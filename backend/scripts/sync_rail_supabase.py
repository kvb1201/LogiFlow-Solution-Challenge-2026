#!/usr/bin/env python3
"""
Sync rail station coordinates and corridor geometry to Supabase.

Usage (from backend/ with .env containing SUPABASE_URL + SUPABASE_KEY):

  python scripts/sync_rail_supabase.py --stations
  python scripts/sync_rail_supabase.py --geometry --pairs 50
  python scripts/sync_rail_supabase.py --full --verbose --log-file logs/geometry_sync.log

Requires tables:
  - station_coordinates (station_code PK)
  - train_route_geometry (train_number, from_code, to_code PK)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")

from app.services import supabase_client as sb
from app.services.route_geometry_store import save_geometry


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


@dataclass
class SyncLogger:
    verbose: bool = False
    log_file: Path | None = None
    jsonl_file: Path | None = None
    _fh: Any = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if self.log_file:
            self.log_file.parent.mkdir(parents=True, exist_ok=True)
            self._fh = self.log_file.open("a", encoding="utf-8")

    def close(self) -> None:
        if self._fh:
            self._fh.close()
            self._fh = None

    def _write(self, line: str, *, force: bool = False) -> None:
        if force or self.verbose:
            print(line, flush=True)
        if self._fh:
            self._fh.write(line + "\n")
            self._fh.flush()

    def info(self, msg: str, **fields: Any) -> None:
        self._write(f"[{_ts()}] INFO  {msg}", force=True)
        self.event("info", msg, **fields)

    def detail(self, msg: str, **fields: Any) -> None:
        self._write(f"[{_ts()}]       {msg}")
        self.event("detail", msg, **fields)

    def warn(self, msg: str, **fields: Any) -> None:
        self._write(f"[{_ts()}] WARN  {msg}", force=True)
        self.event("warn", msg, **fields)

    def error(self, msg: str, **fields: Any) -> None:
        self._write(f"[{_ts()}] ERROR {msg}", force=True)
        self.event("error", msg, **fields)

    def event(self, level: str, msg: str, **fields: Any) -> None:
        if not self.jsonl_file:
            return
        self.jsonl_file.parent.mkdir(parents=True, exist_ok=True)
        row = {"ts": _ts(), "level": level, "msg": msg, **fields}
        with self.jsonl_file.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


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


def sync_stations(limit: int = 0, log: SyncLogger | None = None) -> int:
    from app.pipelines.rail.geometry_builder import station_display_city

    log = log or SyncLogger()
    cache_path = BACKEND / "app" / "pipelines" / "rail" / "station_coords_cache.json"
    if not cache_path.exists():
        log.warn("No station_coords_cache.json found")
        return 0

    with cache_path.open(encoding="utf-8") as fh:
        data = json.load(fh)

    rows: list[dict] = []
    for code, row in data.items():
        if limit and len(rows) >= limit:
            break
        if not isinstance(row, dict):
            continue
        try:
            lat = float(row["lat"])
            lng = float(row["lng"])
        except (KeyError, TypeError, ValueError):
            continue
        name = str(row.get("name") or code)
        city = station_display_city(name, code)
        rows.append(
            {
                "station_code": str(code).upper(),
                "station_name": name,
                "city": city,
                "lat": lat,
                "lng": lng,
                "source": "bulk_sync",
            }
        )

    log.info(f"Upserting {len(rows)} stations to Supabase...")
    t0 = time.perf_counter()
    count = sb.rest_upsert_many("station_coordinates", rows, on_conflict="station_code")
    log.info(f"Synced {count} station rows in {time.perf_counter() - t0:.1f}s")
    return count


def sync_geometry_corridor(
    from_code: str,
    to_code: str,
    *,
    max_trains: int = 5,
    log: SyncLogger | None = None,
) -> int:
    from app.pipelines.rail.data_loader import get_trains_for_route, load_data
    from app.pipelines.rail.geometry_builder import get_train_geometry_detail

    log = log or SyncLogger(verbose=True)
    if not sb.is_configured():
        log.error("Supabase not configured — set SUPABASE_URL and SUPABASE_KEY in .env")
        return 0

    load_data()
    from_u, to_u = from_code.strip().upper(), to_code.strip().upper()
    log.info(f"Corridor sync {from_u}→{to_u} (max {max_trains} trains)")
    trains = get_trains_for_route([from_u], [to_u], max_results=max_trains) or []
    log.detail(f"Found {len(trains)} direct train(s)")
    uploaded = 0
    for train in trains[:max_trains]:
        train_no = str(train.get("train_number") or train.get("train_no") or "").strip()
        if not train_no:
            continue
        t0 = time.perf_counter()
        detail = get_train_geometry_detail(train_no, from_u, to_u)
        elapsed = time.perf_counter() - t0
        pts = int(detail.get("point_count") or 0)
        stops = detail.get("stops") or []
        if pts >= 2:
            uploaded += 1
            log.info(
                f"UPLOAD {train_no} {from_u}→{to_u}: {pts} pts, "
                f"source={detail.get('source')}, {elapsed:.2f}s",
                train_number=train_no,
                from_code=from_u,
                to_code=to_u,
                point_count=pts,
                source=detail.get("source"),
                stops=_stop_codes(stops),
                elapsed_s=round(elapsed, 3),
            )
            log.detail(f"  corridor: {_format_stops(stops)}")
    log.info(f"Corridor done: {uploaded} geometries for {from_u}→{to_u}")
    return uploaded


def sync_geometry_trains(target: int = 100, log: SyncLogger | None = None) -> int:
    from app.pipelines.rail.config import CITY_TO_STATION
    from app.pipelines.rail.data_loader import get_trains_for_route, load_data
    from app.pipelines.rail.geometry_builder import get_train_geometry_detail
    from app.services.location_funnel import resolve_location

    log = log or SyncLogger(verbose=True)
    if not sb.is_configured():
        log.error("Supabase not configured")
        return 0

    load_data()
    cities = [c for c in CITY_TO_STATION if not c.isupper() and " JN" not in c.upper()]
    uploaded = 0
    seen: set[tuple[str, str, str]] = set()

    for i, src_city in enumerate(cities):
        if uploaded >= target:
            break
        for dst_city in cities[i + 1 : i + 10]:
            if uploaded >= target:
                break
            src = resolve_location(src_city)
            dst = resolve_location(dst_city)
            trains = get_trains_for_route(src.station_codes, dst.station_codes, max_results=12)
            for train in trains:
                if uploaded >= target:
                    break
                train_no = str(train.get("train_number") or train.get("train_no") or "").strip()
                from_u = str(train.get("from_station") or src.station_codes[0]).upper()
                to_u = str(train.get("to_station") or dst.station_codes[0]).upper()
                key = (train_no, from_u, to_u)
                if not train_no or key in seen:
                    continue
                seen.add(key)
                detail = get_train_geometry_detail(train_no, from_u, to_u)
                pts = int(detail.get("point_count") or 0)
                if pts >= 2:
                    uploaded += 1
                    log.info(f"[{uploaded}/{target}] {train_no} {from_u}→{to_u} ({pts} pts)")
    log.info(f"Train sync done: {uploaded} geometries")
    return uploaded


def sync_geometry_full(
    *,
    max_trains_per_pair: int = 20,
    skip_existing: bool = True,
    log: SyncLogger | None = None,
) -> int:
    """Upload geometry for every city-pair × all direct trains (all-India)."""
    from app.pipelines.rail.config import CITY_TO_STATION
    from app.pipelines.rail.data_loader import get_trains_for_route, load_data
    from app.pipelines.rail.geometry_builder import get_train_geometry_detail
    from app.services.location_funnel import resolve_location
    from app.services.route_geometry_store import list_geometry_keys

    log = log or SyncLogger(verbose=True)
    if not sb.is_configured():
        log.error("Supabase not configured — set SUPABASE_URL and SUPABASE_KEY in .env")
        return 0

    run_started = time.perf_counter()
    log.info("=" * 72)
    log.info("FULL GEOMETRY SYNC → Supabase train_route_geometry")
    log.info(
        f"Config: max_trains_per_pair={max_trains_per_pair}, "
        f"skip_existing={skip_existing}, verbose={log.verbose}"
    )
    if log.log_file:
        log.info(f"Text log: {log.log_file}")
    if log.jsonl_file:
        log.info(f"JSONL audit: {log.jsonl_file}")

    log.info("Loading Indian Railways schedule CSV (this may take ~30s)...")
    t_load = time.perf_counter()
    load_data()
    log.info(f"Schedule loaded in {time.perf_counter() - t_load:.1f}s")

    cities = sorted(
        c for c in CITY_TO_STATION.keys() if not c.isupper() and " JN" not in c.upper()
    )
    total_pairs = len(cities) * (len(cities) - 1)

    log.info("Fetching existing geometry keys from Supabase...")
    t_keys = time.perf_counter()
    existing = list_geometry_keys() if skip_existing else set()
    log.info(
        f"Supabase cache: {len(existing)} existing legs "
        f"(fetched in {time.perf_counter() - t_keys:.1f}s)"
    )
    log.info(f"City universe: {len(cities)} cities → {total_pairs} directed pairs to scan")

    uploaded = 0
    skipped = 0
    failed = 0
    no_trains_pairs = 0
    no_points = 0
    seen: set[tuple[str, str, str]] = set()
    pairs_with_trains = 0
    by_source: dict[str, int] = {}
    pair_idx = 0

    for src_city in cities:
        for dst_city in cities:
            if src_city == dst_city:
                continue
            pair_idx += 1
            pair_label = f"{src_city}→{dst_city}"

            try:
                src = resolve_location(src_city)
                dst = resolve_location(dst_city)
            except Exception as exc:
                log.warn(f"PAIR_RESOLVE_FAIL {pair_label}: {exc}")
                continue

            t_pair = time.perf_counter()
            trains = get_trains_for_route(
                src.station_codes, dst.station_codes, max_results=max_trains_per_pair
            )
            pair_elapsed = time.perf_counter() - t_pair

            if not trains:
                no_trains_pairs += 1
                if log.verbose:
                    log.detail(
                        f"PAIR [{pair_idx}/{total_pairs}] {pair_label}: "
                        f"0 trains ({pair_elapsed:.2f}s) "
                        f"src={src.station_codes} dst={dst.station_codes}"
                    )
                continue

            pairs_with_trains += 1
            log.detail(
                f"PAIR [{pair_idx}/{total_pairs}] {pair_label}: "
                f"{len(trains)} train(s) in {pair_elapsed:.2f}s "
                f"({src.station_codes[0]}→{dst.station_codes[0]})"
            )

            for train in trains:
                train_no = str(
                    train.get("train_number") or train.get("train_no") or ""
                ).strip()
                train_name = str(train.get("train_name") or "").strip()
                from_u = str(train.get("from_station") or src.station_codes[0]).upper()
                to_u = str(train.get("to_station") or dst.station_codes[0]).upper()
                dist_km = train.get("distance_km")
                key = (train_no, from_u, to_u)

                if not train_no or key in seen:
                    continue
                seen.add(key)

                if skip_existing and key in existing:
                    skipped += 1
                    log.detail(
                        f"  SKIP_CACHED {train_no} {from_u}→{to_u} "
                        f"({train_name or 'unnamed'})"
                    )
                    log.event(
                        "skip",
                        "cached",
                        train_number=train_no,
                        from_code=from_u,
                        to_code=to_u,
                        src_city=src_city,
                        dst_city=dst_city,
                    )
                    continue

                t_leg = time.perf_counter()
                try:
                    detail = get_train_geometry_detail(train_no, from_u, to_u)
                except Exception as exc:
                    failed += 1
                    elapsed = time.perf_counter() - t_leg
                    log.error(
                        f"  FAIL {train_no} {from_u}→{to_u}: {exc} ({elapsed:.2f}s)",
                        train_number=train_no,
                        from_code=from_u,
                        to_code=to_u,
                        error=str(exc),
                    )
                    continue

                elapsed = time.perf_counter() - t_leg
                pts = int(detail.get("point_count") or 0)
                source = str(detail.get("source") or "unknown")
                stops = detail.get("stops") or []

                if pts < 2:
                    no_points += 1
                    log.warn(
                        f"  NO_POINTS {train_no} {from_u}→{to_u}: "
                        f"source={source} ({elapsed:.2f}s)"
                    )
                    continue

                uploaded += 1
                existing.add(key)
                by_source[source] = by_source.get(source, 0) + 1

                log.info(
                    f"  UPLOAD #{uploaded} {train_no} {from_u}→{to_u} "
                    f"| {pair_label} | {pts} pts | source={source} | "
                    f"{dist_km or '?'}km | {elapsed:.2f}s",
                    action="upload",
                    train_number=train_no,
                    train_name=train_name,
                    from_code=from_u,
                    to_code=to_u,
                    src_city=src_city,
                    dst_city=dst_city,
                    point_count=pts,
                    source=source,
                    distance_km=dist_km,
                    elapsed_s=round(elapsed, 3),
                    stops=_stop_codes(stops),
                )
                log.detail(f"    corridor: {_format_stops(stops)}")

                if uploaded % 200 == 0:
                    get_train_geometry_detail.cache_clear()
                    elapsed_total = time.perf_counter() - run_started
                    rate = uploaded / elapsed_total if elapsed_total > 0 else 0
                    log.info(
                        f"--- PROGRESS uploaded={uploaded} skipped={skipped} "
                        f"failed={failed} pairs_scanned={pair_idx}/{total_pairs} "
                        f"pairs_with_trains={pairs_with_trains} "
                        f"elapsed={elapsed_total/60:.1f}min rate={rate:.2f}/s ---"
                    )

    elapsed_total = time.perf_counter() - run_started
    log.info("=" * 72)
    log.info("FULL SYNC COMPLETE")
    log.info(f"  Uploaded:           {uploaded}")
    log.info(f"  Skipped (cached):   {skipped}")
    log.info(f"  Failed:             {failed}")
    log.info(f"  No geometry points: {no_points}")
    log.info(f"  Pairs scanned:      {pair_idx}/{total_pairs}")
    log.info(f"  Pairs with trains:  {pairs_with_trains}")
    log.info(f"  Pairs no trains:    {no_trains_pairs}")
    log.info(f"  Unique legs seen:   {len(seen)}")
    log.info(f"  Elapsed:            {elapsed_total/60:.1f} min ({elapsed_total:.0f}s)")
    if by_source:
        log.info("  By source:")
        for src_name, cnt in sorted(by_source.items(), key=lambda x: -x[1]):
            log.info(f"    {src_name}: {cnt}")
    log.info(f"  Supabase total now: ~{len(existing)} legs")
    log.info("=" * 72)
    return uploaded


def sync_geometry(max_pairs: int = 30, log: SyncLogger | None = None) -> int:
    from app.pipelines.rail.config import CITY_TO_STATION
    from app.pipelines.rail.data_loader import get_trains_for_route, load_data
    from app.pipelines.rail.geometry_builder import get_train_geometry_detail

    log = log or SyncLogger(verbose=True)
    if not sb.is_configured():
        log.error("Supabase not configured")
        return 0

    load_data()
    cities = list(CITY_TO_STATION.keys())
    uploaded = 0
    attempts = 0

    for i, src_city in enumerate(cities):
        if uploaded >= max_pairs:
            break
        for dst_city in cities[i + 1 : i + 6]:
            if uploaded >= max_pairs:
                break
            src_codes = CITY_TO_STATION.get(src_city, [])[:1]
            dst_codes = CITY_TO_STATION.get(dst_city, [])[:1]
            if not src_codes or not dst_codes:
                continue
            from_u, to_u = src_codes[0], dst_codes[0]
            trains = get_trains_for_route([from_u], [to_u], max_results=10) or []
            if not trains:
                continue
            train_no = str(trains[0].get("train_number") or trains[0].get("train_no") or "").strip()
            if not train_no:
                continue
            attempts += 1
            detail = get_train_geometry_detail(train_no, from_u, to_u)
            if detail.get("point_count", 0) >= 2:
                uploaded += 1
                log.info(f"  ✓ {train_no} {from_u}→{to_u} ({detail.get('point_count')} pts)")
            if attempts >= max_pairs * 3:
                break

    log.info(f"Uploaded {uploaded} corridor geometries to Supabase")
    return uploaded


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync rail data to Supabase")
    parser.add_argument("--stations", action="store_true", help="Sync station_coordinates")
    parser.add_argument("--geometry", action="store_true", help="Precompute corridor geometry")
    parser.add_argument("--pairs", type=int, default=40, help="Max geometry pairs")
    parser.add_argument(
        "--corridor",
        type=str,
        default="",
        help="Sync one corridor: FROM,TO station codes (e.g. PRYJ,BSB)",
    )
    parser.add_argument(
        "--trains",
        type=int,
        default=0,
        help="Sync N unique train legs to train_route_geometry (e.g. 100 for audit)",
    )
    parser.add_argument("--all", action="store_true", help="Sync stations + geometry")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Sync ALL city-pair train geometries to Supabase (all-India bulk)",
    )
    parser.add_argument(
        "--no-skip",
        action="store_true",
        help="With --full: recompute even if already in Supabase",
    )
    parser.add_argument(
        "--max-trains",
        type=int,
        default=20,
        help="Max trains per city pair for --full (default 20)",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Log every city-pair and train leg (very detailed)",
    )
    parser.add_argument(
        "--log-file",
        type=str,
        default="",
        help="Append human-readable log to this file (default: logs/geometry_sync_<ts>.log with --full)",
    )
    parser.add_argument(
        "--jsonl",
        type=str,
        default="",
        help="Append JSONL audit events (default: logs/geometry_sync_<ts>.jsonl with --full)",
    )
    args = parser.parse_args()

    if not sb.is_configured():
        print("ERROR: SUPABASE_URL / SUPABASE_KEY not set")
        sys.exit(1)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    log_file = Path(args.log_file) if args.log_file else None
    jsonl_file = Path(args.jsonl) if args.jsonl else None
    if args.full and not log_file:
        log_file = BACKEND / "logs" / f"geometry_sync_{stamp}.log"
    if args.full and not jsonl_file:
        jsonl_file = BACKEND / "logs" / f"geometry_sync_{stamp}.jsonl"

    log = SyncLogger(
        verbose=args.verbose or args.full,
        log_file=log_file,
        jsonl_file=jsonl_file,
    )

    try:
        if args.all or args.stations:
            sync_stations(log=log)
        if args.full:
            sync_geometry_full(
                max_trains_per_pair=args.max_trains,
                skip_existing=not args.no_skip,
                log=log,
            )
        elif args.trains:
            sync_geometry_trains(target=args.trains, log=log)
        elif args.corridor:
            parts = [p.strip() for p in args.corridor.split(",") if p.strip()]
            if len(parts) != 2:
                log.error("--corridor expects FROM,TO (e.g. PRYJ,BSB)")
                sys.exit(1)
            sync_geometry_corridor(parts[0], parts[1], log=log)
        elif args.all or args.geometry:
            sync_geometry(max_pairs=args.pairs, log=log)
        elif not (args.stations):
            parser.print_help()
    finally:
        log.close()


if __name__ == "__main__":
    main()
