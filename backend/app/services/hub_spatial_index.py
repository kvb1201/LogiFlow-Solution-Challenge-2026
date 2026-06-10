"""
Offline spatial index of 9k+ rail hub points for rural / village corridor discovery.

Loaded once from data/hub_geo_index.json — no per-request geocoding of metro lists.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

_INDEX_PATH = Path(__file__).resolve().parents[2] / "data" / "hub_geo_index.json"


@dataclass(frozen=True)
class GeoHubPoint:
    code: str
    label: str
    lat: float
    lng: float
    district: str = ""
    state: str = ""
    station_name: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "label": self.label,
            "lat": self.lat,
            "lng": self.lng,
            "district": self.district,
            "state": self.state,
            "station_name": self.station_name,
        }


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@lru_cache(maxsize=1)
def _load_points() -> tuple[GeoHubPoint, ...]:
    if not _INDEX_PATH.is_file():
        return tuple()
    try:
        raw = json.loads(_INDEX_PATH.read_text(encoding="utf-8"))
        rows = raw.get("entries") if isinstance(raw, dict) else raw
        if not isinstance(rows, list):
            return tuple()
        out: list[GeoHubPoint] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            code = str(row.get("code") or "").upper()
            if not code:
                continue
            try:
                lat = float(row["lat"])
                lng = float(row["lng"])
            except (KeyError, TypeError, ValueError):
                continue
            out.append(
                GeoHubPoint(
                    code=code,
                    label=str(row.get("label") or code),
                    lat=lat,
                    lng=lng,
                    district=str(row.get("district") or ""),
                    state=str(row.get("state") or ""),
                    station_name=str(row.get("station_name") or ""),
                )
            )
        return tuple(out)
    except Exception:
        return tuple()


def hub_index_size() -> int:
    return len(_load_points())


def nearest_hub_points(
    lat: float,
    lng: float,
    *,
    max_hubs: int = 4,
    exclude_labels: set[str] | None = None,
    exclude_codes: set[str] | None = None,
) -> list[tuple[float, GeoHubPoint]]:
    """Return (distance_km, point) sorted nearest-first."""
    points = _load_points()
    if not points:
        return []

    exclude_l = {x.strip().lower() for x in (exclude_labels or set()) if x}
    exclude_c = {x.strip().upper() for x in (exclude_codes or set()) if x}

    scored: list[tuple[float, GeoHubPoint]] = []
    for pt in points:
        if pt.code in exclude_c:
            continue
        if pt.label.lower() in exclude_l:
            continue
        dist = _haversine_km(lat, lng, pt.lat, pt.lng)
        scored.append((dist, pt))

    scored.sort(key=lambda x: x[0])
    return scored[:max_hubs]
