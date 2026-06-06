#!/usr/bin/env python3
"""Verify checked-in India air data snapshots exist and meet minimum size."""
from __future__ import annotations

import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
AIRPORTS = DATA_DIR / "airports.csv"
ROUTES = DATA_DIR / "routes.dat"
OTP_BASELINES = DATA_DIR / "otp-baselines.json"

MIN_AIRPORTS = 20
MIN_ROUTES = 50


def main() -> None:
    missing = [p for p in (AIRPORTS, ROUTES, OTP_BASELINES) if not p.is_file()]
    if missing:
        names = ", ".join(p.name for p in missing)
        print(f"Missing air data files: {names}", file=sys.stderr)
        print("Run: make fetch-air-data", file=sys.stderr)
        raise SystemExit(1)

    airport_lines = sum(1 for _ in AIRPORTS.open(encoding="utf-8")) - 1
    route_lines = sum(1 for _ in ROUTES.open(encoding="utf-8"))

    if airport_lines < MIN_AIRPORTS:
        print(f"Too few airports: {airport_lines} < {MIN_AIRPORTS}", file=sys.stderr)
        raise SystemExit(1)
    if route_lines < MIN_ROUTES:
        print(f"Too few routes: {route_lines} < {MIN_ROUTES}", file=sys.stderr)
        raise SystemExit(1)

    routes_text = ROUTES.read_text(encoding="utf-8")
    if ",DEL," not in routes_text or ",BOM," not in routes_text:
        print("DEL/BOM corridor missing from routes.dat", file=sys.stderr)
        raise SystemExit(1)

    print(f"Air data OK: {airport_lines} airports, {route_lines} routes")


if __name__ == "__main__":
    main()
