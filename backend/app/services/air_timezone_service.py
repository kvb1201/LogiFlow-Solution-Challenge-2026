"""Timezone-aware scheduling for international air routes."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "Asia/Kolkata"


def resolve_timezone(airport: dict[str, Any] | None) -> str:
    if not airport:
        return DEFAULT_TIMEZONE
    tz = (airport.get("timezone") or "").strip()
    if tz:
        return tz
    return DEFAULT_TIMEZONE


def _to_zone(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_TIMEZONE)


def parse_departure_utc(
    departure_time: datetime | str | None,
    source_airport: dict[str, Any] | None,
    default_hour: int = 8,
) -> datetime:
    """
    Parse departure time in the source airport's local timezone, return UTC.
    Date-only strings default to default_hour local at the departure airport.
    """
    tz_name = resolve_timezone(source_airport)
    local_tz = _to_zone(tz_name)

    if isinstance(departure_time, datetime):
        if departure_time.tzinfo is None:
            local_dt = departure_time.replace(tzinfo=local_tz)
        else:
            local_dt = departure_time.astimezone(local_tz)
        return local_dt.astimezone(timezone.utc)

    raw = str(departure_time or "").strip()
    if not raw:
        now_local = datetime.now(local_tz).replace(
            hour=default_hour, minute=0, second=0, microsecond=0
        )
        return now_local.astimezone(timezone.utc)

    parsed: datetime | None = None
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%Y/%m/%d",
    ):
        try:
            chunk = raw[:19] if "T" in raw else raw[:10]
            parsed = datetime.strptime(chunk, fmt)
            if fmt in {"%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d"}:
                parsed = parsed.replace(hour=default_hour, minute=0, second=0, microsecond=0)
            break
        except ValueError:
            continue

    if parsed is None:
        now_local = datetime.now(local_tz).replace(
            hour=default_hour, minute=0, second=0, microsecond=0
        )
        return now_local.astimezone(timezone.utc)

    local_dt = parsed.replace(tzinfo=local_tz)
    return local_dt.astimezone(timezone.utc)


def build_route_schedule(
    departure_time: datetime | str | None,
    duration_hours: float,
    source_airport: dict[str, Any] | None,
    destination_airport: dict[str, Any] | None,
) -> dict[str, str]:
    """Compute UTC and local departure/arrival timestamps for a route."""
    departure_utc = parse_departure_utc(departure_time, source_airport)
    arrival_utc = departure_utc + timedelta(hours=float(duration_hours or 0))

    source_tz = _to_zone(resolve_timezone(source_airport))
    dest_tz = _to_zone(resolve_timezone(destination_airport))

    departure_local = departure_utc.astimezone(source_tz)
    arrival_local = arrival_utc.astimezone(dest_tz)

    fmt = "%Y-%m-%dT%H:%M:%S%z"
    return {
        "departure_utc": departure_utc.strftime(fmt),
        "arrival_utc": arrival_utc.strftime(fmt),
        "departure_local": departure_local.strftime(fmt),
        "arrival_local": arrival_local.strftime(fmt),
        "departure_timezone": str(source_tz),
        "arrival_timezone": str(dest_tz),
    }
