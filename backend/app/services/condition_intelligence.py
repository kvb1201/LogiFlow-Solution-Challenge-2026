"""
Condition Intelligence V1 — deterministic condition scoring.

All scores are 0–100. No randomness — same inputs always produce the same output.

Phases:
  1. ConditionProfile dataclass
  2. Traffic intelligence (route length, city density, stop count, mode)
  3. Weather intelligence (route geography, mode, corridor characteristics)
  4. Route adherence (distance from route using current_location)
  5. ETA variance score
"""
from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Phase 1 — ConditionProfile
# ---------------------------------------------------------------------------

@dataclass
class ConditionProfile:
    """All condition scores 0–100. Higher = better / less impact."""
    traffic_score: float        # 0–100
    weather_score: float        # 0–100
    congestion_score: float     # 0–100
    route_adherence_score: float  # 0–100
    eta_variance_score: float   # 0–100

    # Derived delay estimates
    traffic_delay_minutes: int
    weather_delay_minutes: int

    # Human-readable explanations
    traffic_explanation: str
    weather_explanation: str
    congestion_explanation: str
    adherence_explanation: str
    eta_explanation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "traffic_score": round(self.traffic_score, 1),
            "weather_score": round(self.weather_score, 1),
            "congestion_score": round(self.congestion_score, 1),
            "route_adherence_score": round(self.route_adherence_score, 1),
            "eta_variance_score": round(self.eta_variance_score, 1),
            "traffic_delay_minutes": self.traffic_delay_minutes,
            "weather_delay_minutes": self.weather_delay_minutes,
            "explanations": {
                "traffic": self.traffic_explanation,
                "weather": self.weather_explanation,
                "congestion": self.congestion_explanation,
                "adherence": self.adherence_explanation,
                "eta": self.eta_explanation,
            },
        }


# ---------------------------------------------------------------------------
# Haversine helper (local copy to avoid circular imports)
# ---------------------------------------------------------------------------

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(max(0.0, a)))


# ---------------------------------------------------------------------------
# Phase 2 — Traffic Intelligence (deterministic)
#
# Traffic score is based on:
#   - route_km          → longer routes have more exposure to congestion
#   - stop_count        → each stop adds loading/unloading time
#   - mode              → road is most affected; air is least
#   - city_density_hash → deterministic proxy for urban density using
#                         the sum of latitude digits of source/destination
#                         (reproducible, never random)
# ---------------------------------------------------------------------------

_MODE_TRAFFIC_BASE: dict[str, float] = {
    "road":   0.25,   # 25% baseline congestion exposure
    "rail":   0.10,
    "air":    0.02,
    "water":  0.05,
    "hybrid": 0.20,
}

_MODE_TRAFFIC_PER_KM: dict[str, float] = {
    # additional congestion per 100km
    "road":   0.04,
    "rail":   0.015,
    "air":    0.005,
    "water":  0.01,
    "hybrid": 0.03,
}

_STOP_PENALTY_PCT: float = 0.04   # each stop adds 4% congestion exposure


def _city_density_factor(source: str, destination: str) -> float:
    """
    Deterministic 0–1 urban density proxy.

    Uses the sum of ordinal values of city name characters modulo a prime,
    normalised to [0, 1]. Same city pair always gives same result.
    """
    combined = (source + destination).lower()
    char_sum = sum(ord(c) for c in combined if c.isalpha())
    # Normalise into [0, 1] using modulo 97 (prime), then scale
    return (char_sum % 97) / 96.0


