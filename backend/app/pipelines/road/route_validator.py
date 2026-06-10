"""
Route validity guard for the road pipeline.

Detects corridors that are physically impossible to drive
(trans-oceanic, inter-continental without a land bridge) and
rejects them BOTH for fallback routes AND for any route returned
by TomTom (which can sometimes route via ferries or return bad data).

The check is deterministic and based on coordinate geography — no API call required.
"""
from __future__ import annotations

import math
from typing import Optional


# ---------------------------------------------------------------------------
# Continent bounding boxes (rough, for fast classification)
# ---------------------------------------------------------------------------

_CONTINENTS = {
    "north_america": (-170, 15, -50, 85),    # lon_min, lat_min, lon_max, lat_max
    "south_america": (-85, -60, -30, 15),
    "europe":        (-25, 35, 45, 72),
    "africa":        (-20, -40, 55, 38),
    "asia":          (25, 5, 180, 80),
    "oceania":       (110, -50, 180, -10),
    "central_asia":  (45, 25, 90, 55),       # overlap with asia/europe — land bridge
}

# Continent pairs that are NOT connected by a continuous land road
# (require ferry, ship, or air for any realistic journey).
# This applies regardless of whether TomTom returns a route or not.
_OCEAN_SEPARATED = frozenset({
    frozenset({"north_america", "europe"}),
    frozenset({"north_america", "africa"}),
    frozenset({"north_america", "asia"}),
    frozenset({"north_america", "oceania"}),
    frozenset({"south_america", "europe"}),
    frozenset({"south_america", "africa"}),
    frozenset({"south_america", "asia"}),
    frozenset({"south_america", "oceania"}),
    frozenset({"europe", "oceania"}),
    frozenset({"africa", "oceania"}),
    # Asia ↔ Oceania is separated (no land bridge)
    frozenset({"asia", "oceania"}),
})

# Maximum straight-line distance for which a road route is plausible
# even within a connected landmass.  Routes beyond this threshold are
# physically unreachable by road without crossing an ocean.
_MAX_ROAD_DISTANCE_KM = 4000


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _classify_continent(lat: float, lon: float) -> Optional[str]:
    """Return the continent name for a coordinate, or None if ambiguous."""
    for name, (lon_min, lat_min, lon_max, lat_max) in _CONTINENTS.items():
        if lon_min <= lon <= lon_max and lat_min <= lat <= lat_max:
            return name
    return None


def is_physically_drivable(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    distance_km: Optional[float] = None,
) -> tuple[bool, str]:
    """
    Return (drivable: bool, reason: str).

    A route is NOT drivable by road when:
      1. Source and destination are on ocean-separated continents (hard block).
      2. The straight-line distance exceeds _MAX_ROAD_DISTANCE_KM — no confirmed
         continuous road network spans that distance without crossing water.

    This check applies to BOTH real TomTom routes and fallback estimates.
    TomTom occasionally routes via ferry links or returns misleading data for
    physically impossible corridors; this guard prevents those from propagating.
    """
    dist_km = distance_km if distance_km is not None else _haversine_km(lat1, lon1, lat2, lon2)

    c1 = _classify_continent(lat1, lon1)
    c2 = _classify_continent(lat2, lon2)

    # Hard block: ocean-separated continents
    if c1 and c2 and c1 != c2:
        pair = frozenset({c1, c2})
        if pair in _OCEAN_SEPARATED:
            return False, (
                f"No drivable road route between {c1.replace('_', ' ').title()} "
                f"and {c2.replace('_', ' ').title()}. "
                f"This corridor requires sea or air transport."
            )

    # Distance guard: extreme distances are unreachable by a continuous road network
    if dist_km > _MAX_ROAD_DISTANCE_KM:
        return False, (
            f"Straight-line distance ({dist_km:.0f} km) exceeds the maximum "
            f"plausible road-only threshold ({_MAX_ROAD_DISTANCE_KM} km). "
            f"No confirmed drivable route exists for this corridor."
        )

    return True, ""


def validate_corridor(
    source_coords: tuple[float, float],
    dest_coords: tuple[float, float],
) -> tuple[bool, str]:
    """
    Validate whether ANY road route (real or fallback) should be generated
    for this corridor.

    Returns (is_valid: bool, rejection_reason: str).
    Call this BEFORE processing TomTom results AND before generating fallbacks.
    """
    lat1, lon1 = source_coords
    lat2, lon2 = dest_coords
    dist_km = _haversine_km(lat1, lon1, lat2, lon2)
    return is_physically_drivable(lat1, lon1, lat2, lon2, dist_km)


# Backward-compatible alias used by the existing fallback code
def validate_fallback_route(
    source_coords: tuple[float, float],
    dest_coords: tuple[float, float],
) -> tuple[bool, str]:
    """Alias for validate_corridor — kept for backward compatibility."""
    return validate_corridor(source_coords, dest_coords)
