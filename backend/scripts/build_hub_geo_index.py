#!/usr/bin/env python3
"""Build offline hub spatial index from PDF stations + station_coords_cache.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "app" / "pipelines" / "rail" / "stations_from_pdf_cache.json"
COORDS_PATH = ROOT / "app" / "pipelines" / "rail" / "station_coords_cache.json"
OUT_PATH = ROOT / "data" / "hub_geo_index.json"


def _valid_coord(lat: float, lng: float) -> bool:
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return False
    if abs(lat) < 0.01 and abs(lng) < 0.01:
        return False
    return True


def _title(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return s
    return s.title() if s.isupper() else s


def build_index() -> list[dict]:
    pdf = json.loads(PDF_PATH.read_text(encoding="utf-8"))
    coords = json.loads(COORDS_PATH.read_text(encoding="utf-8"))
    code_to_meta = {
        str(r.get("code", "")).upper(): r for r in pdf if isinstance(r, dict) and r.get("code")
    }

    entries: list[dict] = []
    seen: set[str] = set()

    for raw_code, row in coords.items():
        if not isinstance(row, dict):
            continue
        code = str(raw_code).upper()
        try:
            lat = float(row["lat"])
            lng = float(row["lng"])
        except (KeyError, TypeError, ValueError):
            continue
        if not _valid_coord(lat, lng):
            continue

        meta = code_to_meta.get(code, {})
        district = _title(meta.get("district") or meta.get("city") or "")
        station_name = str(row.get("name") or meta.get("name") or "").strip()
        label = district or _title(station_name) or code
        if dedupe in seen:
            continue
        seen.add(dedupe)

        entries.append(
            {
                "code": code,
                "label": label,
                "lat": round(lat, 5),
                "lng": round(lng, 5),
                "district": district,
                "state": _title(meta.get("state_name") or row.get("state_name") or ""),
                "station_name": station_name,
            }
        )

    entries.sort(key=lambda e: e["code"])
    return entries


def main() -> int:
    entries = build_index()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "count": len(entries),
        "source": "stations_from_pdf_cache.json + station_coords_cache.json",
        "entries": entries,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"Wrote {len(entries)} hub entries → {OUT_PATH}")
    return 0 if len(entries) >= 1000 else 1


if __name__ == "__main__":
    sys.exit(main())
