from __future__ import annotations

import re
import time
import threading
from dataclasses import dataclass, field
from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from typing import Any, Optional

from app.models.domain import ShipmentReport
from app.utils.coordinates import get_coords

# ---------------------------------------------------------------------------
# Nominatim rate-limit guard (max 1 request/second, shared across threads)
# ---------------------------------------------------------------------------
_nominatim_lock = threading.Lock()
_last_nominatim_call: float = 0.0
_NOMINATIM_MIN_INTERVAL = 1.1  # seconds


def _nominatim_reverse(lat: float, lng: float, zoom: int = 10) -> dict[str, Any]:
    """Rate-limited Nominatim reverse geocode. Returns parsed JSON or {}."""
    global _last_nominatim_call
    import json, urllib.request

    with _nominatim_lock:
        gap = time.monotonic() - _last_nominatim_call
        if gap < _NOMINATIM_MIN_INTERVAL:
            time.sleep(_NOMINATIM_MIN_INTERVAL - gap)
        _last_nominatim_call = time.monotonic()

    url = (
        f"https://nominatim.openstreetmap.org/reverse?"
        f"format=json&lat={lat}&lon={lng}&zoom={zoom}&addressdetails=1"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "LogiFlow-RouteIntel/3.0"})
    try:
        with urllib.request.urlopen(req, timeout=4) as r:
            return json.loads(r.read().decode())
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Haversine helpers
# ---------------------------------------------------------------------------

def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    x = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(max(0.0, x)))


def _haversine_distance_km(city_a: str, city_b: str) -> float:
    ca = get_coords(city_a)
    cb = get_coords(city_b)
    if not ca or not cb:
        return 0.0
    return round(_haversine_km(ca, cb), 1)


# ---------------------------------------------------------------------------
# Accepted place types from Nominatim address fields (in priority order)
# Roads, industrial areas, suburbs and localities are intentionally excluded.
# ---------------------------------------------------------------------------
_ACCEPTED_TYPES = ("city", "town", "municipality", "village", "hamlet")
_REJECTED_OSM_CATEGORIES = frozenset({"highway", "industrial", "suburb", "locality", "neighbourhood"})


def _extract_place_name(data: dict[str, Any]) -> tuple[str, str]:
    """
    Return (name, type) from a Nominatim reverse-geocode response.
    Returns ("", "") when the result is a road/industrial/suburb/locality.
    """
    if not data:
        return "", ""

    # Reject roads, industrial, suburb, locality at the category level
    osm_type = (data.get("type") or "").lower()
    osm_class = (data.get("class") or "").lower()
    if osm_class in _REJECTED_OSM_CATEGORIES or osm_type in _REJECTED_OSM_CATEGORIES:
        return "", ""

    addr = data.get("address") or {}
    for place_type in _ACCEPTED_TYPES:
        name = addr.get(place_type, "").strip()
        if name:
            return name, place_type

    return "", ""


# ---------------------------------------------------------------------------
# Phase 1 — Geometry-Based Checkpoint Generation (PRIMARY path)
# ---------------------------------------------------------------------------

@dataclass
class RouteCheckpoint:
    name: str
    place_type: str          # city | town | municipality | village | fallback
    distance_from_start: float  # km along the route
    latitude: float
    longitude: float
    source: str              # "geometry" | "corridor" | "waypoint"


def _geometry_sampling_interval_km(total_km: float) -> float:
    """Sampling interval based on route length — spec requirement."""
    if total_km < 100:
        return 10.0
    if total_km < 300:
        return 15.0
    if total_km < 800:
        return 25.0
    return 40.0


def _build_checkpoints_from_geometry(
    geometry: list[list[float]],   # [[lng, lat], ...]
    total_route_km: float,
) -> list[RouteCheckpoint]:
    """
    Phase 1 primary path.

    Walk the polyline by accumulating arc-length. Each time we cross a
    sampling interval boundary, reverse-geocode that coordinate. Accepted
    place types (city/town/village/municipality) become checkpoints.
    Roads, industrial areas, suburbs, localities are ignored.

    Returns a list of RouteCheckpoint sorted by distance_from_start.
    Consecutive duplicates (same normalised name) are collapsed.
    """
    if len(geometry) < 2:
        return []

    interval = _geometry_sampling_interval_km(total_route_km)
    checkpoints: list[RouteCheckpoint] = []
    seen_names: set[str] = set()

    accumulated_km = 0.0
    next_sample_km = interval  # first sample after one interval

    for i in range(1, len(geometry)):
        prev_pt = geometry[i - 1]
        curr_pt = geometry[i]
        if len(prev_pt) < 2 or len(curr_pt) < 2:
            continue

        prev_lng, prev_lat = float(prev_pt[0]), float(prev_pt[1])
        curr_lng, curr_lat = float(curr_pt[0]), float(curr_pt[1])
        seg_km = _haversine_km((prev_lat, prev_lng), (curr_lat, curr_lng))

        # Walk through all sampling boundaries this segment crosses
        while accumulated_km + seg_km >= next_sample_km:
            # Interpolate exact sample point
            frac = (next_sample_km - accumulated_km) / max(seg_km, 1e-9)
            s_lat = prev_lat + frac * (curr_lat - prev_lat)
            s_lng = prev_lng + frac * (curr_lng - prev_lng)
            sample_dist = next_sample_km

            # Reverse geocode
            rg = _nominatim_reverse(s_lat, s_lng, zoom=10)
            name, ptype = _extract_place_name(rg)

            if name:
                norm = name.lower()
                if norm not in seen_names:
                    seen_names.add(norm)
                    checkpoints.append(RouteCheckpoint(
                        name=name,
                        place_type=ptype,
                        distance_from_start=round(sample_dist, 2),
                        latitude=round(s_lat, 6),
                        longitude=round(s_lng, 6),
                        source="geometry",
                    ))

            next_sample_km += interval

        accumulated_km += seg_km

    # Sort by distance (should already be sorted, but guarantee it)
    checkpoints.sort(key=lambda c: c.distance_from_start)
    return checkpoints


# ---------------------------------------------------------------------------
# Phase 1 — Corridor fallback (secondary path)
# ---------------------------------------------------------------------------

_NEAR_CITY_MAP: dict[str, str] = {
    # Gujarat
    "bharuch": "bharuch", "ankleshwar": "bharuch", "jhagadia": "bharuch",
    "karjan": "vadodara", "padra": "vadodara", "dabhoi": "vadodara",
    "petlad": "anand", "kheda": "anand", "borsad": "anand",
    "nadiad": "nadiad", "mahemdabad": "nadiad", "matar": "nadiad",
    "sanand": "ahmedabad", "bavla": "ahmedabad", "dholka": "ahmedabad",
    "kosamba": "surat", "olpad": "surat", "kamrej": "surat",
    "bardoli": "surat", "navsari": "surat", "vapi": "surat",
    # Mumbai
    "thane": "thane", "kalyan": "kalyan", "ulhasnagar": "kalyan",
    "ambarnath": "kalyan", "badlapur": "kalyan",
    "panvel": "panvel", "navi mumbai": "panvel", "nerul": "panvel",
    "khopoli": "panvel",
    # Delhi
    "new delhi": "delhi", "gurgaon": "delhi", "gurugram": "delhi",
    "faridabad": "delhi", "noida": "delhi", "ghaziabad": "delhi",
    "sonipat": "delhi", "bahadurgarh": "delhi",
    # Misc
    "lonavala": "pune",
    "electronic city": "bengaluru", "whitefield": "bengaluru",
    "hosur": "bengaluru", "tumkur": "bengaluru", "tumkuru": "bengaluru",
    "secunderabad": "hyderabad", "cyberabad": "hyderabad", "bhongir": "hyderabad",
    "tambaram": "chennai", "kanchipuram": "chennai",
    "chengalpattu": "chennai", "avadi": "chennai",
    "howrah": "kolkata", "durgapur": "kolkata", "asansol": "kolkata",
    "bombay": "mumbai", "bangalore": "bengaluru", "calcutta": "kolkata",
    "madras": "chennai", "allahabad": "prayagraj", "nasik": "nashik",
}

