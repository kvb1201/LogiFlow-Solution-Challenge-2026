"""Air pipeline geocoding — delegates to unified geocoder."""
from __future__ import annotations

from typing import Optional

from app.services.geocoder import geocode_city_dict


def geocode_city(city: str) -> Optional[dict]:
    return geocode_city_dict(city)
