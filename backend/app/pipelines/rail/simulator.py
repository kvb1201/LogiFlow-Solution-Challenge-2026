"""
Railway Cargo Simulation Engine.

Allows users to manually set ALL parameters (weather, congestion, season,
departure hour, cargo type/weight) and get deterministic results
(delay, price, risk, ETA) without hitting any external API.

Uses the same tariff tables, route finder, and scoring logic as the
real pipeline — but with user-injected parameters instead of live feeds.
"""

from app.pipelines.rail.route_finder import find_routes
from app.pipelines.rail.engineer import (
    _compute_weather_factor,
    check_cargo_feasibility,
    calc_booking_ease,
)
from app.pipelines.rail.tariff import (
    calc_parcel_cost,
    determine_scale,
    get_tariff_breakdown,
)
from app.pipelines.rail.config import RISK_MULTIPLIERS


# ── Season → month mapping for simulation ─────────────────────────────
_SEASON_TO_MONTH = {
    "monsoon": 7,
    "fog": 1,
    "festival": 10,
    "normal": 4,
    "summer": 5,
    "winter": 12,
}


def _sim_risk_score(route, season, weather_data, congestion_level, departure_hour):
    """
    Compute a deterministic risk score from user-controlled simulation params.

    Components:
      - Train type baseline → 25%
      - Season → 20%
      - Weather → 25%
      - Congestion → 20%
      - Transfer penalty → 10%
    """
    # ── Train type baseline ───────────────────────────────────────────
    train_type_str = ""
    for t in route.get("trains", []):
        train_type_str += (t.get("train_type", "") + " " + t.get("train_name", "")).lower()

    if "rajdhani" in train_type_str:
        type_risk = 0.10
    elif "shatabdi" in train_type_str or "duronto" in train_type_str:
        type_risk = 0.15
    elif "superfast" in train_type_str or "sf" in train_type_str:
        type_risk = 0.25
    else:
        type_risk = 0.35

    # ── Season risk ───────────────────────────────────────────────────
    month = _SEASON_TO_MONTH.get(season, 4)
    if month in RISK_MULTIPLIERS["monsoon_months"]:
        season_risk = 0.30
    elif month in RISK_MULTIPLIERS["fog_months"]:
        season_risk = 0.20
    elif month in RISK_MULTIPLIERS.get("festival_months", []):
        season_risk = 0.15
    else:
        season_risk = 0.05

    # ── Weather risk ──────────────────────────────────────────────────
    _, weather_risk = _compute_weather_factor(weather_data)

    # ── Congestion risk ───────────────────────────────────────────────
    congestion_risk = float(congestion_level) * 0.5

    # ── Night travel risk ─────────────────────────────────────────────
    night_risk = 0.05 if (departure_hour >= 22 or departure_hour <= 5) else 0.0

    # ── Transfer penalty ──────────────────────────────────────────────
    transfer_risk = 0.25 if route.get("has_transfer", False) else 0.0

    total = (
        type_risk * 0.25 +
        season_risk * 0.20 +
        weather_risk * 0.25 +
        congestion_risk * 0.20 +
        transfer_risk * 0.10 +
        night_risk
    )
    return round(max(0.02, min(0.98, total)), 3)


def _scenario_multipliers(weather_data, congestion_level, season, departure_hour):
    """Scenario knobs shared by heuristic and ML-adjusted simulation."""
    weather_factor, _ = _compute_weather_factor(weather_data)
    congestion_factor = 1.0 + float(congestion_level) * 0.4

    month = _SEASON_TO_MONTH.get(season, 4)
    if month in RISK_MULTIPLIERS["monsoon_months"]:
        season_factor = 1.15
    elif month in RISK_MULTIPLIERS["fog_months"]:
        season_factor = 1.10
    elif month in RISK_MULTIPLIERS.get("festival_months", []):
        season_factor = 1.08
    else:
        season_factor = 1.0

    if 7 <= departure_hour <= 10 or 17 <= departure_hour <= 20:
        peak_factor = 1.05
    elif departure_hour >= 23 or departure_hour <= 4:
        peak_factor = 0.95
    else:
        peak_factor = 1.0

    return {
        "weather_factor": round(weather_factor, 3),
        "congestion_factor": round(congestion_factor, 3),
        "season_factor": round(season_factor, 3),
        "peak_factor": round(peak_factor, 3),
    }


def _route_for_ml_prediction(route, departure_hour):
    """Inject simulated departure hour so ML features reflect user scenario."""
    import copy

    patched = copy.deepcopy(route)
    hour = int(departure_hour) % 24
    for train in patched.get("trains") or []:
        train["departure_time"] = f"{hour:02d}:00"
    return patched


