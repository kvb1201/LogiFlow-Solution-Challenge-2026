"""Persist train corridor geometry and station coordinates in Supabase."""

from __future__ import annotations

from typing import Any

from app.services import supabase_client as sb

_GEOMETRY_TABLE = "train_route_geometry"
_STATION_TABLE = "station_coordinates"


def list_geometry_rows(*, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    """Fetch corridor geometry rows from Supabase (audit / map reads)."""
    if not sb.is_configured():
        return []
    return sb.rest_get(
        _GEOMETRY_TABLE,
        {
            "select": "train_number,from_code,to_code,stops,geometry,source,point_count",
            "order": "train_number.asc",
            "limit": str(max(1, limit)),
            "offset": str(max(0, offset)),
        },
        timeout_s=30,
    )


def count_geometry_rows() -> int:
    if not sb.is_configured():
        return 0
    return len(list_geometry_keys())


def list_geometry_keys() -> set[tuple[str, str, str]]:
    """All cached (train_number, from_code, to_code) keys in Supabase."""
    if not sb.is_configured():
        return set()
    keys: set[tuple[str, str, str]] = set()
    offset = 0
    page = 1000
    while True:
        rows = sb.rest_get(
            _GEOMETRY_TABLE,
            {
                "select": "train_number,from_code,to_code",
                "order": "train_number.asc",
                "limit": str(page),
                "offset": str(offset),
            },
            timeout_s=60,
        )
        if not rows:
            break
        for row in rows:
            keys.add(
                (
                    str(row.get("train_number") or "").strip(),
                    str(row.get("from_code") or "").strip().upper(),
                    str(row.get("to_code") or "").strip().upper(),
                )
            )
        if len(rows) < page:
            break
        offset += page
    return keys


def get_cached_geometry(train_number: str, from_code: str, to_code: str) -> dict[str, Any] | None:
    if not sb.is_configured():
        return None
    rows = sb.rest_get(
        _GEOMETRY_TABLE,
        {
            "select": "train_number,from_code,to_code,stops,geometry,source,point_count",
            "train_number": f"eq.{train_number}",
            "from_code": f"eq.{from_code.upper()}",
            "to_code": f"eq.{to_code.upper()}",
            "limit": "1",
        },
        timeout_s=20,
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
        timeout_s=20,
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