def build_traffic_condition(
    route_km: float,
    stop_count: int,
    mode: str,
    source: str,
    destination: str,
) -> tuple[float, float, int, str]:
    """
    Returns (traffic_score 0–100, congestion_score 0–100, delay_minutes, explanation).

    Deterministic — no randomness.
    """
    mode_key = (mode or "road").lower()
    base = _MODE_TRAFFIC_BASE.get(mode_key, 0.20)
    per_km = _MODE_TRAFFIC_PER_KM.get(mode_key, 0.03)

    # Route length contribution (capped at 1000 km worth)
    km_factor = min(route_km, 1000.0) / 100.0 * per_km

    # Stop penalty
    stop_factor = min(stop_count, 10) * _STOP_PENALTY_PCT

    # Urban density
    density = _city_density_factor(source, destination)
    density_factor = density * 0.15   # max 15% additional congestion

    total_congestion = min(1.0, base + km_factor + stop_factor + density_factor)

    # Convert congestion to scores (0 = worst, 100 = best)
    traffic_score = round(max(0.0, 100.0 * (1.0 - total_congestion)))
    congestion_score = round(max(0.0, 100.0 * (1.0 - total_congestion * 0.8)))

    # Delay estimate
    speed_kmh = {"road": 55, "rail": 80, "air": 700, "water": 25, "hybrid": 55}.get(mode_key, 55)
    baseline_minutes = (route_km / speed_kmh) * 60
    delay_minutes = int(round(baseline_minutes * total_congestion * 0.3))

    # Explanation
    if total_congestion < 0.15:
        level, desc = "Low", "Minimal traffic impact expected."
    elif total_congestion < 0.35:
        level, desc = "Moderate", "Moderate traffic on this corridor."
    elif total_congestion < 0.55:
        level, desc = "High", "Significant traffic impact expected."
    else:
        level, desc = "Severe", "Severe congestion likely on this corridor."

    if stop_count > 0:
        desc += f" {stop_count} stop{'s' if stop_count != 1 else ''} add loading time."

    explanation = f"{level} traffic. {desc} Est. delay: {delay_minutes}m."

    return traffic_score, congestion_score, delay_minutes, explanation


# ---------------------------------------------------------------------------
# Phase 3 — Weather Intelligence (deterministic)
#
# Weather score is based on:
#   - route geography (latitude of source/destination)
#   - mode susceptibility
#   - corridor characteristics (mountain/coastal indicators from city names)
# ---------------------------------------------------------------------------

_MODE_WEATHER_SUSCEPTIBILITY: dict[str, float] = {
    "road":   0.30,   # roads most affected by rain/fog
    "rail":   0.15,
    "air":    0.20,   # air affected by storms
    "water":  0.25,   # water affected by waves/storms
    "hybrid": 0.25,
}

# Keywords that indicate routes through weather-sensitive regions
_HIGH_WEATHER_KEYWORDS = frozenset({
    "shimla", "manali", "leh", "darjeeling", "ooty", "munnar",
    "coorg", "gangtok", "sikkim", "kullu", "mussorie", "nainital",
    "goa", "mangalore", "kochi", "visakhapatnam",  # coastal
})

_MONSOON_CITIES = frozenset({
    "mumbai", "pune", "goa", "mangalore", "kochi", "chennai",
    "kolkata", "hyderabad", "bengaluru", "bhubaneswar",
})


def _geography_weather_factor(source: str, destination: str) -> float:
    """
    Deterministic 0–1 weather severity proxy.

    Uses city names to detect mountain/coastal routes, then latitude
    of source as a seasonal proxy (mid-latitudes have more variability).
    """
    src_lower = source.lower()
    dst_lower = destination.lower()
    combined = src_lower + dst_lower

    # High-weather-impact route
    mountain_coastal = any(kw in combined for kw in _HIGH_WEATHER_KEYWORDS)
    monsoon_route = any(kw in combined for kw in _MONSOON_CITIES)

    # Deterministic latitude proxy using city name hash
    lat_hash = sum(ord(c) for c in src_lower if c.isalpha()) % 50
    lat_factor = lat_hash / 50.0  # 0–1

    base = 0.10
    if mountain_coastal:
        base += 0.30
    if monsoon_route:
        base += 0.15
    base += lat_factor * 0.10

    return min(1.0, base)


