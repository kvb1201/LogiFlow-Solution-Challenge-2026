from app.pipelines.base import BasePipeline
import random


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
        weight = payload.get("cargo_weight_kg", 100)

        for r in routes:
            # Time
            effective_time = r["base_duration_hr"] * (1 + r["traffic_level"] + r.get("weather_impact", 0))

            # Cost
            fuel_cost = r["distance_km"] * 6
            driver_cost = effective_time * 200
            weight_cost = weight * 2
            total_cost = fuel_cost + driver_cost + r["toll_cost"] + weight_cost

            # Risk
            risk = (
                r["traffic_level"] * 0.4 +
                (1 - r["highway_ratio"]) * 0.2 +
                r.get("weather_impact", 0) * 0.3 +
                ((hash((r["distance_km"], r["base_duration_hr"])) % 10) / 100)
            )

            enriched.append({
                "type": "Road",
                "mode": "road",
                "time": round(effective_time, 2),
                "cost": int(total_cost),
                "risk": round(max(0, min(1, risk)), 3),
                "geometry": r.get("geometry"),
                "segments": [
                    {
                        "mode": "Road",
                        "from": source,
                        "to": destination,
                        "distance_km": r["distance_km"],
                        "duration_minutes": int(max(effective_time, 0) * 60)
                    }
                ]
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
        max_time = max(r["time"] for r in routes)
        max_cost = max(r["cost"] for r in routes)
        max_risk = max(r["risk"] for r in routes)
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

        def _explain(route, label="best"):
            reasons = []

            # --- Single route edge case ---
            if len(cleaned_ranked) == 1:
                reasons.append("Only route available from provider")
                label = "single"

            # --- Primary reasoning based on label ---
            if label == "single":
                pass
            elif label == "cheapest":
                reasons.append("Lowest cost among all routes")
            elif label == "fastest":
                reasons.append("Fastest delivery time")
            elif label == "safest":
                reasons.append("Lowest risk route")
            elif label == "alternative":
                reasons.append("Alternative feasible route")
            else:
                reasons.append(
                    f"Selected as best route with cost ₹{route['cost']}, time {route['time']} hrs, and risk {int(route['risk']*100)}%"
                )

            # --- Comparative reasoning for BEST route ---
            if label == "best" and len(cleaned_ranked) > 1:
                alt_routes = cleaned_ranked[1:]

                avg_cost = sum(r["cost"] for r in alt_routes) / len(alt_routes)
                avg_time = sum(r["time"] for r in alt_routes) / len(alt_routes)
                avg_risk = sum(r["risk"] for r in alt_routes) / len(alt_routes)

                if route["cost"] < avg_cost:
                    reasons.append(f"Cheaper than average alternative (₹{int(avg_cost)})")

                if route["risk"] < avg_risk:
                    reasons.append(f"Safer than average alternative ({int(avg_risk*100)}% risk)")

                if route["time"] < avg_time:
                    reasons.append(f"Faster than average alternative ({round(avg_time,2)} hrs)")
                elif route["time"] > avg_time:
                    reasons.append("Slightly slower but more economical/safer")

            # --- Constraint reasoning ---
            if payload.get("budget") is not None and route["cost"] <= payload.get("budget"):
                reasons.append("Within budget constraint")

            if payload.get("deadline_hours") is not None and route["time"] <= payload.get("deadline_hours"):
                reasons.append("Meets delivery deadline")

            # --- Risk summary ---
            reasons.append(f"Estimated risk level: {int(route['risk'] * 100)}%")

            return {
                **route,
                "reason": "; ".join(reasons),
                "key_factors": reasons
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
