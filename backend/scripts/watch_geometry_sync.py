#!/usr/bin/env python3
"""
Live terminal dashboard for dynamic geometry sync (no raw log reading).

  cd backend && ./venv/bin/python scripts/watch_geometry_sync.py
  cd backend && ./scripts/watch_geometry_sync.sh
"""
from __future__ import annotations

import argparse
import glob
import re
import sqlite3
import subprocess
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
DEFAULT_DB = BACKEND / "logs" / "geometry_sync_queue.db"
RUN_ID_FILE = BACKEND / "logs" / "geometry_parallel_run.id"
LIVE_LOG = BACKEND / "logs" / "GEOMETRY_SYNC_LIVE.log"

_PAIR_RE = re.compile(
    r"\] +PAIR ([^:]+)→([^:]+): (\d+) train"
)
_UPLOAD_RE = re.compile(
    r"\] +UPLOAD (\S+) (\S+)→(\S+) \| ([^|]+) \| (\d+) pts \| source=(\S+) \| ([\d.]+)s"
)
_WORKER_START_RE = re.compile(r"\] INFO  Worker (\d+) starting")


def _fmt_duration(seconds: float) -> str:
    if seconds <= 0:
        return "—"
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}m"
    if m:
        return f"{m}m {sec:02d}s"
    return f"{sec}s"


def _ts_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _parse_run_start(run_id: str) -> float | None:
    m = re.search(r"(\d{8})_(\d{6})", run_id)
    if not m:
        return None
    dt = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").replace(
        tzinfo=timezone.utc
    )
    return dt.timestamp()


def _tail_lines(path: Path, n: int = 40) -> list[str]:
    if not path.exists():
        return []
    try:
        with path.open("rb") as fh:
            fh.seek(0, 2)
            size = fh.tell()
            block = 8192
            data = b""
            while size > 0 and data.count(b"\n") <= n:
                read = min(block, size)
                size -= read
                fh.seek(size)
                data = fh.read(read) + data
        text = data.decode("utf-8", errors="replace")
        return text.splitlines()[-n:]
    except OSError:
        return []


@dataclass
class WorkerView:
    worker_id: str
    log_path: Path | None = None
    pairs_done: int = 0
    uploads: int = 0
    skips: int = 0
    active_pair: str = "—"
    last_upload: str = "—"
    alive: bool = False


@dataclass
class Dashboard:
    run_id: str = "?"
    run_started: float | None = None
    total_pairs: int = 0
    pairs_done: int = 0
    pairs_pending: int = 0
    pairs_active: int = 0
    pairs_failed: int = 0
    uploads: int = 0
    skips: int = 0
    leg_fails: int = 0
    no_train_pairs: int = 0
    workers: list[WorkerView] = field(default_factory=list)
    recent_uploads: list[str] = field(default_factory=list)
    worker_pids: int = 0


def _connect_ro(db: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5)
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _discover_worker_logs() -> dict[str, Path]:
    logs: dict[str, Path] = {}
    for path in sorted(BACKEND.glob("logs/geometry_dynamic_*_w*.log")):
        m = re.search(r"_w(\d+)\.log$", path.name)
        if m:
            logs[m.group(1)] = path
    return logs


def _count_live_workers() -> int:
    try:
        out = subprocess.run(
            ["pgrep", "-f", "sync_geometry_dynamic.py worker"],
            capture_output=True,
            text=True,
        )
        pids = [p for p in out.stdout.split() if p.strip()]
        # screen/bash/login wrappers inflate count; count unique python workers
        py = subprocess.run(
            ["pgrep", "-f", r"Python scripts/sync_geometry_dynamic.py worker"],
            capture_output=True,
            text=True,
        )
        return len([p for p in py.stdout.split() if p.strip()])
    except OSError:
        return 0


