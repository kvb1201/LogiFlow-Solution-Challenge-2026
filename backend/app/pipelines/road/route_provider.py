from dotenv import load_dotenv
from pathlib import Path
import os
import math
import requests
from requests.exceptions import RequestException

from app.utils.coordinates import get_coords

# Load .env from both:
# - backend/.env (historical)
# - repo-root/.env (common)
_here = Path(__file__).resolve()
load_dotenv(_here.parents[3] / ".env")  # backend/.env
load_dotenv(_here.parents[4] / ".env")  # repo-root/.env

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY")

if not TOMTOM_API_KEY:
    raise Exception("TOMTOM_API_KEY not set (expected in backend/.env or repo-root .env)")


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
            fallback_lat, fallback_lon = get_coords(city)
            print(f"Geocoding fallback for '{city}' -> cached/openstreetmap coordinates")
            return fallback_lat, fallback_lon

        pos = res["results"][0]["position"]
        return pos["lat"], pos["lon"]
    except RequestException as e:
        print(f"DEBUG: TomTom geocode timeout/network error for '{city}': {str(e)}")
        fallback_lat, fallback_lon = get_coords(city)
        return fallback_lat, fallback_lon
    except Exception as e:
        print(f"DEBUG: Geocode error for '{city}': {str(e)}")
        fallback_lat, fallback_lon = get_coords(city)
        return fallback_lat, fallback_lon


def _haversine_km(lat1, lon1, lat2, lon2):
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    return radius * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def _fallback_routes(source, destination, payload, reason):
    """Generate deterministic fallback road routes when TomTom is unavailable."""
    lat1, lon1 = get_coords(source)
    lat2, lon2 = get_coords(destination)

    base_distance = max(_haversine_km(lat1, lon1, lat2, lon2), 40.0)
    base_speed = 50.0
    base_duration = max(base_distance / base_speed, 1.0)

    variants = [
        {"id": "fallback_fast", "dist_mult": 1.00, "delay_mult": 0.16, "toll_mult": 1.15, "highway_ratio": 0.78},
        {"id": "fallback_balanced", "dist_mult": 1.08, "delay_mult": 0.26, "toll_mult": 1.00, "highway_ratio": 0.62},
        {"id": "fallback_local", "dist_mult": 1.18, "delay_mult": 0.34, "toll_mult": 0.82, "highway_ratio": 0.42},
    ]

    results = []
    for idx, variant in enumerate(variants):
        distance_km = round(base_distance * variant["dist_mult"], 2)
        duration_hr = round(max(base_duration * variant["dist_mult"], 1.0), 2)
        traffic_delay_hr = round(duration_hr * variant["delay_mult"], 2)
        traffic_level = classify_traffic(traffic_delay_hr, duration_hr)

        mid_lat = round((lat1 + lat2) / 2 + (0.1 - idx * 0.08), 6)
        mid_lon = round((lon1 + lon2) / 2 + (-0.08 + idx * 0.06), 6)

        results.append({
            "route_id": variant["id"],
            "distance_km": distance_km,
            "base_duration_hr": duration_hr,
            "traffic_delay_hr": traffic_delay_hr,
            "traffic_level": traffic_level,
            "toll_cost": int(round(distance_km * 2.5 * variant["highway_ratio"] * variant["toll_mult"])),
            "highway_ratio": variant["highway_ratio"],
            "road_type": "mixed",
            "route_type": "fallback",
            "weather_impact": None,
            "num_stops": int(distance_km // 120),
            "road_quality": 0.78,
            "night_travel": False,
            "incident_count": 0,
            "data_source": "fallback_offline",
            "fallback_reason": reason,
            "geometry": [
                [round(lon1, 6), round(lat1, 6)],
                [mid_lon, mid_lat],
                [round(lon2, 6), round(lat2, 6)],
            ],
        })

    return results


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

    simulation_mode = payload.get("mode") == "simulation"
    print(f"[ROUTE_PROVIDER] mode={payload.get('mode')} simulation_mode={simulation_mode}")
    sim = payload.get("simulation") or {} if simulation_mode else {}

    # IMPORTANT: Do NOT generate synthetic routes in simulation mode.
    # Always fetch real routes from TomTom and let downstream pipeline apply simulation.
    if simulation_mode:
        print("[ROUTE_PROVIDER] Simulation mode active → using real routes (no synthetic generation)")

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

    try:
        res = requests.get(url, params=params, timeout=10)


        if res.status_code != 200:
            raise Exception(f"TomTom API failed: {res.text}")

        res = res.json()

        if "routes" not in res:
            raise Exception("TomTom returned no routes")
    except RequestException as e:
        print(f"[ROUTE_PROVIDER] TomTom timeout/network error -> using fallback routes: {e}")
        return _fallback_routes(source, destination, payload, "tomtom_timeout")
    except Exception as e:
        print(f"[ROUTE_PROVIDER] TomTom route fetch failed -> using fallback routes: {e}")
        return _fallback_routes(source, destination, payload, "tomtom_unavailable")

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
        except Exception as e:
            print(f"[ROUTE_PROVIDER] Geometry extraction failed: {e}")
            coords = []

        # Downsample if valid
        if isinstance(coords, list) and len(coords) >= 2:
            coords = coords[::5]
        else:
            print(f"[ROUTE_PROVIDER] Invalid geometry for route {i}, dropping geometry")
            coords = []

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
