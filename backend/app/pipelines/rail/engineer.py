"""
Cargo-specific feature engineering for the Railway Decision Engine.
Uses REAL data from RailRadar API for delay/risk calculations.
Cost uses official IRCA tariff tables (slab-based, not formula).
Integrates OpenWeather API for live weather-aware risk and ETA adjustment.
"""

from datetime import datetime
from app.pipelines.rail.config import (
    RISK_MULTIPLIERS,
    CARGO_CONSTRAINTS,
)
from app.pipelines.rail.tariff import (
    calc_parcel_cost,
    determine_scale,
    get_tariff_breakdown,
)


# calc_parcel_cost is now imported from tariff.py
# It uses official IRCA slab-based tables instead of the old formula.
# Signature: calc_parcel_cost(distance_km, weight_kg, train_name, train_type, scale, ...)
# For backward compatibility, it still works with just (distance_km, weight_kg).
# See tariff.py for full documentation.


def _compute_weather_factor(weather_data):
    """
    Compute a delay multiplier from live weather data (OpenWeather API).
    Uses the same approach as the road pipeline's ML service.

    Args:
        weather_data: dict with {temp, rain, condition}

    Returns:
        (weather_factor, weather_risk)
        weather_factor: float multiplier on ETA (1.0 = no impact)
        weather_risk: float 0.0–1.0 contribution to risk score
    """
    if not weather_data or not isinstance(weather_data, dict):
        return 1.0, 0.0

    factor = 1.0
    risk = 0.0

    rain = weather_data.get("rain", 0) or 0
    condition = (weather_data.get("condition") or "").lower()
    temp = weather_data.get("temp", 30) or 30

    # ── Rain impact (mm/hr) ───────────────────────────────────────────
    if rain > 10:
        factor += 0.25
        risk += 0.30
    elif rain > 5:
        factor += 0.15
        risk += 0.20
    elif rain > 2:
        factor += 0.08
        risk += 0.10

    # ── Severe conditions ─────────────────────────────────────────────
    if any(x in condition for x in ["storm", "thunderstorm", "tornado"]):
        factor += 0.30
        risk += 0.35
    elif any(x in condition for x in ["fog", "mist", "haze", "smoke"]):
        factor += 0.15
        risk += 0.15
    elif any(x in condition for x in ["snow", "sleet"]):
        factor += 0.20
        risk += 0.25

    # ── Extreme temperatures ─────────────────────────────────────────
    if temp > 45:
        factor += 0.10
        risk += 0.10  # Track buckling risk
    elif temp < 5:
        factor += 0.05
        risk += 0.05  # Fog/frost related

    return round(factor, 3), round(min(risk, 1.0), 3)


def get_real_delay_data(train_number):
    """
    Fetch REAL average delay data from RailRadar API.
    Returns per-station delay measurements (not heuristics).

    Args:
        train_number: 5-digit train number

    Returns:
        dict: {avg_arrival_delay_min, avg_departure_delay_min, max_delay_min,
               station_delays: [{stationCode, arrivalDelayMinutes, departureDelayMinutes}]}
        or None if API call fails
    """
    from app.pipelines.rail.railradar_client import get_average_delay

    data = get_average_delay(train_number)
    if not data or "route" not in data:
        return None

    station_delays = data["route"]
    arr_delays = [
        s.get("arrivalDelayMinutes", 0) or 0
        for s in station_delays
        if s.get("arrivalDelayMinutes") is not None
    ]
    dep_delays = [
        s.get("departureDelayMinutes", 0) or 0
        for s in station_delays
        if s.get("departureDelayMinutes") is not None
    ]

    avg_arr = sum(arr_delays) / len(arr_delays) if arr_delays else 0
    avg_dep = sum(dep_delays) / len(dep_delays) if dep_delays else 0
    max_delay = max(arr_delays + dep_delays) if (arr_delays or dep_delays) else 0

    return {
        "avg_arrival_delay_min": round(avg_arr, 1),
        "avg_departure_delay_min": round(avg_dep, 1),
        "max_delay_min": max_delay,
        "num_stations_measured": len(station_delays),
        "station_delays": station_delays,
        "data_source": "railradar_api_real",
    }