def _collect_recent_uploads(log_paths: list[Path], limit: int = 10) -> list[str]:
    hits: list[tuple[str, str]] = []
    for path in log_paths:
        wid = "?"
        m = re.search(r"_w(\d+)\.log$", path.name)
        if m:
            wid = m.group(1)
        for line in _tail_lines(path, 25):
            um = _UPLOAD_RE.search(line)
            if um:
                ts = ""
                if line.startswith("["):
                    end = line.find("]")
                    if end > 1:
                        ts = line[1:end]
                hits.append(
                    (
                        ts,
                        f"{ts}  w{wid}  {um.group(1)} {um.group(2)}→{um.group(3)} "
                        f"| {um.group(4).strip()} | {um.group(5)} pts | {um.group(6)}",
                    )
                )
    hits.sort(key=lambda x: x[0], reverse=True)
    return [h[1] for h in hits[:limit]]


def gather(db: Path) -> Dashboard:
    dash = Dashboard()
    if RUN_ID_FILE.exists():
        dash.run_id = RUN_ID_FILE.read_text(encoding="utf-8").strip()
        dash.run_started = _parse_run_start(dash.run_id)

    log_map = _discover_worker_logs()
    dash.worker_pids = _count_live_workers()

    if not db.exists():
        return dash

    conn = _connect_ro(db)
    status_rows = conn.execute(
        "SELECT status, COUNT(*) FROM sync_tasks GROUP BY status"
    ).fetchall()
    totals = conn.execute(
        """
        SELECT COALESCE(SUM(uploads),0), COALESCE(SUM(skips),0),
               COALESCE(SUM(failed),0), COALESCE(SUM(no_trains),0)
        FROM sync_tasks WHERE status IN ('done','empty')
        """
    ).fetchone()
    per_worker = conn.execute(
        """
        SELECT worker_id,
               SUM(CASE WHEN status IN ('done','empty') THEN 1 ELSE 0 END),
               COALESCE(SUM(uploads),0), COALESCE(SUM(skips),0)
        FROM sync_tasks
        WHERE worker_id IS NOT NULL
        GROUP BY worker_id
        ORDER BY CAST(worker_id AS INTEGER)
        """
    ).fetchall()
    active_rows = conn.execute(
        """
        SELECT worker_id, src_city, dst_city FROM sync_tasks
        WHERE status='active'
        """
    ).fetchall()
    conn.close()

    dash.total_pairs = sum(c for _, c in status_rows)
    for status, cnt in status_rows:
        if status in ("done", "empty"):
            dash.pairs_done += cnt
        elif status == "pending":
            dash.pairs_pending = cnt
        elif status == "active":
            dash.pairs_active = cnt
        elif status == "failed":
            dash.pairs_failed = cnt

    if totals:
        dash.uploads, dash.skips, dash.leg_fails, dash.no_train_pairs = totals

    active_by_worker = {
        wid: f"{src}→{dst}" for wid, src, dst in active_rows
    }
    stats_by_worker = {wid: (pairs, up, sk) for wid, pairs, up, sk in per_worker}

    worker_ids = sorted(
        set(log_map) | set(stats_by_worker) | set(active_by_worker),
        key=lambda x: int(x) if x.isdigit() else 999,
    )

    for wid in worker_ids:
        pairs, up, sk = stats_by_worker.get(wid, (0, 0, 0))
        w = WorkerView(
            worker_id=wid,
            log_path=log_map.get(wid),
            pairs_done=pairs,
            uploads=up,
            skips=sk,
            active_pair=active_by_worker.get(wid, "—"),
            alive=dash.worker_pids > 0,
        )
        if w.log_path:
            last_pair = "—"
            last_upload = "—"
            for line in _tail_lines(w.log_path, 50):
                pm = _PAIR_RE.search(line)
                if pm:
                    last_pair = (
                        f"{pm.group(1)}→{pm.group(2)} ({pm.group(3)} trains)"
                    )
                um = _UPLOAD_RE.search(line)
                if um:
                    last_upload = (
                        f"{um.group(1)} {um.group(2)}→{um.group(3)} "
                        f"({um.group(7)}s)"
                    )
            if w.active_pair == "—" and last_pair != "—":
                w.active_pair = last_pair
            w.last_upload = last_upload
        dash.workers.append(w)

    dash.recent_uploads = _collect_recent_uploads(list(log_map.values()))
    return dash


