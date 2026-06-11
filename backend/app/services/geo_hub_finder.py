"""
Geospatial hub discovery for rural / unmapped villages.

Interchange *hubs* are major catalog cities (~70) with multimodal connectivity.
The offline station index (9k+ points) is used only to pin nearest rail stops — not as hubs.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.services.hub_catalog import Hub, _build_hub, _match_city_key, list_interchange_hub_cities
from app.services.hub_spatial_index import GeoHubPoint, nearest_station_points


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _attach_airport(hub: Hub) -> Hub:
    try:
        from app.services.airport_locator_service import resolve_city_to_airport

        ap = resolve_city_to_airport(hub.city)
        code = (ap or {}).get("iata_code") or (ap or {}).get("code")
        if code and len(str(code)) == 3:
            hub.airport_code = str(code).upper()
    except Exception:
        pass
    return hub


@lru_cache(maxsize=1)
def _station_coords_by_code() -> dict[str, tuple[float, float]]:
    from app.services.hub_spatial_index import _load_points

    return {pt.code.upper(): (pt.lat, pt.lng) for pt in _load_points()}


@lru_cache(maxsize=1)
def _interchange_hub_centroids() -> dict[str, tuple[float, float]]:
    """Primary-station lat/lng for each catalog interchange city."""
    by_code = _station_coords_by_code()
    from app.services.hub_catalog import CITY_TO_STATION

    centroids: dict[str, tuple[float, float]] = {}
    for city in list_interchange_hub_cities():
        key = _match_city_key(city) or city
        for code in CITY_TO_STATION.get(city, []):
            hit = by_code.get(str(code).upper())
            if hit:
                centroids[key] = hit
                break
    return centroids


def nearest_rail_station(lat: float, lng: float) -> GeoHubPoint | None:
    """Nearest mapped rail stop — for local station pins, not interchange hub selection."""
    hits = nearest_station_points(lat, lng, max_points=1)
    return hits[0][1] if hits else None


def is_remote_location(
    *,
    canonical_city: str,
    station_codes: list[str],
    lat: float | None,
    lng: float | None,
    raw: str | None = None,
    resolution: str = "",
) -> bool:
    """True when the place is not a mapped metro in our rail hub catalog."""
    if resolution in ("village_geocoded",):
        return True
    if _match_city_key(canonical_city or ""):
        return False
    if station_codes and _match_city_key(canonical_city or ""):
        return False
    return bool(lat and lng) or bool((canonical_city or "").strip())


def nearest_metropolitan_hubs(
    lat: float,
    lng: float,
    *,
    max_hubs: int = 4,
    exclude_cities: set[str] | None = None,
) -> list[Hub]:
    """
    Nearest major interchange cities from the rail catalog — Delhi, Kanpur, Moradabad, etc.
    Does not treat every indexed rail stop as a hub.
    """
    exclude = {_match_city_key(c) or c.strip().lower() for c in (exclude_cities or set()) if c}
    centroids = _interchange_hub_centroids()

    scored: list[tuple[float, str]] = []
    for city, coords in centroids.items():
        key = _match_city_key(city) or city
        if key.lower() in exclude or city.lower() in exclude:
            continue
        dist = _haversine_km(lat, lng, coords[0], coords[1])
        scored.append((dist, city))

    scored.sort(key=lambda x: x[0])

    hubs: list[Hub] = []
    seen: set[str] = set()
    for _dist, city in scored:
        key = (_match_city_key(city) or city).lower()
        if key in seen:
            continue
        seen.add(key)
        hubs.append(_attach_airport(_build_hub(city, on_route=False)))
        if len(hubs) >= max_hubs:
            break
    return hubs


def hubs_for_resolved_place(
    *,
    raw: str,
    canonical_city: str,
    station_codes: list[str],
    lat: float | None,
    lng: float | None,
    max_hubs: int = 4,
    exclude_cities: set[str] | None = None,
) -> list[Hub]:
    """Nearest catalog interchange hubs for a geocoded endpoint (village or small town)."""
    coords: tuple[float, float] | None = None
    if lat is not None and lng is not None:
        coords = (float(lat), float(lng))

    if not coords:
        from app.services.geocoder import geocode_latlng

        for label in (canonical_city, raw):
            if not label:
                continue
            hit = geocode_latlng(label)
            if hit:
                coords = (float(hit[0]), float(hit[1]))
                break

    if not coords:
        return []

    exclude = set(exclude_cities or set())
    if canonical_city:
        exclude.add(canonical_city)
    matched = _match_city_key(canonical_city or raw)
    if matched:
        exclude.add(matched)

    return nearest_metropolitan_hubs(
        coords[0],
        coords[1],
        max_hubs=max_hubs,
        exclude_cities=exclude,
    )


@dataclass
class HubPair:
    origin_hub: Hub
    dest_hub: Hub
    strategy: str = "geo_rural"

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "origin_hub": self.origin_hub.to_dict(),
            "dest_hub": self.dest_hub.to_dict(),
        }


def discover_rural_hub_pairs(
    src_r: Any,
    dst_r: Any,
    *,
    max_pairs: int = 6,
    hubs_per_end: int = 3,
) -> list[HubPair]:
    """
    Hub pairs for village-style O-D: nearest catalog metro × nearest catalog metro.
    """
    from app.services.rural_hub_cache import (
        get_cached_rural_hub_pairs,
        rural_hub_cache_key,
        set_cached_rural_hub_pairs,
    )

    hub_key = rural_hub_cache_key(
        src_r.lat,
        src_r.lng,
        dst_r.lat,
        dst_r.lng,
        max_pairs=max_pairs,
        hubs_per_end=hubs_per_end,
    )
    cached = get_cached_rural_hub_pairs(hub_key)
    if cached is not None:
        return cached

    src_remote = is_remote_location(
        canonical_city=src_r.canonical_city,
        station_codes=src_r.station_codes or [],
        lat=src_r.lat,
        lng=src_r.lng,
        raw=getattr(src_r, "raw", None),
        resolution=getattr(src_r, "resolution", ""),
    )
    dst_remote = is_remote_location(
        canonical_city=dst_r.canonical_city,
        station_codes=dst_r.station_codes or [],
        lat=dst_r.lat,
        lng=dst_r.lng,
        raw=getattr(dst_r, "raw", None),
        resolution=getattr(dst_r, "resolution", ""),
    )

    src_metro = _match_city_key(src_r.canonical_city or src_r.raw)
    dst_metro = _match_city_key(dst_r.canonical_city or dst_r.raw)

    origin_hubs: list[Hub] = []
    dest_hubs: list[Hub] = []

    if src_remote:
        origin_hubs = hubs_for_resolved_place(
            raw=src_r.raw,
            canonical_city=src_r.canonical_city,
            station_codes=src_r.station_codes or [],
            lat=src_r.lat,
            lng=src_r.lng,
            max_hubs=hubs_per_end,
            exclude_cities={dst_r.canonical_city, dst_metro or ""},
        )
    elif src_metro:
        origin_hubs = [_attach_airport(_build_hub(src_metro, on_route=True))]

    if dst_remote:
        dest_hubs = hubs_for_resolved_place(
            raw=dst_r.raw,
            canonical_city=dst_r.canonical_city,
            station_codes=dst_r.station_codes or [],
            lat=dst_r.lat,
            lng=dst_r.lng,
            max_hubs=hubs_per_end,
            exclude_cities={src_r.canonical_city, src_metro or ""},
        )
    elif dst_metro:
        dest_hubs = [_attach_airport(_build_hub(dst_metro, on_route=True))]

    if not origin_hubs or not dest_hubs:
        return []

    pairs: list[HubPair] = []
    for oh in origin_hubs:
        for dh in dest_hubs:
            if oh.city == dh.city:
                continue
            pairs.append(HubPair(origin_hub=oh, dest_hub=dh, strategy="geo_rural"))

    result = pairs[:max_pairs]
    if result:
        set_cached_rural_hub_pairs(hub_key, result)
    return result
