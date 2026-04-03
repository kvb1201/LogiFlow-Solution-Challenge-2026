from .config import FUEL_COST_PER_KM, DRIVER_COST_PER_HOUR


def engineer_routes(routes, payload):
    enriched = []

    for r in routes:
        traffic = min(max(r.get("traffic_level", 0), 0), 1)
        highway_ratio = min(max(r.get("highway_ratio", 1), 0), 1)
        weather = min(max(r.get("weather_impact", 0), 0), 1)
        road_quality = min(max(r.get("road_quality", 1), 0), 1)
        num_stops = max(r.get("num_stops", 0), 0)

        # --- TIME ---
        effective_time = r["base_duration_hr"] * (
            1
            + traffic
            + weather
            + (num_stops * 0.05)
        )
        effective_time = max(effective_time, 0)

        # --- COST ---
        fuel_cost = r["distance_km"] * FUEL_COST_PER_KM
        driver_cost = effective_time * DRIVER_COST_PER_HOUR
        weight_cost = payload.get("cargo_weight_kg", 100) * 2
        stop_cost = num_stops * 100

        total_cost = fuel_cost + driver_cost + r["toll_cost"] + weight_cost + stop_cost
        total_cost = max(total_cost, 0)

        # --- RISK ---
        risk = (
            traffic * 0.35 +
            (1 - highway_ratio) * 0.15 +
            weather * 0.2 +
            (num_stops / 5) * 0.1 +
            (1 - road_quality) * 0.15 +
            (0.05 if r.get("night_travel") else 0)
        )
        risk = min(max(risk, 0), 1)

        booking_ease = (
            1
            - traffic * 0.6
            - weather * 0.2
            - (num_stops * 0.05)
        )
        booking_ease = min(max(booking_ease, 0), 1)

        enriched.append({
            "route_id": r["route_id"],
            "effective_hours": round(effective_time, 2),
            "parcel_cost_inr": int(total_cost),
            "risk_score": round(risk, 3),
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
                    "from_name": payload["origin_city"],
                    "to_name": payload["destination_city"],
                    "distance_km": round(r["distance_km"], 2),
                    "duration_minutes": int(max(effective_time, 0) * 60)
                }
            ]
        })

    return enriched