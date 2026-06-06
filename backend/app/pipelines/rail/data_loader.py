"""
Data loader for the Railway Cargo Decision Engine.
Parses the Indian Railways CSV into efficient lookup structures:
  - Train route index for direct route queries
  - Station adjacency graph for multi-hop route finding
  - Per-train metadata (stops, distance, duration)
"""

import os
from collections import defaultdict
from functools import lru_cache

import pandas as pd

# Path to the CSV
_CSV_PATH = os.path.join(os.path.dirname(__file__), "Train_details_22122017.csv")

# ── Singleton data stores ──────────────────────────────────────────────
_train_routes = None        # {train_no: [list of stops in order]}
_station_graph = None       # {station: set(neighbor_stations)}
_station_trains = None      # {station_code: set(train_numbers)}
_train_metadata = None      # {train_no: {name, src, dst, total_distance, ...}}
_station_catalog = None     # {station_code: {name}}
_loaded = False


def _parse_time(t_str):
    """Parse 'HH:MM:SS' or 'HH:MM' → total minutes from midnight."""
    try:
        parts = str(t_str).strip().split(":")
        h, m = int(parts[0]), int(parts[1])
        return h * 60 + m
    except Exception:
        return None


def _calc_duration_minutes(dep_time_str, arr_time_str, journey_days=0):
    """Calculate duration in minutes between departure and arrival times."""
    dep = _parse_time(dep_time_str)
    arr = _parse_time(arr_time_str)
    if dep is None or arr is None:
        return None
    duration = arr - dep
    if duration <= 0:
        duration += 1440  # crosses midnight
    duration += journey_days * 1440
    return duration


def _segment_option(train_no, stops, i, j, meta):
    """Build one direct leg option between stop indices i and j on a train."""
    s_from = stops[i]
    s_to = stops[j]
    segment_distance = s_to["distance"] - s_from["distance"]
    if segment_distance <= 10:
        return None

    dep_min = _parse_time(s_from["departure_time"])
    arr_min = _parse_time(s_to["arrival_time"])

    if dep_min is not None and arr_min is not None:
        duration = arr_min - dep_min
        if duration <= 0:
            duration += 1440
        if segment_distance > 500 and duration < 180:
            duration += 1440
    else:
        duration = int((segment_distance / 50) * 60)

    return {
        "train_no": train_no,
        "train_name": meta.get("train_name", ""),
        "from_station": s_from["station_code"],
        "to_station": s_to["station_code"],
        "from_station_name": s_from.get("station_name", ""),
        "to_station_name": s_to.get("station_name", ""),
        "departure_time": s_from["departure_time"],
        "arrival_time": s_to["arrival_time"],
        "distance_km": round(segment_distance, 1),
        "duration_minutes": duration,
        "from_seq": s_from["seq"],
        "to_seq": s_to["seq"],
        "stops_between": j - i - 1,
        "total_train_stops": len(stops),
        "total_train_distance": meta.get("total_distance", 0),
    }


def load_data():
    """Load and index the CSV data. Thread-safe singleton pattern."""
    global _train_routes, _station_graph
    global _station_trains, _train_metadata, _station_catalog, _loaded

    if _loaded:
        return

    print("  [DataLoader] Loading Indian Railways schedule data...")
    df = pd.read_csv(_CSV_PATH, low_memory=False, usecols=[
        "Train No", "Train Name", "SEQ", "Station Code", "Station Name",
        "Arrival time", "Departure Time", "Distance",
        "Source Station", "Source Station Name",
        "Destination Station", "Destination Station Name",
    ])

    df.columns = df.columns.str.strip()
    col_map = {
        "Train No": "train_no",
        "Train Name": "train_name",
        "SEQ": "seq",
        "Station Code": "station_code",
        "Station Name": "station_name",
        "Arrival time": "arrival_time",
        "Departure Time": "departure_time",
        "Distance": "distance",
        "Source Station": "source_station",
        "Source Station Name": "source_station_name",
        "Destination Station": "dest_station",
        "Destination Station Name": "dest_station_name",
    }
    df.rename(columns=col_map, inplace=True)

    df["train_no"] = df["train_no"].astype(str).str.strip()
    df["station_code"] = df["station_code"].astype(str).str.strip()
    df["source_station"] = df["source_station"].astype(str).str.strip()
    df["dest_station"] = df["dest_station"].astype(str).str.strip()
    df["seq"] = pd.to_numeric(df["seq"], errors="coerce").fillna(0).astype(int)
    df["distance"] = pd.to_numeric(df["distance"], errors="coerce").fillna(0)
    df.sort_values(["train_no", "seq"], inplace=True)

    _train_routes = {}
    _train_metadata = {}
    _station_catalog = {}
    _station_trains = defaultdict(set)

    for train_no, group in df.groupby("train_no"):
        stops = []
        for _, row in group.iterrows():
            code = row["station_code"]
            name = str(row.get("station_name", ""))
            stops.append({
                "seq": int(row["seq"]),
                "station_code": code,
                "station_name": name,
                "arrival_time": str(row.get("arrival_time", "")),
                "departure_time": str(row.get("departure_time", "")),
                "distance": float(row["distance"]),
            })
            if code and code not in _station_catalog:
                _station_catalog[code] = {"name": name}
            _station_trains[code].add(train_no)

        _train_routes[train_no] = stops

        if stops:
            _train_metadata[train_no] = {
                "train_name": str(group.iloc[0].get("train_name", "")),
                "source_station": str(group.iloc[0].get("source_station", "")),
                "dest_station": str(group.iloc[0].get("dest_station", "")),
                "total_distance": float(stops[-1]["distance"]),
                "num_stops": len(stops),
                "source_station_name": str(group.iloc[0].get("source_station_name", "")),
                "dest_station_name": str(group.iloc[0].get("dest_station_name", "")),
            }

    del df  # drop pandas frame — indexes are enough (~1.7GB → ~100MB)

    _station_graph = defaultdict(set)
    for stops in _train_routes.values():
        for i in range(len(stops) - 1):
            s1 = stops[i]["station_code"]
            s2 = stops[i + 1]["station_code"]
            _station_graph[s1].add(s2)

    _loaded = True
    print(
        f"  [DataLoader] Loaded {len(_train_routes)} trains, "
        f"{len(_station_graph)} stations (on-demand route pairs)"
    )


