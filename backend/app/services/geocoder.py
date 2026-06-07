"""
Unified city geocoding for road/air/water pipelines.

No Google Maps API or scraping required for Indian logistics cities.

Priority:
  1. Offline rail station DB (8k+ stations in station_coords_cache.json)
  2. Static city table
  3. Optional paid APIs (Google / TomTom / ORS) only if keys are set
  4. OpenStreetMap Nominatim (free URL lookup, rate-limited)

Scraping Google Maps HTML is intentionally NOT used — it breaks on CAPTCHAs,
violates Google's Terms of Service, and is less accurate than our rail station
coordinates for station/city names we already know.
"""
from __future__ import annotations

import os
import re
import time
import urllib.error
import urllib.parse
from pathlib import Path
from typing import Optional, Tuple

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

TOMTOM_API_KEY = (os.getenv("TOMTOM_API_KEY") or "").strip()
GOOGLE_MAPS_API_KEY = (
    os.getenv("GOOGLE_MAPS_API_KEY")
    or os.getenv("GOOGLE_GEOCODING_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
    or ""
).strip()
ORS_API_KEY = (os.getenv("ORS_API_KEY") or "").strip()

_GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

_LAST_NOMINATIM_AT = 0.0
_NOMINATIM_MIN_INTERVAL_S = 2.0
_COORD_CACHE: dict[str, tuple[float, float] | None] = {}

# Fast offline fallback for common Indian logistics cities.
_INDIAN_CITY_COORDS: dict[str, tuple[float, float]] = {
    "agra": (27.1767, 78.0081),
    "ahmedabad": (23.0225, 72.5714),
    "allahabad": (25.4358, 81.8463),
    "ambala": (30.3782, 76.7767),
    "amritsar": (31.6340, 74.8723),
    "aurangabad": (19.8762, 75.3433),
    "bareilly": (28.3670, 79.4304),
    "bengaluru": (12.9716, 77.5946),
    "bhopal": (23.2599, 77.4126),
    "bhubaneswar": (20.2961, 85.8245),
    "bilaspur": (22.0797, 82.1391),
    "chennai": (13.0827, 80.2707),
    "coimbatore": (11.0168, 76.9558),
    "cuttack": (20.4625, 85.8830),
    "dehradun": (30.3165, 78.0322),
    "delhi": (28.6139, 77.2090),
    "dhanbad": (23.7957, 86.4304),
    "goa": (15.2993, 74.1240),
    "gorakhpur": (26.7606, 83.3732),
    "guwahati": (26.1445, 91.7362),
    "gwalior": (26.2183, 78.1828),
    "howrah": (22.5958, 88.2636),
    "hyderabad": (17.3850, 78.4867),
    "indore": (22.7196, 75.8577),
    "itarsi": (22.6142, 77.7603),
    "jaipur": (26.9124, 75.7873),
    "jammu": (32.7266, 74.8570),
    "jamshedpur": (22.8046, 86.2029),
    "jabalpur": (23.1815, 79.9864),
    "jhansi": (25.4484, 78.5685),
    "jodhpur": (26.2389, 73.0243),
    "kalyan": (19.2437, 73.1355),
    "kanpur": (26.4499, 80.3319),
    "kochi": (9.9312, 76.2673),
    "kolkata": (22.5726, 88.3639),
    "kota": (25.2138, 75.8648),
    "lucknow": (26.8467, 80.9462),
    "ludhiana": (30.9010, 75.8573),
    "madurai": (9.9252, 78.1198),
    "mangalore": (12.9141, 74.8560),
    "mathura": (27.4924, 77.6737),
    "meerut": (28.9845, 77.7064),
    "moradabad": (28.8386, 78.7733),
    "mumbai": (19.0760, 72.8777),
    "nagpur": (21.1458, 79.0882),
    "nanded": (19.1383, 77.3210),
    "nasik": (19.9975, 73.7898),
    "panvel": (18.9894, 73.1175),
    "patna": (25.5941, 85.1376),
    "prayagraj": (25.4358, 81.8463),
    "pune": (18.5204, 73.8567),
    "raipur": (21.2514, 81.6296),
    "ranchi": (23.3441, 85.3096),
    "rajkot": (22.3039, 70.8022),
    "ratlam": (23.3315, 75.0367),
    "roorkee": (29.8543, 77.8880),
    "salem": (11.6643, 78.1460),
    "secunderabad": (17.4399, 78.4983),
    "solapur": (17.6599, 75.9064),
    "surat": (21.1702, 72.8311),
    "thane": (19.2183, 72.9781),
    "trivandrum": (8.5241, 76.9366),
    "udaipur": (24.5854, 73.7125),
    "ujjain": (23.1765, 75.7885),
    "vadodara": (22.3072, 73.1812),
    "varanasi": (25.3176, 82.9739),
    "vijayawada": (16.5062, 80.6480),
    "visakhapatnam": (17.6868, 83.2185),
    "warangal": (17.9689, 79.5941),
}


def _normalize_key(name: str) -> str:
    raw = re.sub(r",\s*india\s*$", "", (name or "").strip(), flags=re.I)
    aliases = {
        "new delhi": "delhi",
        "bombay": "mumbai",
        "bangalore": "bengaluru",
        "calcutta": "kolkata",
        "madras": "chennai",
        "prayagraj jn": "prayagraj",
        "allahabad": "prayagraj",
    }
    key = raw.lower()
    return aliases.get(key, key)


def _static_lookup(name: str) -> Optional[tuple[float, float]]:
    key = _normalize_key(name)
    if key in _INDIAN_CITY_COORDS:
        return _INDIAN_CITY_COORDS[key]
    for city, coords in _INDIAN_CITY_COORDS.items():
        if city in key or key in city:
            return coords
    return None


_CITY_TO_STATION: Optional[dict] = None
_STATION_COORD_CACHE: Optional[dict] = None

_RAIL_CACHE_PATH = (
    Path(__file__).resolve().parents[1] / "pipelines" / "rail" / "station_coords_cache.json"
)

_STATION_CODE_ALIASES: dict[str, list[str]] = {
    "PRYJ": ["ALD"],
    "ALD": ["PRYJ"],
    "NDLS": ["DLI"],
    "DLI": ["NDLS"],
    "DDU": ["MGS"],
    "MGS": ["DDU"],
    "JHS": ["VGLB"],
    "VGLB": ["JHS"],
    "BCT": ["MMCT"],
    "MMCT": ["BCT"],
    "MAS": ["MS"],
    "MS": ["MAS"],
}

_MAJOR_STATION_COORDS: dict[str, tuple[float, float]] = {
    "PRYJ": (25.4358, 81.8463),
    "ALD": (25.4358, 81.8463),
    "CNB": (26.4499, 80.3319),
    "LKO": (26.8467, 80.9462),
    "BCT": (18.9690, 72.8205),
    "MMCT": (18.9690, 72.8205),
    "PUNE": (18.5286, 73.8742),
    "BRC": (22.3072, 73.1812),
    "ST": (21.1702, 72.8311),
    "KOTA": (25.2138, 75.8648),
    "NDLS": (28.6428, 77.2204),
}


def _load_city_stations() -> dict:
    """Load CITY_TO_STATION without importing the full rail package."""
    global _CITY_TO_STATION
    if _CITY_TO_STATION is not None:
        return _CITY_TO_STATION
    import importlib.util

    path = Path(__file__).resolve().parents[1] / "pipelines" / "rail" / "config.py"
    spec = importlib.util.spec_from_file_location("rail_config_geocoder", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    _CITY_TO_STATION = mod.CITY_TO_STATION
    return _CITY_TO_STATION


def _match_city(name: str) -> Optional[str]:
    key = _normalize_key(name)
    city_map = _load_city_stations()
    for city in city_map:
        if city.lower() == key:
            return city
    best: Optional[str] = None
    best_len = 0
    for city in city_map:
        cl = city.lower()
        if key in cl or cl in key:
            if len(cl) > best_len:
                best = city
                best_len = len(cl)
    return best


def _load_station_coord_cache() -> dict:
    global _STATION_COORD_CACHE
    if _STATION_COORD_CACHE is not None:
        return _STATION_COORD_CACHE
    if not _RAIL_CACHE_PATH.exists():
        _STATION_COORD_CACHE = {}
        return _STATION_COORD_CACHE
    try:
        import json

        with open(_RAIL_CACHE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        _STATION_COORD_CACHE = data if isinstance(data, dict) else {}
    except Exception:
        _STATION_COORD_CACHE = {}
    return _STATION_COORD_CACHE


def _valid_latlng(lat: float, lng: float) -> bool:
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return False
    return not (abs(lat - 20.5937) < 0.01 and abs(lng - 78.9629) < 0.01)


def _station_code_latlng(code: str) -> Optional[tuple[float, float]]:
    """Resolve a station code via offline cache (no rail package import)."""
    c = (code or "").strip().upper()
    if not c:
        return None
    codes = [c]
    for alt in _STATION_CODE_ALIASES.get(c, []):
        if alt not in codes:
            codes.append(alt)

    cache = _load_station_coord_cache()
    for station_code in codes:
        if station_code in _MAJOR_STATION_COORDS:
            return _MAJOR_STATION_COORDS[station_code]
        row = cache.get(station_code)
        if not isinstance(row, dict):
            continue
        try:
            lat = float(row["lat"])
            lng = float(row["lng"])
            if _valid_latlng(lat, lng):
                return lat, lng
        except (KeyError, TypeError, ValueError):
            continue
    return None


def _rail_station_lookup(name: str) -> Optional[tuple[float, float]]:
    """
    City → primary IR station code → offline lat/lng.
    Uses station_coords_cache.json (8k+ stations, already in repo).
    """
    token = (name or "").strip().upper()
    if re.fullmatch(r"[A-Z0-9]{2,5}", token):
        hit = _station_code_latlng(token)
        if hit:
            return hit

    city = _match_city(name)
    if not city and token:
        try:
            from app.pipelines.rail.config import STATION_TO_CITY

            city = STATION_TO_CITY.get(token)
        except Exception:
            city = None
    if not city:
        return None
    for code in _load_city_stations().get(city, []):
        coords = _station_code_latlng(code)
        if coords:
            return coords
    return None


def google_geocode_latlng(query: str) -> Optional[tuple[float, float]]:
    """
    Call Google Maps Geocoding API and return (lat, lng).

    GET https://maps.googleapis.com/maps/api/geocode/json
        ?address=<city>,+India
        &components=country:IN
        &region=in
        &key=<GOOGLE_MAPS_API_KEY>
    """
    if not GOOGLE_MAPS_API_KEY:
        return None

    address = f"{query.strip()}, India"
    params = {
        "address": address,
        "components": "country:IN",
        "region": "in",
        "key": GOOGLE_MAPS_API_KEY,
    }

    res = requests.get(_GOOGLE_GEOCODE_URL, params=params, timeout=10)
    res.raise_for_status()
    body = res.json()

    status = body.get("status", "")
    if status == "OK" and body.get("results"):
        loc = body["results"][0]["geometry"]["location"]
        return float(loc["lat"]), float(loc["lng"])

    if status not in ("ZERO_RESULTS", "OK"):
        err = body.get("error_message", "")
        print(f"[Geocoder] Google Maps {status} for '{query}'{': ' + err if err else ''}")

    return None


def _tomtom(query: str) -> Optional[tuple[float, float]]:
    if not TOMTOM_API_KEY:
        return None
    encoded = urllib.parse.quote(f"{query}, India")
    url = f"https://api.tomtom.com/search/2/geocode/{encoded}.json"
    res = requests.get(url, params={"key": TOMTOM_API_KEY, "limit": 1}, timeout=6)
    res.raise_for_status()
    rows = res.json().get("results") or []
    if not rows:
        return None
    pos = rows[0]["position"]
    return float(pos["lat"]), float(pos["lon"])


def _ors(query: str) -> Optional[tuple[float, float]]:
    if not ORS_API_KEY:
        return None
    res = requests.get(
        "https://api.openrouteservice.org/geocode/search",
        params={"text": f"{query}, India", "size": 1},
        headers={"Authorization": ORS_API_KEY},
        timeout=8,
    )
    res.raise_for_status()
    feats = res.json().get("features") or []
    if not feats:
        return None
    lng, lat = feats[0]["geometry"]["coordinates"]
    return float(lat), float(lng)


def _nominatim(query: str) -> Optional[tuple[float, float]]:
    global _LAST_NOMINATIM_AT
    elapsed = time.monotonic() - _LAST_NOMINATIM_AT
    if elapsed < _NOMINATIM_MIN_INTERVAL_S:
        time.sleep(_NOMINATIM_MIN_INTERVAL_S - elapsed)
    _LAST_NOMINATIM_AT = time.monotonic()

    res = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"format": "jsonv2", "limit": 1, "q": f"{query}, India", "countrycodes": "in"},
        headers={"User-Agent": "LogiFlow-Geocoder/1.0"},
        timeout=8,
    )
    if res.status_code == 429:
        raise urllib.error.HTTPError("nominatim", 429, "Too many requests", None, None)
    res.raise_for_status()
    rows = res.json()
    if not rows:
        return None
    return float(rows[0]["lat"]), float(rows[0]["lon"])


def geocode_latlng(name: str, *, context=None) -> Optional[tuple[float, float]]:
    """Return (lat, lng) for a city/place name in India."""
    if not name or not str(name).strip():
        return None

    raw = str(name).strip()
    token = raw.upper()
    if re.fullmatch(r"[A-Z0-9]{2,5}", token):
        station_hit = _station_code_latlng(token)
        if station_hit:
            if context:
                context.set(f"geocode:{_normalize_key(name)}", station_hit)
            _COORD_CACHE[_normalize_key(name)] = station_hit
            return station_hit

    cache_key = f"geocode:{_normalize_key(name)}"
    if context and context.has(cache_key):
        hit = context.get(cache_key)
        return hit if hit else None

    mem_key = _normalize_key(name)
    if mem_key in _COORD_CACHE:
        hit = _COORD_CACHE[mem_key]
        if context:
            context.set(cache_key, hit)
        return hit

    queries = [name.strip()]
    if "," in name:
        queries.append(name.split(",")[0].strip())

    hit: Optional[tuple[float, float]] = None
    provider: Optional[str] = None

    # Offline first — no API keys, no scraping.
    for q in queries:
        hit = _rail_station_lookup(q)
        if hit:
            provider = "rail_station"
            break

    if not hit:
        for q in queries:
            hit = _static_lookup(q)
            if hit:
                provider = "static"
                break

    if not hit:
        api_providers: list[tuple[str, object]] = []
        if GOOGLE_MAPS_API_KEY:
            api_providers.append(("google_maps", google_geocode_latlng))
        if TOMTOM_API_KEY:
            api_providers.append(("tomtom", _tomtom))
        if ORS_API_KEY:
            api_providers.append(("ors", _ors))
        api_providers.append(("nominatim", _nominatim))

        for q in queries:
            for pname, fn in api_providers:
                try:
                    hit = fn(q)
                    if hit:
                        provider = pname
                        break
                except urllib.error.HTTPError as exc:
                    if exc.code == 429:
                        print(f"[Geocoder] {pname} rate-limited for {q}")
                    continue
                except Exception as exc:
                    print(f"[Geocoder] {pname} failed for {q}: {exc}")
                    continue
            if hit:
                break

    _COORD_CACHE[mem_key] = hit
    if context:
        context.set(cache_key, hit)
    if hit and provider:
        print(f"[Geocoder] {provider} → {name} ({hit[0]:.4f}, {hit[1]:.4f})")
    elif not hit:
        print(f"[Geocoder] no coords for {name}")
    return hit


def geocode_city_dict(name: str) -> Optional[dict]:
    """Return {name, lat, lng} for air pipeline compatibility."""
    hit = geocode_latlng(name)
    if not hit:
        return None
    lat, lng = hit
    return {"name": name, "lat": lat, "lng": lng}
