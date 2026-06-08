#!/usr/bin/env python3
"""
Dynamic SQLite work-queue geometry sync → Supabase.

Workers pull city-pairs from a shared queue (no idle shards).

  python scripts/sync_geometry_dynamic.py build
  python scripts/sync_geometry_dynamic.py worker --id 1
  python scripts/sync_geometry_dynamic.py status
  python scripts/sync_geometry_dynamic.py launch --workers 6
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")

DEFAULT_DB = BACKEND / "logs" / "geometry_sync_queue.db"
STALE_SEC = 600  # reclaim tasks stuck in_progress for 10+ min


def _stop_codes(stops: list[dict]) -> list[str]:
    return [str(s.get("code") or "").upper() for s in stops if s.get("code")]


def _format_stops(stops: list[dict], *, max_show: int = 30) -> str:
    codes = _stop_codes(stops)
    if not codes:
        return "(none)"
    if len(codes) <= max_show:
        return " → ".join(codes)
    head = codes[:12]
    tail = codes[-4:]
    return " → ".join(head) + f" … ({len(codes)} stops) … " + " → ".join(tail)


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _connect(db: Path) -> sqlite3.Connection:
    db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db), timeout=120, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=120000")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            src_city TEXT NOT NULL,
            dst_city TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            worker_id TEXT,
            claimed_at REAL,
            completed_at REAL,
            uploads INTEGER NOT NULL DEFAULT 0,
            skips INTEGER NOT NULL DEFAULT 0,
            failed INTEGER NOT NULL DEFAULT 0,
            no_trains INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            UNIQUE(src_city, dst_city)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sync_tasks_status ON sync_tasks(status, id)"
    )


def build_queue(db: Path, *, reset: bool = False) -> int:
    from app.pipelines.rail.config import CITY_TO_STATION

    cities = sorted(
        c for c in CITY_TO_STATION.keys() if not c.isupper() and " JN" not in c.upper()
    )
    conn = _connect(db)
    init_db(conn)
    if reset:
        conn.execute("DELETE FROM sync_tasks")

    inserted = 0
    for src in cities:
        for dst in cities:
            if src == dst:
                continue
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO sync_tasks (src_city, dst_city) VALUES (?, ?)",
                    (src, dst),
                )
                if conn.total_changes:
                    inserted += 1
            except sqlite3.Error:
                pass
    total = conn.execute("SELECT COUNT(*) FROM sync_tasks").fetchone()[0]
    pending = conn.execute(
        "SELECT COUNT(*) FROM sync_tasks WHERE status='pending'"
    ).fetchone()[0]
    print(f"[{_ts()}] Queue built: {total} pairs ({inserted} new rows, {pending} pending)")
    conn.close()
    return total


def reclaim_stale(conn: sqlite3.Connection) -> int:
    cutoff = time.time() - STALE_SEC
    conn.execute("BEGIN IMMEDIATE")
    cur = conn.execute(
        """
        UPDATE sync_tasks
        SET status='pending', worker_id=NULL, claimed_at=NULL
        WHERE status='active' AND claimed_at IS NOT NULL AND claimed_at < ?
        """,
        (cutoff,),
    )
    conn.execute("COMMIT")
    return cur.rowcount


def claim_task(conn: sqlite3.Connection, worker_id: str) -> tuple[int, str, str] | None:
    reclaim_stale(conn)
    conn.execute("BEGIN IMMEDIATE")
    row = conn.execute(
        """
        SELECT id, src_city, dst_city FROM sync_tasks
        WHERE status='pending'
        ORDER BY id
        LIMIT 1
        """
    ).fetchone()
    if not row:
        conn.execute("COMMIT")
        return None
    task_id, src, dst = row
    conn.execute(
        """
        UPDATE sync_tasks
        SET status='active', worker_id=?, claimed_at=?
        WHERE id=? AND status='pending'
        """,
        (worker_id, time.time(), task_id),
    )
    conn.execute("COMMIT")
    return task_id, src, dst


def complete_task(
    conn: sqlite3.Connection,
    task_id: int,
    *,
    status: str,
    uploads: int = 0,
    skips: int = 0,
    failed: int = 0,
    no_trains: int = 0,
    error: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE sync_tasks
        SET status=?, completed_at=?, uploads=?, skips=?, failed=?, no_trains=?, error=?
        WHERE id=?
        """,
        (status, time.time(), uploads, skips, failed, no_trains, error, task_id),
    )


