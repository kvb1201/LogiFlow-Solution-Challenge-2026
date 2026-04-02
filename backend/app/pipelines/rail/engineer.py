"""
Cargo-specific feature engineering for the Railway Decision Engine.
Uses REAL data from RailRadar API for delay/risk calculations.
Cost uses published Indian Railways parcel tariff formula.
"""

from datetime import datetime
from app.pipelines.rail.config import (
    PARCEL_RATE_TIERS,
    RISK_MULTIPLIERS,
    CARGO_CONSTRAINTS,
)


def calc_parcel_cost(distance_km, weight_kg):
    """
    Calculate Indian Railways parcel cost.
    Based on published IR parcel tariff (slab-based pricing):
      cost = (rate_per_km × distance / 100) + (per_kg_charge × weight)

    Source: Indian Railways Parcel Directorate rate schedule.
    Calibrated: 300kg, 1384km (Mumbai→Delhi) ≈ ₹8,900

    Args:
        distance_km: Route distance in kilometers
        weight_kg: Cargo weight in kilograms

    Returns:
        Total parcel cost in INR (rupees)
    """
    tier = next(
        (t for t in PARCEL_RATE_TIERS if weight_kg <= t["max_kg"]),
        PARCEL_RATE_TIERS[-1]
    )
    distance_charge = (distance_km * tier["rate_per_km_paise"]) / 100
    weight_charge = weight_kg * tier["per_kg_charge"]
    raw_cost = distance_charge + weight_charge
    return round(max(raw_cost, tier["min_charge_rs"]), 2)


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


def calc_risk_score(route, departure_date_str="2025-06-01"):
    """
    Composite risk score from 0.0 (safe) to 1.0 (risky).
    USES REAL DELAY DATA from RailRadar where available.

    Components:
      - Real average delay data (from API) → 40% weight
      - Seasonal risk (monsoon/fog/festival) → 25% weight
      - Transfer penalty → 20% weight
      - Train type reliability → 15% weight

    Args:
        route: Route dict with trains list and real_delay_data
        departure_date_str: ISO date string

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

    # Weighted composite
    total = (
        delay_risk * 0.40 +
        seasonal_risk * 0.25 +
        transfer_risk * 0.20 +
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


def engineer_features(routes, payload):
    """
    Master feature engineering. Enriches route candidates with:
      - Parcel cost (from IR tariff formula)
      - Risk score (from REAL RailRadar delay data)
      - Booking ease (from real running days data)
      - Cargo feasibility checks

    Args:
        routes: List of route dicts from route_finder
        payload: Cargo request dict

    Returns:
        List of enriched route dicts (only feasible ones)
    """
    weight = payload.get("cargo_weight_kg", 100)
    date_str = payload.get("departure_date", "2025-06-01")
    cargo_type = payload.get("cargo_type", "General")

    feasibility = check_cargo_feasibility(cargo_type, weight)

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

        # ── Calculate features ────────────────────────────────────────
        parcel_cost = calc_parcel_cost(distance, weight)
        risk = calc_risk_score(route, date_str)
        ease = calc_booking_ease(route)
        eff_duration = route.get("total_duration_hours", 0)

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
            "risk_score": risk,
            "booking_ease": ease,
            "effective_hours": eff_duration,
            "parcel_van_type": van_type,
            "cargo_feasible": feasibility["feasible"],
            "feasibility_note": feasibility["reason"],
            "cargo_type": cargo_type,
            "cargo_weight_kg": weight,
            "avg_speed_kmph": avg_speed,
            "real_delay_data": real_delay,
        }

        if feasibility["feasible"]:
            enriched.append(enriched_route)

    return enriched