_CORRIDORS: list[tuple[tuple[str, str], list[str]]] = [
    (("surat", "ahmedabad"),    ["bharuch", "ankleshwar", "vadodara", "anand", "nadiad"]),
    (("surat", "vadodara"),     ["bharuch", "ankleshwar", "karjan"]),
    (("vadodara", "ahmedabad"), ["anand", "nadiad"]),
    (("bharuch", "ahmedabad"),  ["vadodara", "anand", "nadiad"]),
    (("bharuch", "vadodara"),   ["ankleshwar", "karjan"]),
    (("surat", "bharuch"),      ["ankleshwar"]),
    (("mumbai", "pune"),        ["thane", "panvel", "lonavala"]),
    (("mumbai", "nashik"),      ["thane", "kalyan", "igatpuri"]),
    (("mumbai", "surat"),       ["thane", "vapi", "navsari"]),
    (("mumbai", "vadodara"),    ["thane", "vapi", "surat", "bharuch", "ankleshwar"]),
    (("pune", "hyderabad"),     ["solapur", "gulbarga"]),
    (("delhi", "mumbai"),       ["kota", "ratlam", "indore", "vadodara", "surat"]),
    (("delhi", "surat"),        ["kota", "ratlam", "indore", "vadodara"]),
    (("delhi", "vadodara"),     ["kota", "ratlam", "indore"]),
    (("delhi", "jaipur"),       ["alwar", "behror"]),
    (("delhi", "amritsar"),     ["ambala", "ludhiana", "jalandhar"]),
    (("delhi", "lucknow"),      ["aligarh", "kannauj", "kanpur"]),
    (("delhi", "kolkata"),      ["kanpur", "varanasi", "patna", "dhanbad"]),
    (("delhi", "chennai"),      ["agra", "bhopal", "nagpur", "hyderabad"]),
    (("agra", "varanasi"),      ["prayagraj"]),
    (("mumbai", "bengaluru"),   ["pune", "solapur", "gulbarga"]),
    (("bengaluru", "chennai"),  ["hosur", "krishnagiri", "vellore"]),
    (("chennai", "kolkata"),    ["vijayawada", "visakhapatnam", "bhubaneswar"]),
    (("kolkata", "guwahati"),   ["siliguri", "jalpaiguri"]),
    (("hyderabad", "bengaluru"), ["kurnool", "anantapur"]),
    (("hyderabad", "mumbai"),   ["solapur", "pune"]),
    (("chennai", "hyderabad"),  ["nellore", "ongole"]),
]


def _normalize_city(name: str) -> str:
    n = re.sub(r"\s+", " ", name.strip().lower())
    return _NEAR_CITY_MAP.get(n, n)


def _intermediate_cities_between(city_a: str, city_b: str) -> list[str]:
    a_key = _normalize_city(city_a)
    b_key = _normalize_city(city_b)
    for (ep_a, ep_b), cities in _CORRIDORS:
        if a_key == ep_a and b_key == ep_b:
            return cities
        if a_key == ep_b and b_key == ep_a:
            return list(reversed(cities))
    return []


def _checkpoints_from_corridor(
    source: str,
    destination: str,
    stops: list[str],
    route_total_km: float,
    wp_cumulative: list[float],
    waypoints: list[str],
) -> list[RouteCheckpoint]:
    """
    Corridor fallback: produce RouteCheckpoint objects from the static table.
    Uses coordinate projection for distance_from_start.
    """
    checkpoints: list[RouteCheckpoint] = []
    seen: set[str] = set()
    wp_coords = [get_coords(w) for w in waypoints]

    def _dist_for(city: str) -> float:
        city_lower = city.lower()
        for i, wp in enumerate(waypoints):
            if wp.lower() == city_lower:
                return wp_cumulative[i]
        coords = get_coords(city)
        if not coords:
            straight = _haversine_distance_km(source, city)
            return min(straight, route_total_km)
        c_lat, c_lng = coords
        best_dist = float("inf")
        best_d = 0.0
        for i in range(len(waypoints) - 1):
            a, b = wp_coords[i], wp_coords[i + 1]
            if not a or not b:
                continue
            ax, ay = a[1], a[0]
            bx, by = b[1], b[0]
            cx, cy = c_lng, c_lat
            dx, dy = bx - ax, by - ay
            seg_sq = dx * dx + dy * dy
            t = 0.0 if seg_sq < 1e-12 else max(0.0, min(1.0, ((cx - ax) * dx + (cy - ay) * dy) / seg_sq))
            proj_lat = a[0] + t * (b[0] - a[0])
            proj_lng = a[1] + t * (b[1] - a[1])
            d = _haversine_km((c_lat, c_lng), (proj_lat, proj_lng))
            if d < best_dist:
                best_dist = d
                best_d = wp_cumulative[i] + t * (wp_cumulative[i + 1] - wp_cumulative[i])
        return best_d

    raw_cities: list[str] = []
    for i, wp in enumerate(waypoints):
        raw_cities.append(wp)
        if i < len(waypoints) - 1:
            for ic in _intermediate_cities_between(wp, waypoints[i + 1]):
                raw_cities.append(ic)

    for city in raw_cities:
        key = city.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        coords = get_coords(city)
        checkpoints.append(RouteCheckpoint(
            name=city,
            place_type="city",
            distance_from_start=_dist_for(city),
            latitude=round(coords[0], 6) if coords else 0.0,
            longitude=round(coords[1], 6) if coords else 0.0,
            source="corridor",
        ))

    checkpoints.sort(key=lambda c: c.distance_from_start)
    return checkpoints


# ---------------------------------------------------------------------------
# Phase 1 — build_route_intelligence (orchestrator)
# ---------------------------------------------------------------------------

