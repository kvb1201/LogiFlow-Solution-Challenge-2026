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

    # Real traffic ratio from TomTom
    ratio = delay_hr / duration_hr
    traffic_level = min(max(ratio * 2.5, 0.0), 1.0)

    return round(traffic_level, 3)


def estimate_toll(distance_km, highway_ratio):
    return int(highway_ratio * distance_km * 2.5)


def get_routes(source, destination, payload=None):
    payload = payload or {}

    simulation_mode = payload.get("simulation_mode", False)
    sim = payload.get("simulation", {}) if simulation_mode else {}

    # If simulation mode → skip TomTom and return synthetic routes
    if simulation_mode:
        base_traffic = float(sim.get("traffic_level", 0.5))
        incident_count = int(sim.get("incident_count", 0))

        routes = []
        for i in range(3):
            dist = 300 + i * 50
            duration = dist / 55
            routes.append({
                "route_id": f"sim_{i}",
                "distance_km": dist,
                "base_duration_hr": round(duration, 2),
                "traffic_delay_hr": round(duration * base_traffic * 0.5, 2),
                "traffic_level": min(1, base_traffic + i * 0.05),
                "toll_cost": int(dist * 0.6),
                "highway_ratio": 0.6 + i * 0.1,
                "road_type": "mixed",
                "weather_impact": None,
                "num_stops": int(dist // 120),
                "road_quality": 0.85,
                "night_travel": False,
                "incident_count": incident_count,
                "geometry": None,
            })
        return routes

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
        # --- Fetch incidents for risk enhancement ---
        incident_count = 0
        try:
            # Bounding box around route (simple min/max from geometry)
            lats = []
            lons = []
            for leg in r.get("legs", []):
                for point in leg.get("points", []):
                    lats.append(point["latitude"])
                    lons.append(point["longitude"])

            if lats and lons:
                lat_mid = sum(lats) / len(lats)
                lon_mid = sum(lons) / len(lons)
                bbox = f"{lat_mid-0.1},{lon_mid-0.1},{lat_mid+0.1},{lon_mid+0.1}"
                incident_url = "https://api.tomtom.com/traffic/services/5/incidentDetails"
                incident_params = {
                    "key": TOMTOM_API_KEY,
                    "bbox": bbox,
                    "fields": "{incidents{type}}",
                }
                inc_res = requests.get(incident_url, params=incident_params, timeout=5).json()
                incident_count = len(inc_res.get("incidents", []))
        except Exception as e:
            print("DEBUG incident fetch failed:", str(e))

        summary = r["summary"]

        distance_km = summary["lengthInMeters"] / 1000
        duration_hr = summary["travelTimeInSeconds"] / 3600
        traffic_delay_hr = summary.get("trafficDelayInSeconds", 0) / 3600

        # Direct real traffic level from TomTom (no artificial baseline)
        traffic_level = classify_traffic(traffic_delay_hr, duration_hr)
        import datetime
        hour = datetime.datetime.now().hour
        if 8 <= hour <= 11:
            traffic_level *= 1.2
        elif 17 <= hour <= 20:
            traffic_level *= 1.3
        traffic_level = min(1, traffic_level)
        traffic_level = min(1, traffic_level + i * 0.05)

        print(f"[ROUTE {i}] dist={distance_km}km delay={traffic_delay_hr}hr traffic={traffic_level}")

        # Derive highway ratio from average speed
        avg_speed = distance_km / max(duration_hr, 1e-3)

        if avg_speed > 70:
            highway_ratio = 0.8
        elif avg_speed > 50:
            highway_ratio = 0.6
        else:
            highway_ratio = 0.4

        if highway_ratio > 0.7:
            route_type = "highway"
        elif highway_ratio > 0.5:
            route_type = "mixed"
        else:
            route_type = "local"

        # Geometry extraction (lat, lon pairs)
        coords = []
        try:
            for leg in r.get("legs", []):
                for point in leg.get("points", []):
                    coords.append([point["longitude"], point["latitude"]])
        except:
            coords = None

        if coords:
            coords = coords[::5]

        result.append({
            "route_id": f"tomtom_{i}",
            "distance_km": round(distance_km, 2),
            "base_duration_hr": round(duration_hr, 2),
            "traffic_delay_hr": round(traffic_delay_hr, 2),
            "traffic_level": traffic_level,
            "toll_cost": estimate_toll(distance_km, highway_ratio),
            "highway_ratio": highway_ratio,
            "road_type": "mixed",
            "route_type": route_type,
            "weather_impact": None,
            "num_stops": int(distance_km // 120),
            "road_quality": 0.85,
            "night_travel": False,
            "incident_count": incident_count,
            "geometry": coords,
        })

    return result