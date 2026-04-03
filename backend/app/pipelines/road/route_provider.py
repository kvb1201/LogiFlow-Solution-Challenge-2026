from dotenv import load_dotenv
from pathlib import Path
import openrouteservice
import os
import requests

# Load .env
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

ORS_API_KEY = os.getenv("ORS_API_KEY")

if not ORS_API_KEY:
    raise Exception("ORS_API_KEY not set in environment")

client = openrouteservice.Client(key=ORS_API_KEY)


def geocode(source, destination):
    url = "https://api.openrouteservice.org/geocode/search"

    def get_coord(place):
        res = requests.get(url, params={
            "api_key": ORS_API_KEY,
            "text": place
        }, timeout=5).json()

        features = res.get("features", [])
        if not features:
            raise Exception(f"Geocoding failed for: {place}")
        coords = features[0]["geometry"]["coordinates"]
        return coords

    return [get_coord(source), get_coord(destination)]


def estimate_toll(distance_km):
    return int(distance_km * 1.5)


def estimate_traffic(duration_hr):
    return min(duration_hr / 10, 1)


# Snap a coordinate to the nearest road using ORS
def snap_to_road(coord):
    try:
        res = client.nearest(
            coordinates=[coord],
            profile="driving-car"
        )
        return res["features"][0]["geometry"]["coordinates"]
    except:
        # 🔥 fallback: return original coord instead of dropping route
        return coord


import math


def get_routes(source, destination):
    coords = geocode(source, destination)

    routes = []

    src, dst = coords

    waypoint_sets = []

    # direct route always
    waypoint_sets.append([src, dst])

    # 🔥 strategy-based routing instead of random waypoints
    strategies = [
        {"name": "fast", "params": {}},
        {"name": "no_highways", "params": {"avoid_features": ["highways"]}},
        {"name": "no_tolls", "params": {"avoid_features": ["tollways"]}}
    ]

    for idx, strat in enumerate(strategies):
        try:
            res = client.directions(
                coordinates=[src, dst],
                profile="driving-car",
                format='json',
                options=strat["params"]
            )

            if res and "routes" in res:
                for r in res["routes"]:
                    r["strategy"] = strat["name"]
                    routes.append(r)

        except Exception as e:
            print(f"Route fetch failed for strategy {strat['name']}: {e}")
            continue

    if not routes:
        raise Exception("ORS returned no routes")

    # remove duplicate routes (same distance + duration, with coarser rounding)
    unique = []
    seen = set()

    for r in routes:
        summary = r.get("summary", {})
        key = (
            round(summary.get("distance", 0), -3),  # 🔥 ~1km precision
            round(summary.get("duration", 0), -2)   # 🔥 ~1 min precision
        )

        if key not in seen:
            seen.add(key)
            unique.append(r)

    routes = unique

    result = []

    for i, route in enumerate(routes):
        summary = route["summary"]

        distance_km = round(summary["distance"] / 1000, 2)
        duration_hr = round(max(summary["duration"] / 3600, 0), 2)

        result.append({
            "route_id": f"ors_{i}",
            "distance_km": distance_km,
            "base_duration_hr": duration_hr,
            "toll_cost": estimate_toll(distance_km),
            "traffic_level": max(0, min(1, estimate_traffic(duration_hr) * (0.9 + 0.2 * (i % 3)))),
            "highway_ratio": max(0.5, min(0.9, 0.7 + (i - 1) * 0.1)),
            "road_type": "mixed",
            "weather_impact": 0.05,
            "num_stops": int(distance_km // 100),
            "road_quality": 0.8,
            "night_travel": False
        })

    return result