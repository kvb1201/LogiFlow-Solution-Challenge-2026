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
        simulation_mode = payload.get("mode") == "simulation"
        sim = payload.get("simulation") or {} if simulation_mode else {}
        from app.services.ml_service import predict_delay
        from app.services.weather_service import get_weather
        weight = payload.get("cargo_weight_kg", 100)

        for route_idx, r in enumerate(routes):
            # Validate geometry early to prevent frontend/map crashes
            geometry = r.get("geometry")
            if not geometry or not isinstance(geometry, list) or len(geometry) < 2:
                print(f"[ENGINEER] Dropping route {route_idx} due to invalid geometry")
                continue
            # Base time
            base_time = float(r.get("base_duration_hr") or r.get("duration_hr") or max(float(r.get("distance_km", 0)) / 60.0, 1.0))

            distance = float(r.get("distance_km", 0))
            base_traffic = float(r.get("traffic_level", 0.3))

            # Strong but stable blending (simulation dominates but keeps realism)
            if simulation_mode and sim.get("traffic_level") is not None:
                sim_traffic = float(sim.get("traffic_level"))
                base_traffic = 0.7 * sim_traffic + 0.3 * base_traffic

            # Add variation based on route characteristics
            traffic_variation = (distance % 50) / 300   # reduce artificial noise
            traffic_level = min(1.0, max(0.05, base_traffic + traffic_variation))

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

            if simulation_mode and sim.get("weather_level") is not None:
                weather_level = float(sim.get("weather_level"))

                # Blend real rain with simulated severity
                real_rain = weather.get("rain", 0)
                blended_rain = 0.5 * real_rain + 0.5 * (weather_level * 10)

                weather = {
                    "temp": weather.get("temp", 30),
                    "rain": blended_rain
                }

            # ML input diversity
            utilization = 30 + traffic_level * 70 + (distance % 30)
            demand = 30 + traffic_level * 60 + (distance % 20)

            if simulation_mode:
                utilization = 0.7 * utilization + 0.3 * float(sim.get("utilization", utilization))
                demand = 0.7 * demand + 0.3 * float(sim.get("demand", demand))

            # ML-based delay prediction (with dynamic features)
            print("ML INPUT:", traffic_cat, utilization, demand)
            adjusted_time, traffic_f, weather_f = predict_delay(
                base_time,
                weather,
                utilization=utilization,
                demand=demand,
                traffic=traffic_level,
                traffic_level=traffic_level,
            )
            print("ML OUTPUT:", traffic_f, weather_f)
            print("ROUTE DEBUG:",
                  "dist=", distance,
                  "traffic=", traffic_level,
                  "util=", utilization,
                  "demand=", demand)

            # Hybrid model: physics + ML refinement
            traffic_multiplier = 1 + (traffic_level * 0.6)
            effective_time = base_time * traffic_multiplier * traffic_f

            # Apply simulation effects (weather + incidents)
            if simulation_mode:
                weather_level = float(sim.get("weather_level", 0))
                incident_count_sim = int(sim.get("incident_count", 0))

                # Stronger but controlled weather impact
                weather_factor = 1 + weather_level * 0.5

                # Incidents remain additive (realistic spikes)
                incident_delay = incident_count_sim * 0.2

                effective_time = effective_time * weather_factor + incident_delay

            distance_km = float(r.get("distance_km", 0))

            # Freight-style logistics pricing (deterministic per route alternative)
            seed = (route_idx * 1_000_003 + int(distance_km * 1_000) * 7_919 + int(weight)) % (2**32)
            rng = random.Random(seed)
            rate_per_km_per_ton = 8 + rng.random() * 4  # ₹/km/ton, 8–12

            if simulation_mode and sim.get("fuel_price") is not None:
                fuel_factor = float(sim.get("fuel_price")) / 100.0
                rate_per_km_per_ton *= fuel_factor

            tons = max(float(weight), 0) / 1000.0
            freight = distance_km * rate_per_km_per_ton * tons
            toll = distance_km * 0.8
            handling = 200 + rng.random() * 200
            gst = 0.05 * freight
            documentation = 100 + rng.random() * 100
            total_cost = freight + toll + handling + gst + documentation
            if simulation_mode:
                congestion_cost = 1 + (traffic_level * 0.3)
                weather_cost = 1 + (float(sim.get("weather_level", 0)) * 0.2)
                incident_cost = 1 + (int(sim.get("incident_count", 0)) * 0.05)
                total_cost *= (congestion_cost * weather_cost * incident_cost)
            cost_low = total_cost * 0.9
            cost_high = total_cost * 1.2

            # Risk based on predicted delay + incidents (more realistic)
            incident_count = r.get("incident_count", 0)
            if simulation_mode:
                incident_count = int(sim.get("incident_count", incident_count))
            # Delay includes weather + traffic slowdown + incidents, consistent with effective_time
            base_delay = incident_count * (0.2 if simulation_mode else 0.1)
            weather_level = float(sim.get("weather_level", 0)) if simulation_mode else 0
            weather_delay = (weather_level * 0.5 * base_time) if simulation_mode else 0
            traffic_delay = traffic_level * 0.3 * base_time
            delay = base_delay + weather_delay + traffic_delay
            print("CONSISTENCY CHECK:", "time=", effective_time, "base=", base_time, "delay=", delay)
            delay_prob = delay / max(base_time, 1e-3)
            incident_penalty = min(incident_count * 0.03, 0.3)
            # Blend risk contribution instead of full override
            risk = (
                0.05 +
                delay_prob * 0.35 +
                traffic_level * 0.25 +
                (weather_level * 0.2) +
                (1 - float(r.get("highway_ratio", 0.7))) * 0.1 +
                incident_penalty
            )
            # Clamp
            risk = max(0, min(1, risk))

            route_out = {
                "type": "Road",
                "mode": "road",
                "time": round(effective_time, 2),
                "base_duration_hr": base_time,
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
                "geometry": r.get("geometry") or [],
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
                "predicted_delay": round(delay, 2),
                "traffic_level": traffic_level,
                "weather_level": sim.get("weather_level") if simulation_mode else None,
                "incident_count": incident_count,
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
        """
        Hard filter: keep routes with cost <= budget (if set) AND time <= deadline (if set).
        If none qualify, return all routes ordered by smallest constraint violation (fallback).
        Returns (routes, note) where note is set only for fallback.
        """
        budget = payload.get("budget")
        deadline = payload.get("deadline_hours")

        def _with_zero_penalty(rlist):
            out = []
            for r in rlist:
                c = r.copy()
                c["constraint_penalty"] = 0.0
                out.append(c)
            return out

        if budget is None and deadline is None:
            return _with_zero_penalty(routes), None

        def _feasible(r):
            if budget is not None and r["cost"] > budget:
                return False
            if deadline is not None and r["time"] > deadline:
                return False
            return True

        feasible = [r for r in routes if _feasible(r)]
        if feasible:
            return _with_zero_penalty(feasible), None

        def _violation_score(r):
            s = 0.0
            if budget is not None and r["cost"] > budget:
                s += (r["cost"] - budget) / max(budget, 1)
            if deadline is not None and r["time"] > deadline:
                s += (r["time"] - deadline) / max(deadline, 1e-6)
            return s

        fallback_order = sorted(routes, key=_violation_score)
        note = "No routes fully satisfy constraints. Showing closest alternatives."
        return _with_zero_penalty(fallback_order), note

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
        elif priority == "safe":
            weights = {
                "cost": 0.15,
                "time": 0.2,
                "risk": 0.5,
                "penalty": 0.15,
            }
        else:
            # balanced (default) and any unknown priority
            weights = {"cost": 0.35, "time": 0.25, "risk": 0.25, "penalty": 0.15}

        simulation_mode = False
        if routes and routes[0].get("weather_level") is not None:
            simulation_mode = True

        if simulation_mode:
            weights["risk"] += 0.1
            weights["time"] += 0.1
            weights["cost"] -= 0.2

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
        mode = payload.get("mode", "realtime")

        if mode not in ["realtime", "simulation"]:
            raise ValueError(f"Invalid mode '{mode}'. Allowed values: 'realtime' or 'simulation'")

        # Normalize mode back into payload to ensure consistency everywhere
        payload["mode"] = mode

        simulation_mode = mode == "simulation"
        priority = payload.get("priority", "balanced")

        routes = self._get_routes(source, destination, payload)

        # Always compute realtime baseline first
        realtime_payload = payload.copy()
        realtime_payload["mode"] = "realtime"

        realtime_enriched = self._engineer(routes, source, destination, realtime_payload)

        realtime_filtered, _ = self._apply_constraints(realtime_enriched, realtime_payload)
        realtime_ranked = self._score_routes(realtime_filtered, priority)

        best_realtime = realtime_ranked[0]

        # If simulation mode → apply simulation to ALL routes
        if simulation_mode:
            import copy
            sim_routes = copy.deepcopy(routes)

            simulated_enriched = self._engineer(sim_routes, source, destination, payload)
            filtered, constraint_note = self._apply_constraints(simulated_enriched, payload)
            ranked = self._score_routes(filtered, priority)
        else:
            enriched = realtime_enriched
            filtered, constraint_note = self._apply_constraints(enriched, payload)
            ranked = self._score_routes(filtered, priority)

        def _clean(route):
            route = route.copy()
            route.pop("norm_time", None)
            route.pop("norm_cost", None)
            route.pop("norm_risk", None)
            route.pop("score", None)
            route.pop("norm_penalty", None)
            route.pop("constraint_penalty", None)
            return route


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

            # Prefer direct traffic_level if available (more stable than ML factor)
            tl = float(route.get("traffic_level", 0.3))
            if tl > 0.7:
                traffic = "high"
            elif tl > 0.4:
                traffic = "moderate"
            else:
                traffic = "low"

            # Weather classification: use simulation input if available
            weather = "good"
            weather_level = route.get("weather_level")
            if weather_level is not None:
                try:
                    wl = float(weather_level)
                    if wl > 0.7:
                        weather = "bad"
                    elif wl > 0.4:
                        weather = "moderate"
                    else:
                        weather = "good"
                except Exception:
                    weather = "good"
            else:
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

            tl = float(route.get("traffic_level", 0.3))
            if tl > 0.8:
                factors.append("Severe congestion expected")
            elif tl > 0.6:
                factors.append("Heavy traffic expected")
            elif tl > 0.4:
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

            incident_count = route.get("incident_count", 0)
            if incident_count > 0:
                factors.append(f"{incident_count} traffic incidents detected on this route")
            return factors

        def _explain(route, label="best"):
            factors = []
            seen = set()

            def add_factor(text: str):
                if text and text not in seen:
                    seen.add(text)
                    factors.append(text)

            if label == "best" and constraint_note:
                add_factor(constraint_note)

            if label == "best":
                # Priority-aware explanation
                if priority == "cost":
                    add_factor("Selected as most cost-efficient route")
                elif priority == "time":
                    add_factor("Selected as fastest available route")
                elif priority == "safe":
                    add_factor("Selected as lowest-risk route")
                else:
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

                if len(cleaned_ranked) == 1:
                    add_factor("Only route satisfying constraints under current conditions")
                else:
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

        print(f"[PIPELINE OUTPUT] mode={payload.get('mode')} routes={len(explained_ranked)}")
        return {
            "simulation": simulation_mode,
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
                "routes_before": len(routes),
                "routes_after": len(filtered),
                "note": constraint_note,
                "constraints_relaxed": constraint_note is not None,
            }
        }
