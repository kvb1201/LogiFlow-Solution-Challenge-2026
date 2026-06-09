#!/usr/bin/env python3
"""
Download and trim OpenFlights + OurAirports data to India-focused snapshots.

Writes:
  backend/data/airports.csv   — Indian airports with scheduled service + IATA
  backend/data/routes.dat     — routes where both endpoints are in that set

Sources (free, attribution in README):
  https://ourairports.com/data/airports.csv
  https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat
"""
from __future__ import annotations

import csv
import sys
import urllib.request
from pathlib import Path

OURAIRPORTS_URL = "https://ourairports.com/data/airports.csv"
OPENFLIGHTS_ROUTES_URL = (
    "https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat"
)

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
AIRPORTS_OUT = DATA_DIR / "airports.csv"
ROUTES_OUT = DATA_DIR / "routes.dat"

# OurAirports columns we keep (full header row preserved for DictReader compat).
AIRPORT_COLUMNS = [
    "id",
    "ident",
    "type",
    "name",
    "latitude_deg",
    "longitude_deg",
    "elevation_ft",
    "continent",
    "iso_country",
    "iso_region",
    "municipality",
    "scheduled_service",
    "gps_code",
    "iata_code",
    "local_code",
    "home_link",
    "wikipedia_link",
    "keywords",
]

AIRPORT_TYPES = {"large_airport", "medium_airport", "small_airport"}


def _download(url: str, dest: Path) -> None:
    print(f"Downloading {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "LogiFlow-air-data-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())


def _filter_airports(raw_csv: Path) -> tuple[list[dict], set[str]]:
    rows: list[dict] = []
    iata_codes: set[str] = set()

    with raw_csv.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row.get("iso_country") != "IN":
                continue
            if row.get("type") not in AIRPORT_TYPES:
                continue
            if row.get("scheduled_service") not in {"yes", "1", "true", "True"}:
                continue
            iata = (row.get("iata_code") or "").strip().upper()
            if len(iata) != 3:
                continue
            rows.append({col: row.get(col, "") for col in AIRPORT_COLUMNS})
            iata_codes.add(iata)

    rows.sort(key=lambda r: (r.get("type", ""), r.get("name", "")))
    return rows, iata_codes


def _write_airports(rows: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with AIRPORTS_OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=AIRPORT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} airports -> {AIRPORTS_OUT}")


def _filter_routes(raw_routes: Path, iata_codes: set[str]) -> list[list[str]]:
    kept: list[list[str]] = []
    with raw_routes.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        for row in reader:
            if len(row) < 9:
                continue
            source = (row[2] or "").strip().upper()
            dest = (row[4] or "").strip().upper()
            if source in iata_codes and dest in iata_codes and source != dest:
                kept.append(row)
    kept.sort(key=lambda r: (r[2], r[4], r[0]))
    return kept


def _write_routes(rows: list[list[str]]) -> None:
    with ROUTES_OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)
    print(f"Wrote {len(rows)} routes -> {ROUTES_OUT}")


def verify() -> None:
    if not AIRPORTS_OUT.is_file() or not ROUTES_OUT.is_file():
        raise SystemExit("Verification failed: output files missing")

    with AIRPORTS_OUT.open("r", encoding="utf-8") as handle:
        airport_count = sum(1 for _ in handle) - 1
    with ROUTES_OUT.open("r", encoding="utf-8") as handle:
        route_count = sum(1 for _ in handle)

    if airport_count < 20:
        raise SystemExit(f"Verification failed: only {airport_count} airports")
    if route_count < 50:
        raise SystemExit(f"Verification failed: only {route_count} routes")

    # Spot-check corridors used in tests.
    routes_text = ROUTES_OUT.read_text(encoding="utf-8")
    if ",DEL," not in routes_text or ",BOM," not in routes_text:
        raise SystemExit("Verification failed: DEL/BOM corridor missing")

    print(f"Verified: {airport_count} airports, {route_count} routes")


def main() -> None:
    tmp_dir = DATA_DIR / ".fetch_tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    raw_airports = tmp_dir / "airports_raw.csv"
    raw_routes = tmp_dir / "routes_raw.dat"

    try:
        _download(OURAIRPORTS_URL, raw_airports)
        _download(OPENFLIGHTS_ROUTES_URL, raw_routes)

        airport_rows, iata_codes = _filter_airports(raw_airports)
        if not airport_rows:
            raise SystemExit("No Indian airports matched filter criteria")

        route_rows = _filter_routes(raw_routes, iata_codes)
        if not route_rows:
            raise SystemExit("No intra-India routes matched filter criteria")

        _write_airports(airport_rows)
        _write_routes(route_rows)
        verify()
    finally:
        for path in (raw_airports, raw_routes):
            if path.exists():
                path.unlink()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"fetch_air_data failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
