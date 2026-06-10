"""
Marine Weather Service — Phase 2.

Provides real wave, wind, and ocean conditions for port coordinates
using Open-Meteo's Marine API and Forecast API.

Replaces the calendar-based monsoon hack in engineer.py with:
  - Marine API: wave_height, wave_period, ocean_current_velocity (7-day forecast)
  - Forecast API: wind_speed, wind_gusts, precipitation, storm_flag (up to 16 days)

Both APIs are free, no auth required, and use cell_selection=sea for port coords.
Responses are cached 1 hour (marine conditions change slowly).

API docs: backend/app/pipelines/water/OPENMETEO_API_REFERENCE.md
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

import requests

log = logging.getLogger(__name__)

# ── Cache (simple in-process dict, TTL 1 hour) ────────────────────────────────
_cache: dict[str, tuple[datetime, object]] = {}
_CACHE_TTL_SECONDS = 3600


def _cache_get(key: str) -> object | None:
    if key in _cache:
        ts, val = _cache[key]
        if (datetime.utcnow() - ts).total_seconds() < _CACHE_TTL_SECONDS:
            return val
        del _cache[key]
    return None


def _cache_set(key: str, val: object) -> None:
    _cache[key] = (datetime.utcnow(), val)


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class MarineConditions:
    """Wave and ocean conditions at a port location."""
    lat: float
    lon: float
    # 7-day max/mean aggregates (worst-case for route risk)
    wave_height_max_m: float        # significant wave height peak
    wave_height_mean_m: float       # average over forecast window
    wave_period_max_s: float        # wave period peak (seconds)
    ocean_current_velocity_max: float  # km/h
    sea_surface_temp_c: float       # °C
    # Derived risk score 0.0–1.0
    sea_risk: float
    # Source flag
    source: str = "open-meteo-marine"
    error: Optional[str] = None


@dataclass
class WindConditions:
    """Wind and precipitation conditions for a departure date window."""
    lat: float
    lon: float
    departure_date: str             # ISO yyyy-mm-dd
    wind_speed_mean_kn: float       # mean wind speed in knots
    wind_gusts_max_kn: float        # peak gusts in knots
    precipitation_mm: float         # total precipitation mm
    storm_flag: bool                # True if any thunderstorm WMO code in window
    pressure_msl_hpa: float         # mean sea-level pressure
    # Derived risk score 0.0–1.0
    wind_risk: float
    source: str = "open-meteo-forecast"
    error: Optional[str] = None


# ── Fallbacks (used when API is unavailable) ──────────────────────────────────

def _month_from_iso_date(value: str | None) -> int:
    if not value:
        return date.today().month
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).month
    except ValueError:
        return date.today().month


def _marine_fallback(lat: float, lon: float, reason: str, departure_date: str | None = None) -> MarineConditions:
    """
    Calendar-based fallback — exactly what we're replacing, kept as safety net.
    Returns a moderate risk for any location rather than crashing.
    """
    month = _month_from_iso_date(departure_date)
    # Monsoon season risk heuristic by region
    if 6 <= month <= 9:
        wave_h = 2.0   # moderate
    elif month in {11, 12, 1, 2} and lon < 30:   # north Atlantic winter
        wave_h = 2.5
    else:
        wave_h = 1.0   # calm

    return MarineConditions(
        lat=lat, lon=lon,
        wave_height_max_m=wave_h,
        wave_height_mean_m=wave_h * 0.65,
        wave_period_max_s=8.0,
        ocean_current_velocity_max=5.0,
        sea_surface_temp_c=28.0,
        sea_risk=_wave_to_risk(wave_h),
        source="fallback-calendar",
        error=reason,
    )


def _wind_fallback(lat: float, lon: float, departure_date: str, reason: str) -> WindConditions:
    month = _month_from_iso_date(departure_date)
    wind_kn = 18.0 if 6 <= month <= 9 else 12.0
    return WindConditions(
        lat=lat, lon=lon,
        departure_date=departure_date,
        wind_speed_mean_kn=wind_kn,
        wind_gusts_max_kn=wind_kn * 1.5,
        precipitation_mm=5.0 if 6 <= month <= 9 else 1.0,
        storm_flag=False,
        pressure_msl_hpa=1013.0,
        wind_risk=_wind_to_risk(wind_kn, False),
        source="fallback-calendar",
        error=reason,
    )


# ── Risk conversion ───────────────────────────────────────────────────────────

def _wave_to_risk(wave_height_m: float) -> float:
    """
    Beaufort-scale-aligned wave height → risk score.
    < 1.0 m  → calm (0.10)
    1.0–2.5m → moderate (0.30)
    2.5–4.0m → rough (0.60)
    > 4.0 m  → very rough / storm (0.90)
    """
    if wave_height_m < 0.5:  return 0.05
    if wave_height_m < 1.0:  return 0.10
    if wave_height_m < 1.5:  return 0.20
    if wave_height_m < 2.5:  return 0.35
    if wave_height_m < 4.0:  return 0.60
    if wave_height_m < 6.0:  return 0.80
    return 0.95


def _wind_to_risk(wind_knots: float, storm_flag: bool) -> float:
    """
    Wind speed (knots) + storm flag → risk score.
    Beaufort 12 = 64 kn = max risk.
    """
    base = min(wind_knots / 64.0, 1.0)
    return min(1.0, base + (0.25 if storm_flag else 0.0))


# ── WMO storm codes ───────────────────────────────────────────────────────────
_STORM_CODES = {95, 96, 99}   # thunderstorm (slight, moderate, hail)
_SEVERE_CODES = {65, 67, 75, 82, 86}  # heavy rain, freezing rain, heavy snow


# ── Marine API ────────────────────────────────────────────────────────────────

def get_port_marine_conditions(lat: float, lon: float) -> MarineConditions:
    """
    Fetch 7-day marine weather for a port coordinate.
    Returns wave height, period, ocean current, SST.
    Cached 1 hour.
    """
    cache_key = f"marine:{lat:.3f}:{lon:.3f}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore

    url = "https://marine-api.open-meteo.com/v1/marine"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join([
            "wave_height",
            "wind_wave_height",
            "swell_wave_height",
            "wave_period",
            "ocean_current_velocity",
            "sea_surface_temperature",
        ]),
        "forecast_days": 7,
        "cell_selection": "sea",
        "timeformat": "unixtime",
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        hourly = data.get("hourly", {})
        wave_h    = [v for v in (hourly.get("wave_height") or []) if v is not None]
        wave_p    = [v for v in (hourly.get("wave_period") or []) if v is not None]
        curr_v    = [v for v in (hourly.get("ocean_current_velocity") or []) if v is not None]
        sst       = [v for v in (hourly.get("sea_surface_temperature") or []) if v is not None]

        if not wave_h:
            result = _marine_fallback(lat, lon, "empty API response")
            _cache_set(cache_key, result)
            return result

        h_max  = max(wave_h)
        h_mean = sum(wave_h) / len(wave_h)
        p_max  = max(wave_p) if wave_p else 8.0
        c_max  = max(curr_v) if curr_v else 0.0
        sst_v  = sum(sst) / len(sst) if sst else 28.0

        result = MarineConditions(
            lat=lat, lon=lon,
            wave_height_max_m=round(h_max, 2),
            wave_height_mean_m=round(h_mean, 2),
            wave_period_max_s=round(p_max, 1),
            ocean_current_velocity_max=round(c_max, 1),
            sea_surface_temp_c=round(sst_v, 1),
            sea_risk=round(_wave_to_risk(h_max), 3),
            source="open-meteo-marine",
        )
        _cache_set(cache_key, result)
        log.debug("[marine] lat=%.2f lon=%.2f wave_max=%.1fm risk=%.2f",
                  lat, lon, h_max, result.sea_risk)
        return result

    except requests.exceptions.Timeout:
        log.warning("[marine] Timeout for lat=%.2f lon=%.2f — using fallback", lat, lon)
        result = _marine_fallback(lat, lon, "API timeout")
        _cache_set(cache_key, result)
        return result

    except Exception as exc:
        log.warning("[marine] Error for lat=%.2f lon=%.2f: %s — using fallback", lat, lon, exc)
        result = _marine_fallback(lat, lon, str(exc))
        _cache_set(cache_key, result)
        return result


# ── Forecast API ──────────────────────────────────────────────────────────────

def get_departure_wind_conditions(
    lat: float,
    lon: float,
    departure_date: str | None = None,
) -> WindConditions:
    """
    Fetch wind + precipitation forecast for a departure date window (±2 days).
    Returns wind speed (knots), gusts, precipitation, storm flag, pressure.

    departure_date: ISO yyyy-mm-dd, defaults to today.
    If departure is > 16 days ahead (beyond forecast horizon), returns fallback.
    Cached 1 hour.
    """
    dep_str = departure_date or date.today().isoformat()
    cache_key = f"wind:{lat:.3f}:{lon:.3f}:{dep_str}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore

    try:
        dep_dt = datetime.fromisoformat(dep_str.replace("Z", "+00:00")).date()
    except ValueError:
        dep_dt = date.today()

    today = date.today()
    days_ahead = (dep_dt - today).days

    # Forecast API only covers 16 days ahead
    if days_ahead > 16 or days_ahead < -92:
        result = _wind_fallback(lat, lon, dep_str, "outside forecast window")
        _cache_set(cache_key, result)
        return result

    # Window: departure day ±2 days, clamped to forecast range
    window_start = max(today, dep_dt - timedelta(days=1))
    window_end   = min(today + timedelta(days=16), dep_dt + timedelta(days=2))

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join([
            "wind_speed_10m",
            "wind_gusts_10m",
            "wind_direction_10m",
            "precipitation",
            "precipitation_probability",
            "weather_code",
            "pressure_msl",
        ]),
        "start_date": window_start.isoformat(),
        "end_date":   window_end.isoformat(),
        "wind_speed_unit": "kn",   # knots for maritime use
        "cell_selection": "sea",
        "timeformat": "unixtime",
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        hourly = data.get("hourly", {})
        wind_s  = [v for v in (hourly.get("wind_speed_10m") or []) if v is not None]
        wind_g  = [v for v in (hourly.get("wind_gusts_10m") or []) if v is not None]
        precip  = [v for v in (hourly.get("precipitation") or []) if v is not None]
        w_code  = [v for v in (hourly.get("weather_code") or []) if v is not None]
        press   = [v for v in (hourly.get("pressure_msl") or []) if v is not None]

        if not wind_s:
            result = _wind_fallback(lat, lon, dep_str, "empty forecast response")
            _cache_set(cache_key, result)
            return result

        wind_mean  = sum(wind_s) / len(wind_s)
        gust_max   = max(wind_g) if wind_g else wind_mean * 1.4
        precip_tot = sum(precip) if precip else 0.0
        press_mean = sum(press) / len(press) if press else 1013.0
        storm_flag = any(int(c) in _STORM_CODES or int(c) in _SEVERE_CODES for c in w_code)

        result = WindConditions(
            lat=lat, lon=lon,
            departure_date=dep_str,
            wind_speed_mean_kn=round(wind_mean, 1),
            wind_gusts_max_kn=round(gust_max, 1),
            precipitation_mm=round(precip_tot, 1),
            storm_flag=storm_flag,
            pressure_msl_hpa=round(press_mean, 1),
            wind_risk=round(_wind_to_risk(gust_max, storm_flag), 3),
            source="open-meteo-forecast",
        )
        _cache_set(cache_key, result)
        log.debug("[forecast] lat=%.2f lon=%.2f wind_mean=%.1fkn gusts=%.1fkn storm=%s",
                  lat, lon, wind_mean, gust_max, storm_flag)
        return result

    except requests.exceptions.Timeout:
        log.warning("[forecast] Timeout for lat=%.2f lon=%.2f — using fallback", lat, lon)
        result = _wind_fallback(lat, lon, dep_str, "API timeout")
        _cache_set(cache_key, result)
        return result

    except Exception as exc:
        log.warning("[forecast] Error for lat=%.2f lon=%.2f: %s — using fallback", lat, lon, exc)
        result = _wind_fallback(lat, lon, dep_str, str(exc))
        _cache_set(cache_key, result)
        return result


# ── Combined helper ───────────────────────────────────────────────────────────

def get_route_weather_risk(
    port_lats_lons: list[tuple[float, float]],
    departure_date: str | None = None,
) -> dict:
    """
    Aggregate weather risk across all ports on a route.
    Returns a combined dict with worst-case values and an overall risk score.

    Called by engineer.py once per route path.
    """
    if not port_lats_lons:
        return {
            "sea_risk": 0.15,
            "wind_risk": 0.10,
            "wave_height_max_m": 1.0,
            "wind_speed_mean_kn": 10.0,
            "storm_flag": False,
            "source": "no-ports",
        }

    marine_results = [get_port_marine_conditions(lat, lon) for lat, lon in port_lats_lons]
    wind_results   = [get_departure_wind_conditions(lat, lon, departure_date) for lat, lon in port_lats_lons]

    worst_sea  = max(r.sea_risk for r in marine_results)
    worst_wind = max(r.wind_risk for r in wind_results)
    any_storm  = any(r.storm_flag for r in wind_results)
    max_wave   = max(r.wave_height_max_m for r in marine_results)
    mean_wind  = sum(r.wind_speed_mean_kn for r in wind_results) / len(wind_results)

    # Ocean current adds a small additional risk
    max_current = max(r.ocean_current_velocity_max for r in marine_results)
    current_bonus = min(0.10, max_current / 30.0)   # 30 km/h current → +0.10

    combined_weather_risk = min(1.0, worst_sea * 0.65 + worst_wind * 0.35 + current_bonus)

    return {
        "sea_risk": round(worst_sea, 3),
        "wind_risk": round(worst_wind, 3),
        "combined_weather_risk": round(combined_weather_risk, 3),
        "wave_height_max_m": round(max_wave, 2),
        "wind_speed_mean_kn": round(mean_wind, 1),
        "storm_flag": any_storm,
        "ocean_current_max_kmh": round(max_current, 1),
        "source": "open-meteo" if not any(r.error for r in marine_results) else "mixed",
    }
