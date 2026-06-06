"""
OTP Congestion Scoring — baseline lookup + operational penalties.

Uses checked-in otp-baselines.json and weather payloads from the existing
OpenWeather integration (weather_service / air_weather_service).
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

DEFAULT_BASELINES_PATH = Path(__file__).resolve().parents[2] / "data" / "otp-baselines.json"
BASELINES_PATH = os.getenv("OTP_BASELINES_PATH", str(DEFAULT_BASELINES_PATH))

WEATHER_PENALTIES: dict[str, float] = {
    "clear": 0.0,
    "clouds": 0.02,
    "rain": 0.05,
    "drizzle": 0.04,
    "thunderstorm": 0.12,
    "fog": 0.10,
    "mist": 0.10,
    "haze": 0.10,
}

MORNING_PEAK_START = 7
MORNING_PEAK_END = 10
EVENING_PEAK_START = 17
EVENING_PEAK_END = 21
PEAK_HOUR_PENALTY = 0.03
WEEKEND_PENALTY = 0.01


def weather_penalty_from_api_response(weather_data: dict[str, Any] | None) -> float:
    """
    Map OpenWeather-style response fields to an OTP penalty.

    Expected shape (from weather_service.get_weather):
      { "temp": float, "rain": float, "condition": "Clear"|"Rain"|... }
    """
    if not weather_data:
        return WEATHER_PENALTIES["clear"]

    condition = str(weather_data.get("condition", "Clear")).strip().lower()
    if condition in WEATHER_PENALTIES:
        return WEATHER_PENALTIES[condition]

    # OpenWeather variants / grouped conditions
    if "thunder" in condition:
        return WEATHER_PENALTIES["thunderstorm"]
    if "drizzle" in condition:
        return WEATHER_PENALTIES["drizzle"]
    if "rain" in condition:
        return WEATHER_PENALTIES["rain"]
    if condition in {"fog", "mist", "haze", "smoke", "dust"}:
        return WEATHER_PENALTIES["fog"]
    if "cloud" in condition:
        return WEATHER_PENALTIES["clouds"]

    return WEATHER_PENALTIES["clear"]


def parse_departure_time(departure_time: datetime | str | None, default_hour: int = 8) -> datetime:
    """Parse ISO date/datetime strings; default to 08:00 when only a date is given."""
    if isinstance(departure_time, datetime):
        return departure_time

    raw = str(departure_time or "").strip()
    if not raw:
        return datetime.now().replace(hour=default_hour, minute=0, second=0, microsecond=0)

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
            parsed = datetime.strptime(raw[:19] if "T" in raw else raw[:10], fmt)
            if fmt in {"%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d"}:
                return parsed.replace(hour=default_hour, minute=0, second=0, microsecond=0)
            return parsed
        except ValueError:
            continue

    return datetime.now().replace(hour=default_hour, minute=0, second=0, microsecond=0)


def peak_hour_penalty(departure_time: datetime) -> float:
    hour = departure_time.hour
    morning = MORNING_PEAK_START <= hour <= MORNING_PEAK_END
    evening = EVENING_PEAK_START <= hour <= EVENING_PEAK_END
    return PEAK_HOUR_PENALTY if morning or evening else 0.0


def weekend_penalty(departure_time: datetime) -> float:
    # Monday=0 ... Sunday=6
    return WEEKEND_PENALTY if departure_time.weekday() >= 5 else 0.0


def inbound_delay_penalty(inbound_delay_minutes: float | int | None) -> float:
    if not inbound_delay_minutes:
        return 0.0
    return min(float(inbound_delay_minutes) / 100.0, 0.10)


def categorize_congestion(congestion_score: int) -> str:
    if congestion_score <= 20:
        return "Low"
    if congestion_score <= 40:
        return "Medium"
    if congestion_score <= 60:
        return "High"
    return "Critical"


@lru_cache(maxsize=1)
def _load_baselines() -> dict[str, Any]:
    path = BASELINES_PATH
    if not path or not os.path.exists(path):
        return {"globalDefaultOTP": 0.76, "airports": {}}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:
        print(f"[OTPScoringService] Failed to load baselines: {exc}")
        return {"globalDefaultOTP": 0.76, "airports": {}}


class OTPScoringService:
    """Compute adjusted OTP and congestion metrics for a departure airport."""

    def lookup_baseline_otp(
        self,
        departure_airport: str,
        departure_time: datetime | str | None,
    ) -> tuple[float, str]:
        """
        Lookup order:
          1. Airport month OTP (byMonth)
          2. Airport default OTP
          3. Global default OTP
        """
        code = (departure_airport or "").strip().upper()
        baselines = _load_baselines()
        global_default = float(baselines.get("globalDefaultOTP", 0.76))
        if not code:
            return global_default, "global_default"

        airport_entry = (baselines.get("airports") or {}).get(code) or {}
        airport_default = float(airport_entry.get("defaultOTP", global_default))

        dt = parse_departure_time(departure_time)
        month_key = str(dt.month)
        by_month = airport_entry.get("byMonth") or {}
        if month_key in by_month:
            return float(by_month[month_key]), "airport_month"

        if code in (baselines.get("airports") or {}):
            return airport_default, "airport_default"

        return global_default, "global_default"

    def score(
        self,
        departure_airport: str,
        departure_time: datetime | str | None,
        weather_data: dict[str, Any] | None,
        inbound_delay_minutes: float | int | None = 0,
    ) -> dict[str, Any]:
        baseline_otp, baseline_source = self.lookup_baseline_otp(departure_airport, departure_time)
        dt = parse_departure_time(departure_time)

        weather_pen = weather_penalty_from_api_response(weather_data)
        peak_pen = peak_hour_penalty(dt)
        weekend_pen = weekend_penalty(dt)
        inbound_pen = inbound_delay_penalty(inbound_delay_minutes)

        adjusted_otp = baseline_otp - weather_pen - peak_pen - weekend_pen - inbound_pen
        adjusted_otp = round(max(0.0, min(adjusted_otp, 1.0)), 3)

        congestion_score = round((1 - adjusted_otp) * 100)
        congestion_level = categorize_congestion(congestion_score)

        factors = {
            "baselineSource": baseline_source,
            "weatherPenalty": round(weather_pen, 3),
            "peakHourPenalty": round(peak_pen, 3),
            "weekendPenalty": round(weekend_pen, 3),
            "inboundDelayPenalty": round(inbound_pen, 3),
            "departureHour": dt.hour,
            "departureWeekday": dt.strftime("%A"),
            "weatherCondition": (weather_data or {}).get("condition", "Clear"),
        }

        return {
            "baselineOTP": round(baseline_otp, 3),
            "adjustedOTP": adjusted_otp,
            "congestionScore": congestion_score,
            "congestionLevel": congestion_level,
            "factors": factors,
        }


_default_service: OTPScoringService | None = None


def get_otp_scoring_service() -> OTPScoringService:
    global _default_service
    if _default_service is None:
        _default_service = OTPScoringService()
    return _default_service