def build_route_intelligence(
    source: str,
    destination: str,
    stops: list[str],
    optimization_result: Optional[dict[str, Any]],
    estimated_time_hours: Optional[float] = None,
) -> dict[str, Any]:
    """
    Build route_intelligence.

    Pipeline:
      PRIMARY  → geometry-based checkpoints (distance-sampled + reverse-geocoded)
      FALLBACK → corridor table when geometry is absent or produces < 3 checkpoints

    Returns:
      checkpoints  — list of {name, place_type, distance_from_start, lat, lng, source}
      route_cities — ordered list of city names (for backward-compat display)
      source       — "geometry" | "corridor"
      total_km_estimate
    """
    waypoints = [source, *(stops or []), destination]

    # ── Cumulative waypoint distances ────────────────────────────────
    wp_coords = [get_coords(w) for w in waypoints]
    wp_cumulative: list[float] = [0.0]
    for i in range(1, len(waypoints)):
        a, b = wp_coords[i - 1], wp_coords[i]
        if a and b:
            seg_km = _haversine_km(a, b)
        else:
            seg_km = 0.0
        wp_cumulative.append(wp_cumulative[-1] + seg_km)

    total_km = (
        wp_cumulative[-1]
        or _haversine_distance_km(source, destination)
        or (float(estimated_time_hours or 0) * 55)
        or 1.0
    )

    # ── Try geometry path ────────────────────────────────────────────
    geometry: list[list[float]] = []
    if optimization_result:
        # road: result.best.geometry  or  result.all[0].geometry
        best = optimization_result.get("best") or {}
        geometry = best.get("geometry") or []
        if not geometry:
            all_routes = optimization_result.get("all") or []
            if all_routes and isinstance(all_routes[0], dict):
                geometry = all_routes[0].get("geometry") or []

    geometry_checkpoints: list[RouteCheckpoint] = []
    intelligence_source = "corridor"

    if len(geometry) >= 4:
        try:
            geometry_checkpoints = _build_checkpoints_from_geometry(geometry, total_km)
            intelligence_source = "geometry"
        except Exception as exc:
            print(f"[RouteIntel] Geometry path failed: {exc}")
            geometry_checkpoints = []

    # ── Add endpoint waypoints to the geometry checkpoint list ───────
    # Always prepend source and append destination so the list is complete.
    if geometry_checkpoints:
        src_coords = wp_coords[0]
        dst_coords = wp_coords[-1]
        source_cp = RouteCheckpoint(
            name=source,
            place_type="waypoint",
            distance_from_start=0.0,
            latitude=round(src_coords[0], 6) if src_coords else 0.0,
            longitude=round(src_coords[1], 6) if src_coords else 0.0,
            source="waypoint",
        )
        dest_cp = RouteCheckpoint(
            name=destination,
            place_type="waypoint",
            distance_from_start=round(total_km, 2),
            latitude=round(dst_coords[0], 6) if dst_coords else 0.0,
            longitude=round(dst_coords[1], 6) if dst_coords else 0.0,
            source="waypoint",
        )
        # De-duplicate endpoint names if already present from geocoding
        src_lower = source.lower()
        dst_lower = destination.lower()
        geometry_checkpoints = [
            c for c in geometry_checkpoints
            if c.name.lower() != src_lower and c.name.lower() != dst_lower
        ]
        geometry_checkpoints = sorted(
            [source_cp] + geometry_checkpoints + [dest_cp],
            key=lambda c: c.distance_from_start,
        )

    # ── Use corridor fallback when geometry produced < 3 checkpoints ─
    use_geometry = len(geometry_checkpoints) >= 3
    if not use_geometry:
        print(f"[RouteIntel] Falling back to corridor table for {source}→{destination} "
              f"(geometry gave {len(geometry_checkpoints)} checkpoints)")
        corridor_checkpoints = _checkpoints_from_corridor(
            source, destination, stops, total_km, wp_cumulative, waypoints
        )
        final_checkpoints = corridor_checkpoints
        intelligence_source = "corridor"
    else:
        final_checkpoints = geometry_checkpoints

    # ── Build backward-compat route_cities list ──────────────────────
    # De-duplicate by normalised name while preserving order
    route_cities: list[str] = []
    seen_rc: set[str] = set()
    for cp in final_checkpoints:
        key = cp.name.strip().lower()
        if key not in seen_rc:
            seen_rc.add(key)
            route_cities.append(cp.name)

    return {
        "checkpoints": [
            {
                "name": cp.name,
                "place_type": cp.place_type,
                "distance_from_start": cp.distance_from_start,
                "latitude": cp.latitude,
                "longitude": cp.longitude,
                "source": cp.source,
            }
            for cp in final_checkpoints
        ],
        "route_cities": route_cities,
        "source": source,
        "destination": destination,
        "total_km_estimate": round(total_km, 1),
        "intelligence_source": intelligence_source,
    }


def enrich_optimization_result_with_intelligence(
    optimization_result: Optional[dict[str, Any]],
    source: str,
    destination: str,
    stops: list[str],
    estimated_time_hours: Optional[float] = None,
) -> dict[str, Any]:
    result = dict(optimization_result or {})
    if "route_intelligence" not in result:
        result["route_intelligence"] = build_route_intelligence(
            source, destination, stops, optimization_result, estimated_time_hours
        )
    return result


# ---------------------------------------------------------------------------
# Requirements 3 & 4 — Dynamic progress and ETA derived from route geometry
# ---------------------------------------------------------------------------

# Route speed model — used when no pipeline result is available
_MODE_SPEED: dict[str, float] = {
    "road":   55.0,
    "air":   700.0,
    "rail":   80.0,
    "water":  25.0,
    "hybrid": 55.0,
}


def _cumulative_distances(cities: list[str]) -> list[float]:
    """
    Cumulative haversine distances [0.0, d01, d01+d12, …] along a city list.
    Unknown coordinates contribute 0 km to that segment.
    """
    cum: list[float] = [0.0]
    for i in range(1, len(cities)):
        ca = get_coords(cities[i - 1])
        cb = get_coords(cities[i])
        seg = _haversine_km(ca, cb) if (ca and cb) else 0.0
        cum.append(cum[-1] + seg)
    return cum


def _distance_along_route(
    city: str,
    route_cities: list[str],
    cumulative: list[float],
) -> float | None:
    """
    Return the cumulative km from route start to `city`.

    For cities explicitly in route_cities: exact lookup.
    For intermediate cities not in the list: coordinate projection
    onto the nearest route segment.
    Returns None only when coordinates are completely unavailable.
    """
    city_lower = city.strip().lower()

    # Exact name match
    for i, rc in enumerate(route_cities):
        if rc.strip().lower() == city_lower:
            return cumulative[i]

    # Coordinate projection
    city_coords = get_coords(city)
    if not city_coords:
        return None

    c_lat, c_lng = city_coords
    rc_coords = [get_coords(rc) for rc in route_cities]
    best_dist_to_route = float("inf")
    best_d_from_start = 0.0

    for i in range(len(route_cities) - 1):
        a = rc_coords[i]
        b = rc_coords[i + 1]
        if not a or not b:
            continue
        ax, ay = a[1], a[0]
        bx, by = b[1], b[0]
        cx, cy = c_lng, c_lat
        dx, dy = bx - ax, by - ay
        seg_sq = dx * dx + dy * dy
        t = 0.0 if seg_sq < 1e-12 else max(0.0, min(1.0, ((cx - ax) * dx + (cy - ay) * dy) / seg_sq))
        proj_lat = a[0] + t * (b[0] - a[0])
        proj_lng = a[1] + t * (b[1] - a[1])
        d_to_route = _haversine_km((c_lat, c_lng), (proj_lat, proj_lng))
        if d_to_route < best_dist_to_route:
            best_dist_to_route = d_to_route
            seg_len = cumulative[i + 1] - cumulative[i]
            best_d_from_start = cumulative[i] + t * seg_len

    return best_d_from_start


def derive_progress_and_eta(
    current_location: str,
    route_cities: list[str],
    mode: str = "road",
    original_estimated_time_hours: float | None = None,
) -> dict[str, Any]:
    """
    Requirement 3 & 4: compute progress_percentage, remaining_distance_km,
    and remaining_eta_minutes purely from route geometry and current_location.

    Never reads stored progress. Never uses checkpoint indices.

    Returns:
        progress_percentage     float  0–100
        covered_distance_km     float
        remaining_distance_km   float
        total_route_km          float
        remaining_eta_minutes   int
        derived_from            "geometry" | "time_ratio" | "unavailable"
    """
    if not route_cities or len(route_cities) < 2:
        eta = int(round((original_estimated_time_hours or 0) * 60))
        return {
            "progress_percentage": 0.0,
            "covered_distance_km": 0.0,
            "remaining_distance_km": 0.0,
            "total_route_km": 0.0,
            "remaining_eta_minutes": eta,
            "derived_from": "unavailable",
        }

    cum = _cumulative_distances(route_cities)
    total_km = cum[-1]

    if total_km < 0.1:
        eta = int(round((original_estimated_time_hours or 0) * 60))
        return {
            "progress_percentage": 0.0,
            "covered_distance_km": 0.0,
            "remaining_distance_km": 0.0,
            "total_route_km": 0.0,
            "remaining_eta_minutes": eta,
            "derived_from": "unavailable",
        }

    covered_km = _distance_along_route(current_location, route_cities, cum)

    if covered_km is None:
        eta = int(round((original_estimated_time_hours or 0) * 60))
        return {
            "progress_percentage": 0.0,
            "covered_distance_km": 0.0,
            "remaining_distance_km": round(total_km, 1),
            "total_route_km": round(total_km, 1),
            "remaining_eta_minutes": eta,
            "derived_from": "unavailable",
        }

    covered_km = max(0.0, min(total_km, covered_km))
    remaining_km = total_km - covered_km
    progress_pct = round((covered_km / total_km) * 100, 1)

    speed_kmh = _MODE_SPEED.get((mode or "road").lower(), 55.0)

    if speed_kmh > 0 and total_km > 1.0:
        remaining_eta = int(round((remaining_km / speed_kmh) * 60))
        derived_from = "geometry"
    elif original_estimated_time_hours and total_km > 0:
        remaining_ratio = remaining_km / total_km
        remaining_eta = int(round(original_estimated_time_hours * remaining_ratio * 60))
        derived_from = "time_ratio"
    else:
        remaining_eta = 0
        derived_from = "unavailable"

    return {
        "progress_percentage": progress_pct,
        "covered_distance_km": round(covered_km, 1),
        "remaining_distance_km": round(remaining_km, 1),
        "total_route_km": round(total_km, 1),
        "remaining_eta_minutes": remaining_eta,
        "derived_from": derived_from,
    }


