"""
Fetch and merge Indian Railway station catalogs from public internet sources.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from typing import Any, Callable

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
ONLINE_DIR = os.path.join(ROOT, "data", "railways_online")
MERGED_PATH = os.path.join(ONLINE_DIR, "stations_merged.json")

DATAMEET_URL = "https://raw.githubusercontent.com/datameet/railways/master/stations.json"
VSTFLUGEL_URL = (
    "https://raw.githubusercontent.com/vstflugel/indian-railway-dataset/main/list_of_stations.json"
)

CACHE_MAX_AGE_S = 7 * 24 * 3600


def _log(msg: str) -> None:
    print(msg, flush=True)


def _download(url: str, dest: str, force: bool = False, label: str = "") -> str:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if not force and os.path.exists(dest):
        age = time.time() - os.path.getmtime(dest)
        if age < CACHE_MAX_AGE_S:
            size_kb = os.path.getsize(dest) / 1024
            _log(f"  [cache] {label or dest} ({size_kb:.0f} KB, age {age / 3600:.1f}h)")
            return dest
    _log(f"  [download] {label or url} ...")
    t0 = time.monotonic()
    req = urllib.request.Request(url, headers={"User-Agent": "LogiFlow-StationCatalog/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
    with open(dest, "wb") as f:
        f.write(data)
    _log(f"  [download] {label or dest} done ({len(data) / 1024:.0f} KB, {time.monotonic() - t0:.1f}s)")
    return dest


def fetch_online_raw(force: bool = False) -> tuple[str, str]:
    datameet_path = os.path.join(ONLINE_DIR, "datameet_stations.json")
    vstflugel_path = os.path.join(ONLINE_DIR, "vstflugel_stations.json")
    _download(DATAMEET_URL, datameet_path, force=force, label="datameet stations.json")
    _download(VSTFLUGEL_URL, vstflugel_path, force=force, label="vstflugel list_of_stations.json")
    return datameet_path, vstflugel_path


def _parse_datameet(path: str, on_progress: Callable[[str], None] | None = None) -> dict[str, dict[str, Any]]:
    if on_progress:
        on_progress("Parsing datameet GeoJSON...")
    raw = json.load(open(path, encoding="utf-8"))
    out: dict[str, dict[str, Any]] = {}
    for feat in raw.get("features") or []:
        props = feat.get("properties") or {}
        code = str(props.get("code") or "").strip().upper()
        if not code:
            continue
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        lng = lat = None
        if len(coords) >= 2:
            lng, lat = float(coords[0]), float(coords[1])
        out[code] = {
            "code": code,
            "name": str(props.get("name") or code).strip(),
            "state_name": str(props.get("state") or "").strip(),
            "zone": str(props.get("zone") or "").strip(),
            "address": str(props.get("address") or "").strip(),
            "lat": lat,
            "lng": lng,
            "source": "datameet",
        }
    if on_progress:
        on_progress(f"  datameet: {len(out)} stations with geometry")
    return out


def _parse_vstflugel(path: str, on_progress: Callable[[str], None] | None = None) -> dict[str, dict[str, Any]]:
    if on_progress:
        on_progress("Parsing vstflugel catalog...")
    rows = json.load(open(path, encoding="utf-8"))
    out: dict[str, dict[str, Any]] = {}
    if not isinstance(rows, list):
        return out
    for row in rows:
        code = str(row.get("station_code") or "").strip().upper()
        if not code:
            continue
        out[code] = {
            "code": code,
            "name": str(row.get("station_name") or code).strip(),
            "region_code": str(row.get("region_code") or "").strip(),
            "source": "vstflugel",
        }
    if on_progress:
        on_progress(f"  vstflugel: {len(out)} station codes")
    return out


def merge_online_catalogs(
    datameet: dict[str, dict[str, Any]],
    vstflugel: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}

    for code, row in vstflugel.items():
        merged[code] = {
            "code": code,
            "name": row.get("name") or code,
            "state_name": "",
            "region_code": row.get("region_code") or "",
            "lat": None,
            "lng": None,
            "coord_source": None,
        }

    for code, row in datameet.items():
        base = merged.get(code) or {
            "code": code,
            "name": row.get("name") or code,
            "state_name": "",
            "region_code": "",
            "lat": None,
            "lng": None,
            "coord_source": None,
        }
        if row.get("name"):
            base["name"] = row["name"]
        if row.get("state_name"):
            base["state_name"] = row["state_name"]
        if row.get("zone"):
            base["zone"] = row["zone"]
        if row.get("lat") is not None and row.get("lng") is not None:
            base["lat"] = row["lat"]
            base["lng"] = row["lng"]
            base["coord_source"] = "datameet"
        merged[code] = base

    return merged


def load_or_fetch_merged_catalog(force: bool = False) -> dict[str, dict[str, Any]]:
    if not force and os.path.exists(MERGED_PATH):
        age = time.time() - os.path.getmtime(MERGED_PATH)
        if age < CACHE_MAX_AGE_S:
            _log(f"[catalog] Using cached merge ({age / 3600:.1f}h old)")
            raw = json.load(open(MERGED_PATH, encoding="utf-8"))
            if isinstance(raw, dict) and raw:
                return raw

    _log("[catalog] Fetching online Indian Railways station data...")
    datameet_path, vstflugel_path = fetch_online_raw(force=force)
    merged = merge_online_catalogs(
        _parse_datameet(datameet_path, on_progress=_log),
        _parse_vstflugel(vstflugel_path, on_progress=_log),
    )
    os.makedirs(ONLINE_DIR, exist_ok=True)
    with open(MERGED_PATH, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
    _log(f"[catalog] Merged {len(merged)} stations -> {MERGED_PATH}")
    return merged


def catalog_stats(catalog: dict[str, dict[str, Any]]) -> dict[str, int]:
    with_coords = sum(1 for r in catalog.values() if r.get("lat") is not None and r.get("lng") is not None)
    return {"total": len(catalog), "with_coords": with_coords, "missing_coords": len(catalog) - with_coords}
