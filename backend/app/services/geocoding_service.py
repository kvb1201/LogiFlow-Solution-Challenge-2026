import time
from typing import Dict, Optional

import requests

_GEOCODE_CACHE: Dict[str, dict] = {}


def _cache_get(key: str) -> Optional[dict]:
    item = _GEOCODE_CACHE.get(key)
    if not item:
        return None
    if item["expires_at"] < time.time():
        _GEOCODE_CACHE.pop(key, None)
        return None
    return item["value"]


def _cache_set(key: str, value: dict, ttl_seconds: int = 24 * 3600) -> dict:
    _GEOCODE_CACHE[key] = {
        "value": value,
        "expires_at": time.time() + ttl_seconds,
    }
    return value


def geocode_city(city: str) -> Optional[dict]:
    key = city.strip().lower()
    cached = _cache_get(key)
    if cached:
        return cached

    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "format": "jsonv2",
                "limit": 1,
                "q": city,
                "countrycodes": "in",
            },
            headers={"User-Agent": "LogiFlow-Air-Pipeline/1.0"},
            timeout=8,
        )
        response.raise_for_status()
        rows = response.json()
        if rows:
            row = rows[0]
            return _cache_set(
                key,
                {
                    "name": city,
                    "lat": float(row["lat"]),
                    "lng": float(row["lon"]),
                },
            )
    except Exception as exc:
        print(f"[GeocodingService] Nominatim lookup failed for {city}: {exc}")
    return None