def process_pair(
    src_city: str,
    dst_city: str,
    *,
    max_trains: int,
    existing: set[tuple[str, str, str]],
    log_path: Path | None,
) -> tuple[int, int, int, int, bool]:
    """Returns uploads, skips, failed, no_trains, had_trains."""
    from app.pipelines.rail.data_loader import get_trains_for_route
    from app.pipelines.rail.geometry_builder import get_train_geometry_detail
    from app.services.location_funnel import resolve_location

    pair_label = f"{src_city}→{dst_city}"
    uploads = skips = failed = 0

    def _log(line: str) -> None:
        if not log_path:
            return
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(f"[{_ts()}] {line}\n")

    try:
        src = resolve_location(src_city)
        dst = resolve_location(dst_city)
    except Exception as exc:
        _log(f"WARN  PAIR_RESOLVE_FAIL {pair_label}: {exc}")
        return 0, 0, 1, 0, False

    trains = get_trains_for_route(
        src.station_codes, dst.station_codes, max_results=max_trains
    )
    if not trains:
        _log(f"      PAIR {pair_label}: 0 trains")
        return 0, 0, 0, 1, False

    _log(
        f"      PAIR {pair_label}: {len(trains)} train(s) "
        f"({src.station_codes[0]}→{dst.station_codes[0]})"
    )
    seen: set[tuple[str, str, str]] = set()

    for train in trains:
        train_no = str(train.get("train_number") or train.get("train_no") or "").strip()
        train_name = str(train.get("train_name") or "").strip()
        from_u = str(train.get("from_station") or src.station_codes[0]).upper()
        to_u = str(train.get("to_station") or dst.station_codes[0]).upper()
        key = (train_no, from_u, to_u)

        if not train_no or key in seen:
            continue
        seen.add(key)

        if key in existing:
            skips += 1
            continue

        t0 = time.perf_counter()
        try:
            detail = get_train_geometry_detail(train_no, from_u, to_u)
        except Exception as exc:
            failed += 1
            _log(f"  FAIL {train_no} {from_u}→{to_u}: {exc}")
            continue

        elapsed = time.perf_counter() - t0
        pts = int(detail.get("point_count") or 0)
        if pts < 2:
            _log(f"  NO_POINTS {train_no} {from_u}→{to_u} ({elapsed:.2f}s)")
            continue

        existing.add(key)
        uploads += 1
        source = str(detail.get("source") or "unknown")
        stops = detail.get("stops") or []
        _log(
            f"  UPLOAD {train_no} {from_u}→{to_u} | {pair_label} | {pts} pts | "
            f"source={source} | {elapsed:.2f}s"
        )
        _log(f"    corridor: {_format_stops(stops)}")

        if uploads % 50 == 0:
            get_train_geometry_detail.cache_clear()

    return uploads, skips, failed, 0, True