def calc_risk_score(route, departure_date_str="2025-06-01", weather_data=None):
    """
    Composite risk score from 0.0 (safe) to 1.0 (risky).
    USES REAL DELAY DATA from RailRadar + live OpenWeather data.

    Components:
      - Real average delay data (from API) → 35% weight
      - Seasonal risk (monsoon/fog/festival) → 20% weight
      - Transfer penalty → 15% weight
      - Train type reliability → 10% weight
      - Live weather risk (OpenWeather) → 20% weight

    Args:
        route: Route dict with trains list and real_delay_data
        departure_date_str: ISO date string
        weather_data: dict from OpenWeather API {temp, rain, condition}

    Returns:
        Risk score between 0.0 and 1.0
    """
    # ── Real delay-based risk (from RailRadar) ────────────────────────
    delay_risk = 0.3  # default if no API data
    real_delays = route.get("real_delay_data")

    if real_delays:
        avg_delay = real_delays.get("avg_arrival_delay_min", 0)
        max_delay = real_delays.get("max_delay_min", 0)
        # Normalize: 0-5min = low, 5-15min = medium, 15-30min = high, 30+ = very high
        if avg_delay <= 5:
            delay_risk = 0.10
        elif avg_delay <= 15:
            delay_risk = 0.25
        elif avg_delay <= 30:
            delay_risk = 0.45
        elif avg_delay <= 60:
            delay_risk = 0.65
        else:
            delay_risk = 0.85
        # Factor in max delay spikes
        if max_delay > 60:
            delay_risk = min(1.0, delay_risk + 0.10)
    else:
        # No real data — estimate from train type
        train_type = ""
        for t in route.get("trains", []):
            train_type += t.get("train_type", "").lower()
        if "rajdhani" in train_type:
            delay_risk = 0.15
        elif "shatabdi" in train_type or "duronto" in train_type:
            delay_risk = 0.20
        elif "superfast" in train_type or "sf" in train_type:
            delay_risk = 0.30
        else:
            delay_risk = 0.40

    # ── Seasonal risk ─────────────────────────────────────────────────
    seasonal_risk = 0.0
    try:
        month = datetime.strptime(departure_date_str, "%Y-%m-%d").month
        if month in RISK_MULTIPLIERS["monsoon_months"]:
            seasonal_risk = 0.25
        elif month in RISK_MULTIPLIERS["fog_months"]:
            seasonal_risk = 0.15
        elif month in RISK_MULTIPLIERS.get("festival_months", []):
            seasonal_risk = 0.10
    except Exception:
        pass

    # ── Transfer penalty ──────────────────────────────────────────────
    transfer_risk = 0.25 if route.get("has_transfer", False) else 0.0

    # ── Train type reliability bonus ──────────────────────────────────
    train_type_str = ""
    for t in route.get("trains", []):
        train_type_str += (t.get("train_type", "") + " " + t.get("train_name", "")).lower()

    reliability_bonus = 0.0
    if "rajdhani" in train_type_str:
        reliability_bonus = -0.08
    elif "shatabdi" in train_type_str:
        reliability_bonus = -0.06
    elif "duronto" in train_type_str:
        reliability_bonus = -0.05

    # ── Live weather risk (from OpenWeather) ──────────────────────────
    _, weather_risk = _compute_weather_factor(weather_data)

    # Weighted composite (updated weights to include weather)
    total = (
        delay_risk * 0.35 +
        seasonal_risk * 0.20 +
        transfer_risk * 0.15 +
        weather_risk * 0.20 +
        reliability_bonus
    )
    return round(max(0.02, min(0.98, total)), 3)


def calc_booking_ease(route):
    """
    Score 0.0 (difficult) to 1.0 (very easy) for booking parcel space.
    Uses train type and running days from real data.
    """
    score = 0.5

    for t in route.get("trains", []):
        train_type = (t.get("train_type", "") + " " + t.get("train_name", "")).lower()

        # Train type
        if "mail" in train_type or "express" in train_type:
            score += 0.10
        elif "rajdhani" in train_type:
            score += 0.05  # VPU but limited
        elif "passenger" in train_type or "memu" in train_type:
            score -= 0.10

        # Running frequency (from real API data)
        if t.get("all_days", False):
            score += 0.10  # daily trains = easier to book
        elif len(t.get("running_days", [])) >= 5:
            score += 0.05
        elif len(t.get("running_days", [])) <= 2:
            score -= 0.10

    if route.get("has_transfer", False):
        score -= 0.20

    return round(max(0.05, min(1.0, score)), 3)