def _sim_delay_hours(route, weather_data, congestion_level, season, departure_hour):
    """
    ML baseline delay (LogiFlow scraped-delay model) scaled by scenario parameters.
    """
    import copy

    base_duration = route.get("total_duration_hours", 0)
    factors = _scenario_multipliers(weather_data, congestion_level, season, departure_hour)
    combined = (
        factors["weather_factor"]
        * factors["congestion_factor"]
        * factors["season_factor"]
        * factors["peak_factor"]
    )

    ml_delay_min = None
    ml_delay_hours = None
    try:
        from app.pipelines.rail.ml_models import predict_delay

        ml_delay_min = float(predict_delay(_route_for_ml_prediction(route, departure_hour)))
        ml_delay_hours = max(0.0, ml_delay_min / 60.0)
    except Exception:
        ml_delay_min = None
        ml_delay_hours = None

    if ml_delay_hours is None:
        # Fallback when ML bundle is unavailable
        adjusted = base_duration * combined
        delay = max(0.0, adjusted - base_duration)
        meta = copy.copy(factors)
        meta.update({
            "ml_used": False,
            "ml_delay_minutes": None,
            "scenario_multiplier": round(combined, 3),
        })
        return round(delay, 2), round(adjusted, 2), meta

    scenario_delay_hours = ml_delay_hours * combined
    adjusted_eta = base_duration + scenario_delay_hours
    meta = copy.copy(factors)
    meta.update({
        "ml_used": True,
        "ml_delay_minutes": round(ml_delay_min, 1),
        "ml_delay_hours": round(ml_delay_hours, 2),
        "scenario_multiplier": round(combined, 3),
    })
    return round(scenario_delay_hours, 2), round(adjusted_eta, 2), meta


