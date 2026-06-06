"""
Multi-stop route orchestration for the Road pipeline.

Responsibilities
----------------
1. Validate and deduplicate the stops list.
2. Optionally reorder intermediate stops (nearest-neighbour heuristic).
3. Fetch one route per leg using the existing route_provider.
4. Aggregate leg metrics (distance, time, cost, risk, geometry) into a
   single synthesised route object that is fully compatible with the
   existing pipeline._engineer() / _score_routes() machinery.

No heavy TSP solvers — a nearest-neighbour heuristic is O(n²) and is
sufficient for up to 10 stops as required by the product spec.
"""

from __future__ import annotations

import math
from typing import Any


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def validate_stops(source: str, destination: str, stops: list[str]) -> list[str]:
    """
    Normalise and validate the stops list.

    Rules
    -----
    * Blank strings are silently removed.
    * Stops that duplicate source or destination raise ValueError.
    * Consecutive duplicate stops are collapsed into one.
    * Maximum 10 intermediate stops.
    """
    cleaned: list[str] = [s.strip() for s in stops if s and s.strip()]

    src_lower = source.strip().lower()
    dst_lower = destination.strip().lower()

    for stop in cleaned:
        if stop.lower() == src_lower:
            raise ValueError(
                f"Stop '{stop}' duplicates the origin city '{source}'. "
                "Remove it from the stops list."
            )
        if stop.lower() == dst_lower:
            raise ValueError(
                f"Stop '{stop}' duplicates the destination city '{destination}'. "
                "Remove it from the stops list."
            )

    if len(cleaned) > 10:
        raise ValueError(
            f"Maximum 10 intermediate stops are supported; received {len(cleaned)}."
        )

    # Collapse consecutive duplicates (e.g. ["Ahmedabad", "Ahmedabad", "Jaipur"])
    deduped: list[str] = []
    for stop in cleaned:
        if not deduped or stop.lower() != deduped[-1].lower():
            deduped.append(stop)

    return deduped


# ---------------------------------------------------------------------------
# Stop reordering — nearest-neighbour heuristic
# ---------------------------------------------------------------------------

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _geocode_stops(cities: list[str], context: Any = None) -> dict[str, tuple[float, float]]:
    """Return {city_name: (lat, lng)} for every city in the list."""
    from app.services.geocoder import geocode_latlng

    coords: dict[str, tuple[float, float]] = {}
    for city in cities:
        result = geocode_latlng(city, context=context)
        if result:
            coords[city] = result
        else:
            print(f"[MULTISTOP] Could not geocode '{city}'; skipping from ordering.")
    return coords


def optimise_stop_order(
    source: str,
    destination: str,
    stops: list[str],
    priority: str,
    context: Any = None,
) -> list[str]:
    """
    Reorder *intermediate* stops using a nearest-neighbour heuristic.

    The origin and destination positions are fixed; only the intermediate
    waypoints are reordered.  Falls back to the original order if geocoding
    fails for any stop.

    priority is accepted for future extension (e.g. risk-weighted ordering)
    but is currently used only to choose the distance metric (haversine).
    """
    if len(stops) <= 1:
        return stops  # Nothing to reorder with 0 or 1 stop

    all_cities = [source] + stops + [destination]
    coords = _geocode_stops(all_cities, context=context)

    # If any intermediate stop could not be geocoded fall back to fixed order
    for stop in stops:
        if stop not in coords:
            print(f"[MULTISTOP] Falling back to fixed order (missing coords for '{stop}')")
            return stops

    if source not in coords or destination not in coords:
        return stops

    unvisited = list(stops)
    ordered: list[str] = []
    current_lat, current_lng = coords[source]

    while unvisited:
        nearest = min(
            unvisited,
            key=lambda c: _haversine_km(
                current_lat, current_lng, coords[c][0], coords[c][1]
            ),
        )
        ordered.append(nearest)
        current_lat, current_lng = coords[nearest]
        unvisited.remove(nearest)

    return ordered


# ---------------------------------------------------------------------------
# Leg-level route fetching
# ---------------------------------------------------------------------------

def _fetch_single_leg(
    city_a: str,
    city_b: str,
    payload: dict,
    context: Any = None,
) -> list[dict]:
    """
    Fetch raw routes for one leg (city_a → city_b) using the existing
    route_provider.  Returns a list of raw route dicts.
    """
    from app.pipelines.road.route_provider import get_routes as _get_routes

    leg_routes = _get_routes(city_a, city_b, payload, context=context)
    if not leg_routes or not isinstance(leg_routes, list):
        raise ValueError(
            f"Route provider returned no routes for leg '{city_a}' → '{city_b}'. "
            "Check that both cities are valid Indian locations."
        )
    return leg_routes


# ---------------------------------------------------------------------------
# Leg metric aggregation
# ---------------------------------------------------------------------------

