from copy import deepcopy

from app.pipelines.air.config import CITY_TO_AIRPORT, MOCK_ROUTES
from app.pipelines.air.engine import score_routes
from app.pipelines.air.ml_models import predict_delay_probability
from app.pipelines.base import BasePipeline
from app.services.air_data_service import get_live_air_routes
from app.services.airport_locator_service import resolve_city_to_airport
from app.services.air_weather_service import get_route_weather_context


class AirPipeline(BasePipeline):
    mode = "air"
    name = "Air Transport"

    CARGO_RULES = {
        "general": {
            "base_markup": 1.0,
            "security_fee_per_kg": 0.25,
            "handling_fee_per_stop": 220,
            "max_recommended_stops": 2,
            "risk_bias": 0.0,
            "preferred_support": "any",
            "notes": ["Standard cargo has no special airport handling restriction."],
        },
        "fragile": {
            "base_markup": 1.14,
            "security_fee_per_kg": 0.55,
            "handling_fee_per_stop": 420,
            "max_recommended_stops": 1,
            "risk_bias": 0.06,
            "preferred_support": "direct_or_one_stop",
            "notes": [
                "Fragile cargo adds reinforced handling and packaging charges.",
                "Extra transfers raise breakage risk, so one-stop routes are preferred.",
            ],
        },
        "perishable": {
            "base_markup": 1.22,
            "security_fee_per_kg": 0.8,
            "handling_fee_per_stop": 650,
            "max_recommended_stops": 0,
            "risk_bias": 0.1,
            "preferred_support": "direct",
            "notes": [
                "Perishable cargo applies cold-chain handling and reefer terminal surcharges.",
                "Direct uplift is preferred to reduce spoilage exposure.",
            ],
        },
    }

    def _normalize_priority(self, priority):
        value = (priority or "balanced").strip().lower()
        aliases = {
            "time": "fast",
            "fastest": "fast",
            "cost": "cheap",
            "cheapest": "cheap",
            "safe": "safe",
        }
        return aliases.get(value, value if value in {"fast", "cheap", "balanced", "safe"} else "balanced")

    def _get_payload(self, payload):
        payload = payload or {}
        cargo = payload.get("cargo") or {}
        constraints = payload.get("constraints") or {}
        return {
            "priority": self._normalize_priority(payload.get("priority")),
            "cargo_weight": float(cargo.get("weight", 100)),
            "cargo_type": str(cargo.get("type", "general")).lower(),
            "max_stops": constraints.get("max_stops"),
            "budget_limit": constraints.get("budget_limit"),
            "deadline_hours": constraints.get("deadline_hours"),
            "departure_date": payload.get("departure_date"),
        }

    def _get_departure_date(self, payload):
        departure_date = payload.get("departure_date")
        if departure_date:
            return departure_date
        return "2026-04-10"

    def _fetch_routes(self, source, destination, payload):
        departure_date = self._get_departure_date(payload)
        live_routes = get_live_air_routes(source, destination, departure_date)
        if live_routes:
            return live_routes

        key = (source, destination)
        routes = MOCK_ROUTES.get(key)
        if routes:
            mocked = deepcopy(routes)
            source_airport = resolve_city_to_airport(source) or {"code": source[:3].upper(), "name": source}
            destination_airport = resolve_city_to_airport(destination) or {"code": destination[:3].upper(), "name": destination}
            for route in mocked:
                route["source_airport"] = source_airport
                route["destination_airport"] = destination_airport
                route["data_source"] = "free_stack_mock_catalog"
            return mocked

        source_airport = resolve_city_to_airport(source) or {"code": source[:3].upper(), "name": source}
        destination_airport = resolve_city_to_airport(destination) or {"code": destination[:3].upper(), "name": destination}

        return [
            {
                "airline": "IndiGo",
                "stops": 0,
                "distance": 1050,
                "duration": 2.2,
                "delay_risk": 0.2,
                "cost_per_kg": 8.5,
                "cargo_types": ["general", "fragile", "perishable"],
                "source_airport": source_airport,
                "destination_airport": destination_airport,
                "data_source": "free_stack_dynamic_fallback",
            },
            {
                "airline": "Air India",
                "stops": 1,
                "distance": 1230,
                "duration": 3.4,
                "delay_risk": 0.34,
                "cost_per_kg": 6.4,
                "cargo_types": ["general", "fragile"],
                "source_airport": source_airport,
                "destination_airport": destination_airport,
                "data_source": "free_stack_dynamic_fallback",
            },
        ]

    def _engineer_features(self, routes, source, destination, payload):
        engineered = []
        cargo_weight = payload["cargo_weight"]
        cargo_type = payload["cargo_type"]
        cargo_rule = self.CARGO_RULES.get(cargo_type, self.CARGO_RULES["general"])
        departure_date = self._get_departure_date(payload)
        weather_context = get_route_weather_context(source, destination)

        for route in routes:
            supported = [item.lower() for item in route.get("cargo_types", ["general"])]
            if cargo_type not in supported:
                continue

            delay_prob, weather_risk, reliability, congestion_risk = predict_delay_probability(
                route,
                source,
                destination,
                departure_date,
                weather_context=weather_context,
            )
            stops = int(route.get("stops", 0))
            time = float(route.get("duration", 0))
            cost_breakdown = self._build_cost_breakdown(route, cargo_weight, cargo_type, cargo_rule)
            cost = cost_breakdown["total"]
            business_rules = self._evaluate_business_rules(route, cargo_weight, cargo_type, cargo_rule)
            risk_raw = (
                float(route.get("delay_risk", 0))
                + stops * 0.1
                + (1 - reliability) * 0.15
                + weather_risk * 0.6
                + congestion_risk * 0.4
                + cargo_rule["risk_bias"]
            )
            risk = round(min(1.0, risk_raw), 3)

            if business_rules["risk_adjustment"]:
                risk = round(min(1.0, risk + business_rules["risk_adjustment"]), 3)
            if business_rules["time_adjustment_hours"]:
                time = round(time + business_rules["time_adjustment_hours"], 2)

            source_airport = route.get("source_airport") or CITY_TO_AIRPORT.get(source, {"code": source[:3].upper(), "name": source})
            destination_airport = route.get("destination_airport") or CITY_TO_AIRPORT.get(destination, {"code": destination[:3].upper(), "name": destination})
            confidence_score, confidence_reasons = self._build_confidence(route, reliability, cargo_rule, business_rules)

            engineered.append({
                "type": "Air",
                "mode": "air",
                "time": round(time, 2),
                "cost": cost,
                "risk": risk,
                "delay_prob": delay_prob,
                "airline": route["airline"],
                "stops": stops,
                "distance": route.get("distance", 0),
                "cost_per_kg": route.get("cost_per_kg", 0),
                "weather_risk": weather_risk,
                "congestion_risk": congestion_risk,
                "reliability": round(reliability, 3),
                "cargo_type": cargo_type,
                "cargo_weight": cargo_weight,
                "data_source": route.get("data_source", "mock"),
                "route_support_type": route.get("route_support_type", "inferred"),
                "supported_by": route.get("supported_by", "internal_fallback"),
                "confidence_score": confidence_score,
                "confidence_label": self._confidence_label(confidence_score),
                "confidence_reasons": confidence_reasons,
                "cost_breakdown": cost_breakdown,
                "business_rules_applied": business_rules["messages"],
                "segments": route.get("segments")
                or [
                    {
                        "mode": "Air",
                        "from": source,
                        "to": destination,
                    }
                ],
                "air_details": {
                    "airline": route["airline"],
                    "stops": stops,
                    "delay_prob": delay_prob,
                    "weather_risk": weather_risk,
                    "congestion_risk": congestion_risk,
                    "reliability": round(reliability, 3),
                    "cargo_type": cargo_type,
                    "cargo_weight": cargo_weight,
                    "source_airport": source_airport,
                    "destination_airport": destination_airport,
                    "hub_airport": route.get("hub_airport"),
                    "route_support_type": route.get("route_support_type", "inferred"),
                    "supported_by": route.get("supported_by", "internal_fallback"),
                    "supporting_airlines": route.get("supporting_airlines", []),
                    "weather_context": weather_context,
                    "confidence_reasons": confidence_reasons,
                    "cost_breakdown": cost_breakdown,
                    "business_rules_applied": business_rules["messages"],
                },
            })

        return engineered

    def _apply_constraints(self, routes, payload):
        max_stops = payload.get("max_stops")
        budget_limit = payload.get("budget_limit")
        deadline_hours = payload.get("deadline_hours")

        filtered = []
        for route in routes:
            if max_stops is not None and route["stops"] > int(max_stops):
                continue
            if budget_limit is not None and route["cost"] > float(budget_limit):
                continue
            if deadline_hours is not None and route["time"] > float(deadline_hours):
                continue
            filtered.append(route)
        return filtered

    def _explain_route(self, route, priority):
        reasons = []
        if priority == "fast":
            reasons.append("Prioritized fastest air cargo movement")
        elif priority == "cheap":
            reasons.append("Prioritized lowest freight cost")
        elif priority == "safe":
            reasons.append("Prioritized lower operational risk")
        else:
            reasons.append("Balanced time, cost, and risk across air routes")

        if route["stops"] == 0:
            if route.get("route_support_type") == "direct":
                reasons.append("Direct airport pair is validated from the OpenFlights route snapshot")
            else:
                reasons.append("Direct flight reduces handling and transfer delay")
        else:
            if route.get("route_support_type") == "one_stop":
                reasons.append("One-stop airport chain is validated from the OpenFlights route snapshot")
            else:
                reasons.append(f"{route['stops']} stop route trades speed for lower fare")

        reasons.append(f"Predicted delay probability: {int(route['delay_prob'] * 100)}%")
        reasons.append(f"Airline reliability score: {route['reliability']:.2f}")
        reasons.append(f"Confidence score: {route['confidence_score']}% ({route['confidence_label']})")
        reasons.extend(route.get("business_rules_applied", []))
        reasons.append(f"Data source: {route.get('data_source', 'mock')}")

        route["reason"] = reasons[0]
        route["key_factors"] = reasons
        route["eta"] = f"{route['time']} hrs"
        return route

    def _build_cost_breakdown(self, route, cargo_weight, cargo_type, cargo_rule):
        base_freight = float(route.get("cost_per_kg", 0)) * cargo_weight
        fuel_surcharge = round(base_freight * 0.12, 2)
        terminal_fee = round(320 + cargo_weight * cargo_rule["security_fee_per_kg"], 2)
        handling_fee = round(route.get("stops", 0) * cargo_rule["handling_fee_per_stop"], 2)
        cargo_markup = round(base_freight * (cargo_rule["base_markup"] - 1), 2)
        heavy_lift_fee = round(max(0.0, cargo_weight - 180) * 1.1, 2)
        total = round(
            base_freight + fuel_surcharge + terminal_fee + handling_fee + cargo_markup + heavy_lift_fee,
            2,
        )
        return {
            "base_freight": round(base_freight, 2),
            "fuel_surcharge": fuel_surcharge,
            "terminal_fee": terminal_fee,
            "handling_fee": handling_fee,
            "cargo_markup": cargo_markup,
            "heavy_lift_fee": heavy_lift_fee,
            "total": total,
            "currency": "INR",
            "pricing_basis": f"{cargo_type} cargo business rule model",
        }

    def _evaluate_business_rules(self, route, cargo_weight, cargo_type, cargo_rule):
        messages = list(cargo_rule["notes"])
        risk_adjustment = 0.0
        time_adjustment_hours = 0.0
        stops = int(route.get("stops", 0))
        support_type = route.get("route_support_type", "inferred")

        if cargo_weight > 450:
            messages.append("Heavy uplift surcharge applied for shipment weight above 450 kg.")
            risk_adjustment += 0.03
            time_adjustment_hours += 0.2
        elif cargo_weight > 180:
            messages.append("Wide-body handling buffer added for shipment weight above 180 kg.")
            time_adjustment_hours += 0.1

        if cargo_type == "perishable" and stops > 0:
            messages.append("Perishable cargo on a connecting route carries extra spoilage exposure.")
            risk_adjustment += 0.08
            time_adjustment_hours += 0.35
        elif cargo_type == "fragile" and stops > 0:
            messages.append("Fragile cargo transfer adds repacking and handling checks.")
            risk_adjustment += 0.04
            time_adjustment_hours += 0.2

        if support_type == "inferred":
            messages.append("Airport pair is inferred from nearest-airport matching, so capacity confidence is lower.")
            risk_adjustment += 0.05
        elif support_type == "one_stop":
            messages.append("One-stop route support is validated from the OpenFlights snapshot.")
        else:
            messages.append("Direct route support is validated from the OpenFlights snapshot.")

        if stops > cargo_rule["max_recommended_stops"]:
            messages.append("This route exceeds the preferred stop count for this cargo type.")
            risk_adjustment += 0.05

        return {
            "messages": messages,
            "risk_adjustment": round(risk_adjustment, 3),
            "time_adjustment_hours": round(time_adjustment_hours, 2),
        }

    def _build_confidence(self, route, reliability, cargo_rule, business_rules):
        score = 62
        reasons = []
        support_type = route.get("route_support_type", "inferred")
        stops = int(route.get("stops", 0))

        if support_type == "direct":
            score += 18
            reasons.append("Airport pair is directly supported by the OpenFlights route snapshot.")
        elif support_type == "one_stop":
            score += 10
            reasons.append("Airport chain is supported by the OpenFlights route snapshot.")
        else:
            reasons.append("Route is inferred from nearest-airport matching and fallback airline heuristics.")

        reliability_bonus = round((reliability - 0.7) * 45)
        score += reliability_bonus
        reasons.append(f"Carrier reliability contributes {reliability_bonus:+d} points.")

        if stops <= cargo_rule["max_recommended_stops"]:
            score += 6
            reasons.append("Stop count fits the cargo handling preference.")
        else:
            score -= 8
            reasons.append("Stop count is above the preferred cargo handling threshold.")

        score -= int(round(business_rules["risk_adjustment"] * 100))
        if business_rules["risk_adjustment"]:
            reasons.append("Cargo-specific operational risk reduced confidence slightly.")

        final_score = max(38, min(96, score))
        return final_score, reasons

    def _confidence_label(self, score):
        if score >= 82:
            return "high"
        if score >= 64:
            return "medium"
        return "watch"

    def generate(self, source, destination, payload=None):
        try:
            normalized = self._get_payload(payload)
            routes = self._fetch_routes(source, destination, normalized)
            engineered = self._engineer_features(routes, source, destination, normalized)
            filtered = self._apply_constraints(engineered, normalized)

            if not filtered:
                return {
                    "mode": "air",
                    "best": None,
                    "alternatives": [],
                    "all": [],
                    "error": "No air routes found"
                }

            ranked = score_routes(filtered, normalized["priority"])
            explained = [self._explain_route(route, normalized["priority"]) for route in ranked]

            best = explained[0] if explained else None
            alternatives = explained[1:] if len(explained) > 1 else []

            return {
                "mode": "air",
                "best": best,
                "alternatives": alternatives,
                "all": explained
            }

        except Exception as e:
            print("[AIR PIPELINE ERROR]", str(e), type(e))
            return {
                "mode": "air",
                "best": None,
                "alternatives": [],
                "all": [],
                "error": str(e)
            }
