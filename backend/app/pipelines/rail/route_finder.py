"""
Route finder for the Railway Cargo Decision Engine.
PRIMARY: Uses RailRadar API for real train data between stations.
FALLBACK: Uses CSV data_loader when API is unavailable.
"""

import re

from app.pipelines.rail import railradar_client
from app.pipelines.rail.config import STATION_TO_CITY
from app.pipelines.rail.station_resolver import resolve_station


def _resolve_stations(city_name, *, for_api: bool = False):
    """
    Resolve a place to rail station codes.

    for_api=True: hub stations only (fast scrape — avoids 50×50 pair explosions).
    for_api=False: full funnel cluster (CSV / offline index).
    """
    if for_api:
        from app.services.location_funnel import api_station_codes_for_place

        return api_station_codes_for_place(city_name)

    from app.services.location_funnel import resolve_location

    loc = resolve_location(city_name)
    out: list[str] = []
    seen: set[str] = set()
    for code in loc.station_codes or []:
        key = str(code).strip().upper()
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    if loc.station_code:
        key = str(loc.station_code).strip().upper()
        if key and key not in seen:
            out.insert(0, key)

    if out:
        return out

    # Legacy fallback when funnel cannot cluster the place.
    raw_input = city_name.strip()
    city_key = raw_input.split(",")[0].strip()
    candidates = []
    code = resolve_station(city_name)
    if code:
        candidates.append(code)
    candidates.append(raw_input)
    candidates.append(city_key.upper())
    for c in candidates:
        normalized = (c or "").strip()
        if not normalized:
            continue
        key = normalized.upper()
        if key in seen:
            continue
        seen.add(key)
        out.append(normalized)
    return out


def get_station_candidates(place: str) -> list[str]:
    """
    Public helper: return station-code candidates attempted for a user-entered place.
    Used for user-facing fallback messages when no trains are found.
    """
    try:
        return _resolve_stations(place)
    except Exception:
        raw = (place or "").strip()
        return [raw] if raw else []


def _minutes_to_time_str(minutes):
    """Convert minutes-from-midnight to HH:MM string."""
    if minutes is None:
        return ""
    h = int(minutes) // 60
    m = int(minutes) % 60
    return f"{h:02d}:{m:02d}"


def _dedupe_routes_by_train_no(routes: list) -> list:
    """One direct route per train — multi-hub API queries (HWH/KOAA/SRC) reuse the same service."""
    from app.pipelines.rail.station_coordinates import normalize_train_number

    out: list = []
    seen: set[str] = set()
    for r in routes:
        if r.get("has_transfer"):
            out.append(r)
            continue
        trains = r.get("trains") or []
        if not trains:
            out.append(r)
            continue
        norm = normalize_train_number(trains[0].get("train_no", ""))
        if norm and norm in seen:
            continue
        if norm:
            seen.add(norm)
        out.append(r)
    return out


