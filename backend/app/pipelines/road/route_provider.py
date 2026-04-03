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

def get_routes(source, destination):
    coords = geocode(source, destination)

    routes = []

    strategies = [
        ("driving-car", {}),
        ("driving-car", {"options": {"avoid_features": ["highways"]}}),
        ("driving-car", {"options": {"avoid_features": ["tollways"]}}),
        # slight coordinate perturbation for diversity
        ("driving-car", {"radiuses": [2000, 2000]}),
    ]

    for idx, (profile, extra) in enumerate(strategies):
        try:
            res = client.directions(
                coordinates=coords,
                profile=profile,
                format='json',
                **extra
            )

            if res and "routes" in res:
                for r in res["routes"]:
                    routes.append(r)

        except Exception as e:
            print(f"Route fetch failed for strategy {idx}: {e}")
            continue

    if not routes:
        raise Exception("ORS returned no routes")

    # remove duplicate routes (same distance + duration)
    unique = []
    seen = set()

    for r in routes:
        summary = r.get("summary", {})
        key = (
            round(summary.get("distance", 0), 0),
            round(summary.get("duration", 0), 0)
        )

        if key not in seen:
            seen.add(key)
            unique.append(r)

    routes = unique

    result = []

    for i, route in enumerate(routes):
        summary = route["summary"]

        distance_km = round(summary["distance"] / 1000, 2)
        duration_hr = round(summary["duration"] / 3600, 2)

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