def run_worker(
    db: Path,
    worker_id: str,
    *,
    max_trains: int = 20,
    log_path: Path | None = None,
) -> None:
    from app.pipelines.rail.data_loader import load_data
    from app.services import supabase_client as sb
    from app.services.route_geometry_store import list_geometry_keys

    if not sb.is_configured():
        print("ERROR: Supabase not configured")
        sys.exit(1)

    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(f"[{_ts()}] INFO  Worker {worker_id} starting\n")

    print(f"[{_ts()}] Worker {worker_id}: loading schedule CSV...")
    load_data()
    print(f"[{_ts()}] Worker {worker_id}: fetching Supabase keys...")
    existing = list_geometry_keys()
    print(f"[{_ts()}] Worker {worker_id}: {len(existing)} cached legs, pulling tasks...")

    conn = _connect(db)
    init_db(conn)
    total_uploads = 0
    pairs_done = 0

    while True:
        task = claim_task(conn, worker_id)
        if not task:
            pending = conn.execute(
                "SELECT COUNT(*) FROM sync_tasks WHERE status='pending'"
            ).fetchone()[0]
            active = conn.execute(
                "SELECT COUNT(*) FROM sync_tasks WHERE status='active'"
            ).fetchone()[0]
            if pending == 0 and active == 0:
                break
            if pending == 0:
                time.sleep(2)
                continue
            time.sleep(0.5)
            continue

        task_id, src_city, dst_city = task
        try:
            up, sk, fl, nt, _ = process_pair(
                src_city,
                dst_city,
                max_trains=max_trains,
                existing=existing,
                log_path=log_path,
            )
            status = "empty" if nt else "done"
            complete_task(
                conn,
                task_id,
                status=status,
                uploads=up,
                skips=sk,
                failed=fl,
                no_trains=nt,
            )
            total_uploads += up
            pairs_done += 1
            if pairs_done % 25 == 0:
                print(
                    f"[{_ts()}] Worker {worker_id}: {pairs_done} pairs, "
                    f"{total_uploads} uploads"
                )
            if total_uploads > 0 and total_uploads % 100 == 0:
                existing.update(list_geometry_keys())
        except Exception as exc:
            complete_task(conn, task_id, status="failed", error=str(exc))
            if log_path:
                with log_path.open("a", encoding="utf-8") as fh:
                    fh.write(f"[{_ts()}] ERROR task {task_id}: {exc}\n")

    conn.close()
    msg = f"Worker {worker_id} finished: {pairs_done} pairs, {total_uploads} uploads"
    print(f"[{_ts()}] {msg}")
    if log_path:
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(f"[{_ts()}] INFO  {msg}\n")


def print_status(db: Path) -> None:
    if not db.exists():
        print("Queue DB not found:", db)
        return
    conn = _connect(db)
    init_db(conn)
    rows = conn.execute(
        """
        SELECT status, COUNT(*) FROM sync_tasks GROUP BY status ORDER BY status
        """
    ).fetchall()
    totals = conn.execute(
        """
        SELECT
          COALESCE(SUM(uploads),0), COALESCE(SUM(skips),0),
          COALESCE(SUM(failed),0), COALESCE(SUM(no_trains),0)
        FROM sync_tasks WHERE status IN ('done','empty')
        """
    ).fetchone()
    active_workers = conn.execute(
        """
        SELECT worker_id, COUNT(*) FROM sync_tasks
        WHERE status='active' GROUP BY worker_id
        """
    ).fetchall()
    conn.close()

    total_tasks = sum(r[1] for r in rows)
    done = sum(r[1] for r in rows if r[0] in ("done", "empty"))
    pending = next((r[1] for r in rows if r[0] == "pending"), 0)
    active = next((r[1] for r in rows if r[0] == "active"), 0)
    failed = next((r[1] for r in rows if r[0] == "failed"), 0)

    print("=" * 60)
    print(f"DYNAMIC GEOMETRY SYNC  ({_ts()})")
    print(f"Queue DB: {db}")
    print("=" * 60)
    for status, cnt in rows:
        print(f"  {status:8} {cnt:5}")
    print()
    print(f"  Progress: {done}/{total_tasks} pairs ({100*done/max(total_tasks,1):.1f}%)")
    print(f"  Pending:  {pending}  |  Active: {active}  |  Failed: {failed}")
    if totals:
        print(
            f"  Uploads: {totals[0]}  Skips: {totals[1]}  "
            f"Leg-fails: {totals[2]}  No-train pairs: {totals[3]}"
        )
    if active_workers:
        print("  Active workers:")
        for wid, cnt in active_workers:
            print(f"    {wid}: {cnt} tasks in flight")
    print("=" * 60)