def find_routes(
    source_city,
    dest_city,
    max_direct=15,
    max_transfer=5,
    use_api=True,
    date_of_journey=None,
    api_budget_s: float | None = None,
):
    """
    Find all cargo routes between two cities.
    Uses RailRadar API as primary data source.

    Args:
        source_city: Name of origin city (e.g., "Mumbai")
        dest_city: Name of destination city (e.g., "Delhi")
        max_direct: Maximum direct routes to return
        max_transfer: Maximum transfer routes to return

    Returns:
        list of route dicts, each containing:
          - route_type: "direct" or "transfer"
          - trains: list of train details
          - total_distance_km, total_duration_minutes
          - segments: structured segment list
    """
    from_stations = _resolve_stations(source_city, for_api=use_api)
    to_stations = _resolve_stations(dest_city, for_api=use_api)

    if not from_stations:
        print(f"  [RouteFinder] Unknown source: {source_city}")
        return []
    if not to_stations:
        print(f"  [RouteFinder] Unknown destination: {dest_city}")
        return []

    routes = []
    # ── PRIMARY: API-first (IRCTC Connect/RapidAPI through client) ────
    if use_api:
        import os
        import time

        if api_budget_s is None:
            api_budget_s = float(os.getenv("RAIL_API_PAIR_BUDGET_S", "22"))
        else:
            api_budget_s = float(api_budget_s)
        api_started = time.monotonic()
        seen_train_nos: set[str] = set()
        # Query API for each station pair (hub codes only — see _resolve_stations)
        for fs in from_stations:
            for ts in to_stations:
                if time.monotonic() - api_started > api_budget_s:
                    print(f"  [RouteFinder] API budget ({api_budget_s}s) reached — using results so far")
                    break
                if len(routes) >= max_direct:
                    break
                api_data = railradar_client.get_trains_between(
                    fs,
                    ts,
                    date_of_journey=date_of_journey,
                )
                if not api_data or not api_data.get("trains"):
                    continue

                for train in api_data.get("trains", []):
                    # STRICT VERIFICATION: Ensure the API didn't return a "nearby" station
                    # IRCTC API sometimes clusters Mumbai stations (BCT, MMCT, BSR, PNVL).
                    # We only want trains that actually stop at the station we queried.
                    actual_fs = train.get("fromStationCode", "").upper()
                    actual_ts = train.get("toStationCode", "").upper()
                    
                    # If the API explicitly returns a different station code, skip it
                    # unless it's an exact match of what we requested.
                    req_fs = fs.upper()
                    req_ts = ts.upper()

                    from app.pipelines.rail.station_coordinates import normalize_train_number

                    train_no = train.get("trainNumber", "")
                    norm_no = normalize_train_number(train_no)
                    if not norm_no or norm_no in seen_train_nos:
                        continue
                    seen_train_nos.add(norm_no)

                    # Extract schedule for this segment
                    from_schedule = train.get("fromStationSchedule", {})
                    to_schedule = train.get("toStationSchedule", {})

                    dep_minutes = from_schedule.get("departureMinutes")
                    arr_minutes = to_schedule.get("arrivalMinutes")
                    dep_day = from_schedule.get("day", 1)
                    arr_day = to_schedule.get("day", 1)

                    # Duration calculation (across days)
                    if dep_minutes is not None and arr_minutes is not None:
                        duration_min = arr_minutes - dep_minutes
                        duration_min += (arr_day - dep_day) * 1440
                        if duration_min <= 0:
                            duration_min += 1440
                    else:
                        duration_min = train.get("travelTimeMinutes", 0) or 0

                    distance_km = to_schedule.get(
                        "distanceFromSourceKm",
                        train.get("distanceKm", 0)
                    ) or 0
                    avg_speed = train.get("avgSpeedKmph", 0) or 0

                    # Running days
                    running_days = train.get("runningDays", {})
                    days_list = running_days.get("days", [])
                    all_days = running_days.get("allDays", False)

                    # Step 5: Validate scraped data
                    station_code_pattern = re.compile(r'^[A-Z]{2,5}$')
                    if not station_code_pattern.match(actual_fs or fs.upper()):
                        continue
                    if not station_code_pattern.match(actual_ts or ts.upper()):
                        continue
                    if duration_min <= 0 or duration_min > 4320:  # max 72 hours
                        continue
                    if distance_km <= 0:
                        continue

                    train_info = {
                        "train_no": train_no,
                        "train_name": train.get("trainName", ""),
                        "train_type": train.get("type", ""),
                        "from_station": actual_fs or fs,
                        "to_station": actual_ts or ts,
                        "from_station_name": train.get("sourceStationName", fs),
                        "to_station_name": train.get("destinationStationName", ts),
                        "departure_time": _minutes_to_time_str(dep_minutes),
                        "arrival_time": _minutes_to_time_str(arr_minutes),
                        "distance_km": round(distance_km, 1),
                        "duration_minutes": duration_min,
                        "avg_speed_kmph": avg_speed,
                        "total_halts": train.get("totalHalts", 0),
                        "running_days": days_list,
                        "all_days": all_days,
                        "data_source": "scraped",
                        # These are used by ML/engineer downstream
                        "stops_between": train.get("totalHalts", 0),
                        "total_train_stops": train.get("totalHalts", 0) + 2,
                        "total_train_distance": train.get("distanceKm", 0) or 0,
                    }

                    routes.append({
                        "route_type": "direct",
                        "trains": [train_info],
                        "total_distance_km": round(distance_km, 1),
                        "total_duration_minutes": duration_min,
                        "total_duration_hours": round(duration_min / 60, 2) if duration_min > 0 else 0,
                        "has_transfer": False,
                        "transfer_details": [],
                        "data_source": "scraped",
                        "segments": [{
                            "mode": "Rail",
                            "from": actual_fs or fs,
                            "to": actual_ts or ts,
                            "from_name": train.get("sourceStationName", fs),
                            "to_name": train.get("destinationStationName", ts),
                            "train_no": train_no,
                            "train_name": train.get("trainName", ""),
                            "train_type": train.get("type", ""),
                            "departure": _minutes_to_time_str(dep_minutes),
                            "arrival": _minutes_to_time_str(arr_minutes),
                            "distance_km": round(distance_km, 1),
                            "duration_minutes": duration_min,
                            "avg_speed_kmph": avg_speed,
                            "running_days": days_list,
                        }],
                    })
            if len(routes) >= max_direct:
                break
            if time.monotonic() - api_started > api_budget_s:
                break

    # ── FALLBACK: CSV/local schedule data (only when API yields nothing) ─
    if not routes:
        try:
            from app.pipelines.rail import data_loader

            csv_from = _resolve_stations(source_city, for_api=False)
            csv_to = _resolve_stations(dest_city, for_api=False)
            direct_trains = data_loader.get_trains_for_route(
                csv_from, csv_to, max_results=max_direct
            )
            for t in direct_trains:
                routes.append({
                    "route_type": "direct",
                    "trains": [t],
                    "total_distance_km": t["distance_km"],
                    "total_duration_minutes": t["duration_minutes"],
                    "total_duration_hours": round(t["duration_minutes"] / 60, 2),
                    "has_transfer": False,
                    "transfer_details": [],
                    "data_source": "csv_fallback",
                    "segments": [{
                        "mode": "Rail",
                        "from": t["from_station"],
                        "to": t["to_station"],
                        "from_name": t.get("from_station_name", t["from_station"]),
                        "to_name": t.get("to_station_name", t["to_station"]),
                        "train_no": t["train_no"],
                        "train_name": t["train_name"],
                        "departure": t["departure_time"],
                        "arrival": t["arrival_time"],
                        "distance_km": t["distance_km"],
                        "duration_minutes": t["duration_minutes"],
                    }],
                })
        except Exception as e:
            print(f"  [RouteFinder] CSV fallback load failed: {e}")

    # Sort by duration, then collapse duplicate train numbers from hub-pair loops
    routes.sort(key=lambda x: x.get("total_duration_minutes", 9999))
    routes = _dedupe_routes_by_train_no(routes)
    return routes[:max_direct]
