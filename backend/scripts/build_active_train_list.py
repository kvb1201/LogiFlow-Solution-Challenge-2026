#!/usr/bin/env python3
"""
Re-confirm which trains from the 2017 CSV still appear on runningstatus.in (proxy for "active").

The schedule file Train_details_22122017.csv is NOT a current fleet list — many numbers are
discontinued, renumbered, or invalid. This script probes the last N days and writes:

  data/ir_delay_scrape/active_trains.txt   — one train number per line (use for scraping)
  data/ir_delay_scrape/active_trains.json  — full report with inactive reasons

Then run: make collect-delays-3d-foreground
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import List, Optional

import requests
from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from scripts.collect_ir_delay_history import (  # noqa: E402
    CSV_PATH,
    _fmt_duration,
    load_train_numbers,
)
from scripts.scrapers.runningstatus import train_has_runningstatus_history  # noqa: E402

load_dotenv(BACKEND_ROOT / ".env")

OUT_DIR = BACKEND_ROOT / "data" / "ir_delay_scrape"
ACTIVE_TXT = OUT_DIR / "active_trains.txt"
ACTIVE_JSON = OUT_DIR / "active_trains.json"
CHECKPOINT = OUT_DIR / "active_validation_checkpoint.json"
DISCOVERED_ACTIVE_TXT = OUT_DIR / "active_discovered_trains.txt"
DISCOVERED_ACTIVE_JSON = OUT_DIR / "active_discovered_trains.json"
DISCOVERED_CHECKPOINT = OUT_DIR / "active_discovered_validation_checkpoint.json"
NOT_IN_2017_TXT = OUT_DIR / "discovered_not_in_2017.txt"


def load_checkpoint(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {"checked": {}, "stats": {"active": 0, "inactive": 0}}


def save_checkpoint(state: dict, path: Path) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate active IR trains via runningstatus.in")
    parser.add_argument("--lookback", type=int, default=3, help="Days to probe per train")
    parser.add_argument("--max-trains", type=int, default=None, help="Cap for testing")
    parser.add_argument("--sleep", type=float, default=0.35, help="Delay between train probes")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--log-interval", type=float, default=60.0)
    parser.add_argument(
        "--trains-file",
        type=Path,
        default=None,
        help="Validate trains from this file (one number per line) instead of 2017 CSV",
    )
    args = parser.parse_args()

    if args.trains_file:
        trains = [
            line.strip()
            for line in args.trains_file.read_text().splitlines()
            if line.strip()
        ]
        trains = sorted(set(trains))
        if args.max_trains:
            trains = trains[: args.max_trains]
        source_label = args.trains_file.name
    else:
        trains = load_train_numbers(args.max_trains, active_only=False)
        source_label = CSV_PATH.name

    if args.trains_file:
        checkpoint_path = DISCOVERED_CHECKPOINT
        active_txt_path = DISCOVERED_ACTIVE_TXT
        active_json_path = DISCOVERED_ACTIVE_JSON
    else:
        checkpoint_path = CHECKPOINT
        active_txt_path = ACTIVE_TXT
        active_json_path = ACTIVE_JSON

    state = (
        load_checkpoint(checkpoint_path)
        if args.resume
        else {"checked": {}, "stats": {"active": 0, "inactive": 0}}
    )
    checked: dict = state.setdefault("checked", {})

    total = len(trains)
    pending = sum(1 for t in trains if str(t) not in checked)
    run_started = time.time()
    last_log = run_started
    processed = 0

    print(f"[validate] trains: {total} (source: {source_label})", flush=True)
    print(f"[validate] pending probes: {pending} · lookback {args.lookback} days", flush=True)

    session = requests.Session()
    active_list: List[str] = []

    for train in trains:
        t = str(train).strip()
        if t in checked:
            if checked[t].get("active"):
                active_list.append(t.zfill(5) if t.replace(".", "").isdigit() else t)
            continue

        is_active = train_has_runningstatus_history(
            t, lookback_days=args.lookback, session=session
        )
        checked[t] = {
            "active": is_active,
            "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        if is_active:
            state["stats"]["active"] = state["stats"].get("active", 0) + 1
            active_list.append(str(t).zfill(5) if str(t).replace(".", "").isdigit() else t)
        else:
            state["stats"]["inactive"] = state["stats"].get("inactive", 0) + 1

        processed += 1
        pending = max(0, pending - 1)

        now = time.time()
        if now - last_log >= args.log_interval:
            done = len(checked)
            print(
                f"\n[validate] ── {time.strftime('%H:%M:%S')} "
                f"(running {_fmt_duration(now - run_started)}) ──",
                flush=True,
            )
            print(
                f"  trains checked: {done:,} / {total:,} · {pending:,} left",
                flush=True,
            )
            print(
                f"  active:   {state['stats'].get('active', 0):,} · "
                f"inactive: {state['stats'].get('inactive', 0):,} · "
                f"current: {t}",
                flush=True,
            )
            rate = processed / max(now - run_started, 1) * 60
            print(f"  rate:     {rate:.1f} trains/min · ETA: {_fmt_duration(pending / max(rate/60, 0.01))}", flush=True)
            save_checkpoint(state, checkpoint_path)
            last_log = now

        if processed % 50 == 0:
            save_checkpoint(state, checkpoint_path)

        time.sleep(args.sleep)

    active_list = sorted(
        {
            (k.zfill(5) if str(k).replace(".", "").isdigit() else str(k))
            for k, v in checked.items()
            if v.get("active")
        }
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    active_txt_path.write_text("\n".join(active_list) + ("\n" if active_list else ""))
    report = {
        "source": source_label,
        "train_count": total,
        "active_count": len(active_list),
        "inactive_count": total - len(active_list),
        "lookback_days": args.lookback,
        "validated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "active_trains": active_list,
        "inactive_sample": [k for k, v in list(checked.items())[:500] if not v.get("active")][:30],
    }
    active_json_path.write_text(json.dumps(report, indent=2))

    print(f"\n[validate] done.", flush=True)
    print(f"  active:   {len(active_list):,} / {total:,} ({100*len(active_list)/max(total,1):.1f}%)", flush=True)
    print(f"  inactive: {total - len(active_list):,}", flush=True)
    print(f"  wrote: {active_txt_path}", flush=True)
    print(f"  next:  make collect-delays-3d-foreground", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