def split_route_at_location(
    route_cities: list[str],
    current_location: str,
) -> tuple[list[str], list[str]]:
    """
    Requirements 5 & 6: split the immutable route_cities into
    (completed_cities, remaining_cities) at current_location.

    Works for any city including backtracking — route_cities is never
    mutated, the split is recomputed every call.

    Returns (before_current, after_current).  current_location itself
    is the "current" node and appears in neither list.
    """
    if not route_cities:
        return [], []

    current_norm = current_location.strip().lower()

    # Exact name match
    for i, rc in enumerate(route_cities):
        if rc.strip().lower() == current_norm:
            return route_cities[:i], route_cities[i + 1:]

    # Coordinate proximity — handles intermediate corridor cities
    city_coords = get_coords(current_location)
    if city_coords:
        best_idx = 0
        best_d = float("inf")
        for i, rc in enumerate(route_cities):
            rc_coords = get_coords(rc)
            if rc_coords:
                d = _haversine_km(city_coords, rc_coords)
                if d < best_d:
                    best_d = d
                    best_idx = i
        if best_d <= 30:  # within 30 km — treat as that checkpoint
            return route_cities[:best_idx], route_cities[best_idx + 1:]

    # Not locatable — treat as before start
    return [], list(route_cities)


# ---------------------------------------------------------------------------
# Requirement 1 — Automatic time-based progression
# ---------------------------------------------------------------------------

def resolve_current_location(
    report: ShipmentReport,
    now: Optional[datetime] = None,
) -> tuple[str, str, float | None]:
    """
    Determine the effective current location and continuous covered distance.

    Returns (resolved_city_label, source, estimated_covered_km).

    - resolved_city_label  — nearest checkpoint name (display only)
    - source               — "manual" | "automatic" | "fallback"
    - estimated_covered_km — continuous km from route start (None for manual/fallback)

    The continuous km value is the authoritative source for:
      progress_percentage, covered_distance_km, remaining_distance_km, ETA.

    The city label is used only for:
      current_city display, corridor split, corridor detection.

    Rebasing (Requirement 4):
      Manual Update Shipment stores:
        current_location          = "Ankleshwar"
        progression_base_location = "Ankleshwar"
        progression_base_time     = <timestamp>

      Future automatic progression starts from Ankleshwar's km position
      at that timestamp, advancing forward continuously.
    """
    now = now or datetime.utcnow()
    opt_result = report.optimization_result or {}
    ri: dict[str, Any] = opt_result.get("route_intelligence") or {}
    route_cities: list[str] = ri.get("route_cities") or []
    total_km_stored = ri.get("total_km_estimate") or 0.0

    confirmed: str = (opt_result.get("current_location") or "").strip()
    base_location: str = (opt_result.get("progression_base_location") or "").strip()
    base_time_str: str = (opt_result.get("progression_base_time") or "").strip()

    # ── Manual-only path (no rebase info) ────────────────────────────
    # A confirmed location was set without rebase metadata. Use it directly.
    # No continuous km — derive_progress_and_eta will snap to checkpoint distance.
    if confirmed and not base_location:
        return confirmed, "manual", None

    # ── Trip hasn't started ───────────────────────────────────────────
    if not base_location and not report.started_at:
        return confirmed or report.source, "manual" if confirmed else "fallback", None

    # ── Determine anchor ──────────────────────────────────────────────
    if base_location and base_time_str:
        try:
            base_dt = datetime.fromisoformat(base_time_str)
        except ValueError:
            base_dt = None
        anchor_location = base_location
        anchor_time = base_dt
    elif report.started_at:
        anchor_location = report.source
        anchor_time = report.started_at
    else:
        return confirmed or report.source, "manual" if confirmed else "fallback", None

    # ── Validate route data ───────────────────────────────────────────
    if not route_cities or len(route_cities) < 2 or not anchor_time:
        return confirmed or report.source, "manual" if confirmed else "fallback", None

    cum = _cumulative_distances(route_cities)
    total_km = cum[-1] if cum else total_km_stored or 1.0
    if total_km < 0.1:
        return confirmed or report.source, "manual" if confirmed else "fallback", None

    original_eta_hours = float(report.estimated_time or 0)
    if original_eta_hours <= 0:
        return confirmed or report.source, "manual" if confirmed else "fallback", None

    # ── Continuous km computation ─────────────────────────────────────
    speed_kmh = total_km / original_eta_hours

    # Distance at anchor point
    anchor_covered_km = _distance_along_route(anchor_location, route_cities, cum) or 0.0

    # Additional distance since anchor — continuous, sub-checkpoint precision
    elapsed_since_anchor = max(0.0, (now - anchor_time).total_seconds() / 3600.0)
    additional_km = elapsed_since_anchor * speed_kmh

    # Clamp: never go backward, never exceed total
    estimated_covered_km = min(total_km, anchor_covered_km + additional_km)

    # ── City label: nearest checkpoint to estimated_covered_km ────────
    # This is DISPLAY ONLY. It changes discretely as checkpoints are passed.
    # Progress/ETA calculations use estimated_covered_km directly.
    best_city = route_cities[0]
    best_diff = float("inf")
    for i, city in enumerate(route_cities):
        diff = abs(cum[i] - estimated_covered_km)
        if diff < best_diff:
            best_diff = diff
            best_city = city

    return best_city, "automatic", estimated_covered_km


# ---------------------------------------------------------------------------
# Estimated location from progress %
# ---------------------------------------------------------------------------

def _estimate_city_from_progress(
    route_intelligence: dict[str, Any],
    progress_percentage: float,
) -> str:
    """
    Map progress % to the nearest city name.
    Uses rich checkpoint objects when available (geometry path),
    falls back to the plain route_cities list.
    """
    checkpoints_raw = route_intelligence.get("checkpoints") or []

    if checkpoints_raw and isinstance(checkpoints_raw[0], dict):
        # Rich checkpoints: use distance_from_start for accurate mapping
        total_km = route_intelligence.get("total_km_estimate") or 1.0
        target_km = (progress_percentage / 100.0) * total_km
        best_cp = min(checkpoints_raw, key=lambda c: abs(c["distance_from_start"] - target_km))
        return best_cp["name"]

    # Fallback: plain list (old corridor-only path)
    cities: list[str] = (
        route_intelligence.get("route_cities") or checkpoints_raw or []
    )
    if not cities:
        return ""

    clamped = min(100.0, max(0.0, progress_percentage))
    if clamped >= 100.0:
        return cities[-1]
    if clamped <= 0.0:
        return cities[0]

    n = len(cities)
    idx = int(round((clamped / 100.0) * (n - 1)))
    return cities[max(0, min(n - 1, idx))]


# ---------------------------------------------------------------------------
# Corridor detection
# ---------------------------------------------------------------------------

