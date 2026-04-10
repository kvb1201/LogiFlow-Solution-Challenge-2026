from .config import FUEL_COST_PER_KM, DRIVER_COST_PER_HOUR


def engineer_routes(routes, payload):
    # Fetch ML + weather context once (avoid repeated calls)
    from app.services.weather_service import get_weather
    weather_data = get_weather(payload.get("origin_city")) or {
        "temperature": 30,
        "humidity": 50,
        "rain": 0
    }

    # Simulation / overrides
    simulation_mode = payload.get("simulation_mode", False)
    sim = payload.get("simulation", {}) if simulation_mode else {}
    cost_override = sim.get("cost_components", {}) if simulation_mode else {}

    enriched = []

    for r in routes:
        raw_traffic = r.get("traffic_level")

        if raw_traffic is None:
            raise Exception("traffic_level missing in route_provider output")

        traffic = min(max(float(raw_traffic), 0), 1)
        if simulation_mode and sim.get("traffic_level") is not None:
            sim_traffic = min(max(float(sim.get("traffic_level")), 0), 1)
            traffic = 0.5 * traffic + 0.5 * sim_traffic
        print("DEBUG traffic_level →", traffic)
        highway_ratio = min(max(r.get("highway_ratio", 1), 0), 1)
        raw_weather = r.get("weather_impact")
        weather = min(max(raw_weather if raw_weather is not None else 0, 0), 1)

        if simulation_mode and sim.get("weather_level") is not None:
            weather_level = float(sim.get("weather_level"))
            weather = 0.5 * weather + 0.5 * weather_level

        road_quality = min(max(r.get("road_quality", 1), 0), 1)
        num_stops = max(r.get("num_stops", 0), 0)

        # --- TIME ---
        from app.services.ml_service import predict_delay

        base_time = r["base_duration_hr"]

        # ML-based delay prediction
        adjusted_time, traffic_factor, weather_factor = predict_delay(
            max(base_time, 0),
            weather_data,
            traffic=0 if traffic < 0.35 else 1 if traffic < 0.6 else 2,
            traffic_level=traffic
        )

        # Safety: ensure traffic_factor reflects traffic_level
        if traffic_factor == 1.0 and traffic > 0:
            traffic_factor = 1 + traffic

        # Guard against ML returning None
        if traffic_factor is None:
            raise Exception("ML did not return traffic_factor")
        if weather_factor is None:
            weather_factor = 1.0

        effective_time = max(adjusted_time if adjusted_time is not None else base_time, 0)

        # Apply simulation effects (weather + incidents)
        if simulation_mode:
            weather_level = float(sim.get("weather_level", 0))
            incident_count_sim = int(sim.get("incident_count", 0))

            weather_factor_sim = 1 + weather_level * 0.5
            incident_delay = incident_count_sim * 0.2

            effective_time = effective_time * weather_factor_sim + incident_delay

        # Add slight traffic influence to differentiate routes
        effective_time += traffic * 0.5

        # --- COST ---
        fuel_cost = r.get("distance_km", 0) * FUEL_COST_PER_KM
        driver_cost = effective_time * DRIVER_COST_PER_HOUR
        weight_cost = payload.get("cargo_weight_kg", 100) * 2
        stop_cost = num_stops * 100

        # Optional fuel price scaling
        if simulation_mode and sim.get("fuel_price") is not None:
            fuel_factor = float(sim.get("fuel_price")) / 100.0
            fuel_cost *= fuel_factor

        base_cost = fuel_cost + driver_cost + r.get("toll_cost", 0) + weight_cost + stop_cost

        # Apply user cost component overrides (absolute additions)
        if simulation_mode and cost_override:
            base = base_cost
            fuel_extra = cost_override.get("fuel", 0)
            handling = cost_override.get("handling", 0)
            toll_extra = cost_override.get("toll", 0)
            misc = cost_override.get("misc", 0)
            total_cost = base + fuel_extra + handling + toll_extra + misc
        else:
            total_cost = base_cost

        # --- RISK ---
        delay = max(effective_time - base_time, 0)
        delay_ratio = delay / max(base_time, 1e-3)

        incident_count = r.get("incident_count", 0)
        if simulation_mode and sim.get("incident_count") is not None:
            incident_count = int(sim.get("incident_count"))

        # Incident penalty (capped to avoid extreme spikes)
        incident_penalty = min(incident_count * 0.03, 0.3)

        risk = (
            traffic * 0.4 +
            (1 - highway_ratio) * 0.2 +
            min(1.0, delay_ratio) * 0.25 +
            incident_penalty
        )

        risk = min(max(risk, 0), 1)

        booking_ease = 1 - (traffic * 0.6 + (1 - highway_ratio) * 0.4)
        booking_ease = min(max(booking_ease, 0), 1)

        enriched.append({
            "route_id": r["route_id"],
            "effective_hours": round(effective_time, 2),
            "parcel_cost_inr": int(total_cost),
            "cost_components_user": cost_override if simulation_mode else None,
            "simulation": simulation_mode,
            "risk_score": round(risk, 3),
            "traffic_factor": round(traffic_factor, 2),
            "weather_factor": round(weather_factor, 2),
            "predicted_delay": round(max(effective_time - base_time, 0), 2),
            "booking_ease": round(booking_ease, 2),
            # Debug/analysis fields
            "distance_km": round(r["distance_km"], 2),
            "traffic_level": traffic,
            "weather_impact": weather,
            "num_stops": num_stops,
            "road_quality": road_quality,
            "base_duration_hr": round(r["base_duration_hr"], 2),
            "base_duration_minutes": int(r["base_duration_hr"] * 60),

            # NOTE: If strategies modify "effective_hours" later, recompute duration_minutes from it
            "segments": [
                {
                    "mode": "Road",
                    "from_name": payload.get("origin_city", "Unknown"),
                    "to_name": payload.get("destination_city", "Unknown"),
                    "distance_km": round(r["distance_km"], 2),
                    "duration_minutes": int(max(effective_time, 0) * 60)
                }
            ]
        })

    return enriched