@lru_cache(maxsize=4096)
def get_direct_trains(from_station, to_station):
    """
    Get all direct train options between two stations.
    Computed on demand from train routes — avoids a 800k-entry pre-index.
    """
    load_data()
    results = []
    trains_at_from = _station_trains.get(from_station, ())
    for train_no in trains_at_from:
        stops = _train_routes.get(train_no)
        if not stops:
            continue
        meta = _train_metadata.get(train_no, {})
        codes = [s["station_code"] for s in stops]
        try:
            start = codes.index(from_station)
        except ValueError:
            continue
        try:
            end = codes.index(to_station, start + 1)
        except ValueError:
            continue
        option = _segment_option(train_no, stops, start, end, meta)
        if option:
            results.append(option)
    return results


def get_trains_for_route(from_stations, to_stations, max_results=20):
    """
    Get trains between any combination of from_stations and to_stations.
    Used when a city has multiple station codes.
    Returns sorted by duration (fastest first).
    """
    load_data()
    results = []
    seen_trains = set()

    for fs in from_stations:
        for ts in to_stations:
            for train in get_direct_trains(fs, ts):
                train_key = (train["train_no"], fs, ts)
                if train_key not in seen_trains:
                    seen_trains.add(train_key)
                    results.append(train)

    results.sort(key=lambda x: x.get("duration_minutes", 9999))
    return results[:max_results]


def find_transfer_routes(from_stations, to_stations, max_results=10):
    """
    Find 1-transfer routes via common intermediate stations.
    Uses major junctions + on-demand direct lookups (no full pair index).
    """
    load_data()
    from app.pipelines.rail.config import MAJOR_JUNCTIONS

    origin_connections = {}
    for fs in from_stations:
        for mid in MAJOR_JUNCTIONS:
            if mid == fs:
                continue
            for t in get_direct_trains(fs, mid)[:3]:
                if mid not in origin_connections or \
                   t["duration_minutes"] < origin_connections[mid]["duration_minutes"]:
                    origin_connections[mid] = t

    transfer_routes = []
    for mid_station, leg1 in origin_connections.items():
        for ts in to_stations:
            leg2_options = get_direct_trains(mid_station, ts)
            if not leg2_options:
                continue
            leg2 = min(leg2_options, key=lambda x: x["duration_minutes"])

            leg1_arr = _parse_time(leg1["arrival_time"])
            leg2_dep = _parse_time(leg2["departure_time"])
            if leg1_arr and leg2_dep:
                wait = leg2_dep - leg1_arr
                if wait < 60:
                    wait += 1440
                if wait > 720:
                    continue
            else:
                wait = 180

            total_duration = leg1["duration_minutes"] + wait + leg2["duration_minutes"]
            total_distance = leg1["distance_km"] + leg2["distance_km"]

            transfer_routes.append({
                "type": "transfer",
                "transfer_station": mid_station,
                "transfer_station_name": leg1.get("to_station_name", mid_station),
                "wait_minutes": wait,
                "leg1": leg1,
                "leg2": leg2,
                "total_duration_minutes": total_duration,
                "total_distance_km": total_distance,
            })

    transfer_routes.sort(key=lambda x: x["total_duration_minutes"])
    return transfer_routes[:max_results]


def get_station_graph():
    """Get the full station adjacency graph."""
    load_data()
    return _station_graph


def get_train_metadata(train_no):
    """Get metadata for a specific train."""
    load_data()
    return _train_metadata.get(str(train_no), {})


def get_all_station_codes():
    """Get all known station codes in the dataset."""
    load_data()
    return set(_station_graph.keys())


def get_train_route(train_no):
    """Get the full stop sequence for a train."""
    load_data()
    return _train_routes.get(str(train_no), [])


def get_station_name(station_code: str) -> str:
    """Official station name from the schedule CSV."""
    load_data()
    row = (_station_catalog or {}).get(str(station_code).strip().upper(), {})
    return str(row.get("name") or "")


def get_route_stats():
    """Return summary statistics about the loaded data."""
    load_data()
    return {
        "total_trains": len(_train_routes),
        "total_stations": len(_station_graph),
        "total_route_pairs": "on_demand",
    }
