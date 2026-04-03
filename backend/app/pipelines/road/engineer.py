from .config import FUEL_COST_PER_KM, DRIVER_COST_PER_HOUR


def engineer_routes(routes, payload):
    # Fetch ML + weather context once (avoid repeated calls)
    from app.services.weather_service import get_weather
    weather_data = get_weather(payload.get("origin_city")) or {}

    enriched = []

    for r in routes:
        raw_traffic = r.get("traffic_level")
        traffic = min(max(raw_traffic if raw_traffic is not None else 0, 0), 1)
        highway_ratio = min(max(r.get("highway_ratio", 1), 0), 1)
        raw_weather = r.get("weather_impact")
        weather = min(max(raw_weather if raw_weather is not None else 0, 0), 1)
        road_quality = min(max(r.get("road_quality", 1), 0), 1)
        num_stops = max(r.get("num_stops", 0), 0)

        # --- TIME ---
        from app.services.ml_service import predict_delay

        base_time = r["base_duration_hr"]

        # ML-based delay prediction
        adjusted_time, traffic_factor, weather_factor = predict_delay(
            max(base_time, 0),
            weather_data
        )

        # Guard against ML returning None
        if traffic_factor is None:
            traffic_factor = 1.0
        if weather_factor is None:
            weather_factor = 1.0

        effective_time = max(adjusted_time if adjusted_time is not None else base_time, 0)

        # --- COST ---
        fuel_cost = r.get("distance_km", 0) * FUEL_COST_PER_KM
        driver_cost = effective_time * DRIVER_COST_PER_HOUR
        weight_cost = payload.get("cargo_weight_kg", 100) * 2
        stop_cost = num_stops * 100

        total_cost = fuel_cost + driver_cost + r.get("toll_cost", 0) + weight_cost + stop_cost
        total_cost = max(total_cost, 0)

        # --- RISK ---
        risk = (
            (traffic_factor - 1) * 0.5 +
            (weather_factor - 1) * 0.3 +
            (1 - float(highway_ratio)) * 0.2
        )
        risk = min(max(risk, 0), 1)

        booking_ease = (
            1
            - (traffic_factor - 1) * 0.6
            - (weather_factor - 1) * 0.2
        )
        booking_ease = min(max(booking_ease, 0), 1)

        enriched.append({
            "route_id": r["route_id"],
            "effective_hours": round(effective_time, 2),
            "parcel_cost_inr": int(total_cost),
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