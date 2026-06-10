"""
Geospatial nearest hub discovery for rural / unmapped villages.

Uses the offline hub_geo_index.json (9k+ rail stations with lat/lng) instead of
geocoding a short hardcoded metro list on every request.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from app.services.hub_catalog import Hub, _build_hub, _match_city_key
from app.services.hub_spatial_index import GeoHubPoint, nearest_hub_points


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


def _hub_from_geo_point(pt: GeoHubPoint, *, on_route: bool = False) -> Hub:
    """Build a Hub from an indexed station — prefer catalog city when mapped."""
    matched = _match_city_key(pt.label) or (pt.district and _match_city_key(pt.district))
    if matched:
        hub = _build_hub(matched, on_route=on_route)
    else:
        hub = Hub(
            city=pt.label,
            display_name=f"{pt.label}, India",
            rail_stations=[pt.code],
            airport_code=None,
            tier=2,
            on_route=on_route,
        )
    if pt.code and pt.code not in hub.rail_stations:
        hub.rail_stations = [pt.code, *hub.rail_stations]
    hub = _attach_airport(hub)
    return hub


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
    exclude = {c.strip() for c in (exclude_cities or set()) if c}
    nearest = nearest_hub_points(
        lat,
        lng,
        max_hubs=max(1, max_hubs * 3),
        exclude_labels=exclude,
    )

    hubs: list[Hub] = []
    seen_labels: set[str] = set()
    for _dist, pt in nearest:
        key = pt.label.lower()
        if key in seen_labels:
            continue
        seen_labels.add(key)
        hubs.append(_hub_from_geo_point(pt, on_route=False))
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
    """Nearest rail hubs for a geocoded endpoint (village or small town)."""
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
    Hub pairs for village-style O-D: nearest hub to source × nearest hub to dest.
    """
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

    return pairs[:max_pairs]
