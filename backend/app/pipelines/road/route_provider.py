from dotenv import load_dotenv
from pathlib import Path
import openrouteservice
import os
import requests
import math

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


# Helper functions for generating waypoint-based routes
def midpoint(a, b):
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]


def generate_waypoints(src, dst, n=3, offset_km=40):
    waypoints = []

    mid = midpoint(src, dst)

    dx = dst[0] - src[0]
    dy = dst[1] - src[1]

    perp = [-dy, dx]

    length = math.sqrt(perp[0]**2 + perp[1]**2)
    if length == 0:
        return []

    perp = [perp[0] / length, perp[1] / length]

    offset = offset_km / 111

    for i in range(-n//2, n//2 + 1):
        if i == 0:
            continue

        wp = [
            mid[0] + perp[0] * offset * i,
            mid[1] + perp[1] * offset * i
        ]

        wp = snap_to_road(wp)
        waypoints.append(wp)

    return waypoints


def get_routes(source, destination, payload=None):
    payload = payload or {}
    coords = geocode(source, destination)

    routes = []

    src, dst = coords

    option_sets = []

    option_sets.append({"name": "default", "params": {}})

    if payload.get("avoid_highways"):
        option_sets.append({"name": "no_highways", "params": {"avoid_features": ["highways"]}})

    if payload.get("avoid_tolls"):
        option_sets.append({"name": "no_tolls", "params": {"avoid_features": ["tollways"]}})

    # 1. Direct routes (with constraints)
    for strat in option_sets:
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

        except:
            continue

    # 2. Waypoint-based routes (REAL diversity)
    waypoints = generate_waypoints(src, dst)

    for i, wp in enumerate(waypoints):
        try:
            res = client.directions(
                coordinates=[src, wp, dst],
                profile="driving-car",
                format='json'
            )

            if res and "routes" in res:
                r = res["routes"][0]
                r["strategy"] = f"waypoint_{i}"
                routes.append(r)

        except:
            continue

    if not routes:
        raise Exception("ORS returned no routes")

    # remove near-duplicate routes (distance + duration rounded)
    unique = []
    seen = set()

    for r in routes:
        summary = r.get("summary", {})
        key = (
            round(summary.get("distance", 0), 0),  # 🔥 ~1m precision
            round(summary.get("duration", 0), 0)   # 🔥 ~1s precision
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

        geometry = route.get("geometry")
        coords = geometry.get("coordinates") if isinstance(geometry, dict) else None

        result.append({
            "route_id": f"ors_{i}",
            "distance_km": distance_km,
            "base_duration_hr": duration_hr,
            "toll_cost": estimate_toll(distance_km),
            "traffic_level": max(0, min(1, estimate_traffic(duration_hr))),
            "highway_ratio": 0.7,
            "road_type": "mixed",
            "weather_impact": 0.05,
            "num_stops": int(distance_km // 100),
            "road_quality": 0.8,
            "night_travel": False,
            "geometry": coords,
        })

    return result