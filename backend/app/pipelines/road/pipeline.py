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

        for r in routes:
            # Base time
            base_time = r["base_duration_hr"]

            # Fetch weather
            weather = get_weather(source) or {}
            # Basic guard to ensure dict shape
            if not isinstance(weather, dict):
                weather = {}

            # Derive dynamic ML features
            utilization = payload.get("cargo_weight_kg", 100) / 2
            demand = max(len(routes) * 10, 10)

            # ML-based delay prediction (with dynamic features)
            adjusted_time, traffic_f, weather_f = predict_delay(
                base_time,
                weather,
                utilization=utilization,
                demand=demand
            )

            effective_time = adjusted_time

            # Cost
            fuel_cost = r.get("distance_km", 0) * 6
            driver_cost = max(effective_time, 0) * 200
            weight_cost = weight * 2
            total_cost = fuel_cost + driver_cost + r.get("toll_cost", 0) + weight_cost

            # Risk (ML-based only, no legacy signals)
            risk = (
                (traffic_f - 1) * 0.5 +
                (weather_f - 1) * 0.3 +
                (1 - float(r.get("highway_ratio", 1))) * 0.2
            )

            # Clamp
            risk = max(0, min(1, risk))

            enriched.append({
                "type": "Road",
                "mode": "road",
                "time": round(effective_time, 2),
                "cost": int(total_cost),
                "risk": round(risk, 3),
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
            })

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
            traffic_f = float(route.get("traffic_factor", 1.0))
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
            if delay > 1.0:
                factors.append(f"Significant delay expected (~{delay:.1f} hrs)")
            elif 0.3 <= delay <= 1.0:
                factors.append(f"Minor delay expected (~{delay:.1f} hrs)")
            else:
                factors.append("Minimal delay expected")

            traffic_f = float(route.get("traffic_factor", 1.0))
            if traffic_f > 1.3:
                factors.append("Heavy traffic expected on this route")
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

            pf = _priority_factor()
            if pf:
                add_factor(pf)

            if label == "best":
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