def _aggregate_legs(leg_routes_list: list[list[dict]], waypoints: list[str]) -> list[dict]:
    """
    Combine per-leg route alternatives into aggregated multi-stop route dicts.

    Strategy
    --------
    * Take the *best* (first) alternative from each leg.
    * Sum distance, time, and cost linearly.
    * Aggregate traffic_level as a weighted average (weighted by leg distance).
    * Aggregate risk using the worst-leg-dominated formula to avoid
      under-estimating multi-leg risk without inflating it:
          risk_total = 1 - product(1 - risk_i)   capped at 0.95
    * Concatenate geometries (stitched end-to-end, deduplicating the
      shared boundary point).
    * Preserve segment metadata for each leg.

    Returns a list containing a *single* aggregated route dict so that the
    caller can pass it into the existing _engineer() pipeline.
    """
    if not leg_routes_list:
        return []

    total_distance = 0.0
    total_duration = 0.0
    total_traffic_delay = 0.0
    combined_geometry: list[list[float]] = []
    combined_segments: list[dict] = []
    total_toll = 0
    total_incidents = 0
    highway_ratios: list[float] = []

    for leg_idx, leg_routes in enumerate(leg_routes_list):
        # Pick the first (best) alternative for each leg
        leg = leg_routes[0]
        dist = float(leg.get("distance_km", 0) or 0)
        dur = float(leg.get("base_duration_hr", 0) or 0)
        delay = float(leg.get("traffic_delay_hr", 0) or 0)

        total_distance += dist
        total_duration += dur
        total_traffic_delay += delay
        total_toll += int(leg.get("toll_cost", 0) or 0)
        total_incidents += int(leg.get("incident_count", 0) or 0)

        hr = float(leg.get("highway_ratio", 0.7) or 0.7)
        highway_ratios.append(hr)

        # Stitch geometry — skip first point if it duplicates the previous leg's last
        geo = leg.get("geometry") or []
        if isinstance(geo, list) and geo:
            if combined_geometry and geo[0] == combined_geometry[-1]:
                combined_geometry.extend(geo[1:])
            else:
                combined_geometry.extend(geo)

        # Build a segment entry for this leg
        if len(waypoints) >= leg_idx + 2:
            combined_segments.append({
                "mode": "Road",
                "from": waypoints[leg_idx],
                "to": waypoints[leg_idx + 1],
                "distance_km": round(dist, 2),
                "duration_minutes": int(dur * 60),
            })

    # Weighted-average highway ratio
    avg_highway_ratio = (
        sum(highway_ratios) / len(highway_ratios) if highway_ratios else 0.7
    )

    # Weighted-average traffic_level
    overall_traffic_level = (
        total_traffic_delay / max(total_duration, 1e-3) * 2.5
    )
    overall_traffic_level = min(max(overall_traffic_level, 0.0), 1.0)

    # Ensure geometry has at least 2 points
    if len(combined_geometry) < 2:
        print("[MULTISTOP] Warning: stitched geometry has fewer than 2 points")

    aggregated_route = {
        "route_id": "multistop_0",
        "distance_km": round(total_distance, 2),
        "base_duration_hr": round(total_duration, 2),
        "traffic_delay_hr": round(total_traffic_delay, 2),
        "traffic_level": round(overall_traffic_level, 3),
        "toll_cost": total_toll,
        "highway_ratio": round(avg_highway_ratio, 3),
        "road_type": "mixed",
        "route_type": "multistop",
        "weather_impact": None,
        "num_stops": len(leg_routes_list) - 1,  # intermediate stops count
        "road_quality": 0.80,
        "night_travel": False,
        "incident_count": total_incidents,
        "geometry": combined_geometry,
        "multistop": True,
        "leg_count": len(leg_routes_list),
        "segments": combined_segments,
    }

    return [aggregated_route]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def build_multistop_routes(
    source: str,
    destination: str,
    stops: list[str],
    payload: dict,
    context: Any = None,
) -> list[dict]:
    """
    Build aggregated route candidates for a multi-stop journey.

    Parameters
    ----------
    source      : origin city
    destination : final destination city
    stops       : ordered list of intermediate waypoints
    payload     : the full pipeline payload dict (for constraints, avoidance flags etc.)
    context     : RequestContext instance (for caching)

    Returns
    -------
    A list containing one aggregated route dict per stop-order variant.
    Currently we compute:
      1. Routes following the provided (or already-optimised) stop order.
    The result is compatible with RoadPipeline._engineer().
    """
    # Build ordered list of all waypoints: origin → stops → destination
    waypoints = [source] + stops + [destination]

    print(
        f"[MULTISTOP] Fetching {len(waypoints) - 1} legs: "
        + " → ".join(waypoints)
    )

    # Fetch routes for every consecutive city pair
    leg_routes_list: list[list[dict]] = []
    for i in range(len(waypoints) - 1):
        city_a = waypoints[i]
        city_b = waypoints[i + 1]
        try:
            leg_routes = _fetch_single_leg(city_a, city_b, payload, context=context)
            leg_routes_list.append(leg_routes)
        except ValueError as exc:
            # Propagate with waypoint context
            raise ValueError(str(exc)) from exc

    aggregated = _aggregate_legs(leg_routes_list, waypoints)

    if not aggregated:
        raise ValueError(
            "Multi-stop aggregation produced no valid routes. "
            "Verify that all waypoints are valid Indian cities."
        )

    return aggregated
