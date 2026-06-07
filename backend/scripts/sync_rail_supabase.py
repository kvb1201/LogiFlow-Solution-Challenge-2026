#!/usr/bin/env python3
"""
Sync rail station coordinates and corridor geometry to Supabase.

Usage (from backend/ with .env containing SUPABASE_URL + SUPABASE_KEY):

  python scripts/sync_rail_supabase.py --stations
  python scripts/sync_rail_supabase.py --geometry --pairs 50
  python scripts/sync_rail_supabase.py --all

Requires tables:
  - station_coordinates (station_code PK)
  - train_route_geometry (train_number, from_code, to_code PK)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")

from app.services import supabase_client as sb
from app.services.route_geometry_store import save_geometry


def sync_stations(limit: int = 0) -> int:
    from app.pipelines.rail.geometry_builder import station_display_city

    cache_path = BACKEND / "app" / "pipelines" / "rail" / "station_coords_cache.json"
    if not cache_path.exists():
        print("No station_coords_cache.json found")
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

    count = sb.rest_upsert_many("station_coordinates", rows, on_conflict="station_code")
    print(f"Synced {count} stations to Supabase")
    return count


def sync_geometry_corridor(from_code: str, to_code: str, *, max_trains: int = 5) -> int:
    """Precompute geometry for one station pair (e.g. PRYJ→BSB)."""
    from app.pipelines.rail.data_loader import get_trains_for_route, load_data
    from app.pipelines.rail.geometry_builder import get_train_geometry_detail

    if not sb.is_configured():
        print("Supabase not configured — set SUPABASE_URL and SUPABASE_KEY in .env")
        return 0

    load_data()
    from_u, to_u = from_code.strip().upper(), to_code.strip().upper()
    trains = get_trains_for_route(from_u, to_u) or []
    uploaded = 0
    for train in trains[:max_trains]:
        train_no = str(train.get("train_number") or train.get("train_no") or "").strip()
        if not train_no:
            continue
        detail = get_train_geometry_detail(train_no, from_u, to_u)
        if detail.get("point_count", 0) >= 2:
            uploaded += 1
            print(f"  ✓ {train_no} {from_u}→{to_u} ({detail.get('point_count')} pts)")
    print(f"Uploaded {uploaded} geometries for {from_u}→{to_u}")
    return uploaded


def sync_geometry(max_pairs: int = 30) -> int:
    from app.pipelines.rail.config import CITY_TO_STATION
    from app.pipelines.rail.data_loader import get_trains_for_route, load_data
    from app.pipelines.rail.geometry_builder import get_train_geometry_detail

    if not sb.is_configured():
        print("Supabase not configured — set SUPABASE_URL and SUPABASE_KEY in .env")
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
            trains = get_trains_for_route(from_u, to_u) or []
            if not trains:
                continue
            train_no = str(trains[0].get("train_number") or trains[0].get("train_no") or "").strip()
            if not train_no:
                continue
            attempts += 1
            detail = get_train_geometry_detail(train_no, from_u, to_u)
            if detail.get("point_count", 0) >= 2:
                uploaded += 1
                print(f"  ✓ {train_no} {from_u}→{to_u} ({detail.get('point_count')} pts)")
            if attempts >= max_pairs * 3:
                break

    print(f"Uploaded {uploaded} corridor geometries to Supabase")
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
    parser.add_argument("--all", action="store_true", help="Sync stations + geometry")
    args = parser.parse_args()

    if not sb.is_configured():
        print("ERROR: SUPABASE_URL / SUPABASE_KEY not set")
        sys.exit(1)

    if args.all or args.stations:
        sync_stations()
    if args.corridor:
        parts = [p.strip() for p in args.corridor.split(",") if p.strip()]
        if len(parts) != 2:
            print("ERROR: --corridor expects FROM,TO (e.g. PRYJ,BSB)")
            sys.exit(1)
        sync_geometry_corridor(parts[0], parts[1])
    elif args.all or args.geometry:
        sync_geometry(max_pairs=args.pairs)
    if not (args.all or args.stations or args.geometry or args.corridor):
        parser.print_help()


if __name__ == "__main__":
    main()
