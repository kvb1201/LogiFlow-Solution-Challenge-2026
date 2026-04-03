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
    import urllib.parse
    encoded_city = urllib.parse.quote(city)
    url = f"https://api.tomtom.com/search/2/geocode/{encoded_city}.json"
    params = {"key": TOMTOM_API_KEY}

    try:
        res = requests.get(url, params=params, timeout=5).json()
        if not res.get("results"):
            # Fallback: if "City, District" fails, try just "City"
            if "," in city:
                fallback_city = city.split(",")[0].strip()
                print(f"Geocoding failed for '{city}', trying fallback: '{fallback_city}'")
                return geocode_city(fallback_city)
            raise Exception(f"Geocoding failed for {city}")

        pos = res["results"][0]["position"]
        return pos["lat"], pos["lon"]
    except Exception as e:
        print(f"DEBUG: Geocode error for '{city}': {str(e)}")
        raise e


def classify_traffic(delay_hr, duration_hr):
    # Prevent division issues
    duration_hr = max(duration_hr, 1e-3)

    ratio = delay_hr / duration_hr

    # Real-world baseline traffic (never 0)
    base_traffic = 0.25

    # Scale traffic more aggressively from delay
    traffic_level = base_traffic + ratio * 2.5

    # Clamp between realistic bounds
    traffic_level = min(max(traffic_level, 0.25), 1.0)

    return round(traffic_level, 2)


def estimate_toll(distance_km, highway_ratio):
    base = distance_km * 1.2
    highway_bonus = highway_ratio * distance_km * 0.8
    return int(base + highway_bonus)


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
        # TomTom expects repeated keys: avoid=motorways&avoid=tollRoads (not comma-separated)
        params["avoid"] = avoid_list

    res = requests.get(url, params=params, timeout=10)

    if res.status_code != 200:
        raise Exception(f"TomTom API failed: {res.text}")

    res = res.json()

    if "routes" not in res:
        raise Exception("TomTom returned no routes")

    result = []

    for i, r in enumerate(res["routes"]):
        summary = r["summary"]

        distance_km = summary["lengthInMeters"] / 1000
        duration_hr = summary["travelTimeInSeconds"] / 3600
        traffic_delay_hr = summary.get("trafficDelayInSeconds", 0) / 3600

        traffic_level = classify_traffic(traffic_delay_hr, duration_hr)
        print("DEBUG route traffic → delay_hr:", traffic_delay_hr, "duration_hr:", duration_hr, "traffic_level:", traffic_level)

        # Derive highway ratio from average speed
        avg_speed = distance_km / max(duration_hr, 1e-3)

        if avg_speed > 70:
            highway_ratio = 0.8
        elif avg_speed > 50:
            highway_ratio = 0.6
        else:
            highway_ratio = 0.4

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
            "toll_cost": estimate_toll(distance_km, highway_ratio),
            "highway_ratio": highway_ratio,
            "road_type": "mixed",
            "weather_impact": None,
            "num_stops": int(distance_km // 120),
            "road_quality": 0.85,
            "night_travel": False,
            "geometry": coords,
        })

    return result