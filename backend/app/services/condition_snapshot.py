"""
Condition Snapshot — extracts real condition signals from optimization_result
and Weather API, then builds a ConditionSnapshot for the health engine.

Phase 1  — ConditionSnapshot dataclass
Phase 2  — Real traffic signals from TomTom (via optimization_result.best)
Phase 3  — Real weather signals from OpenWeather API
Phase 4  — ML delay prediction
Phase 5  — Confidence scoring
Phase 6  — Health engine upgrade (new weights: traffic 35%, weather 20%,
            delay 20%, adherence 15%, eta_variance 10%)
Phase 7  — Explainable breakdown with real signal sources
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Phase 1 — ConditionSnapshot
# ---------------------------------------------------------------------------

@dataclass
class ConditionSnapshot:
    # --- Real signals (None when unavailable) ---
    traffic_level: Optional[float]           # 0–1 from TomTom (0=clear, 1=gridlock)
    traffic_delay_minutes: int               # absolute delay minutes
    predicted_delay_hours: Optional[float]   # ML model prediction
    temperature: Optional[float]             # °C
    precipitation: Optional[float]           # mm/h
    visibility: Optional[float]              # km (derived from condition string)
    weather_condition: Optional[str]         # "Clear", "Rain", "Storm", etc.

    # --- Computed 0–100 scores ---
    traffic_score: float
    weather_score: float
    delay_score: float
    route_adherence_score: float
    eta_variance_score: float

    # --- Confidence + sources ---
    confidence_score: int                    # 0–100
    signal_sources: list[str]               # e.g. ["tomtom", "weather_api", "ml_delay_model"]
    signal_freshness: dict[str, str]        # {"traffic":"live","weather":"live","delay":"heuristic"}
    signals_refreshed_at: Optional[str]     # ISO timestamp of last live refresh

    # --- Explanations ---
    traffic_explanation: str
    weather_explanation: str
    delay_explanation: str
    adherence_explanation: str
    eta_explanation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "traffic_level": round(self.traffic_level, 3) if self.traffic_level is not None else None,
            "traffic_delay_minutes": self.traffic_delay_minutes,
            "predicted_delay_hours": round(self.predicted_delay_hours, 2) if self.predicted_delay_hours is not None else None,
            "temperature": self.temperature,
            "precipitation": self.precipitation,
            "visibility": self.visibility,
            "weather_condition": self.weather_condition,
            "traffic_score": round(self.traffic_score, 1),
            "weather_score": round(self.weather_score, 1),
            "delay_score": round(self.delay_score, 1),
            "route_adherence_score": round(self.route_adherence_score, 1),
            "eta_variance_score": round(self.eta_variance_score, 1),
            "confidence_score": self.confidence_score,
            "signal_sources": self.signal_sources,
            "signal_freshness": self.signal_freshness,
            "signals_refreshed_at": self.signals_refreshed_at,
            "explanations": {
                "traffic": self.traffic_explanation,
                "weather": self.weather_explanation,
                "delay": self.delay_explanation,
                "adherence": self.adherence_explanation,
                "eta": self.eta_explanation,
            },
        }


# ---------------------------------------------------------------------------
# Phase 2 — Extract real traffic signals from optimization_result
# ---------------------------------------------------------------------------

def _extract_pipeline_signals(
    optimization_result: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """
    Extract TomTom + ML signals from the stored optimization_result.
    Checks: best → all[0] → optimization_result root.
    Returns a flat dict of available signals (None for missing).
    """
    if not optimization_result:
        return {}

    candidates = [
        optimization_result.get("best") or {},
        (optimization_result.get("all") or [{}])[0] if optimization_result.get("all") else {},
        optimization_result,
    ]

    result: dict[str, Any] = {}
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        # TomTom traffic
        if "traffic_level" in candidate and result.get("traffic_level") is None:
            result["traffic_level"] = candidate["traffic_level"]
        if "traffic_factor" in candidate and result.get("traffic_factor") is None:
            result["traffic_factor"] = candidate["traffic_factor"]
        # ML delay
        if "predicted_delay" in candidate and result.get("predicted_delay") is None:
            result["predicted_delay"] = candidate["predicted_delay"]
        if "weather_factor" in candidate and result.get("weather_factor") is None:
            result["weather_factor"] = candidate["weather_factor"]
        if "weather_level" in candidate and result.get("weather_level") is None:
            result["weather_level"] = candidate["weather_level"]
        # Distance
        if "distance_km" in candidate and result.get("distance_km") is None:
            result["distance_km"] = candidate["distance_km"]

    return result


def build_traffic_score_from_real(
    traffic_level: Optional[float],
    traffic_factor: Optional[float],
    route_km: float,
) -> tuple[float, int, str, bool]:
    """
    Returns (traffic_score 0–100, delay_minutes, explanation, used_real_signal).

    Uses TomTom traffic_level if available (0–1, higher = worse).
    Falls back to traffic_factor (multiplier ≥1, higher = worse).
    """
    if traffic_level is not None:
        tl = max(0.0, min(1.0, float(traffic_level)))
        score = round(max(0.0, 100.0 * (1.0 - tl)))
        # Delay: traffic adds extra time proportional to congestion
        speed_kmh = max(5.0, 55.0 * (1.0 - tl * 0.8))
        baseline_min = (route_km / 55.0) * 60
        actual_min = (route_km / speed_kmh) * 60
        delay_min = max(0, int(round(actual_min - baseline_min)))

        if tl < 0.15:
            level, desc = "Light", "Light traffic detected by TomTom."
        elif tl < 0.35:
            level, desc = "Moderate", "Moderate traffic detected by TomTom."
        elif tl < 0.60:
            level, desc = "Heavy", "Heavy congestion detected by TomTom."
        else:
            level, desc = "Severe", "Severe congestion detected by TomTom."

        explanation = f"{level} traffic (TomTom congestion index {round(tl * 100)}%). {desc} Est. delay: {delay_min}m."
        return score, delay_min, explanation, True

    if traffic_factor is not None:
        tf = max(1.0, float(traffic_factor))
        # Factor 1.0 = no slowdown, 2.0 = double travel time
        slowdown = min(1.0, (tf - 1.0))
        score = round(max(0.0, 100.0 * (1.0 - slowdown * 0.7)))
        delay_min = int(round((route_km / 55.0) * 60 * (tf - 1.0) * 0.5))
        delay_min = max(0, delay_min)
        explanation = f"Traffic factor {round(tf, 2)}× (ML estimate). Est. delay: {delay_min}m."
        return score, delay_min, explanation, True

    return None, 0, "", False  # no real signal


# ---------------------------------------------------------------------------
# Phase 3 — Real weather signals from OpenWeather
# ---------------------------------------------------------------------------

def _visibility_from_condition(condition: str) -> float:
    """Estimate visibility km from OpenWeather condition string."""
    c = (condition or "").lower()
    if "storm" in c or "thunder" in c:
        return 0.5
    if "heavy rain" in c or "snow" in c:
        return 1.0
    if "rain" in c or "drizzle" in c or "mist" in c:
        return 3.0
    if "haze" in c or "fog" in c:
        return 1.5
    if "cloud" in c or "overcast" in c:
        return 8.0
    return 10.0  # Clear / default


def build_weather_score_from_real(
    temp: Optional[float],
    rain: Optional[float],
    condition: Optional[str],
    weather_factor: Optional[float],
    mode: str = "road",
) -> tuple[float, int, Optional[float], Optional[float], Optional[float], str, bool]:
    """
    Returns (weather_score 0–100, delay_minutes, temperature, precipitation,
             visibility, explanation, used_real_signal).

    Uses real OpenWeather values when available.
    """
    temp_c = float(temp) if temp is not None else None
    rain_mm = float(rain) if rain is not None else 0.0
    cond = str(condition or "Clear")
    visibility_km = _visibility_from_condition(cond)
    precipitation = rain_mm

    # Mode susceptibility
    susceptibility = {"road": 1.0, "rail": 0.5, "air": 0.8, "water": 0.9, "hybrid": 0.8}.get(
        (mode or "road").lower(), 0.8
    )

    if temp is not None or rain is not None or weather_factor is not None:
        # Build impact from real data
        impact = 0.0

        # Rain impact (0–10mm/h range)
        if rain_mm > 0:
            impact += min(0.40, rain_mm / 10.0 * 0.40)

        # Visibility impact
        if visibility_km < 2.0:
            impact += 0.25
        elif visibility_km < 5.0:
            impact += 0.10

        # Extreme temperature
        if temp_c is not None:
            if temp_c > 45 or temp_c < 0:
                impact += 0.15
            elif temp_c > 40 or temp_c < 5:
                impact += 0.05

        # Weather condition override
        cond_lower = cond.lower()
        if "storm" in cond_lower or "thunder" in cond_lower:
            impact = max(impact, 0.50)
        elif "heavy" in cond_lower:
            impact = max(impact, 0.35)
        elif "snow" in cond_lower or "blizzard" in cond_lower:
            impact = max(impact, 0.45)

        # Blend with weather_factor if available
        if weather_factor is not None:
            wf = float(weather_factor)
            if wf >= 1.0:
                factor_impact = min(0.5, (wf - 1.0) * 0.5)
                impact = max(impact, factor_impact)

        impact = min(1.0, impact * susceptibility)
        weather_score = round(max(0.0, 100.0 * (1.0 - impact)))

        baseline_min = 60  # rough proxy
        delay_min = int(round(baseline_min * impact * 0.15))

        # Build explanation
        parts = []
        if "storm" in cond_lower or "thunder" in cond_lower:
            parts.append(f"Storm conditions ({cond})")
        elif "rain" in cond_lower or "drizzle" in cond_lower:
            parts.append(f"Rainfall {rain_mm:.1f}mm/h")
        elif "snow" in cond_lower:
            parts.append(f"Snow ({cond})")
        else:
            parts.append(f"Condition: {cond}")

        if temp_c is not None:
            parts.append(f"Temp {temp_c:.0f}°C")
        if visibility_km < 8.0:
            parts.append(f"Visibility {visibility_km:.1f}km")

        if weather_score >= 85:
            level = "Favourable"
        elif weather_score >= 65:
            level = "Moderate"
        elif weather_score >= 40:
            level = "Adverse"
        else:
            level = "Severe"

        explanation = f"{level} weather — {', '.join(parts)}. (Weather API) Est. delay: {delay_min}m."
        return weather_score, delay_min, temp_c, precipitation if precipitation > 0 else None, visibility_km, explanation, True

    return None, 0, None, None, None, "", False


# ---------------------------------------------------------------------------
# Phase 4 — ML Delay Score
# ---------------------------------------------------------------------------

def build_delay_score_from_ml(
    predicted_delay_hours: Optional[float],
) -> tuple[float, str, bool]:
    """
    Returns (delay_score 0–100, explanation, used_real_signal).

    0h → 100, 1h → 80, 2h → 60, 3h → 40, 4h → 20, 5h+ → 0
    Linear: score = max(0, 100 - delay_hours * 20)
    """
    if predicted_delay_hours is None:
        return None, "", False

    delay_h = max(0.0, float(predicted_delay_hours))
    score = round(max(0.0, 100.0 - delay_h * 20.0))

    if delay_h < 0.25:
        desc = "Minimal delay predicted by ML model."
    elif delay_h < 1.0:
        desc = f"Minor delay ({round(delay_h * 60)}m) predicted by ML model."
    elif delay_h < 2.0:
        desc = f"Moderate delay ({round(delay_h, 1)}h) predicted by ML model."
    else:
        desc = f"Significant delay ({round(delay_h, 1)}h) predicted by ML model."

    return score, desc, True


# ---------------------------------------------------------------------------
# Phase 5 — Confidence Score
# ---------------------------------------------------------------------------

def compute_confidence_score(signal_sources: list[str]) -> int:
    """
    Legacy function — kept for backward compatibility.
    Use _compute_confidence_from_freshness for new code.
    """
    conf = 15
    sources_lower = {s.lower() for s in signal_sources}
    if "tomtom" in sources_lower:
        conf += 35
    if "weather_api" in sources_lower:
        conf += 25
    if "ml_delay_model" in sources_lower:
        conf += 25
    return min(100, conf)


def _compute_confidence_from_freshness(signal_freshness: dict[str, str]) -> int:
    """
    Phase 6: Confidence reflects signal freshness.

    Traffic:
      live    → +35
      stored  → +20
      fallback/heuristic → +5
    Weather:
      live    → +25
      stored  → +15
      unavailable → 0
    Delay:
      live    → +25
      stored/heuristic → +12
      unavailable → 0
    Base: 15 (always — route + progress present)
    """
    conf = 15
    t = signal_freshness.get("traffic", "unavailable")
    w = signal_freshness.get("weather", "unavailable")
    d = signal_freshness.get("delay",   "unavailable")

    conf += {"live": 35, "stored": 20, "fallback": 5}.get(t, 0)
    conf += {"live": 25, "stored": 15}.get(w, 0)
    conf += {"live": 25, "heuristic": 12, "stored": 12}.get(d, 0)

    return min(100, conf)


# ---------------------------------------------------------------------------
# Phase 6 — Health score with upgraded weights
# ---------------------------------------------------------------------------
#
# New weights (real signals can dominate):
#   Traffic     35 pts  (was 5 pts — was under-weighted)
#   Weather     20 pts  (was 5 pts)
#   Delay       20 pts  (new — from ML prediction)
#   Adherence   15 pts  (was 40 pts — reducing since corridor detection is the
#                        main adherence signal, not a separate 40pt factor)
#   ETA Variance 10 pts (was 25 pts)
#
# Total = 100 pts
# Note: The adherence weight reduction is intentional — adherence is now
# captured more precisely via the corridor_status in route_adherence_score,
# which is then weighted at 15% instead of 40% to make room for real signals.

def compute_health_from_snapshot(snapshot: ConditionSnapshot) -> tuple[int, str]:
    """
    Phase 6: compute health_score (0–100) and health_level from ConditionSnapshot.

    Returns (health_score, health_level).
    """
    adherence_pts  = snapshot.route_adherence_score * 0.15   # 15% weight
    eta_pts        = snapshot.eta_variance_score    * 0.10   # 10% weight
    traffic_pts    = snapshot.traffic_score         * 0.35   # 35% weight
    weather_pts    = snapshot.weather_score         * 0.20   # 20% weight
    delay_pts      = snapshot.delay_score           * 0.20   # 20% weight

    total = adherence_pts + eta_pts + traffic_pts + weather_pts + delay_pts
    health_score = round(max(0, min(100, total)))

    if health_score >= 80:
        health_level = "healthy"
    elif health_score >= 60:
        health_level = "moderate"
    else:
        health_level = "at_risk"

    return health_score, health_level


# ---------------------------------------------------------------------------
# Phase 7 — Explainable breakdown with real signal attribution
# ---------------------------------------------------------------------------

def build_snapshot_breakdown(snapshot: ConditionSnapshot) -> dict[str, Any]:
    """
    Build health_breakdown dict showing real signal explanations.
    """
    # Max points per factor under new weighting
    MAX = {
        "traffic":    35.0,
        "weather":    20.0,
        "delay":      20.0,
        "adherence":  15.0,
        "eta":        10.0,
    }

    actual = {
        "traffic":   snapshot.traffic_score   * 0.35,
        "weather":   snapshot.weather_score   * 0.20,
        "delay":     snapshot.delay_score     * 0.20,
        "adherence": snapshot.route_adherence_score * 0.15,
        "eta":       snapshot.eta_variance_score    * 0.10,
    }

    def _delta(key: str) -> int:
        return int(round(actual[key] - MAX[key]))

    breakdown = {
        "traffic": {
            "points":  round(actual["traffic"], 1),
            "max":     MAX["traffic"],
            "delta":   _delta("traffic"),
            "why":     snapshot.traffic_explanation,
            "source":  "TomTom" if "tomtom" in [s.lower() for s in snapshot.signal_sources] else "heuristic",
        },
        "weather": {
            "points":  round(actual["weather"], 1),
            "max":     MAX["weather"],
            "delta":   _delta("weather"),
            "why":     snapshot.weather_explanation,
            "source":  "Weather API" if "weather_api" in [s.lower() for s in snapshot.signal_sources] else "heuristic",
        },
        "delay": {
            "points":  round(actual["delay"], 1),
            "max":     MAX["delay"],
            "delta":   _delta("delay"),
            "why":     snapshot.delay_explanation,
            "source":  "ML model" if "ml_delay_model" in [s.lower() for s in snapshot.signal_sources] else "heuristic",
        },
        "adherence": {
            "points":  round(actual["adherence"], 1),
            "max":     MAX["adherence"],
            "delta":   _delta("adherence"),
            "why":     snapshot.adherence_explanation,
            "source":  "corridor",
        },
        "eta": {
            "points":  round(actual["eta"], 1),
            "max":     MAX["eta"],
            "delta":   _delta("eta"),
            "why":     snapshot.eta_explanation,
            "source":  "schedule",
        },
    }

    # Summary — identify worst factor
    worst = min(breakdown.items(), key=lambda x: x[1]["delta"])
    if worst[1]["delta"] < -3:
        summary = f"Biggest drag: {worst[0]} (−{abs(worst[1]['delta'])} pts). {worst[1]['why']}"
    else:
        summary = "Route conditions are within normal parameters."

    breakdown["summary"] = summary
    return breakdown


# ---------------------------------------------------------------------------
# Orchestrator — build_condition_snapshot
# ---------------------------------------------------------------------------

def build_condition_snapshot(
    optimization_result: Optional[dict[str, Any]],
    corridor_status: str,
    deviation_km: Optional[float],
    overdue_minutes: int,
    eta_gap_minutes: int,
    route_km: float,
    stop_count: int,
    mode: str,
    source: str,
    destination: str,
    # Fallback builders (imported from condition_intelligence)
    fallback_traffic_fn = None,
    fallback_weather_fn = None,
    fallback_adherence_fn = None,
    fallback_eta_fn = None,
    # Phase 5: live_signals takes highest priority (from live_signal_refresh)
    live_signals: Any = None,
) -> ConditionSnapshot:
    """
    Build a ConditionSnapshot.

    Signal priority (Phase 5):
      1. live_signals  — freshly fetched TomTom + Weather + ML (this call)
      2. optimization_result.best — stored pipeline signals
      3. fallback heuristics

    live_signals is a LiveSignals object from live_signal_refresh.refresh_condition_signals().
    """
    signal_sources: list[str] = []
    signal_freshness: dict[str, str] = {
        "traffic": "unavailable",
        "weather": "unavailable",
        "delay":   "unavailable",
    }
    signals_refreshed_at: Optional[str] = None

    # ── Extract stored pipeline signals (fallback #2) ─────────────────
    pipeline = _extract_pipeline_signals(optimization_result)
    stored_traffic_level  = pipeline.get("traffic_level")
    stored_traffic_factor = pipeline.get("traffic_factor")
    stored_predicted_delay = pipeline.get("predicted_delay")
    stored_weather_factor  = pipeline.get("weather_factor")

    # ── Resolve traffic signal (live > stored > heuristic) ────────────
    traffic_level: Optional[float] = None
    traffic_factor_val: Optional[float] = None
    used_live_traffic = False

    if live_signals and live_signals.traffic_level is not None:
        traffic_level = live_signals.traffic_level
        traffic_factor_val = None  # use traffic_level directly
        used_live_traffic = True
        signal_freshness["traffic"] = live_signals.traffic_freshness
        signals_refreshed_at = live_signals.refreshed_at
    elif stored_traffic_level is not None or stored_traffic_factor is not None:
        traffic_level = stored_traffic_level
        traffic_factor_val = stored_traffic_factor
        signal_freshness["traffic"] = "stored"
    # else: heuristic — signal_freshness["traffic"] stays "unavailable"

    # ── Resolve weather signal (live > stored > heuristic) ────────────
    temp: Optional[float] = None
    rain: Optional[float] = None
    condition: Optional[str] = None
    _weather_from_api = False

    if live_signals and live_signals.temperature is not None:
        temp = live_signals.temperature
        rain = live_signals.precipitation or 0.0
        condition = live_signals.weather_condition or "Clear"
        _weather_from_api = True
        signal_freshness["weather"] = live_signals.weather_freshness
        if not signals_refreshed_at:
            signals_refreshed_at = live_signals.refreshed_at
    else:
        # Try stored pipeline weather
        weather_data: dict[str, Any] = {}
        if optimization_result:
            cached_weather = (optimization_result.get("best") or {}).get("weather")
            if not cached_weather and optimization_result.get("all"):
                first = (optimization_result["all"] or [None])[0]
                cached_weather = (first or {}).get("weather") if isinstance(first, dict) else None
            if cached_weather and isinstance(cached_weather, dict) and cached_weather.get("temp") is not None:
                weather_data = cached_weather
                _weather_from_api = True
                signal_freshness["weather"] = "stored"
            else:
                try:
                    import os
                    from app.services.weather_service import get_weather
                    if os.getenv("OPENWEATHER_API_KEY"):
                        live_w = get_weather(source)
                        if live_w and live_w.get("temp") is not None:
                            weather_data = live_w
                            _weather_from_api = True
                            signal_freshness["weather"] = "live"
                except Exception:
                    pass
        temp = weather_data.get("temp")
        rain = float(weather_data.get("rain") or 0)
        condition = weather_data.get("condition")

    # ── Resolve ML delay signal (live > stored > heuristic) ───────────
    predicted_delay: Optional[float] = None
    used_live_delay = False

    if live_signals and live_signals.predicted_delay_hours is not None:
        predicted_delay = live_signals.predicted_delay_hours
        used_live_delay = True
        signal_freshness["delay"] = live_signals.delay_freshness
    elif stored_predicted_delay is not None:
        predicted_delay = stored_predicted_delay
        signal_freshness["delay"] = "stored"
    # else: heuristic proxy computed below

    # ── Build traffic score ───────────────────────────────────────────
    traffic_score_val, traffic_delay_min, traffic_exp, used_real_traffic = \
        build_traffic_score_from_real(traffic_level, traffic_factor_val, route_km)

    if used_real_traffic:
        freshness_label = signal_freshness["traffic"]
        src_label = "live" if freshness_label == "live" else (
            "stored (TomTom)" if freshness_label == "stored" else "TomTom"
        )
        if freshness_label in ("live", "stored"):
            signal_sources.append("tomtom" if freshness_label == "live" else "tomtom_stored")
        traffic_score = traffic_score_val
        traffic_exp_final = traffic_exp
    else:
        if fallback_traffic_fn:
            ts, _, td, te = fallback_traffic_fn(route_km, stop_count, mode, source, destination)
            traffic_score = ts
            traffic_delay_min = td
            traffic_exp_final = te
        else:
            traffic_score = 65.0
            traffic_exp_final = "Traffic estimate unavailable (heuristic)."

    # ── Build weather score ───────────────────────────────────────────
    weather_score_val, weather_delay_min, temp_c, precip, vis, weather_exp, used_real_weather = \
        build_weather_score_from_real(temp, rain, condition, stored_weather_factor, mode)

    if used_real_weather and _weather_from_api:
        freshness_label = signal_freshness["weather"]
        signal_sources.append("weather_api" if freshness_label == "live" else "weather_stored")
        weather_score = weather_score_val
        weather_exp_final = weather_exp
    else:
        if fallback_weather_fn:
            ws, _, we = fallback_weather_fn(route_km, mode, source, destination)
            weather_score = ws
            weather_exp_final = we
        else:
            weather_score = 75.0
            weather_exp_final = "Weather estimate unavailable (heuristic)."
        temp_c = None; precip = None; vis = None; weather_delay_min = 0

    # ── Build delay score ─────────────────────────────────────────────
    delay_score_val, delay_exp, used_ml = build_delay_score_from_ml(predicted_delay)

    if used_ml:
        freshness_label = signal_freshness["delay"]
        signal_sources.append("ml_delay_model" if freshness_label in ("live","heuristic") else "ml_delay_stored")
        delay_score = delay_score_val
        delay_exp_final = delay_exp
    else:
        proxy = (traffic_score * 0.6 + weather_score * 0.4)
        delay_score = round(proxy)
        delay_exp_final = "ML delay prediction unavailable — estimated from traffic/weather."

    # ── Adherence and ETA ─────────────────────────────────────────────
    if fallback_adherence_fn:
        adherence_score, adherence_exp = fallback_adherence_fn(corridor_status, deviation_km)
    else:
        adherence_score = 100.0 if corridor_status == "ON_ROUTE" else 60.0
        adherence_exp = "Corridor adherence estimate."

    if fallback_eta_fn:
        eta_score, eta_exp = fallback_eta_fn(overdue_minutes, eta_gap_minutes)
    else:
        total_gap = max(0, overdue_minutes) + max(0, eta_gap_minutes)
        eta_score = max(0.0, 100.0 - total_gap / 2.0)
        eta_exp = f"ETA variance: {total_gap}m total gap."

    # ── Confidence — Phase 6: reflects freshness ──────────────────────
    confidence = _compute_confidence_from_freshness(signal_freshness)

    return ConditionSnapshot(
        traffic_level=traffic_level,
        traffic_delay_minutes=traffic_delay_min,
        predicted_delay_hours=predicted_delay,
        temperature=round(temp_c, 1) if temp_c is not None else None,
        precipitation=round(precip, 2) if precip is not None else None,
        visibility=round(vis, 1) if vis is not None else None,
        weather_condition=condition,
        traffic_score=traffic_score,
        weather_score=weather_score,
        delay_score=delay_score,
        route_adherence_score=adherence_score,
        eta_variance_score=eta_score,
        confidence_score=confidence,
        signal_sources=signal_sources,
        signal_freshness=signal_freshness,
        signals_refreshed_at=signals_refreshed_at,
        traffic_explanation=traffic_exp_final,
        weather_explanation=weather_exp_final,
        delay_explanation=delay_exp_final,
        adherence_explanation=adherence_exp,
        eta_explanation=eta_exp,
    )
    """
    Build a ConditionSnapshot, preferring real signals with graceful fallback
    to the existing deterministic heuristics.
    """
    signal_sources: list[str] = []

    # Extract real pipeline signals
    pipeline = _extract_pipeline_signals(optimization_result)
    traffic_level   = pipeline.get("traffic_level")
    traffic_factor  = pipeline.get("traffic_factor")
    predicted_delay = pipeline.get("predicted_delay")   # hours
    weather_factor  = pipeline.get("weather_factor")

    weather_data: dict[str, Any] = {}
    _weather_from_api = False   # True only for pipeline-cached weather (verified real signal)
    if optimization_result:
        # Pipeline already fetched + validated weather during route computation — most reliable
        cached_weather = (optimization_result.get("best") or {}).get("weather")
        if not cached_weather and optimization_result.get("all"):
            first = (optimization_result["all"] or [None])[0]
            cached_weather = (first or {}).get("weather") if isinstance(first, dict) else None
        if cached_weather and isinstance(cached_weather, dict) and cached_weather.get("temp") is not None:
            weather_data = cached_weather
            _weather_from_api = True   # pipeline-verified real signal
        else:
            # No cached weather in pipeline result — fetch live as supplementary
            try:
                from app.services.weather_service import get_weather
                live = get_weather(source)
                if live and live.get("temp") is not None:
                    weather_data = live
                    # Only mark as real signal if API key was present (not fallback)
                    import os
                    _weather_from_api = bool(os.getenv("OPENWEATHER_API_KEY"))
            except Exception:
                pass
    # When opt=None: use live weather for scoring but don't count as verified pipeline signal

    temp = weather_data.get("temp")
    rain = weather_data.get("rain")
    condition = weather_data.get("condition")

    # ── Traffic score ─────────────────────────────────────────────────
    traffic_score_val, traffic_delay_min, traffic_exp, used_real_traffic = \
        build_traffic_score_from_real(traffic_level, traffic_factor, route_km)

    if used_real_traffic:
        signal_sources.append("tomtom")
        traffic_score = traffic_score_val
        traffic_exp_final = traffic_exp
    else:
        # Fallback to heuristic
        if fallback_traffic_fn:
            ts, _, td, te = fallback_traffic_fn(route_km, stop_count, mode, source, destination)
            traffic_score = ts
            traffic_delay_min = td
            traffic_exp_final = te
        else:
            traffic_score = 65.0
            traffic_exp_final = "Traffic estimate unavailable (using heuristic)."

    # ── Weather score ─────────────────────────────────────────────────
    weather_score_val, weather_delay_min, temp_c, precip, vis, weather_exp, used_real_weather = \
        build_weather_score_from_real(temp, rain, condition, weather_factor, mode)

    if used_real_weather and _weather_from_api:
        signal_sources.append("weather_api")
        weather_score = weather_score_val
        weather_exp_final = weather_exp
    else:
        if fallback_weather_fn:
            ws, _, we = fallback_weather_fn(route_km, mode, source, destination)
            weather_score = ws
            weather_exp_final = we
        else:
            weather_score = 75.0
            weather_exp_final = "Weather estimate unavailable (using heuristic)."
        temp_c = None
        precip = None
        vis = None
        weather_delay_min = 0

    # ── ML delay score ────────────────────────────────────────────────
    delay_score_val, delay_exp, used_ml = build_delay_score_from_ml(predicted_delay)

    if used_ml:
        signal_sources.append("ml_delay_model")
        delay_score = delay_score_val
        delay_exp_final = delay_exp
    else:
        # Derive delay score from traffic/weather scores as proxy
        proxy = (traffic_score * 0.6 + weather_score * 0.4)
        delay_score = round(proxy)
        delay_exp_final = "ML delay prediction unavailable — estimated from traffic/weather."

    # ── Adherence score ───────────────────────────────────────────────
    if fallback_adherence_fn:
        adherence_score, adherence_exp = fallback_adherence_fn(corridor_status, deviation_km)
    else:
        adherence_score = 100.0 if corridor_status == "ON_ROUTE" else 60.0
        adherence_exp = "Corridor adherence estimate."

    # ── ETA variance score ────────────────────────────────────────────
    if fallback_eta_fn:
        eta_score, eta_exp = fallback_eta_fn(overdue_minutes, eta_gap_minutes)
    else:
        total_gap = max(0, overdue_minutes) + max(0, eta_gap_minutes)
        eta_score = max(0.0, 100.0 - total_gap / 2.0)
        eta_exp = f"ETA variance: {total_gap}m total gap."

    # ── Confidence ────────────────────────────────────────────────────
    confidence = compute_confidence_score(signal_sources)

    return ConditionSnapshot(
        traffic_level=traffic_level,
        traffic_delay_minutes=traffic_delay_min,
        predicted_delay_hours=predicted_delay,
        temperature=round(temp_c, 1) if temp_c is not None else None,
        precipitation=round(precip, 2) if precip is not None else None,
        visibility=round(vis, 1) if vis is not None else None,
        weather_condition=condition,
        traffic_score=traffic_score,
        weather_score=weather_score,
        delay_score=delay_score,
        route_adherence_score=adherence_score,
        eta_variance_score=eta_score,
        confidence_score=confidence,
        signal_sources=signal_sources,
        traffic_explanation=traffic_exp_final,
        weather_explanation=weather_exp_final,
        delay_explanation=delay_exp_final,
        adherence_explanation=adherence_exp,
        eta_explanation=eta_exp,
    )