def _bar(done: int, total: int, width: int = 40) -> str:
    if total <= 0:
        return "░" * width
    filled = int(width * done / total)
    return "█" * filled + "░" * (width - filled)


def render(dash: Dashboard, *, interval: float) -> str:
    lines: list[str] = []
    w = 72
    elapsed = 0.0
    if dash.run_started:
        elapsed = max(0.0, time.time() - dash.run_started)

    pct = 100.0 * dash.pairs_done / dash.total_pairs if dash.total_pairs else 0.0
    rate_pairs_min = (dash.pairs_done / elapsed * 60.0) if elapsed > 60 else 0.0
    rate_up_min = (dash.uploads / elapsed * 60.0) if elapsed > 60 else 0.0
    remaining = dash.total_pairs - dash.pairs_done
    eta_s = (remaining / (dash.pairs_done / elapsed)) if elapsed > 30 and dash.pairs_done else 0.0

    lines.append("═" * w)
    lines.append(f"  GEOMETRY SYNC — LIVE DASHBOARD          {_ts_now()}")
    lines.append(f"  Run: {dash.run_id}  ·  elapsed {_fmt_duration(elapsed)}")
    lines.append("═" * w)
    lines.append("")
    lines.append(
        f"  PAIRS    {dash.pairs_done:,} / {dash.total_pairs:,} done  "
        f"({pct:.1f}%)  ·  {remaining:,} left"
    )
    lines.append(f"  [{_bar(dash.pairs_done, dash.total_pairs)}]")
    lines.append(
        f"  UPLOADS  {dash.uploads:,} new  ·  {dash.skips:,} skipped  ·  "
        f"{dash.leg_fails:,} leg-fails  ·  {dash.no_train_pairs:,} empty pairs"
    )
    lines.append(
        f"  QUEUE    {dash.pairs_pending:,} pending  ·  {dash.pairs_active} active  ·  "
        f"{dash.pairs_failed} failed  ·  {dash.worker_pids} python workers alive"
    )
    if rate_pairs_min > 0:
        lines.append(
            f"  RATE     {rate_pairs_min:.1f} pairs/min  ·  {rate_up_min:.1f} uploads/min  ·  "
            f"ETA {_fmt_duration(eta_s)}"
        )
    else:
        lines.append("  RATE     warming up… (ETA after ~1 min)")
    lines.append("")
    lines.append("─" * w)
    lines.append(
        f"  {'WORKER':<8}{'PAIRS':>7}{'UPLOADS':>9}{'SKIPS':>8}  "
        f"{'CURRENT PAIR':<28}LAST UPLOAD"
    )
    lines.append("─" * w)

    if not dash.workers:
        lines.append("  (no workers found — is sync running?)")
    else:
        for wv in dash.workers:
            pair = (wv.active_pair[:26] + "…") if len(wv.active_pair) > 27 else wv.active_pair
            upload = (
                (wv.last_upload[:34] + "…") if len(wv.last_upload) > 35 else wv.last_upload
            )
            lines.append(
                f"  w{wv.worker_id:<7}{wv.pairs_done:>7}{wv.uploads:>9}{wv.skips:>8}  "
                f"{pair:<28}{upload}"
            )

    lines.append("─" * w)
    lines.append("  RECENT UPLOADS")
    if dash.recent_uploads:
        for row in dash.recent_uploads[:8]:
            lines.append(f"    {row}")
    else:
        lines.append("    (none yet)")
    lines.append("─" * w)
    lines.append(
        f"  Refreshes every {interval:.0f}s · Ctrl+C to exit · "
        f"full log: logs/GEOMETRY_SYNC_LIVE.log"
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Live geometry sync dashboard")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--interval", type=float, default=30.0)
    parser.add_argument("--once", action="store_true", help="Print once and exit")
    args = parser.parse_args()

    if not sys.stdout.isatty() and not args.once:
        print("Tip: run in a Terminal tab for live refresh.", flush=True)

    try:
        while True:
            dash = gather(args.db)
            text = render(dash, interval=args.interval)
            if sys.stdout.isatty():
                print("\033[2J\033[H", end="")
            print(text, flush=True)
            if args.once:
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n[dashboard] stopped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
