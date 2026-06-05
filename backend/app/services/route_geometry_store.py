"""Persist train corridor geometry and station coordinates in Supabase."""

from __future__ import annotations

from typing import Any

from app.services import supabase_client as sb

_GEOMETRY_TABLE = "train_route_geometry"
_STATION_TABLE = "station_coordinates"


def get_cached_geometry(train_number: str, from_code: str, to_code: str) -> dict[str, Any] | None:
    rows = sb.rest_get(
        _GEOMETRY_TABLE,
        {
            "select": "train_number,from_code,to_code,stops,geometry,source,point_count",
            "train_number": f"eq.{train_number}",
            "from_code": f"eq.{from_code.upper()}",
            "to_code": f"eq.{to_code.upper()}",
            "limit": "1",
        },
    )
    return rows[0] if rows else None


def save_geometry(
    train_number: str,
    from_code: str,
    to_code: str,
    *,
    stops: list[dict[str, Any]],
    geometry: list[list[float]],
    source: str,
) -> None:
    sb.rest_upsert(
        _GEOMETRY_TABLE,
        {
            "train_number": str(train_number),
            "from_code": from_code.upper(),
            "to_code": to_code.upper(),
            "stops": stops,
            "geometry": geometry,
            "source": source,
            "point_count": len(geometry),
        },
        on_conflict="train_number,from_code,to_code",
    )


def get_station_coord(station_code: str) -> dict[str, Any] | None:
    rows = sb.rest_get(
        _STATION_TABLE,
        {
            "select": "station_code,station_name,city,lat,lng",
            "station_code": f"eq.{station_code.upper()}",
            "limit": "1",
        },
    )
    return rows[0] if rows else None


def save_station_coord(
    station_code: str,
    *,
    station_name: str,
    city: str,
    lat: float,
    lng: float,
    source: str = "computed",
) -> None:
    sb.rest_upsert(
        _STATION_TABLE,
        {
            "station_code": station_code.upper(),
            "station_name": station_name,
            "city": city,
            "lat": lat,
            "lng": lng,
            "source": source,
        },
        on_conflict="station_code",
    )
