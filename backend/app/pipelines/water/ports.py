from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Iterable

from app.pipelines.water.config import PORTS
from app.pipelines.water.port_catalog import city_matches_port, search_ports

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class PortCandidate:
    port_id: str
    name: str
    lat: float
    lng: float
    coast: str
    base_congestion: float
    base_security_risk: float
    distance_km: float
    region: str = "india"
    infrastructure_quality: float = 0.8
    customs_hours: float = 8.0
    piracy_risk: float = 0.02


from app.pipelines.water.geo import haversine_km


def iter_ports() -> Iterable[dict]:
    return PORTS


def _port_dict_to_candidate(port: dict, distance_km: float = 0.0) -> PortCandidate:
    return PortCandidate(
        port_id=str(port["id"]),
        name=str(port["name"]),
        lat=float(port["lat"]),
        lng=float(port["lng"]),
        coast=str(port.get("coast", "unknown")),
        base_congestion=float(port.get("base_congestion", 0.4)),
        base_security_risk=float(port.get("base_security_risk", 0.2)),
        distance_km=float(distance_km),
        region=str(port.get("region", "india")),
        infrastructure_quality=float(port.get("infrastructure_quality", 0.8)),
        customs_hours=float(port.get("customs_hours", 8.0)),
        piracy_risk=float(port.get("piracy_risk", 0.02)),
    )


def map_port_id_to_candidates(port_id: str, n: int = 1) -> list[PortCandidate]:
    normalized = str(port_id).strip().lower()
    for p in iter_ports():
        if str(p["id"]).lower() == normalized:
            return [_port_dict_to_candidate(p, distance_km=0.0)][: max(1, n)]
    return []


def map_city_to_ports(city_name: str, n: int = 3, max_distance_km: float = 250.0, context=None) -> list[PortCandidate]:
    """
    Map a city name to the nearest N ports by geodesic distance.

    Returns an empty list if no port is within max_distance_km — water
    transport is not viable for deeply inland cities.
    """
    if not city_name:
        return []

    normalized_city = city_name.strip().lower()

    # Direct port detection — bypass geocoding for exact or alias matches (e.g. Shanghai → Pudong).
    direct_matches: list[PortCandidate] = []
    for p in iter_ports():
        if city_matches_port(normalized_city, str(p["name"]), str(p["id"])):
            direct_matches.append(_port_dict_to_candidate(p, distance_km=0.0))

    if direct_matches:
        direct_matches.sort(key=lambda c: (c.distance_km, len(c.name)))
        log.info("[water] Direct port match for '%s': %s", city_name, [m.port_id for m in direct_matches])
        return direct_matches[: max(1, n)]

    # Catalog search before geocoding — avoids bad coords for major port cities.
    catalog_hits = search_ports(city_name, limit=max(n * 3, 10))
    routable_hits = [h for h in catalog_hits if h.get("routable")]
    for hit in (routable_hits or catalog_hits)[: max(1, n)]:
        for p in iter_ports():
            if str(p["id"]) == hit["id"]:
                direct_matches.append(_port_dict_to_candidate(p, distance_km=0.0))
                break

    if direct_matches:
        log.info("[water] Catalog port match for '%s': %s", city_name, [m.port_id for m in direct_matches])
        return direct_matches[: max(1, n)]

    cache_key = f"coords:{city_name}"
    if context and context.has(cache_key):
        coords = context.get(cache_key)
        if coords is None:
            raise ValueError(f"Port or city '{city_name}' does not exist.")
        city_lat, city_lng = coords
        log.debug("[water] Coordinate cache hit: %s", cache_key)
    else:
        from app.utils.coordinates import get_coords_or_none
        coords = get_coords_or_none(city_name)
        if coords is None:
            if context:
                context.set(cache_key, None)
            raise ValueError(f"Port or city '{city_name}' does not exist.")
        city_lat, city_lng = coords
        log.debug("[water] Coordinate lookup: %s", cache_key)
        if context:
            context.set(cache_key, (city_lat, city_lng))


    candidates: list[PortCandidate] = []
    for p in iter_ports():
        d_km = haversine_km(city_lat, city_lng, float(p["lat"]), float(p["lng"]))
        candidates.append(
            PortCandidate(
                port_id=str(p["id"]),
                name=str(p["name"]),
                lat=float(p["lat"]),
                lng=float(p["lng"]),
                coast=str(p.get("coast", "unknown")),
                base_congestion=float(p.get("base_congestion", 0.4)),
                base_security_risk=float(p.get("base_security_risk", 0.2)),
                distance_km=float(d_km),
                region=str(p.get("region", "india")),
                infrastructure_quality=float(p.get("infrastructure_quality", 0.8)),
                customs_hours=float(p.get("customs_hours", 8.0)),
                piracy_risk=float(p.get("piracy_risk", 0.02)),
            )
        )

    candidates.sort(key=lambda x: x.distance_km)

    within = [c for c in candidates if c.distance_km <= max_distance_km]
    if within:
        return within[: max(1, n)]

    # No port within threshold — water transport not viable for this city.
    log.info(
        "[water] No ports within %.0fkm of %s (nearest: %.0fkm)",
        max_distance_km,
        city_name,
        candidates[0].distance_km,
    )
    return []
