"""
Multi-objective decision engine for the Railway Cargo Pipeline.
Produces three primary recommendations (cheapest, fastest, safest)
and a balanced composite ranking of all feasible options.
"""


def _normalize(values):
    """Min-max normalize a list of values to 0-1 range."""
    if not values:
        return []
    lo = min(values)
    hi = max(values)
    if hi == lo:
        return [0.5] * len(values)
    return [(v - lo) / (hi - lo) for v in values]


def _build_recommendation(route, priority, reason):
    """Build a structured recommendation dict from a route."""
    first_train = route["trains"][0] if route.get("trains") else {}

    # Real delay data from RailRadar API
    real_delay = route.get("real_delay_data")
    delay_info = {}
    if real_delay:
        delay_info = {
            "avg_delay_minutes": real_delay.get("avg_arrival_delay_min", 0),
            "max_delay_minutes": real_delay.get("max_delay_min", 0),
            "stations_measured": real_delay.get("num_stations_measured", 0),
            "delay_data_source": "railradar_api_real",
        }
    else:
        delay_info = {
            "avg_delay_minutes": route.get("predicted_delay_min", 0),
            "delay_data_source": "ml_prediction",
        }

    rec = {
        "priority": priority,
        "reason": reason,
        "route_type": route.get("route_type", "direct"),
        "train_number": first_train.get("train_no", ""),
        "train_name": first_train.get("train_name", ""),
        "train_type": first_train.get("train_type", ""),
        "departure": first_train.get("departure_time", ""),
        "arrival": route["trains"][-1].get("arrival_time", "") if route.get("trains") else "",
        "duration_hours": round(route.get("effective_hours", route.get("total_duration_hours", 0)), 1),
        "parcel_cost_inr": round(route.get("parcel_cost_inr", 0), 0),
        "risk_score": route.get("risk_score", 0),
        "risk_pct": f"{route.get('risk_score', 0) * 100:.0f}%",
        "booking_ease": route.get("booking_ease", 0.5),
        "parcel_van_type": route.get("parcel_van_type", "SLR"),
        "has_transfer": route.get("has_transfer", False),
        "transfer_details": route.get("transfer_details", []),
        "distance_km": route.get("total_distance_km", 0),
        "avg_speed_kmph": route.get("avg_speed_kmph", 0),
        "running_days": first_train.get("running_days", []),
        "segments": route.get("segments", []),
        "delay_info": delay_info,
        "predicted_delay_min": round(route.get("predicted_delay_min", 0), 1),
        "adjusted_duration_hours": round(route.get("adjusted_duration_hours", route.get("effective_hours", 0)), 1),
        "tariff_scale": route.get("tariff_scale", "S"),
        "tariff_breakdown": route.get("tariff_breakdown", {}),
        "data_source": route.get("data_source", "unknown"),
        # Weather fields (from OpenWeather integration)
        "weather_factor": route.get("weather_factor", 1.0),
        "weather_risk": route.get("weather_risk", 0.0),
        "weather_data": route.get("weather_data"),
    }
    return rec