def detect_corridor_status(
    current_city: str,
    route_intelligence: dict[str, Any],
) -> dict[str, str]:
    """
    ON_ROUTE / NEAR_ROUTE / OFF_ROUTE.

    For geometry-sourced route_intelligence, tolerance is based on the
    distance to the nearest checkpoint on the route.
    """
    if not current_city or not current_city.strip():
        return {"status": "ON_ROUTE", "matched_city": ""}

    route_cities: list[str] = route_intelligence.get("route_cities") or []
    current_norm = _normalize_city(current_city)

    # Step 1: exact normalised match
    for rc in route_cities:
        if _normalize_city(rc) == current_norm:
            return {"status": "ON_ROUTE", "matched_city": rc}

    # Step 2: near-city alias
    canonical = _NEAR_CITY_MAP.get(current_norm, current_norm)
    for rc in route_cities:
        if _normalize_city(rc) == canonical:
            return {"status": "NEAR_ROUTE", "matched_city": rc}

    # Step 2b: substring
    for rc in route_cities:
        rc_norm = _normalize_city(rc)
        if rc_norm in current_norm or current_norm in rc_norm:
            return {"status": "NEAR_ROUTE", "matched_city": rc}

    # Step 3: coordinate proximity for geometry-sourced checkpoints
    checkpoints_raw = route_intelligence.get("checkpoints") or []
    if checkpoints_raw and isinstance(checkpoints_raw[0], dict):
        current_coords = get_coords(current_city)
        if current_coords:
            for cp in checkpoints_raw:
                cp_lat = cp.get("latitude", 0)
                cp_lng = cp.get("longitude", 0)
                if cp_lat and cp_lng:
                    d = _haversine_km(current_coords, (cp_lat, cp_lng))
                    if d <= 15:   # within 15 km → ON_ROUTE
                        return {"status": "ON_ROUTE", "matched_city": cp["name"]}
                    if d <= 40:   # within 40 km → NEAR_ROUTE
                        return {"status": "NEAR_ROUTE", "matched_city": cp["name"]}

    return {"status": "OFF_ROUTE", "matched_city": ""}


# ---------------------------------------------------------------------------
# Trip progress helpers
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TripProgress:
    progress_percentage: float
    elapsed_minutes: int
    remaining_minutes: int


@dataclass(frozen=True)
class LocationEstimate:
    label: str
    latitude: Optional[float]
    longitude: Optional[float]
    segment_start: str
    segment_end: str
    confidence: str


