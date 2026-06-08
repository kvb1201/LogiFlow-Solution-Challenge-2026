from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from typing import Any, Optional

from app.models.domain import ShipmentReport
from app.utils.coordinates import get_coords


# ---------------------------------------------------------------------------
# Fuzzy city adjacency map — for NEAR_ROUTE detection (Phase 3)
# Maps satellite / nearby towns → canonical route city
# ---------------------------------------------------------------------------
_NEAR_CITY_MAP: dict[str, str] = {
    # Gujarat corridor (Surat↔Ahmedabad)
    "bharuch": "bharuch",
    "ankleshwar": "bharuch",       # Ankleshwar is ~5km from Bharuch
    "jhagadia": "bharuch",
    "karjan": "vadodara",
    "padra": "vadodara",
    "dabhoi": "vadodara",
    "petlad": "anand",
    "kheda": "anand",
    "borsad": "anand",
    "nadiad": "nadiad",
    "mahemdabad": "nadiad",
    "matar": "nadiad",
    "sanand": "ahmedabad",
    "bavla": "ahmedabad",
    "dholka": "ahmedabad",
    "kosamba": "surat",
    "olpad": "surat",
    "kamrej": "surat",
    "bardoli": "surat",
    "navsari": "surat",
    "vapi": "surat",
    # Mumbai corridor
    "thane": "thane",
    "kalyan": "kalyan",
    "ulhasnagar": "kalyan",
    "ambarnath": "kalyan",
    "badlapur": "kalyan",
    "panvel": "panvel",
    "navi mumbai": "panvel",
    "nerul": "panvel",
    "khopoli": "panvel",
    # Delhi corridor
    "new delhi": "delhi",
    "gurgaon": "delhi",
    "gurugram": "delhi",
    "faridabad": "delhi",
    "noida": "delhi",
    "ghaziabad": "delhi",
    "sonipat": "delhi",
    "bahadurgarh": "delhi",
    # Pune–Mumbai
    "lonavala": "pune",
    # Bangalore corridor
    "electronic city": "bengaluru",
    "whitefield": "bengaluru",
    "hosur": "bengaluru",
    "tumkur": "bengaluru",
    "tumkuru": "bengaluru",
    # Hyderabad
    "secunderabad": "hyderabad",
    "cyberabad": "hyderabad",
    "bhongir": "hyderabad",
    # Chennai corridor
    "tambaram": "chennai",
    "kanchipuram": "chennai",
    "chengalpattu": "chennai",
    "avadi": "chennai",
    # Kolkata
    "howrah": "kolkata",
    "durgapur": "kolkata",
    "asansol": "kolkata",
    # Generic aliases
    "bombay": "mumbai",
    "bangalore": "bengaluru",
    "calcutta": "kolkata",
    "madras": "chennai",
    "allahabad": "prayagraj",
    "nasik": "nashik",
}


def _normalize_city(name: str) -> str:
    """Lowercase, strip punctuation, handle common aliases."""
    n = name.strip().lower()
    n = re.sub(r"\s+", " ", n)
    return _NEAR_CITY_MAP.get(n, n)


# ---------------------------------------------------------------------------
# Phase 1 — Route Intelligence generation
# ---------------------------------------------------------------------------

def _extract_route_cities_from_geometry(opt_result: dict[str, Any]) -> list[str]:
    """
    Try to pull intermediate city waypoints from road geometry using reverse-geocode
    of evenly-spaced coordinates. Falls back gracefully.
    """
    best = opt_result.get("best") or {}
    geometry = best.get("geometry") or []
    if len(geometry) < 4:
        return []

    # Sample ~10 evenly-spaced points from geometry
    step = max(1, len(geometry) // 10)
    sample_coords = geometry[::step]

    cities = []
    for pt in sample_coords:
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            continue
        lng, lat = float(pt[0]), float(pt[1])
        # Reverse geocode via Nominatim (best-effort, may be slow)
        try:
            import json, urllib.request
            url = (
                f"https://nominatim.openstreetmap.org/reverse?"
                f"format=json&lat={lat}&lon={lng}&zoom=10"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "LogiFlow-RouteIntel"})
            with urllib.request.urlopen(req, timeout=3) as r:
                data = json.loads(r.read().decode())
            addr = data.get("address", {})
            city = (
                addr.get("city")
                or addr.get("town")
                or addr.get("village")
                or addr.get("county")
                or ""
            )
            if city:
                cities.append(city)
        except Exception:
            pass

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for c in cities:
        key = c.lower()
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


