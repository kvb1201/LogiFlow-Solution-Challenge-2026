from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from app.pipelines.water.config import PORTS
from app.utils.coordinates import get_coords


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


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math

    r = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def iter_ports() -> Iterable[dict]:
    return PORTS


def map_city_to_ports(city_name: str, n: int = 3, max_distance_km: float = 400.0, context=None) -> list[PortCandidate]:
    """
    Map a city name to the nearest N ports by geodesic distance.

    Returns an empty list if no port is within max_distance_km — water
    transport is not viable for deeply inland cities.
    """
    if not city_name:
        return []

    normalized_city = city_name.strip().lower()

    # Step 2 & 3: Direct port detection — bypass geocoding/distance if city matches a port
    direct_matches: list[PortCandidate] = []
    for p in iter_ports():
        p_id_norm = str(p["id"]).lower()
        p_name_norm = str(p["name"]).lower()
        
        # Check for strict alias matching like "mumbai" -> "mumbai" or "nhava sheva" -> jnpt
        # A simple check: if the normalized city matches the id, or is in the name.
        if normalized_city == p_id_norm or normalized_city in p_name_norm:
            direct_matches.append(
                PortCandidate(
                    port_id=str(p["id"]),
                    name=str(p["name"]),
                    lat=float(p["lat"]),
                    lng=float(p["lng"]),
                    coast=str(p.get("coast", "unknown")),
                    base_congestion=float(p.get("base_congestion", 0.4)),
                    base_security_risk=float(p.get("base_security_risk", 0.2)),
                    distance_km=0.0,
                )
            )

    if direct_matches:
        print(f"[WATER] Direct port match for '{city_name}': {[m.port_id for m in direct_matches]}")
        return direct_matches[: max(1, n)]

    cache_key = f"coords:{city_name}"
    if context and context.has(cache_key):
        city_lat, city_lng = context.get(cache_key)
        print(f"[CACHE HIT] {cache_key}")
    else:
        city_lat, city_lng = get_coords(city_name)
        print(f"[API CALL] {cache_key}")
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
            )
        )

    candidates.sort(key=lambda x: x.distance_km)

    within = [c for c in candidates if c.distance_km <= max_distance_km]
    if within:
        return within[: max(1, n)]

    # No port within threshold — water transport not viable for this city.
    print(f"[WATER] No ports within {max_distance_km}km of {city_name} (nearest: {candidates[0].distance_km:.0f}km)")
    return []