def simulate(payload):
    """
    Run a full simulation with user-controlled parameters.

    Args:
        payload: dict with keys:
            - origin_city: str
            - destination_city: str
            - cargo_weight_kg: float (default 100)
            - cargo_type: str (default "General")
            - priority: str (cost/time/safe/balanced)
            - weather: {temp, rain, condition} (user-set)
            - congestion_level: float 0.0–1.0
            - season: str (monsoon/fog/festival/normal/summer/winter)
            - departure_hour: int 0–23

    Returns:
        dict with simulation results for each route
    """
    origin = payload.get("origin_city", "")
    destination = payload.get("destination_city", "")
    weight = float(payload.get("cargo_weight_kg", 100))
    cargo_type = payload.get("cargo_type", "General")
    priority = payload.get("priority", "balanced").lower()
    weather_data = payload.get("weather", {"temp": 30, "rain": 0, "condition": "Clear"})
    congestion_level = max(0.0, min(1.0, float(payload.get("congestion_level", 0.3))))
    season = payload.get("season", "normal").lower()
    departure_hour = int(payload.get("departure_hour", 12)) % 24

    if not origin or not destination:
        return {"error": "origin_city and destination_city are required"}

    # ── Cargo feasibility check ───────────────────────────────────────
    feasibility = check_cargo_feasibility(cargo_type, weight)
    if not feasibility["feasible"]:
        return {"error": f"Cargo not feasible: {feasibility['reason']}"}

    # ── Find routes (ConfirmTkt / IR schedule corpus) ─────────────────
    try:
        routes = find_routes(origin, destination, max_direct=10, max_transfer=3)
    except Exception as e:
        return {"error": f"Route finding failed: {e}"}

    if not routes:
        return {"error": f"No train routes found between {origin} and {destination}"}

    # ── Simulate each route ───────────────────────────────────────────
    simulated = []
    for route in routes:
        distance = route.get("total_distance_km", 0)
        if distance <= 0:
            continue

        first_train = route.get("trains", [{}])[0] if route.get("trains") else {}
        t_name = first_train.get("train_name", "")
        t_type = first_train.get("train_type", "")
        t_number = first_train.get("train_no", "")
        scale = determine_scale(t_name, t_type, t_number)

        # Cost (deterministic from tariff tables)
        cost = calc_parcel_cost(
            distance_km=distance,
            weight_kg=weight,
            train_name=t_name,
            train_type=t_type,
            scale=scale,
        )
        tariff_detail = get_tariff_breakdown(
            distance_km=distance,
            weight_kg=weight,
            train_name=t_name,
            train_type=t_type,
            scale=scale,
        )

        # Delay & adjusted ETA (ML baseline × scenario multipliers)
        delay_hours, adjusted_eta, factors = _sim_delay_hours(
            route, weather_data, congestion_level, season, departure_hour
        )

        # Risk: scenario score blended with ML delay magnitude
        scenario_risk = _sim_risk_score(route, season, weather_data, congestion_level, departure_hour)
        ml_delay_min = factors.get("ml_delay_minutes") or (delay_hours * 60)
        ml_risk = min(0.35, float(ml_delay_min) / 180.0)
        risk = round(min(0.98, scenario_risk * 0.7 + ml_risk * 0.3), 3)

        # Booking ease
        ease = calc_booking_ease(route)

        # ── Key factors explanation ───────────────────────────────────
        key_factors = []
        wf, wr = _compute_weather_factor(weather_data)
        if wr > 0.2:
            key_factors.append(f"Severe weather impact (rain={weather_data.get('rain', 0)}mm, {weather_data.get('condition', 'Clear')})")
        elif wr > 0.1:
            key_factors.append(f"Moderate weather impact ({weather_data.get('condition', 'Clear')})")
        else:
            key_factors.append("Favorable weather conditions")

        if congestion_level > 0.7:
            key_factors.append(f"High platform/yard congestion ({congestion_level:.0%})")
        elif congestion_level > 0.4:
            key_factors.append(f"Moderate congestion ({congestion_level:.0%})")
        else:
            key_factors.append(f"Low congestion ({congestion_level:.0%})")

        if season in ("monsoon", "fog"):
            key_factors.append(f"Seasonal risk: {season} season adds delays")
        elif season == "festival":
            key_factors.append("Festival season: higher platform crowding")

        if factors.get("ml_used"):
            key_factors.append(
                f"LogiFlow ML baseline: {factors.get('ml_delay_minutes', 0):.0f} min "
                f"→ scenario-adjusted: {delay_hours * 60:.0f} min "
                f"(×{factors.get('scenario_multiplier', 1):.2f})"
            )
        elif delay_hours > 2:
            key_factors.append(f"Significant delay expected: {delay_hours:.1f} hrs")
        elif delay_hours > 0.5:
            key_factors.append(f"Moderate delay expected: {delay_hours:.1f} hrs")
        else:
            key_factors.append("Minimal delay expected")

        key_factors.append(f"Tariff scale: {scale} ({tariff_detail.get('scale_name', '')})")

        simulated.append({
            "train_number": t_number,
            "train_name": t_name,
            "train_type": t_type,
            "route_type": route.get("route_type", "direct"),
            "distance_km": round(distance, 1),
            "base_duration_hours": round(route.get("total_duration_hours", 0), 2),
            "delay_hours": delay_hours,
            "adjusted_eta_hours": adjusted_eta,
            "cost_inr": round(cost, 2),
            "risk_score": risk,
            "risk_pct": f"{risk * 100:.0f}%",
            "booking_ease": ease,
            "weather_factor": factors["weather_factor"],
            "congestion_factor": factors["congestion_factor"],
            "season_factor": factors["season_factor"],
            "peak_factor": factors["peak_factor"],
            "ml_delay_minutes": factors.get("ml_delay_minutes"),
            "scenario_multiplier": factors.get("scenario_multiplier"),
            "delay_source": "logiflow_ml_simulation" if factors.get("ml_used") else "logiflow_simulation",
            "tariff_scale": scale,
            "tariff_breakdown": tariff_detail,
            "key_factors": key_factors,
            "segments": route.get("segments", []),
            "has_transfer": route.get("has_transfer", False),
        })

    if not simulated:
        return {"error": "No feasible routes for simulation"}

    # ── Sort by priority ──────────────────────────────────────────────
    if priority in ("cost", "cheap", "cheapest"):
        simulated.sort(key=lambda x: x["cost_inr"])
    elif priority in ("time", "fast", "fastest", "speed"):
        simulated.sort(key=lambda x: x["adjusted_eta_hours"])
    elif priority in ("safe", "safety", "safest"):
        simulated.sort(key=lambda x: x["risk_score"])
    else:
        # Balanced composite sort
        if simulated:
            max_cost = max(s["cost_inr"] for s in simulated) or 1
            max_time = max(s["adjusted_eta_hours"] for s in simulated) or 1
            max_risk = max(s["risk_score"] for s in simulated) or 1
            for s in simulated:
                s["_score"] = (
                    0.35 * (s["cost_inr"] / max_cost) +
                    0.30 * (s["adjusted_eta_hours"] / max_time) +
                    0.25 * (s["risk_score"] / max_risk) +
                    0.10 * (1 - s["booking_ease"])
                )
            simulated.sort(key=lambda x: x.get("_score", 0))
            for s in simulated:
                s.pop("_score", None)

    return {
        "simulation_params": {
            "origin_city": origin,
            "destination_city": destination,
            "cargo_weight_kg": weight,
            "cargo_type": cargo_type,
            "priority": priority,
            "weather": weather_data,
            "congestion_level": congestion_level,
            "season": season,
            "departure_hour": departure_hour,
        },
        "best": simulated[0] if simulated else None,
        "cheapest": min(simulated, key=lambda x: x["cost_inr"]) if len(simulated) > 1 else None,
        "fastest": min(simulated, key=lambda x: x["adjusted_eta_hours"]) if len(simulated) > 1 else None,
        "safest": min(simulated, key=lambda x: x["risk_score"]) if len(simulated) > 1 else None,
        "all_results": simulated,
        "total_routes": len(simulated),
    }