def build_weather_condition(
    route_km: float,
    mode: str,
    source: str,
    destination: str,
) -> tuple[float, int, str]:
    """
    Returns (weather_score 0–100, delay_minutes, explanation).

    Deterministic — no randomness.
    """
    mode_key = (mode or "road").lower()
    susceptibility = _MODE_WEATHER_SUSCEPTIBILITY.get(mode_key, 0.25)
    geo_factor = _geography_weather_factor(source, destination)

    weather_impact = susceptibility * geo_factor
    weather_score = round(max(0.0, 100.0 * (1.0 - weather_impact)))

    # Delay estimate: weather adds up to 20% of baseline travel time
    speed_kmh = {"road": 55, "rail": 80, "air": 700, "water": 25, "hybrid": 55}.get(mode_key, 55)
    baseline_min = (route_km / speed_kmh) * 60
    delay_minutes = int(round(baseline_min * weather_impact * 0.2))

    # Explanation
    src_lower = source.lower()
    dst_lower = destination.lower()
    combined = src_lower + dst_lower

    if weather_impact < 0.08:
        level, desc = "Favourable", "Weather conditions are favourable for this route."
    elif weather_impact < 0.18:
        level, desc = "Mild", "Minor weather impact expected."
    elif weather_impact < 0.30:
        level, desc = "Moderate", "Moderate weather risk on this corridor."
    else:
        level, desc = "High", "Elevated weather risk — check forecasts before departure."

    notes = []
    if any(kw in combined for kw in _HIGH_WEATHER_KEYWORDS):
        notes.append("Route passes through a weather-sensitive region.")
    if any(kw in combined for kw in _MONSOON_CITIES):
        notes.append("Coastal/monsoon corridor detected.")

    full_desc = f"{level} weather. {desc}"
    if notes:
        full_desc += " " + " ".join(notes)
    full_desc += f" Est. delay: {delay_minutes}m."

    return weather_score, delay_minutes, full_desc


# ---------------------------------------------------------------------------
# Phase 4 — Route Adherence Score (deterministic)
#
# Converts corridor_status into a 0–100 score with smooth penalisation.
# OFF_ROUTE: distance_from_route drives the penalty.
# ---------------------------------------------------------------------------

def build_adherence_score(
    corridor_status: str,
    deviation_km: Optional[float],
) -> tuple[float, str]:
    """
    Returns (adherence_score 0–100, explanation).

    ON_ROUTE  : 100
    NEAR_ROUTE: 70 − linear decay based on deviation_km
    OFF_ROUTE : 20 − heavier penalty, further decay with km
    """
    if corridor_status == "ON_ROUTE":
        return 100.0, "On route — no deviation detected."

    if corridor_status == "NEAR_ROUTE":
        base = 70.0
        if deviation_km and deviation_km > 0:
            # Linear decay: −1 pt per 2 km, floor at 40
            penalty = min(30.0, deviation_km / 2.0)
            score = max(40.0, base - penalty)
            return round(score, 1), f"Near route — {deviation_km:.0f} km from expected corridor."
        return base, "Near route — minor deviation."

    # OFF_ROUTE
    base = 20.0
    if deviation_km and deviation_km > 0:
        penalty = min(20.0, deviation_km / 10.0)
        score = max(0.0, base - penalty)
        return round(score, 1), f"Off route — {deviation_km:.0f} km deviation from corridor. Reoptimization recommended."
    return base, "Off route — significant deviation from planned corridor."


# ---------------------------------------------------------------------------
# Phase 5 — ETA Variance Score (deterministic)
# ---------------------------------------------------------------------------

def build_eta_variance_score(
    overdue_minutes: int,
    eta_gap_minutes: int,
) -> tuple[float, str]:
    """
    Returns (eta_variance_score 0–100, explanation).

    Both overdue_minutes and eta_gap_minutes contribute.
    Perfect: 100. Each minute of gap reduces the score.
    """
    total_gap = max(0, overdue_minutes) + max(0, eta_gap_minutes)

    if total_gap == 0:
        return 100.0, "On schedule — no ETA variance."

    # Score decays: −1 pt per 2 minutes of total gap, floor at 0
    score = max(0.0, 100.0 - total_gap / 2.0)

    if overdue_minutes > 0 and eta_gap_minutes > 0:
        desc = f"Overdue by {overdue_minutes}m and projected {eta_gap_minutes}m behind schedule."
    elif overdue_minutes > 0:
        desc = f"Currently {overdue_minutes}m overdue."
    else:
        desc = f"Projected {eta_gap_minutes}m behind original schedule."

    if score >= 70:
        level = "Minor variance."
    elif score >= 40:
        level = "Moderate delay."
    else:
        level = "Significant delay."

    return round(score, 1), f"{level} {desc}"