def check_cargo_feasibility(cargo_type, weight_kg):
    """
    Check if cargo type/weight is allowed in passenger parcel vans.
    """
    constraint = CARGO_CONSTRAINTS.get(cargo_type, CARGO_CONSTRAINTS["General"])
    max_kg = constraint.get("max_kg_per_booking", 500)

    if max_kg == 0:
        return {
            "feasible": False,
            "reason": constraint.get("notes", "Not allowed on parcel trains"),
            "notes": constraint.get("notes", ""),
        }

    if weight_kg > max_kg:
        num_bookings = -(-int(weight_kg) // max_kg)
        return {
            "feasible": True,
            "reason": (f"{cargo_type} allows max {max_kg}kg per booking. "
                       f"Split into {num_bookings} bookings."),
            "notes": constraint.get("notes", ""),
            "split_bookings": num_bookings,
        }

    return {"feasible": True, "reason": "OK", "notes": constraint.get("notes", "")}


def engineer_features(routes, payload, weather_override=None):
    """
    Master feature engineering. Enriches route candidates with:
      - Parcel cost (from IR tariff formula)
      - Risk score (from REAL RailRadar delay data + OpenWeather)
      - Weather factor (from OpenWeather API)
      - Booking ease (from real running days data)
      - Cargo feasibility checks

    Args:
        routes: List of route dicts from route_finder
        payload: Cargo request dict
        weather_override: Optional dict to override weather API call (for simulation mode)

    Returns:
        List of enriched route dicts (only feasible ones)
    """
    weight = payload.get("cargo_weight_kg", 100)
    date_str = payload.get("departure_date", "2025-06-01")
    cargo_type = payload.get("cargo_type", "General")
    origin_city = payload.get("origin_city", "")

    feasibility = check_cargo_feasibility(cargo_type, weight)

    # ── Fetch weather data from OpenWeather API (once, not per route) ─
    if weather_override is not None:
        weather_data = weather_override
    else:
        try:
            from app.services.weather_service import get_weather
            weather_data = get_weather(origin_city) if origin_city else {"temp": 30, "rain": 0, "condition": "Clear"}
        except Exception as e:
            print(f"  [Engineer] Weather API failed: {e}")
            weather_data = {"temp": 30, "rain": 0, "condition": "Clear"}

    weather_factor, weather_risk = _compute_weather_factor(weather_data)

    enriched = []
    for route in routes:
        distance = route.get("total_distance_km", 0)
        if distance <= 0:
            continue

        # ── Fetch real delay data from RailRadar ──────────────────────
        real_delay = None
        for t in route.get("trains", []):
            train_no = t.get("train_no", "")
            if train_no and len(train_no) == 5:
                real_delay = get_real_delay_data(train_no)
                if real_delay:
                    break

        route["real_delay_data"] = real_delay

        # ── Determine tariff scale from train info ────────────────────
        first_train = route.get("trains", [{}])[0] if route.get("trains") else {}
        t_name = first_train.get("train_name", "")
        t_type = first_train.get("train_type", "")
        t_number = first_train.get("train_no", "")
        scale = determine_scale(t_name, t_type, t_number)

        # ── Calculate features (using official IRCA tariff tables) ────
        parcel_cost = calc_parcel_cost(
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
        risk = calc_risk_score(route, date_str, weather_data=weather_data)
        ease = calc_booking_ease(route)
        eff_duration = route.get("total_duration_hours", 0)

        # ── Apply weather factor to duration ──────────────────────────
        adjusted_duration = round(eff_duration * weather_factor, 2)

        # Van type heuristic (from train type)
        train_type_str = ""
        for t in route.get("trains", []):
            train_type_str += t.get("train_type", "").lower()
        van_type = "VPU" if "rajdhani" in train_type_str else "SLR"

        # Avg speed from real data
        avg_speed = 0
        for t in route.get("trains", []):
            s = t.get("avg_speed_kmph", 0) or 0
            if s > avg_speed:
                avg_speed = s

        enriched_route = {
            **route,
            "parcel_cost_inr": parcel_cost,
            "tariff_scale": scale,
            "tariff_breakdown": tariff_detail,
            "risk_score": risk,
            "booking_ease": ease,
            "effective_hours": eff_duration,
            "adjusted_duration_hours": adjusted_duration,
            "parcel_van_type": van_type,
            "cargo_feasible": feasibility["feasible"],
            "feasibility_note": feasibility["reason"],
            "cargo_type": cargo_type,
            "cargo_weight_kg": weight,
            "avg_speed_kmph": avg_speed,
            "real_delay_data": real_delay,
            # ── Weather fields (new) ──────────────────────────────────
            "weather_factor": weather_factor,
            "weather_risk": weather_risk,
            "weather_data": weather_data,
        }

        if feasibility["feasible"]:
            enriched.append(enriched_route)

    return enriched