def decide(enriched_routes, payload):
    """
    Core decision engine.

    Args:
        enriched_routes: List of routes with engineered features
        payload: Original cargo request dict

    Returns:
        dict with:
          - cheapest: best cost recommendation
          - fastest: quickest arrival recommendation
          - safest: lowest risk recommendation
          - all_options: full ranked list with composite scores
          - constraints_applied: summary of applied filters
          - model_info: ML model details
    """
    if not enriched_routes:
        return {"error": "No feasible routes found for this cargo configuration."}

    budget = payload.get("budget_max_inr", float("inf"))
    deadline = payload.get("deadline_hours", float("inf"))

    # ── Apply hard constraints ────────────────────────────────────────
    filtered = [
        r for r in enriched_routes
        if r.get("parcel_cost_inr", 0) <= budget
        and r.get("effective_hours", 0) <= deadline
    ]

    if not filtered:
        print(f"  [Engine] No routes meet budget ({budget}) and deadline ({deadline}h). "
              f"Showing best available.")
        filtered = enriched_routes[:]

    # ── Cheapest ──────────────────────────────────────────────────────
    cheapest_route = min(filtered, key=lambda r: r.get("parcel_cost_inr", float("inf")))
    cheapest = _build_recommendation(
        cheapest_route, "cheapest",
        f"Lowest parcel cost: ₹{cheapest_route.get('parcel_cost_inr', 0):.0f}"
    )

    # ── Fastest ───────────────────────────────────────────────────────
    fastest_route = min(filtered, key=lambda r: r.get("effective_hours", float("inf")))
    fastest = _build_recommendation(
        fastest_route, "fastest",
        f"Arrives in {fastest_route.get('effective_hours', 0):.1f} hrs "
        f"(incl. any transfer waits)"
    )

    # ── Safest ────────────────────────────────────────────────────────
    safest_route = min(filtered, key=lambda r: r.get("risk_score", float("inf")))
    safest = _build_recommendation(
        safest_route, "safest",
        f"Lowest risk ({safest_route.get('risk_score', 0) * 100:.0f}%), "
        f"{safest_route.get('punctuality_pct', 0):.0f}% on-time"
    )

    # ── Balanced composite scoring ────────────────────────────────────
    costs = [r.get("parcel_cost_inr", 0) for r in filtered]
    times = [r.get("effective_hours", 0) for r in filtered]
    risks = [r.get("risk_score", 0) for r in filtered]
    eases = [1 - r.get("booking_ease", 0.5) for r in filtered]  # flip: lower = better

    norm_costs = _normalize(costs)
    norm_times = _normalize(times)
    norm_risks = _normalize(risks)
    norm_eases = _normalize(eases)

    # Priority weighting
    priority = payload.get("priority", "cost").lower()
    if priority in ("cost", "cheap", "cheapest"):
        weights = (0.45, 0.20, 0.20, 0.15)
    elif priority in ("time", "fast", "fastest", "speed"):
        weights = (0.20, 0.45, 0.20, 0.15)
    elif priority in ("safe", "safety", "safest", "reliable"):
        weights = (0.15, 0.20, 0.45, 0.20)
    else:
        weights = (0.35, 0.30, 0.20, 0.15)  # balanced

    w_cost, w_time, w_risk, w_ease = weights

    all_options = []
    for i, r in enumerate(filtered):
        total_score = (
            w_cost * norm_costs[i] +
            w_time * norm_times[i] +
            w_risk * norm_risks[i] +
            w_ease * norm_eases[i]
        )

        first_train = r["trains"][0] if r.get("trains") else {}
        real_delay = r.get("real_delay_data")
        avg_delay = real_delay.get("avg_arrival_delay_min", 0) if real_delay else r.get("predicted_delay_min", 0)

        # ── Generating Proper Reasoning ───────────────────────────────────
        reasoning = []
        if w_cost > 0.3 and norm_costs[i] <= 0.2:
            reasoning.append(f"Highly cost-effective (₹{r.get('parcel_cost_inr', 0):.0f}) matching budget priority")
        if w_time > 0.3 and norm_times[i] <= 0.2:
            reasoning.append(f"Provides extremely fast transit ({r.get('effective_hours', 0):.1f}h) matching time priority")
        if w_risk > 0.3 and norm_risks[i] <= 0.2:
            reasoning.append(f"Offers optimal safety for physical cargo ({r.get('risk_score', 0)*100:.0f}% risk)")
            
        if not reasoning:
            if norm_costs[i] < 0.3 and norm_times[i] < 0.3:
                reasoning.append("Provides robust balance of speed and affordability")
            elif norm_risks[i] < 0.2 and norm_eases[i] < 0.2:
                reasoning.append("Highly reliable schedule with minimal booking delays")
            elif norm_eases[i] < 0.1:
                reasoning.append("Selected for its high booking availability context")
            else:
                reasoning.append("Meets standard cargo transport requirements")
                
        final_reason = " • ".join(reasoning)

        all_options.append({
            "rank": 0,
            "selection_reason": final_reason,
            "train_number": first_train.get("train_no", ""),
            "train_name": first_train.get("train_name", ""),
            "train_type": first_train.get("train_type", ""),
            "route_type": r.get("route_type", "direct"),
            "parcel_cost_inr": round(r.get("parcel_cost_inr", 0), 0),
            "effective_hours": round(r.get("effective_hours", 0), 1),
            "risk_score": r.get("risk_score", 0),
            "booking_ease": r.get("booking_ease", 0.5),
            "has_transfer": r.get("has_transfer", False),
            "total_score": round(total_score, 4),
            "distance_km": r.get("total_distance_km", 0),
            "avg_speed_kmph": r.get("avg_speed_kmph", 0),
            "avg_delay_min": round(avg_delay, 1),
            "delay_source": "railradar_api" if real_delay else "ml_prediction",
            "running_days": first_train.get("running_days", []),
            "segments": r.get("segments", []),
            "tariff_scale": r.get("tariff_scale", "S"),
            "data_source": r.get("data_source", "unknown"),
            "weather_factor": r.get("weather_factor", 1.0),
            "weather_risk": r.get("weather_risk", 0.0),
        })

    all_options.sort(key=lambda x: x["total_score"])
    for i, opt in enumerate(all_options):
        opt["rank"] = i + 1

    return {
        "cheapest": cheapest,
        "fastest": fastest,
        "safest": safest,
        "all_options": all_options,
        "constraints_applied": {
            "budget_inr": budget if budget != float("inf") else None,
            "deadline_hours": deadline if deadline != float("inf") else None,
            "routes_before_filter": len(enriched_routes),
            "routes_after_filter": len(filtered),
            "priority": priority,
            "weights": {
                "cost": w_cost,
                "time": w_time,
                "risk": w_risk,
                "ease": w_ease,
            },
        },
    }
