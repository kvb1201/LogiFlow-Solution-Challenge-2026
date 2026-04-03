from dotenv import load_dotenv
from pathlib import Path
import os
import requests

# Load .env
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY")

if not TOMTOM_API_KEY:
    raise Exception("TOMTOM_API_KEY not set in environment")


def geocode_city(city: str):
    url = f"https://api.tomtom.com/search/2/geocode/{city}.json"
    params = {"key": TOMTOM_API_KEY}

    res = requests.get(url, params=params, timeout=5).json()

    if not res.get("results"):
        raise Exception(f"Geocoding failed for {city}")

    pos = res["results"][0]["position"]
    return pos["lat"], pos["lon"]


def classify_traffic(delay_hr, duration_hr):
    ratio = delay_hr / max(duration_hr, 1e-3)

    if ratio > 0.25:
        return 0.9  # heavy
    elif ratio > 0.1:
        return 0.6  # moderate
    else:
        return 0.3  # light


def estimate_toll(distance_km):
    return int(distance_km * 1.5)


def get_routes(source, destination, payload=None):
    payload = payload or {}

    lat1, lon1 = geocode_city(source)
    lat2, lon2 = geocode_city(destination)

    url = f"https://api.tomtom.com/routing/1/calculateRoute/{lat1},{lon1}:{lat2},{lon2}/json"

    params = {
        "key": TOMTOM_API_KEY,
        "traffic": "true",
        "maxAlternatives": 3,
    }

    # Apply constraints (clean handling)
    avoid_list = []

    if payload.get("avoid_highways"):
        avoid_list.append("motorways")

    if payload.get("avoid_tolls"):
        avoid_list.append("tollRoads")

    if avoid_list:
        params["avoid"] = ",".join(avoid_list)

    res = requests.get(url, params=params, timeout=10).json()

    if "routes" not in res:
        raise Exception("TomTom returned no routes")

    result = []

    for i, r in enumerate(res["routes"]):
        summary = r["summary"]

        distance_km = summary["lengthInMeters"] / 1000
        duration_hr = summary["travelTimeInSeconds"] / 3600
        traffic_delay_hr = summary.get("trafficDelayInSeconds", 0) / 3600

        traffic_level = classify_traffic(traffic_delay_hr, duration_hr)

        # Geometry extraction (lat, lon pairs)
        coords = []
        try:
            for leg in r.get("legs", []):
                for point in leg.get("points", []):
                    coords.append([point["longitude"], point["latitude"]])
        except:
            coords = None

        result.append({
            "route_id": f"tomtom_{i}",
            "distance_km": round(distance_km, 2),
            "base_duration_hr": round(duration_hr, 2),
            "traffic_delay_hr": round(traffic_delay_hr, 2),
            "traffic_level": traffic_level,
            "toll_cost": estimate_toll(distance_km),
            "highway_ratio": 0.7,
            "road_type": "mixed",
            "weather_impact": 0.05,
            "num_stops": int(distance_km // 120),
            "road_quality": 0.85,
            "night_travel": False,
            "geometry": coords,
        })

    return result