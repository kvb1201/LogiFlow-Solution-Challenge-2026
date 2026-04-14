"""
Route finder for the Railway Cargo Decision Engine.
PRIMARY: Uses RailRadar API for real train data between stations.
FALLBACK: Uses CSV data_loader when API is unavailable.
"""

from app.pipelines.rail import railradar_client
from app.pipelines.rail.config import STATION_TO_CITY
from app.pipelines.rail.station_resolver import resolve_station


def _resolve_stations(city_name):
    """
    Resolve a city name to its primary station code using local resolver.
    Returns a list with a single station code.
    """
    raw_input = city_name.strip()
    city_key = raw_input.split(",")[0].strip()
    candidates = []

    # Always try resolved station code first so downstream (ConfirmTkt) receives a code.
    code = resolve_station(city_name)
    if code:
        candidates.append(code)

    # Keep the original input as a secondary fallback for providers that accept text queries.
    candidates.append(raw_input)

    # Final fallback: assume already a station code form.
    candidates.append(city_key.upper())

    # Deduplicate while preserving order.
    out = []
    seen = set()
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


def find_routes(
    source_city,
    dest_city,
    max_direct=15,
    max_transfer=5,
    use_api=True,
    date_of_journey=None,
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
    from_stations = _resolve_stations(source_city)
    to_stations = _resolve_stations(dest_city)

    if not from_stations:
        print(f"  [RouteFinder] Unknown source: {source_city}")
        return []
    if not to_stations:
        print(f"  [RouteFinder] Unknown destination: {dest_city}")
        return []

    routes = []
    # ── PRIMARY: API-first (IRCTC Connect/RapidAPI through client) ────
    if use_api:
        seen_trains = set()
        # Query API for each station pair
        for fs in from_stations:
            for ts in to_stations:
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

                    train_no = train.get("trainNumber", "")
                    train_key = (train_no, actual_fs or fs.upper(), actual_ts or ts.upper())
                    if train_key in seen_trains:
                        continue
                    seen_trains.add(train_key)

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
                        "data_source": train.get("provider", "rail_api"),
                        # These are used by ML/engineer downstream
                        "stops_between": train.get("totalHalts", 0),
                        "total_train_stops": train.get("totalHalts", 0) + 2,
                        "total_train_distance": train.get("distanceKm", 0) or 0,
                        # ConfirmTkt-rich fields for UI + ML.
                        "confirmtkt_raw": train.get("confirmtkt_raw"),
                        "confirmtkt_availability_cache": train.get("confirmtkt_availability_cache", {}),
                        "confirmtkt_availability_cache_tatkal": train.get("confirmtkt_availability_cache_tatkal", {}),
                        "confirmtkt_avl_classes": train.get("confirmtkt_avl_classes", []),
                        "confirmtkt_train_rating": train.get("confirmtkt_train_rating"),
                    }

                    routes.append({
                        "route_type": "direct",
                        "trains": [train_info],
                        "total_distance_km": round(distance_km, 1),
                        "total_duration_minutes": duration_min,
                        "total_duration_hours": round(duration_min / 60, 2) if duration_min > 0 else 0,
                        "has_transfer": False,
                        "transfer_details": [],
                        "data_source": train.get("provider", "rail_api"),
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
                            "confirmtkt_raw": train.get("confirmtkt_raw"),
                        }],
                    })

    # ── FALLBACK: CSV/local schedule data (only when API yields nothing) ─
    if not routes:
        try:
            from app.pipelines.rail import data_loader
            direct_trains = data_loader.get_trains_for_route(
                from_stations, to_stations, max_results=max_direct
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

    # Sort by duration
    routes.sort(key=lambda x: x.get("total_duration_minutes", 9999))
    return routes[:max_direct]
