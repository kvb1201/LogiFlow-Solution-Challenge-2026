import random

from app.pipelines.base import BasePipeline


class RoadPipeline(BasePipeline):
    mode = "road"
    name = "Road Transport"

    # --- STEP 1: Simulate routes ---
    def _get_routes(self, source, destination, payload):
        """
        Route provider abstraction.
        STRICT: Only uses real provider. No simulation fallback.
        """
        from app.pipelines.road.route_provider import get_routes

        routes = get_routes(source, destination, payload)

        if not routes or not isinstance(routes, list):
            raise Exception("Route provider returned no valid routes")

        return routes

    # --- STEP 2: Feature Engineering ---
    def _engineer(self, routes, source, destination, payload):
        enriched = []
        from app.services.ml_service import predict_delay
        from app.services.weather_service import get_weather
        weight = payload.get("cargo_weight_kg", 100)

        for route_idx, r in enumerate(routes):
            # Base time
            base_time = r["base_duration_hr"]

            distance = float(r.get("distance_km", 0))
            base_traffic = float(r.get("traffic_level", 0.3))

            # Add variation based on route characteristics
            traffic_variation = (distance % 50) / 200   # small variation
            traffic_level = min(1.0, max(0.2, base_traffic + traffic_variation))

            # Convert traffic_level → categorical (0/1/2)
            if traffic_level < 0.4:
                traffic_cat = 0
            elif traffic_level < 0.7:
                traffic_cat = 1
            else:
                traffic_cat = 2

            weather = get_weather(source) or {}
            # Basic guard to ensure dict shape
            if not isinstance(weather, dict):
                weather = {}

            # Inject synthetic variation if API returns flat data
            temp = weather.get("temp", 30)
            rain = weather.get("rain", 0)
            distance_factor = (distance % 100) / 100
            weather = {
                "temp": temp + (distance_factor * 3 - 1.5),   # ±1.5°C variation
                "rain": rain + (distance_factor * 0.5)        # slight rain variation
            }

            # ML input diversity
            utilization = 30 + traffic_level * 70 + (distance % 30)
            demand = 30 + traffic_level * 60 + (distance % 20)

            # ML-based delay prediction (with dynamic features)
            print("ML INPUT:", traffic_cat, utilization, demand)
            adjusted_time, traffic_f, weather_f = predict_delay(
                base_time,
                weather,
                utilization=utilization,
                demand=demand,
                traffic=traffic_cat,
                traffic_level=traffic_level,
            )
            print("ML OUTPUT:", traffic_f, weather_f)
            print("ROUTE DEBUG:",
                  "dist=", distance,
                  "traffic=", traffic_level,
                  "util=", utilization,
                  "demand=", demand)

            effective_time = adjusted_time

            distance_km = float(r.get("distance_km", 0))

            # Freight-style logistics pricing (deterministic per route alternative)
            seed = (route_idx * 1_000_003 + int(distance_km * 1_000) * 7_919 + int(weight)) % (2**32)
            rng = random.Random(seed)
            rate_per_km_per_ton = 8 + rng.random() * 4  # ₹/km/ton, 8–12
            tons = max(float(weight), 0) / 1000.0
            freight = distance_km * rate_per_km_per_ton * tons
            toll = distance_km * 0.8
            handling = 200 + rng.random() * 200
            gst = 0.05 * freight
            documentation = 100 + rng.random() * 100
            total_cost = freight + toll + handling + gst + documentation
            cost_low = total_cost * 0.9
            cost_high = total_cost * 1.2

            # Risk based on predicted delay (more realistic)
            delay = max(effective_time - base_time, 0)
            delay_prob = delay / max(base_time, 1e-3)
            risk = (
                0.15 +
                delay_prob * 0.5 +
                traffic_level * 0.25 +
                (1 - float(r.get("highway_ratio", 0.7))) * 0.2
            )

            # Clamp
            risk = max(0, min(1, risk))

            route_out = {
                "type": "Road",
                "mode": "road",
                "time": round(effective_time, 2),
                "cost": int(round(total_cost)),
                "cost_range": {
                    "low": int(round(cost_low)),
                    "high": int(round(cost_high)),
                },
                "cost_breakdown": {
                    "freight": int(round(freight)),
                    "toll": int(round(toll)),
                    "handling": int(round(handling)),
                    "gst": int(round(gst)),
                    "documentation": int(round(documentation)),
                },
                "risk": round(risk, 3),
                "distance_km": round(float(r.get("distance_km", 0)), 1),
                "geometry": r.get("geometry"),
                "segments": [
                    {
                        "mode": "Road",
                        "from": source,
                        "to": destination,
                        "distance_km": r["distance_km"],
                        "duration_minutes": int(max(effective_time, 0) * 60)
                    }
                ],
                "traffic_factor": round(traffic_f, 3),
                "weather_factor": round(weather_f, 3),
                "predicted_delay": round(max(effective_time - base_time, 0), 2),
                "traffic_level": traffic_level,
                "highway_ratio": float(r.get("highway_ratio", 0.7)),
            }
            print("FINAL ROUTE:",
                  route_out["distance_km"],
                  route_out["risk"],
                  route_out["traffic_factor"],
                  route_out["predicted_delay"])
            enriched.append(route_out)

        return enriched

    # --- STEP 2.5: Constraints Filtering ---
    def _apply_constraints(self, routes, payload):
        budget = payload.get("budget")
        deadline = payload.get("deadline_hours")

        # Do NOT filter out routes; instead attach penalty scores
        penalized = []
        for r in routes:
            penalty = 0.0

            if budget is not None and r["cost"] > budget:
                penalty += (r["cost"] - budget) / max(budget, 1)

            if deadline is not None and r["time"] > deadline:
                penalty += (r["time"] - deadline) / max(deadline, 1)

            r_copy = r.copy()
            r_copy["constraint_penalty"] = round(penalty, 4)
            penalized.append(r_copy)

        return penalized

    # --- STEP 3: Decision Engine ---
    def _score_routes(self, routes, priority="balanced"):
        max_time = max(r["time"] for r in routes) or 1
        max_cost = max(r["cost"] for r in routes) or 1
        max_risk = max(r["risk"] for r in routes) or 1
        max_penalty = max(r.get("constraint_penalty", 0) for r in routes)
        if max_penalty == 0:
            max_penalty = 1

        for r in routes:
            r["norm_time"] = r["time"] / max_time
            r["norm_cost"] = r["cost"] / max_cost
            r["norm_risk"] = r["risk"] / max_risk
            r["norm_penalty"] = r.get("constraint_penalty", 0) / max_penalty

        if priority == "cost":
            weights = {"cost": 0.45, "time": 0.2, "risk": 0.2, "penalty": 0.15}
        elif priority == "time":
            weights = {"cost": 0.2, "time": 0.45, "risk": 0.2, "penalty": 0.15}
        else:
            weights = {"cost": 0.35, "time": 0.25, "risk": 0.25, "penalty": 0.15}

        for r in routes:
            r["score"] = (
                r["norm_cost"] * weights["cost"] +
                r["norm_time"] * weights["time"] +
                r["norm_risk"] * weights["risk"] +
                r["norm_penalty"] * weights["penalty"]
            )

        return sorted(routes, key=lambda x: x["score"])

    # --- STEP 3: Pipeline Entry ---
    def generate(self, source: str, destination: str, payload=None):
        payload = payload or {}
        priority = payload.get("priority", "balanced")

        routes = self._get_routes(source, destination, payload)
        enriched = self._engineer(routes, source, destination, payload)

        # 🚫 Removed fallback strategy block

        filtered = self._apply_constraints(enriched, payload)

        def _clean(route):
            route = route.copy()
            route.pop("norm_time", None)
            route.pop("norm_cost", None)
            route.pop("norm_risk", None)
            route.pop("score", None)
            route.pop("norm_penalty", None)
            route.pop("constraint_penalty", None)
            return route

        ranked = self._score_routes(filtered, priority)

        if len(ranked) == 1:
            cheapest = fastest = safest = None
        else:
            cheapest = _clean(min(ranked, key=lambda x: x["cost"]))
            fastest = _clean(min(ranked, key=lambda x: x["time"]))
            safest = _clean(min(ranked, key=lambda x: x["risk"]))

        cleaned_ranked = [_clean(r) for r in ranked]

        def _priority_factor():
            if priority == "cost":
                return "Optimized for cost efficiency"
            if priority == "time":
                return "Optimized for fastest delivery"
            if priority == "safe":
                return "Optimized for safety"
            return None

        def _ml_summary(route):
            # Prefer ML output, fallback to route traffic_level if ML gives default
            traffic_f = route.get("traffic_factor")
            if traffic_f is None or float(traffic_f) == 1.0:
                # fallback to normalized traffic_level → convert to factor
                tl = float(route.get("traffic_level", 0.3))
                traffic_f = 1 + tl
            else:
                traffic_f = float(traffic_f)

            weather_f = float(route.get("weather_factor", 1.0))
            delay = float(route.get("predicted_delay", 0.0))

            if traffic_f > 1.3:
                traffic = "high"
            elif traffic_f > 1.1:
                traffic = "moderate"
            else:
                traffic = "low"

            if weather_f > 1.2:
                weather = "bad"
            elif weather_f > 1.0:
                weather = "moderate"
            else:
                weather = "good"

            return {
                "traffic": traffic,
                "weather": weather,
                "delay_hours": round(delay, 2),
            }

        def _common_context(route):
            factors = []
            budget = payload.get("budget")
            deadline = payload.get("deadline_hours")
            if budget is not None and route["cost"] <= budget:
                factors.append("Within budget constraint")
            if deadline is not None and route["time"] <= deadline:
                factors.append("Meets delivery deadline")
            factors.append(f"Estimated risk level: {int(route['risk'] * 100)}%")

            delay = float(route.get("predicted_delay", 0.0))
            if delay > 2.0:
                factors.append(f"Significant delay expected (~{delay:.1f} hrs)")
            elif delay > 1.0:
                factors.append(f"Moderate delay expected (~{delay:.1f} hrs)")
            elif delay >= 0.3:
                factors.append(f"Minor delay expected (~{delay:.1f} hrs)")
            else:
                factors.append("Minimal delay expected")

            traffic_f = route.get("traffic_factor")
            if traffic_f is None or float(traffic_f) == 1.0:
                tl = float(route.get("traffic_level", 0.3))
                traffic_f = 1 + tl
            else:
                traffic_f = float(traffic_f)
            if traffic_f > 1.4:
                factors.append("Severe congestion expected")
            elif traffic_f > 1.25:
                factors.append("Heavy traffic expected")
            elif traffic_f > 1.1:
                factors.append("Moderate traffic conditions")
            else:
                factors.append("Low traffic expected")

            weather_f = float(route.get("weather_factor", 1.0))
            if weather_f > 1.2:
                factors.append("Adverse weather may impact travel time")
            elif weather_f > 1.0:
                factors.append("Moderate weather impact")
            else:
                factors.append("Favorable weather conditions")

            highway_ratio = float(route.get("highway_ratio", 0.7))
            if highway_ratio < 0.5:
                factors.append("Route includes more local roads (potential variability)")
            elif highway_ratio > 0.7:
                factors.append("Highway-dominated route (more stable travel)")

            return factors

        def _explain(route, label="best"):
            factors = []
            seen = set()

            def add_factor(text: str):
                if text and text not in seen:
                    seen.add(text)
                    factors.append(text)

            if label == "best":
                pf = _priority_factor()
                if pf:
                    add_factor(pf)
                if len(cleaned_ranked) > 1:
                    alt = cleaned_ranked[1]
                    cost_diff = alt["cost"] - route["cost"]
                    time_diff = alt["time"] - route["time"]
                    delay_diff = float(alt.get("predicted_delay", 0.0)) - float(route.get("predicted_delay", 0.0))
                    parts = []
                    if cost_diff > 0:
                        parts.append(f"₹{int(cost_diff)} cheaper")
                    if time_diff > 0.1:
                        parts.append(f"{time_diff:.1f} hrs faster")
                    if delay_diff > 0.1:
                        parts.append(f"{delay_diff:.1f} hrs lower expected delay")
                    if parts:
                        add_factor(", ".join(parts) + " than next best route")
                    if route["risk"] < alt["risk"] and time_diff < 0:
                        add_factor("Slightly slower but significantly safer than next best route")

                # Distance-based insight
                if float(route.get("distance_km", 0)) > 1500:
                    add_factor("Long-distance route (higher fatigue & variability)")
                elif float(route.get("distance_km", 0)) < 800:
                    add_factor("Shorter route with quicker turnaround")

                # Highway insight
                if float(route.get("highway_ratio", 0.7)) > 0.75:
                    add_factor("Mostly highway route (more predictable timing)")
                elif float(route.get("highway_ratio", 0.7)) < 0.5:
                    add_factor("Includes local roads (possible delays)")

                add_factor(f"Selected among {len(cleaned_ranked)} feasible routes")
            else:
                add_factor("Alternative feasible route")

            for f in _common_context(route):
                add_factor(f)

            ml_s = _ml_summary(route)

            return {
                **route,
                "reason": factors[0] if factors else "Alternative feasible route",
                "key_factors": factors,
                "ml_summary": ml_s,
            }

        explained_ranked = [
            _explain(r, "best" if i == 0 else "alternative")
            for i, r in enumerate(cleaned_ranked)
        ]

        return {
            "best": _explain(cleaned_ranked[0], "best"),
            "cheapest": _explain(cheapest, "cheapest") if cheapest else None,
            "fastest": _explain(fastest, "fastest") if fastest else None,
            "safest": _explain(safest, "safest") if safest else None,
            "alternatives": [_explain(r, "alternative") for r in cleaned_ranked[1:]],
            "has_alternatives": len(cleaned_ranked) > 1,
            "all": explained_ranked,
            "constraints_applied": {
                "budget": payload.get("budget"),
                "deadline_hours": payload.get("deadline_hours"),
                "routes_before": len(enriched),
                "routes_after": len(filtered),
                "note": "Only one route satisfied constraints" if len(filtered) == 1 else None
            }
        }
