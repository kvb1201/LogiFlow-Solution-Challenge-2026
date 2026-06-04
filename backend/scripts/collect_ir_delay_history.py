#!/usr/bin/env python3
"""
Build an India-only train delay CSV (see docs/INDIAN_RAILWAYS_DATA.md).

Strategies (--strategy):
  history     — runningstatus.in past days (default; resumable bulk history)
  live-today  — IRCTC RapidAPI live status for today only (quota-limited)
  hybrid      — history for past dates + RapidAPI for today

There is no unlimited public NTES API. Full history ≈ 11k trains × 90 days ≈ 1M polite requests.

Examples:
  ./venv/bin/python scripts/collect_ir_delay_history.py --pilot
  ./venv/bin/python scripts/collect_ir_delay_history.py --days 90 --resume
  ENABLE_IRCTC_RAPIDAPI=true ./venv/bin/python scripts/collect_ir_delay_history.py --strategy live-today --max-trains 50
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import date
from pathlib import Path
from typing import List, Optional, Tuple

import requests
from dotenv import load_dotenv

# Allow imports from backend/
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from scripts.scrapers.runningstatus import (  # noqa: E402
    StationDelayRow,
    fetch_train_day,
    iter_dates_last_n_days,
)
from scripts.scrapers.rapidapi_live import fetch_live_today  # noqa: E402

load_dotenv(BACKEND_ROOT / ".env")

CSV_PATH = BACKEND_ROOT / "app" / "pipelines" / "rail" / "Train_details_22122017.csv"
OUT_DIR = BACKEND_ROOT / "data" / "ir_delay_scrape"
OUT_CSV = OUT_DIR / "ir_train_delays.csv"
CHECKPOINT = OUT_DIR / "checkpoint.json"
LOCK_FILE = OUT_DIR / ".collector.lock"
ACTIVE_TRAINS_FILE = OUT_DIR / "active_trains.txt"

FIELDNAMES = [
    "run_date",
    "train_number",
    "station_code",
    "station_name",
    "distance_km",
    "scheduled_arrival",
    "scheduled_departure",
    "actual_arrival",
    "actual_departure",
    "arrival_delay_min",
    "departure_delay_min",
    "delay_text",
    "scrape_status",
    "data_source",
    "page_status",
    "scraped_at_utc",
]


def load_train_numbers(
    limit: Optional[int] = None,
    *,
    active_only: bool = True,
) -> List[str]:
    if active_only and ACTIVE_TRAINS_FILE.exists():
        trains = [
            line.strip()
            for line in ACTIVE_TRAINS_FILE.read_text().splitlines()
            if line.strip()
        ]
        trains = sorted(set(trains))
        if limit:
            trains = trains[:limit]
        return trains

    import pandas as pd

    df = pd.read_csv(CSV_PATH, low_memory=False)
    col = "Train No" if "Train No" in df.columns else df.columns[0]
    trains = sorted({str(x).strip() for x in df[col].dropna().unique() if str(x).strip()})
    if limit:
        trains = trains[:limit]
    return trains


def load_checkpoint() -> dict:
    if CHECKPOINT.exists():
        return json.loads(CHECKPOINT.read_text())
    return {"completed": [], "stats": {"ok": 0, "no_table": 0, "errors": 0, "rows": 0}}


def save_checkpoint(state: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CHECKPOINT.write_text(json.dumps(state, indent=2))


def task_key(train: str, day: date) -> str:
    return f"{train}|{day.isoformat()}"


def append_meta_row(
    writer: csv.DictWriter,
    *,
    train: str,
    day: date,
    page_status: str,
) -> None:
    writer.writerow(
        {
            "run_date": day.isoformat(),
            "train_number": train,
            "station_code": "",
            "station_name": "",
            "distance_km": "",
            "scheduled_arrival": "",
            "scheduled_departure": "",
            "actual_arrival": "",
            "actual_departure": "",
            "arrival_delay_min": "",
            "departure_delay_min": "",
            "delay_text": "",
            "scrape_status": "meta",
            "data_source": "",
            "page_status": page_status,
            "scraped_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    )


def acquire_lock() -> bool:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if LOCK_FILE.exists():
        try:
            raw = LOCK_FILE.read_text().strip()
            if raw.startswith("pid:"):
                pid = int(raw.split(":")[1].strip().split()[0])
                os.kill(pid, 0)
                print(
                    f"[collect] already running (pid {pid}). "
                    f"Stop it first or delete {LOCK_FILE} if that process is gone.",
                    flush=True,
                )
                return False
        except ProcessLookupError:
            pass  # stale lock — previous run crashed
        except (ValueError, OSError):
            pass
    LOCK_FILE.write_text(f"pid:{os.getpid()}\nstarted:{time.time()}\n")
    return True


def _configure_rapidapi_for_collector() -> None:
    """Honor .env for live-today / hybrid without editing railradar_client defaults."""
    if os.getenv("ENABLE_IRCTC_RAPIDAPI", "").lower() in ("1", "true", "yes"):
        from app.pipelines.rail import railradar_client as rc

        rc.ENABLE_IRCTC_RAPIDAPI = True


def fetch_one(
    train: str,
    day: date,
    strategy: str,
    session: requests.Session,
) -> Tuple[str, List[StationDelayRow], str]:
    """Returns (page_status, rows, data_source label)."""
    today = date.today()
    use_live = strategy == "live-today" or (strategy == "hybrid" and day == today)
    use_history = strategy == "history" or (strategy == "hybrid" and day < today)

    if use_live and (strategy == "live-today" or day == today):
        status, rows = fetch_live_today(train, run_day=day)
        return status, rows, "rapidapi_irctc1"

    if use_history:
        status, rows = fetch_train_day(train, day, session=session)
        return status, rows, "runningstatus.in"

    status, rows = fetch_train_day(train, day, session=session)
    return status, rows, "runningstatus.in"


def release_lock() -> None:
    try:
        LOCK_FILE.unlink(missing_ok=True)
    except OSError:
        pass


def _count_pending(trains: List[str], days: List[date], done: set) -> Tuple[int, int]:
    """Return (pending_requests, trains_with_at_least_one_pending_day)."""
    pending = 0
    trains_left = 0
    for train in trains:
        t = str(train).strip().zfill(5)
        train_pending = 0
        for day in days:
            if task_key(t, day) not in done:
                train_pending += 1
        if train_pending:
            trains_left += 1
            pending += train_pending
    return pending, trains_left


def _fmt_duration(seconds: float) -> str:
    if seconds < 0 or not (seconds < 1e9):
        return "—"
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    if h:
        return f"{h}h {m}m"
    if m:
        return f"{m}m {sec}s"
    return f"{sec}s"


def _log_minute_status(
    *,
    elapsed_s: float,
    total_trains: int,
    total_tasks: int,
    requests_done_run: int,
    requests_remaining: int,
    trains_remaining: int,
    current_train: str,
    stats: dict,
    sleep_s: float,
) -> None:
    done_total = total_tasks - requests_remaining
    pct = (100.0 * done_total / total_tasks) if total_tasks else 0.0
    trains_done = total_trains - trains_remaining
    rate_per_min = (requests_done_run / elapsed_s * 60.0) if elapsed_s > 0 else 0.0
    sec_per_req = (elapsed_s / requests_done_run) if requests_done_run > 0 else sleep_s
    eta_s = requests_remaining * sec_per_req if requests_remaining > 0 else 0.0

    print(
        f"\n[collect] ── {time.strftime('%H:%M:%S')} "
        f"(running {_fmt_duration(elapsed_s)}) ──",
        flush=True,
    )
    print(
        f"  requests: {done_total:,} / {total_tasks:,} done · "
        f"{requests_remaining:,} left ({pct:.1f}%)",
        flush=True,
    )
    print(
        f"  trains:   {trains_done:,} / {total_trains:,} fully done · "
        f"{trains_remaining:,} trains still have days left",
        flush=True,
    )
    print(
        f"  rate:     {rate_per_min:.1f} req/min (~{sec_per_req:.2f}s/req) · "
        f"ETA: {_fmt_duration(eta_s)}",
        flush=True,
    )
    print(
        f"  current:  train {current_train} · "
        f"csv rows={stats.get('rows', 0):,} · "
        f"ok={stats.get('ok', 0):,} · no_table={stats.get('no_table', 0):,} · "
        f"errors={stats.get('errors', 0):,}",
        flush=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect IR delay history into CSV")
    parser.add_argument("--days", type=int, default=90, help="Days of history (default 90)")
    parser.add_argument("--max-trains", type=int, default=None, help="Cap trains (for testing)")
    parser.add_argument("--sleep", type=float, default=1.25, help="Seconds between HTTP calls")
    parser.add_argument("--resume", action="store_true", help="Skip completed train|date keys")
    parser.add_argument(
        "--pilot",
        action="store_true",
        help="Quick sample: 15 trains × 14 days",
    )
    parser.add_argument(
        "--strategy",
        choices=("history", "live-today", "hybrid"),
        default=os.getenv("COLLECT_IR_STRATEGY", "history"),
        help="history=runningstatus past days; live-today=RapidAPI; hybrid=both",
    )
    parser.add_argument(
        "--log-interval",
        type=float,
        default=float(os.getenv("COLLECT_LOG_INTERVAL_SEC", "60")),
        help="Print progress summary every N seconds (default 60)",
    )
    parser.add_argument(
        "--use-csv-all",
        action="store_true",
        help="Skip active_trains.txt and use full 2017 CSV (not recommended)",
    )
    args = parser.parse_args()

    if args.strategy in ("live-today", "hybrid"):
        _configure_rapidapi_for_collector()

    if not acquire_lock():
        return 2

    try:
        return _run_collect(args)
    finally:
        release_lock()


def _run_collect(args: argparse.Namespace) -> int:
    if args.pilot:
        args.max_trains = args.max_trains or 15
        args.days = min(args.days, 14)

    if args.strategy == "live-today":
        args.days = 1
        if args.sleep < 2.0:
            args.sleep = 2.0
        print("[collect] live-today uses RapidAPI quota — keep --max-trains small on free tier")

    active_only = not args.use_csv_all
    if active_only and not ACTIVE_TRAINS_FILE.exists():
        print(
            "[collect] ERROR: active_trains.txt missing. The 2017 CSV has many discontinued trains.\n"
            "  Run first:  make validate-active-trains\n"
            "  Or force:   add --use-csv-all (wastes ~25%+ requests on dead numbers)",
            flush=True,
        )
        return 2

    trains = load_train_numbers(args.max_trains, active_only=active_only)
    days = iter_dates_last_n_days(args.days)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    state = load_checkpoint() if args.resume else {"completed": [], "stats": {"ok": 0, "no_table": 0, "errors": 0, "rows": 0}}
    done = set(state.get("completed") or [])

    write_header = not OUT_CSV.exists() or OUT_CSV.stat().st_size == 0
    total_tasks = len(trains) * len(days)
    total_trains = len(trains)
    requests_remaining, trains_remaining = _count_pending(trains, days, done)

    src = "active_trains.txt" if active_only and ACTIVE_TRAINS_FILE.exists() else "Train_details_22122017.csv (2017)"
    print(
        f"[collect] strategy={args.strategy} trains={total_trains} days={len(days)} "
        f"tasks={total_tasks} source={src}",
        flush=True,
    )
    print(f"[collect] output={OUT_CSV}", flush=True)
    print(
        f"[collect] pending: {requests_remaining:,} requests · {trains_remaining:,} trains incomplete",
        flush=True,
    )
    print(
        f"[collect] status log every {args.log_interval:.0f}s · "
        f"rough ETA at {args.sleep}s/req: {_fmt_duration(requests_remaining * args.sleep)}",
        flush=True,
    )

    session = requests.Session()
    completed_this_run = 0
    run_started = time.time()
    last_log_at = run_started
    current_train = "—"

    with OUT_CSV.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        if write_header:
            writer.writeheader()

        for ti, train in enumerate(trains):
            train = str(train).strip().zfill(5)
            current_train = train
            for day in days:
                key = task_key(train, day)
                if key in done:
                    continue

                page_status, rows, source = fetch_one(
                    train, day, args.strategy, session
                )
                scraped_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

                if rows:
                    state["stats"]["ok"] = state["stats"].get("ok", 0) + 1
                    state["stats"]["rows"] = state["stats"].get("rows", 0) + len(rows)
                    for row in rows:
                        d = row.to_csv_row()
                        d["data_source"] = source
                        d["page_status"] = page_status
                        d["scraped_at_utc"] = scraped_at
                        writer.writerow(d)
                else:
                    if page_status == "no_table":
                        state["stats"]["no_table"] = state["stats"].get("no_table", 0) + 1
                    else:
                        state["stats"]["errors"] = state["stats"].get("errors", 0) + 1
                    append_meta_row(writer, train=train, day=day, page_status=page_status)

                done.add(key)
                state["completed"] = list(done)
                completed_this_run += 1
                requests_remaining = max(0, requests_remaining - 1)
                if all(task_key(train, d) in done for d in days):
                    trains_remaining = max(0, trains_remaining - 1)

                now = time.time()
                if completed_this_run % 25 == 0:
                    save_checkpoint(state)
                    fh.flush()

                if now - last_log_at >= args.log_interval:
                    _log_minute_status(
                        elapsed_s=now - run_started,
                        total_trains=total_trains,
                        total_tasks=total_tasks,
                        requests_done_run=completed_this_run,
                        requests_remaining=requests_remaining,
                        trains_remaining=trains_remaining,
                        current_train=current_train,
                        stats=state["stats"],
                        sleep_s=args.sleep,
                    )
                    last_log_at = now

                time.sleep(args.sleep)

    save_checkpoint(state)
    _log_minute_status(
        elapsed_s=time.time() - run_started,
        total_trains=total_trains,
        total_tasks=total_tasks,
        requests_done_run=completed_this_run,
        requests_remaining=requests_remaining,
        trains_remaining=trains_remaining,
        current_train=current_train,
        stats=state["stats"],
        sleep_s=args.sleep,
    )
    print(f"[collect] done. stats={state['stats']}", flush=True)
    print(f"[collect] csv={OUT_CSV}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
