"""
Geospatial nearest metropolitan hub discovery for rural / unmapped villages.

Villagers often name a place with no rail station or airport. We geocode the label,
then rank major interchange cities by great-circle distance.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from app.services.hub_catalog import Hub, _build_hub, _match_city_key

# Tier-1 metros + major logistics gateways (must exist in rail CITY_TO_STATION).
_METRO_HUB_CITIES: tuple[str, ...] = (
    "Delhi",
    "Mumbai",
    "Bengaluru",
    "Chennai",
    "Kolkata",
    "Hyderabad",
    "Ahmedabad",
    "Pune",
    "Jaipur",
    "Lucknow",
    "Chandigarh",
    "Nagpur",
    "Patna",
    "Bhopal",
    "Kanpur",
    "Varanasi",
    "Agra",
    "Surat",
    "Vadodara",
    "Indore",
    "Visakhapatnam",
    "Guwahati",
    "Bhubaneswar",
    "Kochi",
    "Coimbatore",
    "Prayagraj",
    "Allahabad",
    "Ranchi",
    "Raipur",
    "Jodhpur",
    "Amritsar",
)

_hub_coords_cache: dict[str, tuple[float, float] | None] = {}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _hub_coords(city: str) -> tuple[float, float] | None:
    if city in _hub_coords_cache:
        return _hub_coords_cache[city]

    from app.services.geocoder import geocode_latlng

    hit = geocode_latlng(f"{city}, India")
    _hub_coords_cache[city] = (float(hit[0]), float(hit[1])) if hit else None
    return _hub_coords_cache[city]


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


def is_remote_location(
    *,
    canonical_city: str,
    station_codes: list[str],
    lat: float | None,
    lng: float | None,
) -> bool:
    """True when the place is not a mapped metro in our rail hub catalog."""
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
    exclude = {c.lower() for c in (exclude_cities or set())}
    scored: list[tuple[float, str]] = []

    for city in _METRO_HUB_CITIES:
        if city.lower() in exclude:
            continue
        coords = _hub_coords(city)
        if not coords:
            continue
        dist = _haversine_km(lat, lng, coords[0], coords[1])
        scored.append((dist, city))

    scored.sort(key=lambda x: x[0])
    hubs: list[Hub] = []
    for dist, city in scored[:max_hubs]:
        hub = _build_hub(city, on_route=False)
        hub.tier = 1
        hub = _attach_airport(hub)
        hubs.append(hub)
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
    """Nearest metros for a geocoded endpoint (village or small town)."""
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
    Hub pairs for village-style O-D: nearest metro to source × nearest metro to dest.
    """
    src_remote = is_remote_location(
        canonical_city=src_r.canonical_city,
        station_codes=src_r.station_codes or [],
        lat=src_r.lat,
        lng=src_r.lng,
    )
    dst_remote = is_remote_location(
        canonical_city=dst_r.canonical_city,
        station_codes=dst_r.station_codes or [],
        lat=dst_r.lat,
        lng=dst_r.lng,
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

    return pairs[:max_pairs]