def _haversine_distance_km(city_a: str, city_b: str) -> float:
    """Return straight-line distance between two cities in km (0 if unknown)."""
    ca = get_coords(city_a)
    cb = get_coords(city_b)
    if not ca or not cb:
        return 0.0
    lat1, lon1 = ca
    lat2, lon2 = cb
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return round(2 * 6371.0 * asin(sqrt(max(0.0, a))), 1)


def _intermediate_cities_between(city_a: str, city_b: str) -> list[str]:
    """
    Return known Indian cities that lie roughly on the road corridor
    between city_a and city_b, based on static heuristics.

    Each corridor entry is (endpoint_pair, ordered_intermediate_cities).
    The match is bidirectional — order of a/b doesn't matter.
    When a/b are an exact corridor pair, return just those intermediates.
    No partial matching to avoid spurious cities being added.
    """
    # Each entry: ([ep_a, ep_b], [intermediate cities in order ep_a→ep_b])
    CORRIDORS: list[tuple[tuple[str, str], list[str]]] = [
        # ── Gujarat ─────────────────────────────────────────────────────
        (("surat", "ahmedabad"),    ["bharuch", "ankleshwar", "vadodara", "anand", "nadiad"]),
        (("surat", "vadodara"),     ["bharuch", "ankleshwar", "karjan"]),
        (("vadodara", "ahmedabad"), ["anand", "nadiad"]),
        (("bharuch", "ahmedabad"),  ["vadodara", "anand", "nadiad"]),
        (("bharuch", "vadodara"),   ["ankleshwar", "karjan"]),
        (("surat", "bharuch"),      ["ankleshwar"]),
        # ── Mumbai region ───────────────────────────────────────────────
        (("mumbai", "pune"),        ["thane", "panvel", "lonavala"]),
        (("mumbai", "nashik"),      ["thane", "kalyan", "igatpuri"]),
        (("mumbai", "surat"),       ["thane", "vapi", "navsari"]),
        (("mumbai", "vadodara"),    ["thane", "vapi", "surat", "bharuch", "ankleshwar"]),
        (("pune", "hyderabad"),     ["solapur", "gulbarga"]),
        # ── Delhi–Mumbai ────────────────────────────────────────────────
        (("delhi", "mumbai"),       ["kota", "ratlam", "indore", "vadodara", "surat"]),
        (("delhi", "surat"),        ["kota", "ratlam", "indore", "vadodara"]),
        (("delhi", "vadodara"),     ["kota", "ratlam", "indore"]),
        # ── Delhi–North ─────────────────────────────────────────────────
        (("delhi", "jaipur"),       ["alwar", "behror"]),
        (("delhi", "amritsar"),     ["ambala", "ludhiana", "jalandhar"]),
        (("delhi", "lucknow"),      ["aligarh", "kannauj", "kanpur"]),
        (("delhi", "kolkata"),      ["kanpur", "varanasi", "patna", "dhanbad"]),
        (("delhi", "chennai"),      ["agra", "bhopal", "nagpur", "hyderabad"]),
        (("agra", "varanasi"),      ["prayagraj"]),
        # ── South ───────────────────────────────────────────────────────
        (("mumbai", "bengaluru"),   ["pune", "solapur", "gulbarga"]),
        (("bengaluru", "chennai"),  ["hosur", "krishnagiri", "vellore"]),
        (("chennai", "kolkata"),    ["vijayawada", "visakhapatnam", "bhubaneswar"]),
        (("kolkata", "guwahati"),   ["siliguri", "jalpaiguri"]),
        (("hyderabad", "bengaluru"),["kurnool", "anantapur"]),
        (("hyderabad", "mumbai"),   ["solapur", "pune"]),
        (("chennai", "hyderabad"),  ["nellore", "ongole"]),
    ]

    a_key = _normalize_city(city_a)
    b_key = _normalize_city(city_b)

    for (ep_a, ep_b), cities in CORRIDORS:
        # Exact bidirectional match only — no partial matching
        if (a_key == ep_a and b_key == ep_b):
            return cities
        if (a_key == ep_b and b_key == ep_a):
            return list(reversed(cities))

    return []