def calculate_trip_progress(
    started_at: Optional[datetime],
    expected_end_time: Optional[datetime],
    current_time: Optional[datetime] = None,
) -> TripProgress:
    now = current_time or datetime.utcnow()
    if not started_at or not expected_end_time:
        return TripProgress(0.0, 0, 0)

    total_s = max((expected_end_time - started_at).total_seconds(), 1)
    elapsed_s = (now - started_at).total_seconds()

    if elapsed_s <= 0:
        pct = 0.0
    elif now >= expected_end_time:
        pct = 100.0
    else:
        pct = (elapsed_s / total_s) * 100

    return TripProgress(
        progress_percentage=round(min(100.0, max(0.0, pct)), 1),
        elapsed_minutes=max(0, int(elapsed_s // 60)),
        remaining_minutes=max(0, int((expected_end_time - now).total_seconds() // 60)),
    )


def estimate_trip_location(
    report: ShipmentReport, progress_percentage: float
) -> LocationEstimate:
    waypoints = [report.source, *(report.stops or []), report.destination]
    if len(waypoints) < 2:
        return LocationEstimate(
            report.source or report.destination or "Unknown",
            None, None,
            report.source or "Unknown",
            report.destination or "Unknown",
            "low",
        )

    clamped = min(100.0, max(0.0, progress_percentage))
    opt_result = report.optimization_result or {}
    ri = opt_result.get("route_intelligence")

    if ri and (ri.get("route_cities") or ri.get("checkpoints")):
        city_label = _estimate_city_from_progress(ri, clamped)
        if city_label:
            coords = get_coords(city_label)
            seg_count = len(waypoints) - 1
            seg_idx = min(seg_count - 1, int((clamped / 100.0) * seg_count))
            return LocationEstimate(
                label=city_label,
                latitude=round(coords[0], 5) if coords else None,
                longitude=round(coords[1], 5) if coords else None,
                segment_start=waypoints[seg_idx],
                segment_end=waypoints[seg_idx + 1],
                confidence="high",
            )

    # Old interpolation fallback
    seg_count = len(waypoints) - 1
    scaled = (clamped / 100.0) * seg_count
    seg_idx = min(seg_count - 1, int(scaled))
    seg_ratio = 1.0 if clamped >= 100 else scaled - seg_idx

    s_name = waypoints[seg_idx]
    e_name = waypoints[seg_idx + 1]
    s_coords = get_coords(s_name)
    e_coords = get_coords(e_name)

    if seg_ratio >= 0.85:
        label = e_name
    elif seg_ratio <= 0.15:
        label = s_name
    else:
        label = f"Between {s_name} and {e_name}"

    if s_coords and e_coords:
        lat = s_coords[0] + (e_coords[0] - s_coords[0]) * seg_ratio
        lng = s_coords[1] + (e_coords[1] - s_coords[1]) * seg_ratio
        return LocationEstimate(label, round(lat, 5), round(lng, 5), s_name, e_name, "medium")

    return LocationEstimate(label, None, None, s_name, e_name, "low")


# ---------------------------------------------------------------------------
# Remaining Journey Evaluation
# ---------------------------------------------------------------------------

def _run_remaining_pipeline(report, current_location, remaining_stops, destination):
    from app.services.reoptimization_service import _run_pipeline, _fallback_result
    try:
        return _run_pipeline(report, current_location, remaining_stops, destination)
    except Exception as exc:
        return _fallback_result(report, current_location, remaining_stops, destination, str(exc))


def evaluate_remaining_journey(
    report: ShipmentReport,
    current_location: str,
    progress_percentage: float,
) -> dict[str, Any]:
    waypoints = [report.source, *(report.stops or []), report.destination]
    destination = report.destination
    seg_count = max(1, len(waypoints) - 1)
    seg_idx = min(seg_count - 1, int((progress_percentage / 100.0) * seg_count))
    remaining_stops = [wp for wp in waypoints[seg_idx + 1:] if wp != destination]

    try:
        pipeline_result = _run_remaining_pipeline(report, current_location, remaining_stops, destination)
    except Exception:
        pipeline_result = {}

    from app.services.reoptimization_service import extract_plan_metrics
    metrics = extract_plan_metrics(pipeline_result)

    updated_eta_minutes = None
    if metrics.get("time") is not None:
        updated_eta_minutes = int(round(float(metrics["time"]) * 60))

    return {
        "current_location": current_location,
        "remaining_stops": remaining_stops,
        "destination": destination,
        "updated_eta_minutes": updated_eta_minutes,
        "updated_cost": metrics.get("cost"),
        "updated_risk": metrics.get("risk"),
        "pipeline_result": pipeline_result,
        "metrics": metrics,
    }


# ---------------------------------------------------------------------------
# Phase 2 — Deterministic Health Scoring Engine
# ---------------------------------------------------------------------------
#
# Health score = weighted sum of five independent inputs.
# Same inputs ALWAYS produce the same output — no random or time-sensitive
# factors beyond what is in the inputs themselves.
#
# Weights:
#   Route Adherence   40 pts   (corridor_status)
#   ETA Impact        25 pts   (overdue + eta_gap vs original remaining)
#   Traffic Impact     5 pts   (derived from pipeline metrics if available)
#   Weather Impact     5 pts   (derived from pipeline metrics if available)
#   Risk Impact       25 pts   (updated_risk vs base_risk)
#
# Total = 100 pts
#
# Confidence score (0–100):
#   Reflects data quality — how much of the scoring was based on real
#   pipeline output vs estimation/fallback.

_ADHERENCE_SCORES: dict[str, float] = {
    "ON_ROUTE": 40.0,
    "NEAR_ROUTE": 24.0,   # 60% of 40
    "OFF_ROUTE": 4.0,     # 10% of 40
}

# Phase 3 thresholds
_THRESHOLD_HEALTHY = 80
_THRESHOLD_MONITOR = 60
_THRESHOLD_SUGGEST = 40
# 0–39 = STRONGLY_RECOMMEND


def compute_health_score(
    corridor_status: str,
    overdue_minutes: int,
    original_remaining_minutes: int,
    updated_eta_minutes: Optional[int],
    base_risk: float,
    updated_risk: Optional[float],
    pipeline_metrics: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """
    Phase 2 — Deterministic health scoring engine.

    Returns:
      health_score   0–100
      health_level   healthy | moderate | at_risk
      confidence     0–100
      component_scores  {adherence, eta, traffic, weather, risk}
      inputs         (echo of what was used — for auditability)
    """

    # ── 1. Route Adherence (40 pts) ──────────────────────────────────
    adherence_pts = _ADHERENCE_SCORES.get(corridor_status, 4.0)

    # ── 2. ETA Impact (25 pts) ───────────────────────────────────────
    # Logic:
    #   - no overdue, no eta_gap → 25 pts (perfect)
    #   - overdue up to 120 min → linear decay to 0
    #   - eta_gap > 0 (slower than expected) → proportional penalty
    if updated_eta_minutes is not None and original_remaining_minutes > 0:
        eta_gap = updated_eta_minutes - original_remaining_minutes
        # Normalise: gap as fraction of original remaining time
        gap_ratio = max(0.0, eta_gap) / max(original_remaining_minutes, 1)
        eta_pts = max(0.0, 25.0 * (1.0 - min(1.0, gap_ratio)))
    elif overdue_minutes > 0:
        eta_pts = max(0.0, 25.0 * (1.0 - min(1.0, overdue_minutes / 120)))
    else:
        eta_pts = 25.0

    # ── 3. Traffic Impact (5 pts) ────────────────────────────────────
    traffic_pts = 5.0
    traffic_confidence = 0
    if pipeline_metrics:
        tf = pipeline_metrics.get("traffic_factor") or pipeline_metrics.get("traffic_level")
        if tf is not None:
            traffic_factor = float(tf)
            # traffic_factor > 1 means slowdown; traffic_level 0–1 maps to severity
            if traffic_factor >= 1.0:          # it's a multiplier
                traffic_pts = max(0.0, 5.0 * (1.0 - min(1.0, (traffic_factor - 1.0) / 1.0)))
            else:                              # it's a 0–1 congestion level
                traffic_pts = max(0.0, 5.0 * (1.0 - traffic_factor))
            traffic_confidence = 100

    # ── 4. Weather Impact (5 pts) ────────────────────────────────────
    weather_pts = 5.0
    weather_confidence = 0
    if pipeline_metrics:
        wf = pipeline_metrics.get("weather_factor") or pipeline_metrics.get("weather_level")
        if wf is not None:
            weather_factor = float(wf)
            if weather_factor >= 1.0:
                weather_pts = max(0.0, 5.0 * (1.0 - min(1.0, (weather_factor - 1.0) / 0.5)))
            else:
                weather_pts = max(0.0, 5.0 * (1.0 - weather_factor))
            weather_confidence = 100

    # ── 5. Risk Impact (25 pts) ──────────────────────────────────────
    effective_risk = float(updated_risk) if updated_risk is not None else base_risk
    risk_pts = max(0.0, 25.0 * (1.0 - effective_risk))

    # ── Total ─────────────────────────────────────────────────────────
    total = adherence_pts + eta_pts + traffic_pts + weather_pts + risk_pts
    health_score = round(max(0, min(100, total)))

    # ── Health level ─────────────────────────────────────────────────
    if health_score >= _THRESHOLD_HEALTHY:
        health_level = "healthy"
    elif health_score >= _THRESHOLD_MONITOR:
        health_level = "moderate"
    else:
        health_level = "at_risk"

    # ── Confidence score ──────────────────────────────────────────────
    # Base = 50 (corridor + progress always available)
    # +25 for having real pipeline metrics (updated_eta, updated_risk)
    # +12 for traffic data from pipeline
    # +13 for weather data from pipeline
    conf = 50
    if updated_eta_minutes is not None:
        conf += 15
    if updated_risk is not None:
        conf += 10
    conf += (traffic_confidence * 12) // 100
    conf += (weather_confidence * 13) // 100
    confidence = min(100, conf)

    return {
        "health_score": health_score,
        "health_level": health_level,
        "confidence": confidence,
        "component_scores": {
            "adherence": round(adherence_pts, 1),
            "eta": round(eta_pts, 1),
            "traffic": round(traffic_pts, 1),
            "weather": round(weather_pts, 1),
            "risk": round(risk_pts, 1),
        },
        "inputs": {
            "corridor_status": corridor_status,
            "overdue_minutes": overdue_minutes,
            "original_remaining_minutes": original_remaining_minutes,
            "updated_eta_minutes": updated_eta_minutes,
            "base_risk": round(base_risk, 4),
            "updated_risk": round(effective_risk, 4),
        },
    }


# ---------------------------------------------------------------------------
# Phase 3 — Smart Reoptimization Recommendation (threshold-driven)
# ---------------------------------------------------------------------------

def get_reoptimization_recommendation(
    health_score: int,
    current_metrics: dict[str, Any],
    updated_metrics: dict[str, Any],
) -> dict[str, Any]:
    """
    Phase 3: threshold-driven recommendation.

    80–100  → healthy      (continue)
    60–79   → monitor      (monitor)
    40–59   → suggest      (suggest_reoptimization)
    0–39    → strongly     (strongly_recommend_reoptimization)

    Also checks whether improvement meets thresholds before recommending.
    Thresholds: ETA > 15 min OR risk > 5% OR cost > 5%.
    Returns recommendation dict — never auto-reoptimizes.
    """
    # ── Score-based level ─────────────────────────────────────────────
    if health_score >= _THRESHOLD_HEALTHY:
        level = "continue"
        label = "Continue on current route"
        suggest = False
    elif health_score >= _THRESHOLD_MONITOR:
        level = "monitor"
        label = "Monitor closely"
        suggest = False
    elif health_score >= _THRESHOLD_SUGGEST:
        level = "suggest_reoptimization"
        label = "Reoptimization suggested"
        suggest = True
    else:
        level = "strongly_recommend_reoptimization"
        label = "Reoptimization strongly recommended"
        suggest = True

    # ── Improvement check (only when reoptimization is on the table) ─
    improvement_reasons: list[str] = []
    improvement_meets_threshold = False

    if suggest and updated_metrics:
        cur_time = float(current_metrics.get("time") or 0)
        upd_time = float(updated_metrics.get("time") or 0)
        if cur_time > 0 and upd_time > 0:
            eta_delta_min = int((cur_time - upd_time) * 60)
            if eta_delta_min > 15:
                improvement_reasons.append(f"ETA improves by {eta_delta_min}m")

        cur_risk = float(current_metrics.get("risk") or 0)
        upd_risk = float(updated_metrics.get("risk") or 0)
        if cur_risk > 0 and upd_risk < cur_risk:
            pct = int((cur_risk - upd_risk) / cur_risk * 100)
            if pct > 5:
                improvement_reasons.append(f"Risk reduces by {pct}%")

        cur_cost = float(current_metrics.get("cost") or 0)
        upd_cost = float(updated_metrics.get("cost") or 0)
        if cur_cost > 0 and upd_cost < cur_cost:
            pct = int((cur_cost - upd_cost) / cur_cost * 100)
            if pct > 5:
                improvement_reasons.append(f"Cost reduces by {pct}%")

        improvement_meets_threshold = bool(improvement_reasons)

        # If suggested but improvement below threshold, downgrade to monitor
        if not improvement_meets_threshold and health_score >= _THRESHOLD_SUGGEST:
            level = "monitor"
            label = "Monitor — improvement below threshold"
            suggest = False

    return {
        "action": level,
        "label": label,
        "suggest_reoptimization": suggest,
        "improvement_meets_threshold": improvement_meets_threshold,
        "improvement_reasons": improvement_reasons,
        "health_score": health_score,
    }


# Keep backward-compat alias used elsewhere
def should_recommend_reoptimization(
    current_metrics: dict[str, Any],
    updated_metrics: dict[str, Any],
) -> tuple[bool, str]:
    rec = get_reoptimization_recommendation(50, current_metrics, updated_metrics)
    return rec["improvement_meets_threshold"], "; ".join(rec["improvement_reasons"]) or "Current route remains optimal"


# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------
# Master evaluate_route_health
# ---------------------------------------------------------------------------

def evaluate_route_health(
    report: ShipmentReport,
    actual_location_name: Optional[str] = None,
    current_time: Optional[datetime] = None,
) -> dict[str, Any]:
    """
    Master health evaluation.

    Location resolution (single source of truth — Requirements 1 & 2):
      1. actual_location_name  → preview mode (Req 7): user is evaluating a
         candidate city but has NOT committed. Does not touch stored state.
      2. resolve_current_location() → combines:
         a. confirmed manual current_location (from Update Shipment, Req 3)
         b. time-based automatic progression rebased at the last update (Req 1 & 4)
         c. source city (fallback, trip not started)

    All other values (progress, ETA, split corridor, health) derive from
    this one resolved city — nothing else is persisted.
    """
    now = current_time or datetime.utcnow()

    opt_result = report.optimization_result or {}
    route_intelligence: Optional[dict[str, Any]] = opt_result.get("route_intelligence")
    full_route_cities: list[str] = (
        route_intelligence.get("route_cities") if route_intelligence else None
    ) or []
    confirmed_location: str = (opt_result.get("current_location") or "").strip()

    # ── Resolve current location ──────────────────────────────────────
    if actual_location_name and actual_location_name.strip():
        # Preview: user is evaluating a city without committing (Req 7)
        driver_city = actual_location_name.strip()
        location_source = "preview"
        auto_covered_km: float | None = None   # preview uses city-snapped distance
    else:
        # Automatic progression or confirmed manual — single source of truth
        driver_city, location_source, auto_covered_km = resolve_current_location(report, now)

    # ── Elapsed section: Source → Current Location (Req 5) ───────────
    # When automatic progression provides a continuous covered_km, use it
    # directly — this gives smooth progress instead of checkpoint-stepped.
    # For manual/preview locations, derive from the city's projected distance.
    if auto_covered_km is not None and full_route_cities:
        # Continuous path: use raw km from automatic progression
        cum_for_total = _cumulative_distances(full_route_cities)
        total_route_km_c = cum_for_total[-1] if cum_for_total else 0.0

        if total_route_km_c > 0.1:
            covered_km     = round(min(auto_covered_km, total_route_km_c), 1)
            remaining_km   = round(max(0.0, total_route_km_c - covered_km), 1)
            progress_pct   = round((covered_km / total_route_km_c) * 100, 1)

            speed_kmh = _MODE_SPEED.get((report.mode or "road").lower(), 55.0)
            remaining_eta_minutes = int(round((remaining_km / speed_kmh) * 60)) if speed_kmh > 0 else 0
            progress_derived_from = "geometry"
            total_route_km = round(total_route_km_c, 1)
        else:
            # Route has no geometry — fall back to city-based
            elapsed_dynamic = derive_progress_and_eta(
                current_location=driver_city,
                route_cities=full_route_cities,
                mode=report.mode or "road",
                original_estimated_time_hours=report.estimated_time,
            )
            progress_pct          = elapsed_dynamic["progress_percentage"]
            covered_km            = elapsed_dynamic["covered_distance_km"]
            remaining_km          = elapsed_dynamic["remaining_distance_km"]
            remaining_eta_minutes = elapsed_dynamic["remaining_eta_minutes"]
            progress_derived_from = elapsed_dynamic["derived_from"]
            total_route_km        = elapsed_dynamic["total_route_km"]
    else:
        # Manual/preview: city-snapped distance (acceptable — user picked a city)
        elapsed_dynamic = derive_progress_and_eta(
            current_location=driver_city,
            route_cities=full_route_cities,
            mode=report.mode or "road",
            original_estimated_time_hours=report.estimated_time,
        )
        progress_pct          = elapsed_dynamic["progress_percentage"]
        covered_km            = elapsed_dynamic["covered_distance_km"]
        remaining_km          = elapsed_dynamic["remaining_distance_km"]
        remaining_eta_minutes = elapsed_dynamic["remaining_eta_minutes"]
        progress_derived_from = elapsed_dynamic["derived_from"]
        total_route_km        = elapsed_dynamic["total_route_km"]

    # ── Split corridor — derived, never persisted (Req 5 & 6, Req 8) ─
    completed_cities: list[str] = []
    remaining_cities: list[str] = []
    if driver_city and full_route_cities:
        completed_cities, remaining_cities = split_route_at_location(full_route_cities, driver_city)
    elif full_route_cities:
        remaining_cities = full_route_cities[:]

    # ── Estimated location struct (for API compat) ────────────────────
    coords = get_coords(driver_city)
    estimated = LocationEstimate(
        label=driver_city,
        latitude=round(coords[0], 5) if coords else None,
        longitude=round(coords[1], 5) if coords else None,
        segment_start=driver_city,
        segment_end=report.destination,
        confidence=(
            "confirmed" if location_source == "manual"
            else "automatic" if location_source == "automatic"
            else "preview" if location_source == "preview"
            else "low"
        ),
    )

    # ── Corridor detection (Req 9) ────────────────────────────────────
    actual_location: Optional[dict[str, Any]] = None
    deviation_km: Optional[float] = None
    corridor_status = "ON_ROUTE"
    corridor_matched_city = ""

    if driver_city:
        actual_coords = get_coords(driver_city)
        actual_location = {
            "label": driver_city,
            "latitude": round(actual_coords[0], 5) if actual_coords else None,
            "longitude": round(actual_coords[1], 5) if actual_coords else None,
            "confidence": estimated.confidence,
        }
        if route_intelligence:
            res = detect_corridor_status(driver_city, route_intelligence)
            corridor_status = res["status"]
            corridor_matched_city = res["matched_city"]

    # ── Pipeline evaluation for projected metrics ─────────────────────
    remaining_eval: dict[str, Any] = {}
    if driver_city and progress_pct < 100:
        try:
            remaining_eval = evaluate_remaining_journey(report, driver_city, progress_pct)
        except Exception:
            remaining_eval = {}

    pipeline_eta   = remaining_eval.get("updated_eta_minutes")
    final_eta_min  = pipeline_eta if pipeline_eta is not None else remaining_eta_minutes

    # ── Elapsed wall-clock time ───────────────────────────────────────
    time_prog = calculate_trip_progress(report.started_at, report.expected_end_time, now)

    overdue_minutes = 0
    if report.expected_end_time and now > report.expected_end_time:
        overdue_minutes = int((now - report.expected_end_time).total_seconds() // 60)

    original_remaining = 0
    if report.started_at and report.expected_end_time:
        original_remaining = max(0, int((report.expected_end_time - now).total_seconds() // 60))

    total_minutes = 0
    if report.started_at and report.expected_end_time:
        total_minutes = max(1, int((report.expected_end_time - report.started_at).total_seconds() // 60))

    base_risk   = min(1.0, max(0.0, float(report.risk_score or 0.15)))
    updated_risk = remaining_eval.get("updated_risk")

    pipeline_metrics: Optional[dict[str, Any]] = None
    if remaining_eval.get("pipeline_result"):
        best_route = remaining_eval["pipeline_result"].get("best") or {}
        if best_route:
            pipeline_metrics = best_route

    # ── Health scoring (Req 9 — always from resolved current_location) ─
    score_result = compute_health_score(
        corridor_status=corridor_status,
        overdue_minutes=overdue_minutes,
        original_remaining_minutes=original_remaining,
        updated_eta_minutes=final_eta_min,
        base_risk=base_risk,
        updated_risk=updated_risk,
        pipeline_metrics=pipeline_metrics,
    )
    health_score = score_result["health_score"]
    health_level = score_result["health_level"]
    confidence   = score_result["confidence"]
    component_scores = score_result["component_scores"]

    # ── Condition Intelligence V2 (real signals + fallback) ─────────
    from app.services.condition_snapshot import (
        build_condition_snapshot,
        compute_health_from_snapshot,
        build_snapshot_breakdown,
    )
    from app.services.condition_intelligence import (
        build_traffic_condition,
        build_weather_condition,
        build_adherence_score,
        build_eta_variance_score,
        build_health_breakdown,      # kept for backward-compat profile
        ConditionProfile,
    )
    from app.services.condition_history import (
        append_condition_history, get_condition_history,
    )

    # ETA gap for condition signals
    _eta_gap_for_snapshot = 0
    if final_eta_min is not None and original_remaining > 0:
        _eta_gap_for_snapshot = max(0, final_eta_min - original_remaining)

    _route_km_for_snapshot = total_route_km if total_route_km else (
        float(opt_result.get("route_intelligence", {}).get("total_km_estimate") or 0)
    )

    # ── Phase 7: Live signal refresh for remaining journey ────────────
    # Fetch fresh TomTom + Weather + ML for current_location → destination.
    # Only for active trips with a known current location.
    live_signals = None
    if driver_city and driver_city != report.source and report.status == "active":
        try:
            from app.services.live_signal_refresh import refresh_condition_signals
            live_signals = refresh_condition_signals(
                current_location=driver_city,
                destination=report.destination,
                mode=report.mode or "road",
                cargo_type=report.cargo_type or "General",
            )
        except Exception as _live_exc:
            print(f"[LiveRefresh] Skipped: {_live_exc}")

    # Build snapshot — live signals > stored signals > heuristic
    snapshot = build_condition_snapshot(
        optimization_result=opt_result,
        corridor_status=corridor_status,
        deviation_km=deviation_km,
        overdue_minutes=overdue_minutes,
        eta_gap_minutes=_eta_gap_for_snapshot,
        route_km=_route_km_for_snapshot,
        stop_count=len(report.stops or []),
        mode=report.mode or "road",
        source=report.source,
        destination=report.destination,
        fallback_traffic_fn=build_traffic_condition,
        fallback_weather_fn=build_weather_condition,
        fallback_adherence_fn=build_adherence_score,
        fallback_eta_fn=build_eta_variance_score,
        live_signals=live_signals,
    )

    # Phase 6 — compute health from real signals
    health_score, health_level = compute_health_from_snapshot(snapshot)
    confidence = snapshot.confidence_score

    # Phase 7 — explainable breakdown
    health_breakdown = build_snapshot_breakdown(snapshot)

    # Build backward-compat condition_profile dict using snapshot data
    condition_profile_dict = snapshot.to_dict()

    # Build a minimal ConditionProfile for backward-compat build_health_breakdown call
    # (used only when reverting to legacy path — keep in sync)
    _legacy_profile = ConditionProfile(
        traffic_score=snapshot.traffic_score,
        weather_score=snapshot.weather_score,
        congestion_score=snapshot.traffic_score,
        route_adherence_score=snapshot.route_adherence_score,
        eta_variance_score=snapshot.eta_variance_score,
        traffic_delay_minutes=snapshot.traffic_delay_minutes,
        weather_delay_minutes=0,
        traffic_explanation=snapshot.traffic_explanation,
        weather_explanation=snapshot.weather_explanation,
        congestion_explanation=snapshot.traffic_explanation,
        adherence_explanation=snapshot.adherence_explanation,
        eta_explanation=snapshot.eta_explanation,
    )

    # ── Recommendation ────────────────────────────────────────────────
    current_metrics = {
        "cost": report.estimated_cost,
        "time": report.estimated_time,
        "risk": report.risk_score,
    }
    updated_metrics = remaining_eval.get("metrics") or {}
    recommendation = get_reoptimization_recommendation(
        health_score, current_metrics, updated_metrics
    )
    recommended_action = recommendation["action"]
    reopt_recommended  = recommendation["suggest_reoptimization"]
    reopt_reason = (
        "; ".join(recommendation["improvement_reasons"])
        if recommendation["improvement_reasons"]
        else recommendation["label"]
    )

    # ── Legacy compat ────────────────────────────────────────────────
    if corridor_status == "OFF_ROUTE":
        deviation_level = "major"
    elif corridor_status == "NEAR_ROUTE":
        deviation_level = "minor"
    else:
        deviation_level = "none"

    eta_variance_minutes = overdue_minutes
    if deviation_level == "minor":
        eta_variance_minutes += max(15, int(total_minutes * 0.05))
    elif deviation_level == "major":
        eta_variance_minutes += max(60, int(total_minutes * 0.15))

    delay_risk = (
        "high"   if health_score < _THRESHOLD_SUGGEST
        else "medium" if health_score < _THRESHOLD_MONITOR
        else "low"
    )

    # ── Condition History (Phase 8) — only persist for real evaluations ─
    condition_history: list[dict[str, Any]] = get_condition_history(opt_result)
    if not actual_location_name:
        try:
            from sqlalchemy.orm.session import object_session
            sess = object_session(report)
            if sess is not None:
                new_opt = append_condition_history(
                    opt_result,
                    health_score,
                    health_level,
                    condition_profile_dict,
                    now,
                )
                report.optimization_result = new_opt
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(report, "optimization_result")
                condition_history = get_condition_history(new_opt)
        except Exception:
            pass

    return {
        "status": report.status,
        # Health
        "health_level": health_level,
        "shipment_health_score": health_score,
        "health_confidence": confidence,
        "health_component_scores": component_scores,
        # Condition Intelligence V2
        "condition_profile": condition_profile_dict,
        "health_breakdown": health_breakdown,
        "condition_history": condition_history,
        "signal_sources": snapshot.signal_sources,
        "signal_freshness": snapshot.signal_freshness,
        "signals_refreshed_at": snapshot.signals_refreshed_at,
        # Recommendation
        "recommended_action": recommended_action,
        "reoptimization_recommended": reopt_recommended,
        "reoptimization_reason": reopt_reason,
        "recommendation": recommendation,
        # Resolved current location + origin
        "current_location": driver_city,
        "location_source": location_source,
        "confirmed_current_location": confirmed_location or None,
        # Elapsed: Source → Current Location
        "progress_percentage": progress_pct,
        "covered_distance_km": covered_km,
        "total_route_km": total_route_km,
        "progress_derived_from": progress_derived_from,
        "elapsed_minutes": time_prog.elapsed_minutes,
        # Projected: Current Location → Destination
        "remaining_distance_km": remaining_km,
        "remaining_eta_minutes": final_eta_min,
        "remaining_minutes": time_prog.remaining_minutes,
        "updated_cost": remaining_eval.get("updated_cost"),
        "updated_risk": updated_risk,
        "updated_eta_minutes": pipeline_eta,
        # Full immutable route + derived corridor split
        "route_cities": full_route_cities or None,
        "completed_cities": completed_cities,
        "remaining_cities": remaining_cities,
        # Corridor
        "corridor_status": corridor_status,
        "corridor_matched_city": corridor_matched_city,
        # Location structs (API compat)
        "estimated_location": {
            "label": estimated.label,
            "latitude": estimated.latitude,
            "longitude": estimated.longitude,
            "segment_start": estimated.segment_start,
            "segment_end": estimated.segment_end,
            "confidence": estimated.confidence,
        },
        "actual_location": actual_location,
        "deviation_level": deviation_level,
        "deviation_km": deviation_km,
        # Legacy
        "eta_variance_minutes": eta_variance_minutes,
        "delay_risk": delay_risk,
        "checked_at": now.isoformat(),
    }