# ---------------------------------------------------------------------------
# Phase 1 — build_condition_profile (orchestrator)
# ---------------------------------------------------------------------------

def build_condition_profile(
    corridor_status: str,
    deviation_km: Optional[float],
    overdue_minutes: int,
    eta_gap_minutes: int,
    route_km: float,
    stop_count: int,
    mode: str,
    source: str,
    destination: str,
) -> ConditionProfile:
    """
    Build a complete ConditionProfile from deterministic inputs.

    No randomness — same inputs always produce the same profile.
    """
    traffic_score, congestion_score, traffic_delay, traffic_exp = build_traffic_condition(
        route_km=route_km,
        stop_count=stop_count,
        mode=mode,
        source=source,
        destination=destination,
    )
    weather_score, weather_delay, weather_exp = build_weather_condition(
        route_km=route_km,
        mode=mode,
        source=source,
        destination=destination,
    )
    adherence_score, adherence_exp = build_adherence_score(
        corridor_status=corridor_status,
        deviation_km=deviation_km,
    )
    eta_score, eta_exp = build_eta_variance_score(
        overdue_minutes=overdue_minutes,
        eta_gap_minutes=eta_gap_minutes,
    )

    return ConditionProfile(
        traffic_score=traffic_score,
        weather_score=weather_score,
        congestion_score=congestion_score,
        route_adherence_score=adherence_score,
        eta_variance_score=eta_score,
        traffic_delay_minutes=traffic_delay,
        weather_delay_minutes=weather_delay,
        traffic_explanation=traffic_exp,
        weather_explanation=weather_exp,
        congestion_explanation=f"Congestion index: {round(100 - congestion_score)}%. {traffic_exp}",
        adherence_explanation=adherence_exp,
        eta_explanation=eta_exp,
    )


# ---------------------------------------------------------------------------
# Health breakdown — maps component scores to point deltas
# ---------------------------------------------------------------------------

def build_health_breakdown(
    adherence_pts: float,
    eta_pts: float,
    traffic_pts: float,
    weather_pts: float,
    risk_pts: float,
    condition_profile: ConditionProfile,
) -> dict[str, Any]:
    """
    Phase 5 — explainable breakdown.

    Returns a dict showing:
      - how many points each factor contributes (positive = helps, negative = hurts)
      - human-readable "why" for each factor
    """
    # Maximum possible points per factor
    MAX = {"adherence": 40.0, "eta": 25.0, "traffic": 5.0, "weather": 5.0, "risk": 25.0}

    def _delta(actual: float, maximum: float) -> int:
        """How far below max this factor is (negative = penalty, 0 = perfect)."""
        return int(round(actual - maximum))

    breakdown = {
        "adherence": {
            "points": round(adherence_pts, 1),
            "max": MAX["adherence"],
            "delta": _delta(adherence_pts, MAX["adherence"]),
            "why": condition_profile.adherence_explanation,
        },
        "eta": {
            "points": round(eta_pts, 1),
            "max": MAX["eta"],
            "delta": _delta(eta_pts, MAX["eta"]),
            "why": condition_profile.eta_explanation,
        },
        "traffic": {
            "points": round(traffic_pts, 1),
            "max": MAX["traffic"],
            "delta": _delta(traffic_pts, MAX["traffic"]),
            "why": condition_profile.traffic_explanation,
        },
        "weather": {
            "points": round(weather_pts, 1),
            "max": MAX["weather"],
            "delta": _delta(weather_pts, MAX["weather"]),
            "why": condition_profile.weather_explanation,
        },
        "risk": {
            "points": round(risk_pts, 1),
            "max": MAX["risk"],
            "delta": _delta(risk_pts, MAX["risk"]),
            "why": (
                f"Risk score {round(100 - risk_pts / 25 * 100)}%."
                " Includes delay probability and operational risk factors."
            ),
        },
    }

    # Summary sentence
    worst = min(breakdown.items(), key=lambda x: x[1]["delta"])
    if worst[1]["delta"] < -5:
        summary = f"Biggest drag: {worst[0]} (−{abs(worst[1]['delta'])} pts). {worst[1]['why']}"
    else:
        summary = "Route conditions are within normal parameters."

    breakdown["summary"] = summary
    return breakdown
