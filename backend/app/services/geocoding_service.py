"""Air pipeline geocoding — delegates to unified geocoder."""
from __future__ import annotations

from typing import Optional

from app.services.geocoder import geocode_city_dict, geocode_city_global_dict


def geocode_city(city: str) -> Optional[dict]:
    return geocode_city_dict(city)


def geocode_city_global(city: str) -> Optional[dict]:
    """Global geocoding for international airport matching (no India-only restriction)."""
    return geocode_city_global_dict(city)
