"""City coordinates — delegates to unified geocoder (static table + APIs)."""
from __future__ import annotations

from app.services.geocoder import geocode_latlng

# Legacy alias used by water pipeline midpoint logic.
INDIA_CENTER_PLACEHOLDER = (20.5937, 78.9629)

midpoint_name_cache: dict[str, str] = {}


def is_placeholder_coord(lat: float, lng: float) -> bool:
    return (
        abs(lat - INDIA_CENTER_PLACEHOLDER[0]) < 0.01
        and abs(lng - INDIA_CENTER_PLACEHOLDER[1]) < 0.01
    )


def get_coords(name, context=None):
    """
    Return (lat, lng) for a location name, or None when unknown.
    """
    if not name:
        return None
    if str(name).lower() in {"midpoint", "port", "express hub", "central depot"}:
        return None
    return geocode_latlng(str(name), context=context)


def get_dynamic_midpoint(source: str, destination: str):
    """Geographical midpoint between two cities (for water/road fallbacks)."""
    key = f"{source}-{destination}"
    if key in midpoint_name_cache:
        return midpoint_name_cache[key]

    s = get_coords(source)
    d = get_coords(destination)
    if not s or not d:
        return "Central Hub"

    s_lat, s_lon = s
    d_lat, d_lon = d
    mid_lat = (s_lat + d_lat) / 2
    mid_lon = (s_lon + d_lon) / 2

    try:
        import json
        import urllib.parse
        import urllib.request

        url = (
            "https://nominatim.openstreetmap.org/reverse?"
            f"format=json&lat={mid_lat}&lon={mid_lon}&zoom=10"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "LogiFlow-AI-Agent"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
            address = data.get("address", {})
            city_name = (
                address.get("city")
                or address.get("town")
                or address.get("county")
                or address.get("state")
                or "Intermediate Hub"
            )
            midpoint_name_cache[key] = city_name
            return city_name
    except Exception as e:
        print(f"Reverse geocode failed for midpoint of {source}-{destination}: {e}")

    return "Central Hub"
