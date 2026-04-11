"""
RailRadar API client for the Railway Cargo Decision Engine.
Interfaces with https://api.railradar.org for real Indian Railways data:
  - Train search between stations
  - Real average delay data per train
  - Station search and info (lat/lng)
  - Live train tracking
"""

import os
import requests
import time
from functools import lru_cache
from dotenv import load_dotenv
from pathlib import Path

# Load .env
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

# ── API Configuration ─────────────────────────────────────────────────
RAILRADAR_BASE_URL = os.environ.get("RAILRADAR_BASE_URL", "https://api.railradar.org")
RAILRADAR_API_KEY = os.environ.get("RAILRADAR_API_KEY", "")

_session = requests.Session()
_session.headers.update({
    "X-API-Key": RAILRADAR_API_KEY,
    "Accept": "application/json",
})

# Rate limiting
_last_request_time = 0
_MIN_INTERVAL = 0.15  # 150ms between requests


def _get(endpoint, params=None, timeout=10):
    """
    Make a GET request to the RailRadar API.
    Handles rate limiting, errors, and response parsing.
    """
    global _last_request_time

    # Rate limit
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _last_request_time = time.time()

    url = f"{RAILRADAR_BASE_URL}{endpoint}"
    try:
        resp = _session.get(url, params=params, timeout=timeout)
        resp.raise_for_status()
        body = resp.json()
        if body.get("success"):
            return body.get("data", {})
        else:
            error = body.get("error", {})
            print(f"  [RailRadar] API error: {error.get('message', 'Unknown')}")
            return None
    except requests.exceptions.Timeout:
        print(f"  [RailRadar] Timeout on {endpoint}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"  [RailRadar] Request failed: {e}")
        return None
    except Exception as e:
        print(f"  [RailRadar] Unexpected error: {e}")
        return None


# ── Station Endpoints ─────────────────────────────────────────────────

def search_stations(query):
    """
    Search for stations by name or code.

    Args:
        query: City name or station code (e.g., "Mumbai", "NDLS")

    Returns:
        List of {code, name} dicts, or empty list
    """
    data = _get("/api/v1/search/stations", params={"query": query})
    if data and "stations" in data:
        return data["stations"]
    return []


def get_station_info(station_code):
    """
    Get detailed station info including coordinates.

    Args:
        station_code: Station code (e.g., "NDLS")

    Returns:
        Station dict with code, name, lat, lng, zone, etc.
    """
    data = _get(f"/api/v1/stations/{station_code}/info")
    return data


# ── Train Endpoints ───────────────────────────────────────────────────

def get_trains_between(from_code, to_code):
    """
    Find all trains running between two stations.
    Returns real schedule data with distance, speed, travel time.

    Args:
        from_code: Source station code (e.g., "MMCT")
        to_code: Destination station code (e.g., "NDLS")

    Returns:
        dict with totalTrains, trains list
    """
    data = _get("/api/v1/trains/between", params={"from": from_code, "to": to_code})
    return data


def get_train_data(train_number, data_type="static"):
    """
    Get comprehensive train data (static schedule, route, live status).

    Args:
        train_number: 5-digit train number (e.g., "12951")
        data_type: "full", "static", or "live"

    Returns:
        Train data dict
    """
    data = _get(
        f"/api/v1/trains/{train_number}",
        params={"dataType": data_type}
    )
    return data


def get_average_delay(train_number):
    """
    Get REAL average arrival/departure delay per station for a train.
    This is measured historical data, not a heuristic.

    Args:
        train_number: 5-digit train number

    Returns:
        dict with train info and route list of per-station delays
    """
    data = _get(f"/api/v1/trains/{train_number}/average-delay")
    return data


def get_live_status(train_number, journey_date=None):
    """
    Get real-time live tracking status for a train.

    Args:
        train_number: 5-digit train number
        journey_date: Optional YYYY-MM-DD date

    Returns:
        Live status dict with current location, delays
    """
    params = {"dataType": "live"}
    if journey_date:
        params["journeyDate"] = journey_date
    data = _get(f"/api/v1/trains/{train_number}", params=params)
    return data


def search_trains(query):
    """
    Search for trains by number or name.

    Args:
        query: Train number or name fragment

    Returns:
        List of matching train dicts
    """
    data = _get("/api/v1/search/trains", params={"query": query})
    if isinstance(data, list):
        return data
    return []


def get_live_station_board(station_code, hours=8):
    """
    Get live station board — trains arriving/departing in next N hours.

    Args:
        station_code: Station code
        hours: Time window (1-8)

    Returns:
        Station board with train list
    """
    data = _get(
        f"/api/v1/stations/{station_code}/live",
        params={"hours": hours}
    )
    return data


@lru_cache(maxsize=2000)
def get_station_coords(station_code):
    """
    Helper to fetch and cache station coordinates to minimize API calls.
    """
    info = get_station_info(station_code)
    if info and "latitude" in info and "longitude" in info:
        return [info["longitude"], info["latitude"]]
    return None

@lru_cache(maxsize=100)
def get_train_geometry(train_no, from_station, to_station):
    """
    Helper to get the geometry coordinates for a train route from A to B.
    Extracts intermediate stations using the static schedule, then 
    fetches their coordinates utilizing the cache.
    """
    data = get_train_data(train_no, data_type="static")
    if not data or "route" not in data:
        return None
        
    route = data["route"]
    
    start_idx, end_idx = -1, -1
    for i, stop in enumerate(route):
        code = stop.get("stationCode")
        if not code:
            continue
        code = code.upper()
        if code == from_station.upper():
            start_idx = i
        if code == to_station.upper():
            end_idx = i
            
    if start_idx == -1 or end_idx == -1 or start_idx > end_idx:
        return None

    # Limit to 10 intermediate points to avoid overloading API / rate limits
    route_leg = route[start_idx:end_idx + 1]
    
    if len(route_leg) > 10:
        # Sample evenly
        indices = [0]
        step = (len(route_leg) - 1) / 9.0
        for i in range(1, 9):
            indices.append(int(i * step))
        indices.append(len(route_leg) - 1)
        sampled_route = [route_leg[i] for i in sorted(list(set(indices)))]
    else:
        sampled_route = route_leg
        
    coords = []
    for stop in sampled_route:
        code = stop.get("stationCode")
        if code:
            coord = get_station_coords(code.upper())
            if coord:
                coords.append(coord)
                
    return coords if coords else None