def stop_old_workers() -> None:
    subprocess.run(["pkill", "-f", "sync_rail_supabase.py --full"], check=False)
    subprocess.run(["pkill", "-f", "sync_geometry_dynamic.py worker"], check=False)
    out = subprocess.run(["screen", "-ls"], capture_output=True, text=True)
    for line in out.stdout.splitlines():
        if "geosync" in line:
            part = line.strip().split()[0]
            sid = part.split(".", 1)[0]
            subprocess.run(["screen", "-S", sid, "-X", "quit"], check=False)


def launch_workers(db: Path, workers: int, max_trains: int) -> None:
    stop_old_workers()
    time.sleep(2)

    if not db.exists() or db.stat().st_size == 0:
        build_queue(db)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    run_id_path = BACKEND / "logs" / "geometry_parallel_run.id"
    run_id_path.write_text(f"dynamic_{stamp}\n", encoding="utf-8")

    live_log = BACKEND / "logs" / "GEOMETRY_SYNC_LIVE.log"
    with live_log.open("w", encoding="utf-8") as fh:
        fh.write(f"===== DYNAMIC QUEUE SYNC started {_ts()} =====\n")
        fh.write(f"Workers: {workers} | DB: {db}\n\n")

    log_files = " ".join(
        f"logs/geometry_dynamic_{stamp}_w{i}.log" for i in range(1, workers + 1)
    )
    subprocess.Popen(
        [
            "screen",
            "-dmS",
            f"geosync_live_{stamp}",
            "bash",
            "-c",
            f"cd {BACKEND} && tail -F {log_files} >> logs/GEOMETRY_SYNC_LIVE.log 2>&1",
        ]
    )

    for i in range(1, workers + 1):
        log_path = BACKEND / "logs" / f"geometry_dynamic_{stamp}_w{i}.log"
        cmd = (
            f"cd {BACKEND} && ./venv/bin/python scripts/sync_geometry_dynamic.py worker "
            f"--id {i} --db {db} --log-file {log_path} --max-trains {max_trains}"
        )
        subprocess.run(
            ["screen", "-dmS", f"geosync_dyn_{stamp}_w{i}", "bash", "-c", cmd],
            check=True,
        )
        time.sleep(3)

    # prevent sleep
    subprocess.Popen(
        ["screen", "-dmS", "geosync_caffeinate", "caffeinate", "-dims"],
    )

    print(f"[{_ts()}] Launched {workers} dynamic workers (run dynamic_{stamp})")
    print(f"  Live log: {live_log}")
    print(f"  Status:   ./venv/bin/python scripts/sync_geometry_dynamic.py status")
    print_status(db)


def main() -> None:
    parser = argparse.ArgumentParser(description="Dynamic queue geometry sync")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_build = sub.add_parser("build", help="Build/refresh pair queue")
    p_build.add_argument("--db", type=Path, default=DEFAULT_DB)
    p_build.add_argument("--reset", action="store_true")

    p_worker = sub.add_parser("worker", help="Run queue worker")
    p_worker.add_argument("--id", required=True)
    p_worker.add_argument("--db", type=Path, default=DEFAULT_DB)
    p_worker.add_argument("--max-trains", type=int, default=20)
    p_worker.add_argument("--log-file", type=Path, default=None)

    p_status = sub.add_parser("status", help="Queue progress")
    p_status.add_argument("--db", type=Path, default=DEFAULT_DB)

    p_launch = sub.add_parser("launch", help="Stop old workers and launch dynamic pool")
    p_launch.add_argument("--workers", type=int, default=6)
    p_launch.add_argument("--db", type=Path, default=DEFAULT_DB)
    p_launch.add_argument("--max-trains", type=int, default=20)
    p_launch.add_argument("--reset-queue", action="store_true")

    args = parser.parse_args()

    if args.cmd == "build":
        build_queue(args.db, reset=args.reset)
    elif args.cmd == "worker":
        run_worker(
            args.db,
            str(args.id),
            max_trains=args.max_trains,
            log_path=args.log_file,
        )
    elif args.cmd == "status":
        print_status(args.db)
    elif args.cmd == "launch":
        if args.reset_queue:
            build_queue(args.db, reset=True)
        launch_workers(args.db, args.workers, args.max_trains)


if __name__ == "__main__":
    main()
