from copy import deepcopy

from app.pipelines.air.config import CITY_TO_AIRPORT, MOCK_ROUTES
from app.pipelines.air.engine import score_routes
from app.pipelines.air.ml_models import predict_delay_probability
from app.pipelines.base import BasePipeline


class AirPipeline(BasePipeline):
    mode = "air"
    name = "Air Transport"

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
        }

    def _fetch_routes(self, source, destination):
        key = (source, destination)
        routes = MOCK_ROUTES.get(key)
        if routes:
            return deepcopy(routes)

        source_airport = CITY_TO_AIRPORT.get(source, {"code": source[:3].upper(), "name": source})
        destination_airport = CITY_TO_AIRPORT.get(destination, {"code": destination[:3].upper(), "name": destination})

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
            },
        ]

    def _engineer_features(self, routes, source, destination, payload):
        engineered = []
        cargo_weight = payload["cargo_weight"]
        cargo_type = payload["cargo_type"]

        for route in routes:
            supported = [item.lower() for item in route.get("cargo_types", ["general"])]
            if cargo_type not in supported:
                continue

            delay_prob, weather_risk, reliability = predict_delay_probability(route, source, destination)
            stops = int(route.get("stops", 0))
            time = float(route.get("duration", 0))
            cost = round(float(route.get("cost_per_kg", 0)) * cargo_weight, 2)
            risk = round(min(1.0, float(route.get("delay_risk", 0)) + stops * 0.1 + (1 - reliability) * 0.15), 3)

            source_airport = route.get("source_airport") or CITY_TO_AIRPORT.get(source, {"code": source[:3].upper(), "name": source})
            destination_airport = route.get("destination_airport") or CITY_TO_AIRPORT.get(destination, {"code": destination[:3].upper(), "name": destination})

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
                "reliability": round(reliability, 3),
                "cargo_type": cargo_type,
                "cargo_weight": cargo_weight,
                "segments": [
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
                    "reliability": round(reliability, 3),
                    "cargo_type": cargo_type,
                    "cargo_weight": cargo_weight,
                    "source_airport": source_airport,
                    "destination_airport": destination_airport,
                },
            })

        return engineered

    def _apply_constraints(self, routes, payload):
        max_stops = payload.get("max_stops")
        budget_limit = payload.get("budget_limit")

        filtered = []
        for route in routes:
            if max_stops is not None and route["stops"] > int(max_stops):
                continue
            if budget_limit is not None and route["cost"] > float(budget_limit):
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
            reasons.append("Direct flight reduces handling and transfer delay")
        else:
            reasons.append(f"{route['stops']} stop route trades speed for lower fare")

        reasons.append(f"Predicted delay probability: {int(route['delay_prob'] * 100)}%")
        reasons.append(f"Airline reliability score: {route['reliability']:.2f}")

        route["reason"] = reasons[0]
        route["key_factors"] = reasons
        route["eta"] = f"{route['time']} hrs"
        return route

    def generate(self, source, destination, payload=None):
        normalized = self._get_payload(payload)
        routes = self._fetch_routes(source, destination)
        engineered = self._engineer_features(routes, source, destination, normalized)
        filtered = self._apply_constraints(engineered, normalized)

        if not filtered:
            return []

        ranked = score_routes(filtered, normalized["priority"])
        return [self._explain_route(route, normalized["priority"]) for route in ranked]