def build_route_intelligence(
    source: str,
    destination: str,
    stops: list[str],
    optimization_result: Optional[dict[str, Any]],
    estimated_time_hours: Optional[float] = None,
) -> dict[str, Any]:
    """
    Generate route_intelligence for a newly created report.

    Route city pipeline:
      1. Walk declared waypoints, insert intermediate corridor cities after each leg.
      2. Deduplicate by lowercase canonical key — keep first occurrence.
      3. Sort all cities (excluding source/destination anchors) by cumulative
         haversine distance from source so the list always reflects actual
         path traversal order.
      4. Sample checkpoints evenly from the ordered list.

    Returns:
      route_cities  — full ordered, deduplicated city list
      checkpoints   — evenly-spaced subset ordered by distance_from_start
    """
    waypoints = [source, *(stops or []), destination]

    # ── Step 1: collect cities in discovery order ────────────────────
    raw: list[str] = []
    seen: set[str] = set()

    def _add(city: str) -> None:
        # Use plain lowercase for deduplication — NOT _normalize_city.
        # _normalize_city maps nearby towns to their canonical route city
        # (e.g. karjan → vadodara), which is correct for corridor detection
        # but wrong here: we want both Vadodara AND Karjan in the city list.
        key = city.strip().lower()
        if key not in seen:
            seen.add(key)
            raw.append(city)

    for i, wp in enumerate(waypoints):
        _add(wp)
        if i < len(waypoints) - 1:
            for ic in _intermediate_cities_between(wp, waypoints[i + 1]):
                _add(ic)

    # Geometry enrichment if corridor table produced too few cities
    if optimization_result and len(raw) < 4:
        for gc in _extract_route_cities_from_geometry(optimization_result):
            _add(gc)

    if len(raw) < 2:
        raw = list(dict.fromkeys([source, destination]))  # fallback

    # ── Step 2: build distance_from_start for every city ────────────
    # Anchor: source = 0 km, destination = total_km.
    # For interior cities: compute cumulative distance along the waypoint
    # chain by finding which leg each city belongs to and interpolating.

    src_coords = get_coords(source)
    dst_coords = get_coords(destination)
    total_km = (
        _haversine_distance_km(source, destination)
        or (float(estimated_time_hours or 0) * 55)
        or 1.0
    )

    # Build cumulative distances for declared waypoints (for leg assignment)
    wp_coords = [get_coords(w) for w in waypoints]
    wp_cumulative: list[float] = [0.0]
    for i in range(1, len(waypoints)):
        a, b = wp_coords[i - 1], wp_coords[i]
        if a and b:
            lat1, lon1 = a; lat2, lon2 = b
            dlat = radians(lat2 - lat1); dlon = radians(lon2 - lon1)
            x = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
            seg_km = 2 * 6371.0 * asin(sqrt(max(0.0, x)))
        else:
            seg_km = total_km / max(len(waypoints) - 1, 1)
        wp_cumulative.append(wp_cumulative[-1] + seg_km)

    route_total_km = wp_cumulative[-1] or total_km

    def _dist_from_start(city: str) -> float:
        """Return estimated km from source along the route for a given city."""
        city_lower = city.lower()
        # Direct waypoint match
        for i, wp in enumerate(waypoints):
            if wp.lower() == city_lower:
                return wp_cumulative[i]
        # Coordinate-based: project onto nearest leg
        coords = get_coords(city)
        if not coords:
            # Fall back to straight-line fraction from source
            straight = _haversine_distance_km(source, city)
            return min(straight, route_total_km)
        c_lat, c_lng = coords
        best_dist: float = float("inf")
        best_d_from_start: float = 0.0
        for i in range(len(waypoints) - 1):
            a, b = wp_coords[i], wp_coords[i + 1]
            if not a or not b:
                continue
            # Find the t∈[0,1] that minimises distance from city to point on segment a→b
            ax, ay = a[1], a[0]  # lng, lat
            bx, by = b[1], b[0]
            cx, cy = c_lng, c_lat
            dx, dy = bx - ax, by - ay
            seg_len_sq = dx * dx + dy * dy
            if seg_len_sq < 1e-12:
                t = 0.0
            else:
                t = max(0.0, min(1.0, ((cx - ax) * dx + (cy - ay) * dy) / seg_len_sq))
            proj_lat = a[0] + t * (b[0] - a[0])
            proj_lng = a[1] + t * (b[1] - a[1])
            dlat = radians(c_lat - proj_lat); dlon = radians(c_lng - proj_lng)
            x = sin(dlat/2)**2 + cos(radians(c_lat)) * cos(radians(proj_lat)) * sin(dlon/2)**2
            d = 2 * 6371.0 * asin(sqrt(max(0.0, x)))
            if d < best_dist:
                best_dist = d
                seg_km_full = wp_cumulative[i + 1] - wp_cumulative[i]
                best_d_from_start = wp_cumulative[i] + t * seg_km_full
        return best_d_from_start

    # ── Step 3: sort by distance_from_start ─────────────────────────
    city_distances: list[tuple[str, float]] = []
    for city in raw:
        city_distances.append((city, _dist_from_start(city)))

    city_distances.sort(key=lambda x: x[1])
    route_cities = [c for c, _ in city_distances]

    # Ensure source is first and destination is last
    src_lower = source.lower()
    dst_lower = destination.lower()
    route_cities = [c for c in route_cities if c.lower() != src_lower and c.lower() != dst_lower]
    route_cities = [source] + route_cities + [destination]

    # ── Step 4: checkpoint selection ────────────────────────────────
    hours = float(estimated_time_hours or 0)
    if total_km < 300:
        target_checkpoints = 3
    elif total_km < 700:
        target_checkpoints = 4
    elif total_km < 1200:
        target_checkpoints = 5
    elif total_km < 1800:
        target_checkpoints = 6
    else:
        target_checkpoints = 8

    if len(route_cities) <= target_checkpoints:
        checkpoints = route_cities[:]
    else:
        step = max(1, (len(route_cities) - 1) // (target_checkpoints - 1))
        indices = list(range(0, len(route_cities), step))
        if len(route_cities) - 1 not in indices:
            indices.append(len(route_cities) - 1)
        checkpoints = [route_cities[i] for i in indices]

    return {
        "checkpoints": checkpoints,
        "route_cities": route_cities,
        "source": source,
        "destination": destination,
        "total_km_estimate": round(route_total_km, 1),
    }


def enrich_optimization_result_with_intelligence(
    optimization_result: Optional[dict[str, Any]],
    source: str,
    destination: str,
    stops: list[str],
    estimated_time_hours: Optional[float] = None,
) -> dict[str, Any]:
    """
    Wrap the existing optimization_result with route_intelligence.
    Backward-compatible: old results without this key are left untouched at query time.
    """
    result = dict(optimization_result or {})
    if "route_intelligence" not in result:
        result["route_intelligence"] = build_route_intelligence(
            source, destination, stops, optimization_result, estimated_time_hours
        )
    return result


# ---------------------------------------------------------------------------
# Phase 2 — Estimated location upgrade
# ---------------------------------------------------------------------------

def _estimate_city_from_progress(
    route_intelligence: dict[str, Any],
    progress_percentage: float,
) -> str:
    """
    Map progress % to the nearest city along the route.

    Uses route_intelligence.route_cities (full ordered list) for granular
    positioning. Checkpoints are used as a fallback when route_cities is absent.
    Never returns "Between A and B".
    """
    # Use the full ordered route_cities for smooth city-level resolution.
    # Checkpoints are a sparse sample — they skip intermediate cities and cause
    # coarse jumps (e.g. 0–49% all mapping to the source city on short routes).
    cities: list[str] = (
        route_intelligence.get("route_cities")
        or route_intelligence.get("checkpoints")
        or []
    )
    if not cities:
        return ""

    clamped = min(100.0, max(0.0, progress_percentage))
    if clamped >= 100.0:
        return cities[-1]
    if clamped <= 0.0:
        return cities[0]

    n = len(cities)
    raw_idx = (clamped / 100.0) * (n - 1)
    idx = int(round(raw_idx))
    idx = max(0, min(n - 1, idx))
    return cities[idx]


# ---------------------------------------------------------------------------
# Phase 3 — Route Corridor Detection
# ---------------------------------------------------------------------------

def detect_corridor_status(
    current_city: str,
    route_intelligence: dict[str, Any],
) -> dict[str, str]:
    """
    Returns {status: ON_ROUTE | NEAR_ROUTE | OFF_ROUTE, matched_city: str}

    Step 1 — exact match in route_cities  → ON_ROUTE
    Step 2 — fuzzy/near match             → NEAR_ROUTE
    Step 3 — otherwise                    → OFF_ROUTE
    """
    if not current_city or not current_city.strip():
        return {"status": "ON_ROUTE", "matched_city": ""}

    route_cities: list[str] = route_intelligence.get("route_cities") or []
    current_norm = _normalize_city(current_city)

    # Step 1: exact (normalised) match
    for rc in route_cities:
        if _normalize_city(rc) == current_norm:
            return {"status": "ON_ROUTE", "matched_city": rc}

    # Step 2: fuzzy — check if current_city normalizes to a known near-city
    # that maps to a route city
    canonical = _NEAR_CITY_MAP.get(current_norm, current_norm)
    for rc in route_cities:
        if _normalize_city(rc) == canonical:
            return {"status": "NEAR_ROUTE", "matched_city": rc}

    # Step 2b: substring match (e.g. "New Delhi" ↔ "Delhi")
    for rc in route_cities:
        rc_norm = _normalize_city(rc)
        if rc_norm in current_norm or current_norm in rc_norm:
            return {"status": "NEAR_ROUTE", "matched_city": rc}

    # Step 3: off route
    return {"status": "OFF_ROUTE", "matched_city": ""}


# ---------------------------------------------------------------------------
# Core trip-progress helpers
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
        return TripProgress(progress_percentage=0.0, elapsed_minutes=0, remaining_minutes=0)

    total_seconds = max((expected_end_time - started_at).total_seconds(), 1)
    elapsed_seconds = (now - started_at).total_seconds()

    if elapsed_seconds <= 0:
        progress = 0.0
    elif now >= expected_end_time:
        progress = 100.0
    else:
        progress = (elapsed_seconds / total_seconds) * 100

    return TripProgress(
        progress_percentage=round(min(100.0, max(0.0, progress)), 1),
        elapsed_minutes=max(0, int(elapsed_seconds // 60)),
        remaining_minutes=max(0, int((expected_end_time - now).total_seconds() // 60)),
    )


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    radius_km = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    x = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return 2 * radius_km * asin(sqrt(max(0.0, x)))


def estimate_trip_location(
    report: ShipmentReport, progress_percentage: float
) -> LocationEstimate:
    """
    Phase 2 upgrade: use route_intelligence when available.
    Falls back to old segment interpolation for existing reports.
    """
    waypoints = [report.source, *(report.stops or []), report.destination]
    if len(waypoints) < 2:
        return LocationEstimate(
            label=report.source or report.destination or "Unknown",
            latitude=None,
            longitude=None,
            segment_start=report.source or "Unknown",
            segment_end=report.destination or "Unknown",
            confidence="low",
        )

    clamped = min(100.0, max(0.0, progress_percentage))

    # ── Phase 2: use route_intelligence if present ──────────────────
    opt_result = report.optimization_result or {}
    route_intelligence = opt_result.get("route_intelligence")

    if route_intelligence and route_intelligence.get("route_cities"):
        city_label = _estimate_city_from_progress(route_intelligence, clamped)
        if city_label:
            coords = get_coords(city_label)
            # Determine segment_start / segment_end for context
            segment_count = len(waypoints) - 1
            scaled = (clamped / 100.0) * segment_count
            seg_idx = min(segment_count - 1, int(scaled))
            return LocationEstimate(
                label=city_label,
                latitude=round(coords[0], 5) if coords else None,
                longitude=round(coords[1], 5) if coords else None,
                segment_start=waypoints[seg_idx],
                segment_end=waypoints[seg_idx + 1],
                confidence="high",
            )

    # ── Fallback: old segment interpolation ─────────────────────────
    segment_count = len(waypoints) - 1
    scaled = (clamped / 100.0) * segment_count
    segment_index = min(segment_count - 1, int(scaled))
    segment_ratio = 1.0 if clamped >= 100 else scaled - segment_index

    start_name = waypoints[segment_index]
    end_name = waypoints[segment_index + 1]
    start_coords = get_coords(start_name)
    end_coords = get_coords(end_name)

    # Avoid generic "Between A and B" — if we are >90% into a segment use end_name
    if segment_ratio >= 0.85:
        label = end_name
    elif segment_ratio <= 0.15:
        label = start_name
    else:
        label = f"Between {start_name} and {end_name}"

    if start_coords and end_coords:
        lat = start_coords[0] + (end_coords[0] - start_coords[0]) * segment_ratio
        lng = start_coords[1] + (end_coords[1] - start_coords[1]) * segment_ratio
        return LocationEstimate(
            label=label,
            latitude=round(lat, 5),
            longitude=round(lng, 5),
            segment_start=start_name,
            segment_end=end_name,
            confidence="medium",
        )

    return LocationEstimate(
        label=label,
        latitude=None,
        longitude=None,
        segment_start=start_name,
        segment_end=end_name,
        confidence="low",
    )


# ---------------------------------------------------------------------------
# Phase 4 — Remaining Journey Evaluation
# ---------------------------------------------------------------------------

def _run_remaining_pipeline(
    report: ShipmentReport,
    current_location: str,
    remaining_stops: list[str],
    destination: str,
) -> dict[str, Any]:
    """
    Re-run the existing optimization pipeline from current_location.
    Does NOT modify the report. Result is used only for health scoring.
    """
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
    """
    Phase 4: evaluate the remaining journey from current_location.
    Returns updated ETA, cost, risk, delay estimates.
    """
    # Build remaining stops: waypoints beyond progress index
    waypoints = [report.source, *(report.stops or []), report.destination]
    destination = report.destination

    segment_count = max(1, len(waypoints) - 1)
    scaled = (progress_percentage / 100.0) * segment_count
    seg_idx = min(segment_count - 1, int(scaled))

    # Remaining stops are waypoints strictly after current segment start
    remaining_stops = [wp for wp in waypoints[seg_idx + 1 :] if wp != destination]

    try:
        pipeline_result = _run_remaining_pipeline(
            report, current_location, remaining_stops, destination
        )
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
# Phase 5 — Health Scoring Engine
# ---------------------------------------------------------------------------

def _compute_health_score(
    corridor_status: str,
    remaining_eval: dict[str, Any],
    overdue_minutes: int,
    base_risk: float,
    report: ShipmentReport,
) -> tuple[str, str, str]:
    """
    Deterministic health scoring.

    Returns (health_level, delay_risk, recommended_action).

    Rules:
    - OFF_ROUTE + any delay → at_risk
    - OFF_ROUTE + no delay  → moderate
    - NEAR_ROUTE + high delay → at_risk
    - NEAR_ROUTE + low delay  → moderate
    - ON_ROUTE + high delay   → moderate
    - ON_ROUTE + low delay    → healthy

    'High delay' = updated ETA > original ETA + 15min, or overdue > 30min
    'Risk high'  = updated_risk > 0.55
    """
    updated_risk: float = float(remaining_eval.get("updated_risk") or 0.0) if remaining_eval else 0.0
    updated_eta_minutes: Optional[int] = remaining_eval.get("updated_eta_minutes") if remaining_eval else None

    # Compute delay signal
    original_remaining_minutes = 0
    if report.started_at and report.expected_end_time:
        now = datetime.utcnow()
        original_remaining_minutes = max(0, int((report.expected_end_time - now).total_seconds() // 60))

    eta_gap_minutes = 0
    if updated_eta_minutes is not None and original_remaining_minutes > 0:
        eta_gap_minutes = updated_eta_minutes - original_remaining_minutes

    significant_delay = (eta_gap_minutes > 15) or (overdue_minutes >= 30)
    high_risk = (updated_risk > 0.55) or (base_risk > 0.65)

    if corridor_status == "OFF_ROUTE":
        if significant_delay or high_risk:
            return "at_risk", "high", "reoptimize"
        return "moderate", "medium", "reoptimize"

    if corridor_status == "NEAR_ROUTE":
        if significant_delay or high_risk:
            return "at_risk", "high", "reoptimize"
        return "moderate", "medium", "monitor"

    # ON_ROUTE
    if significant_delay or high_risk:
        return "moderate", "medium", "monitor"
    if overdue_minutes >= 60:
        return "at_risk", "high", "reoptimize"
    return "healthy", "low", "continue"


# ---------------------------------------------------------------------------
# Phase 6 — Smarter Reoptimization Trigger
# ---------------------------------------------------------------------------

_ETA_IMPROVEMENT_THRESHOLD_MINUTES = 15
_RISK_REDUCTION_THRESHOLD = 0.05       # 5%
_COST_REDUCTION_THRESHOLD = 0.05       # 5%


def should_recommend_reoptimization(
    current_metrics: dict[str, Any],
    updated_metrics: dict[str, Any],
) -> tuple[bool, str]:
    """
    Phase 6: recommend reoptimization only if improvement exceeds thresholds.

    Returns (recommend: bool, reason: str)

    Thresholds:
      ETA improvement  > 15 minutes
      Risk reduction   > 5%
      Cost reduction   > 5%
    """
    reasons: list[str] = []

    # ETA (time in hours → convert to minutes)
    current_time = float(current_metrics.get("time") or 0)
    updated_time = float(updated_metrics.get("time") or 0)
    if current_time > 0 and updated_time > 0:
        eta_improvement_min = int((current_time - updated_time) * 60)
        if eta_improvement_min > _ETA_IMPROVEMENT_THRESHOLD_MINUTES:
            reasons.append(f"ETA improves by {eta_improvement_min}m")

    # Risk reduction
    current_risk = float(current_metrics.get("risk") or 0)
    updated_risk = float(updated_metrics.get("risk") or 0)
    if current_risk > 0 and updated_risk < current_risk:
        risk_reduction = (current_risk - updated_risk) / current_risk
        if risk_reduction > _RISK_REDUCTION_THRESHOLD:
            reasons.append(f"Risk reduces by {int(risk_reduction * 100)}%")

    # Cost reduction
    current_cost = float(current_metrics.get("cost") or 0)
    updated_cost = float(updated_metrics.get("cost") or 0)
    if current_cost > 0 and updated_cost < current_cost:
        cost_reduction = (current_cost - updated_cost) / current_cost
        if cost_reduction > _COST_REDUCTION_THRESHOLD:
            reasons.append(f"Cost reduces by {int(cost_reduction * 100)}%")

    if reasons:
        return True, "; ".join(reasons)
    return False, "Current route remains optimal"


# ---------------------------------------------------------------------------
# Master evaluate_route_health — Phase 2–6 integration
# ---------------------------------------------------------------------------

def evaluate_route_health(
    report: ShipmentReport,
    actual_location_name: Optional[str] = None,
    current_time: Optional[datetime] = None,
) -> dict[str, Any]:
    now = current_time or datetime.utcnow()

    # ── Route Intelligence ───────────────────────────────────────────
    opt_result = report.optimization_result or {}
    route_intelligence: Optional[dict[str, Any]] = opt_result.get("route_intelligence")

    # ── Requirement 3: use confirmed current_location when available ─
    # After an Update Shipment action the confirmed location is stored in
    # optimization_result.current_location — use it directly instead of
    # estimating from progress %.
    confirmed_location: str = (opt_result.get("current_location") or "").strip()

    # The "driver city" for this evaluation:
    #   1. Explicit query param (actual_location_name) — a fresh override
    #   2. Confirmed location stored in shipment details
    #   3. Nothing — fall back to progress-based estimate below
    driver_city: str = (actual_location_name or "").strip() or confirmed_location

    # ── Progress ─────────────────────────────────────────────────────
    progress = calculate_trip_progress(report.started_at, report.expected_end_time, now)

    # ── Estimated location (only used when no confirmed location) ────
    if driver_city:
        # We have a confirmed or freshly-supplied location — use it.
        # Skip progress-based estimation entirely.
        coords = get_coords(driver_city)
        estimated = LocationEstimate(
            label=driver_city,
            latitude=round(coords[0], 5) if coords else None,
            longitude=round(coords[1], 5) if coords else None,
            segment_start=driver_city,
            segment_end=report.destination,
            confidence="confirmed" if driver_city == confirmed_location else "medium",
        )
    else:
        estimated = estimate_trip_location(report, progress.progress_percentage)

    # ── Actual / Current Location ─────────────────────────────────────
    actual_location = None
    deviation_km: Optional[float] = None
    corridor_status = "ON_ROUTE"
    corridor_matched_city = ""

    if driver_city:
        actual_coords = get_coords(driver_city)
        actual_location = {
            "label": driver_city,
            "latitude": round(actual_coords[0], 5) if actual_coords else None,
            "longitude": round(actual_coords[1], 5) if actual_coords else None,
            "confidence": "confirmed" if driver_city == confirmed_location else (
                "medium" if actual_coords else "low"
            ),
        }

        if route_intelligence:
            corridor_result = detect_corridor_status(driver_city, route_intelligence)
            corridor_status = corridor_result["status"]
            corridor_matched_city = corridor_result["matched_city"]
        else:
            if actual_coords and estimated.latitude is not None and estimated.longitude is not None:
                deviation_km = round(
                    _haversine_km(actual_coords, (estimated.latitude, estimated.longitude)), 1
                )
                if deviation_km >= 150:
                    corridor_status = "OFF_ROUTE"
                elif deviation_km >= 50:
                    corridor_status = "NEAR_ROUTE"

        if actual_coords and estimated.latitude is not None and estimated.longitude is not None:
            deviation_km = round(
                _haversine_km(actual_coords, (estimated.latitude, estimated.longitude)), 1
            )

    # ── Remaining Journey Evaluation ─────────────────────────────────
    current_location_for_eval = driver_city or estimated.label
    remaining_eval: dict[str, Any] = {}

    if current_location_for_eval and progress.progress_percentage < 100:
        try:
            remaining_eval = evaluate_remaining_journey(
                report, current_location_for_eval, progress.progress_percentage
            )
        except Exception:
            remaining_eval = {}

    # ── Overdue calculation ───────────────────────────────────────────
    overdue_minutes = 0
    if report.expected_end_time and now > report.expected_end_time:
        overdue_minutes = int((now - report.expected_end_time).total_seconds() // 60)

    base_risk = min(1.0, max(0.0, float(report.risk_score or 0.15)))

    total_minutes = 0
    if report.started_at and report.expected_end_time:
        total_minutes = max(1, int((report.expected_end_time - report.started_at).total_seconds() // 60))

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

    # ── Health Scoring ────────────────────────────────────────────────
    health_level, delay_risk, recommended_action = _compute_health_score(
        corridor_status, remaining_eval, overdue_minutes, base_risk, report
    )

    adherence_score = {"ON_ROUTE": 1.0, "NEAR_ROUTE": 0.6, "OFF_ROUTE": 0.1}.get(corridor_status, 1.0)

    updated_eta = remaining_eval.get("updated_eta_minutes") if remaining_eval else None
    original_rem = 0
    if report.started_at and report.expected_end_time:
        original_rem = max(0, int((report.expected_end_time - now).total_seconds() // 60))
    if updated_eta is not None and original_rem > 0:
        eta_ratio = max(0.0, 1.0 - max(0, updated_eta - original_rem) / max(original_rem, 1))
    elif overdue_minutes > 0:
        eta_ratio = max(0.0, 1.0 - min(1.0, overdue_minutes / 120))
    else:
        eta_ratio = 1.0

    updated_risk_val = float(remaining_eval.get("updated_risk") or base_risk) if remaining_eval else base_risk
    risk_score_component = max(0.0, 1.0 - updated_risk_val)

    original_cost = float(report.estimated_cost or 0)
    updated_cost_val = float(remaining_eval.get("updated_cost") or 0) if remaining_eval else 0
    if original_cost > 0 and updated_cost_val > original_cost:
        cost_score = max(0.0, 1.0 - (updated_cost_val - original_cost) / original_cost)
    else:
        cost_score = 1.0

    shipment_health_score = round(
        (adherence_score * 40) +
        (eta_ratio * 25) +
        (risk_score_component * 20) +
        (cost_score * 15)
    )

    # ── Reoptimization Trigger ────────────────────────────────────────
    reopt_recommended = False
    reopt_reason = ""
    if recommended_action == "reoptimize" or (driver_city and corridor_status != "ON_ROUTE"):
        current_metrics = {
            "cost": report.estimated_cost,
            "time": report.estimated_time,
            "risk": report.risk_score,
        }
        updated_metrics = remaining_eval.get("metrics") or {}
        reopt_recommended, reopt_reason = should_recommend_reoptimization(
            current_metrics, updated_metrics
        )
        if not reopt_recommended and recommended_action == "reoptimize":
            recommended_action = "monitor"
            reopt_reason = "Improvement below threshold — continue monitoring"

    # ── Requirement 4: split route_cities into sections ──────────────
    # completed_cities / current_city / remaining_cities for corridor display
    full_route_cities: list[str] = (
        route_intelligence.get("route_cities") if route_intelligence else None
    ) or []

    completed_cities: list[str] = []
    remaining_cities: list[str] = []

    if driver_city and full_route_cities:
        driver_norm = driver_city.lower()
        split_idx = next(
            (i for i, c in enumerate(full_route_cities) if c.lower() == driver_norm), -1
        )
        if split_idx >= 0:
            completed_cities = full_route_cities[:split_idx]
            remaining_cities = full_route_cities[split_idx + 1:]
        else:
            # driver_city not in list — treat everything as remaining
            remaining_cities = full_route_cities

    # ── Build response ────────────────────────────────────────────────
    return {
        "status": report.status,
        "health_level": health_level,
        "shipment_health_score": shipment_health_score,
        "progress_percentage": progress.progress_percentage,
        "elapsed_minutes": progress.elapsed_minutes,
        "remaining_minutes": progress.remaining_minutes,
        "eta_variance_minutes": eta_variance_minutes,
        "delay_risk": delay_risk,
        "recommended_action": recommended_action,
        "estimated_location": {
            "label": estimated.label,
            "latitude": estimated.latitude,
            "longitude": estimated.longitude,
            "segment_start": estimated.segment_start,
            "segment_end": estimated.segment_end,
            "confidence": estimated.confidence,
        },
        "actual_location": actual_location,
        "confirmed_current_location": confirmed_location or None,
        "deviation_level": deviation_level,
        "deviation_km": deviation_km,
        "corridor_status": corridor_status,
        "corridor_matched_city": corridor_matched_city,
        # Full route cities from route_intelligence (may be trimmed after update)
        "route_cities": full_route_cities or None,
        # Split sections for corridor display (Requirement 4)
        "completed_cities": completed_cities,
        "remaining_cities": remaining_cities,
        "updated_eta_minutes": remaining_eval.get("updated_eta_minutes"),
        "updated_cost": remaining_eval.get("updated_cost"),
        "updated_risk": remaining_eval.get("updated_risk"),
        "reoptimization_recommended": reopt_recommended,
        "reoptimization_reason": reopt_reason,
        "checked_at": now.isoformat(),
    }
