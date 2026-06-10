from copy import deepcopy
import logging

from app.pipelines.air.config import CITY_TO_AIRPORT
from app.pipelines.air.engine import score_routes
from app.pipelines.air.ml_models import predict_delay_probability
from app.pipelines.base import BasePipeline
from app.services.air_data_service import get_live_air_routes
from app.services.airport_locator_service import resolve_city_to_airport
from app.services.air_weather_service import get_route_weather_context
from app.services.air_timezone_service import build_route_schedule

logger = logging.getLogger(__name__)


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
        mode = payload.get("mode", "realtime")
        simulation = payload.get("simulation") or {} if mode == "simulation" else {}
        weight = float(cargo.get("weight", 100))
        
        length_cm = float(cargo.get("length_cm", 0))
        width_cm = float(cargo.get("width_cm", 0))
        height_cm = float(cargo.get("height_cm", 0))
        
        if length_cm > 0 and width_cm > 0 and height_cm > 0:
            volumetric_weight = (length_cm * width_cm * height_cm) / 6000.0
        else:
            volumetric_weight = 0.0
            
        chargeable_weight = max(weight, volumetric_weight)

        return {
            "mode": mode,
            "priority": self._normalize_priority(payload.get("priority")),
            "cargo_weight": weight,
            "cargo_volume": float(cargo.get("volume", weight / 167.0)),
            "volumetric_weight": volumetric_weight,
            "chargeable_weight": chargeable_weight,
            "cargo_type": str(cargo.get("type", "general")).lower(),
            "max_stops": constraints.get("max_stops"),
            "budget_limit": constraints.get("budget_limit"),
            "deadline_hours": constraints.get("deadline_hours"),
            "departure_date": payload.get("departure_date"),
            "simulation": simulation,
        }

    def _get_departure_date(self, payload):
        departure_date = payload.get("departure_date")
        if departure_date:
            return departure_date
        return "2026-04-10"

    def _fetch_routes(self, source, destination, payload, context=None):
        departure_date = self._get_departure_date(payload)
        live_routes = get_live_air_routes(source, destination, departure_date)
        if live_routes:
            for route in live_routes:
                route["data_source"] = "openflights"
                route["is_fallback"] = False
            return live_routes

        # No OpenFlights support for this airport pair — return empty for a clean no_routes response.
        print(f"[AIR] No routes found for {source} -> {destination}")
        return []

    def _engineer_features(self, routes, source, destination, payload, context=None):
        engineered = []
        cargo_weight = payload["cargo_weight"]
        cargo_volume = payload["cargo_volume"]
        cargo_type = payload["cargo_type"]
        cargo_rule = self.CARGO_RULES.get(cargo_type, self.CARGO_RULES["general"])
        departure_date = self._get_departure_date(payload)
        weather_context = get_route_weather_context(source, destination, context=context)

        simulation_mode = payload.get("mode") == "simulation"
        sim = payload.get("simulation") or {} if simulation_mode else {}

        for route in routes:
            supported = [item.lower() for item in route.get("cargo_types", ["general"])]
            if cargo_type not in supported:
                continue

            delay_prob, weather_risk, reliability, congestion_risk, otp_prediction = predict_delay_probability(
                route,
                source,
                destination,
                departure_date,
                weather_context=weather_context,
            )

            # Apply simulation mode adjustments
            if simulation_mode:
                # Adjust weather risk based on simulation
                if sim.get("weather_level") is not None:
                    sim_weather = float(sim.get("weather_level"))
                    weather_risk = 0.5 * weather_risk + 0.5 * sim_weather

                # Adjust congestion risk based on simulation
                if sim.get("congestion_level") is not None:
                    sim_congestion = float(sim.get("congestion_level"))
                    congestion_risk = 0.5 * congestion_risk + 0.5 * sim_congestion

                # Adjust delay probability based on simulation
                if sim.get("delay_factor") is not None:
                    sim_delay = float(sim.get("delay_factor"))
                    delay_prob = 0.5 * delay_prob + 0.5 * sim_delay

                # Adjust reliability based on simulation
                if sim.get("reliability_factor") is not None:
                    sim_reliability = float(sim.get("reliability_factor"))
                    reliability = 0.5 * reliability + 0.5 * sim_reliability

            stops = int(route.get("stops", 0))
            time = float(route.get("duration", 0))
            cost_breakdown = self._build_cost_breakdown(
                route,
                payload,
                cargo_rule,
                weather_risk,
                congestion_risk,
                reliability,
            )
            cost = cost_breakdown["finalCost"]

            # Apply simulation mode to cost
            if simulation_mode:
                if sim.get("fuel_price") is not None:
                    fuel_factor = float(sim.get("fuel_price")) / 100.0
                    cost = cost * fuel_factor

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
            schedule = build_route_schedule(
                departure_date,
                time,
                source_airport,
                destination_airport,
            )

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
                "otp_prediction": otp_prediction,
                "congestion_score": otp_prediction["congestionScore"],
                "congestion_level": otp_prediction["congestionLevel"],
                "reliability": round(reliability, 3),
                "cargo_type": cargo_type,
                "cargo_weight": cargo_weight,
                "cargo_volume": cargo_volume,
                "data_source": route.get("data_source", "openflights"),
                "is_fallback": route.get("is_fallback", True),
                "route_support_type": route.get("route_support_type", "inferred"),
                "supported_by": route.get("supported_by", "internal_fallback"),
                "confidence_score": confidence_score,
                "confidence_label": self._confidence_label(confidence_score),
                "confidence_reasons": confidence_reasons,
                "cost_breakdown": cost_breakdown,
                "business_rules_applied": business_rules["messages"],
                "simulation_mode": simulation_mode,
                "sim_weather_level": sim.get("weather_level") if simulation_mode else None,
                "sim_congestion_level": sim.get("congestion_level") if simulation_mode else None,
                "sim_delay_factor": sim.get("delay_factor") if simulation_mode else None,
                "sim_reliability_factor": sim.get("reliability_factor") if simulation_mode else None,
                "sim_fuel_price": sim.get("fuel_price") if simulation_mode else None,
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
                    "otp_prediction": otp_prediction,
                    "congestion_score": otp_prediction["congestionScore"],
                    "congestion_level": otp_prediction["congestionLevel"],
                    "reliability": round(reliability, 3),
                    "cargo_type": cargo_type,
                    "cargo_weight": cargo_weight,
                    "cargo_volume": cargo_volume,
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
                    "schedule": schedule,
                    "departure_local": schedule["departure_local"],
                    "arrival_local": schedule["arrival_local"],
                    "departure_utc": schedule["departure_utc"],
                    "arrival_utc": schedule["arrival_utc"],
                },
            })

        return engineered

    def _apply_constraints(self, routes, payload):
        max_stops = payload.get("max_stops")
        budget_limit = payload.get("budget_limit")
        deadline_hours = payload.get("deadline_hours")

        MIN_CONFIDENCE = 60

        filtered = []
        for route in routes:
            # Step 1: Minimum confidence threshold
            if route.get("confidence_score", 0) < MIN_CONFIDENCE:
                print(f"[AIR FILTER] rejected low confidence route (score: {route.get('confidence_score')})")
                continue

            # Step 4: Prevent unrealistic routes
            stops = route.get("stops", 0)
            if stops > 1:
                print(f"[AIR FILTER] rejected route with excessive stops: {stops}")
                continue

            src_air = route.get("air_details", {}).get("source_airport", {})
            dst_air = route.get("air_details", {}).get("destination_airport", {})
            if src_air.get("lat") is None or dst_air.get("lat") is None:
                print("[AIR FILTER] rejected route with missing airport geographic mapping")
                continue

            if max_stops is not None and stops > int(max_stops):
                continue
            if budget_limit is not None and route["cost"] > float(budget_limit):
                continue
            if deadline_hours is not None and route["time"] > float(deadline_hours):
                continue
            filtered.append(route)
        return filtered

    def _explain_route(self, route, priority, simulation_mode=False):
        reasons = []
        seen = set()

        def add_factor(text: str):
            if text and text not in seen:
                seen.add(text)
                reasons.append(text)

        # Priority-based explanation
        if priority == "fast":
            add_factor("Prioritized fastest air cargo movement")
        elif priority == "cheap":
            add_factor("Prioritized lowest freight cost")
        elif priority == "safe":
            add_factor("Prioritized lower operational risk")
        else:
            add_factor("Balanced time, cost, and risk across air routes")

        # Stop count explanation
        if route["stops"] == 0:
            if route.get("route_support_type") == "direct":
                add_factor("Direct airport pair is validated from the OpenFlights route snapshot")
            else:
                add_factor("Direct flight reduces handling and transfer delay")
        else:
            if route.get("route_support_type") == "one_stop":
                add_factor("One-stop airport chain is validated from the OpenFlights route snapshot")
            else:
                add_factor(f"{route['stops']} stop route trades speed for lower fare")

        # Congestion and delay information
        congestion_level = route.get('congestion_level', 'Unknown')
        congestion_score = route.get('congestion_score', 0)
        if congestion_level == "High":
            add_factor(f"High airport congestion detected ({congestion_score}/100)")
        elif congestion_level == "Medium":
            add_factor(f"Moderate airport congestion ({congestion_score}/100)")
        else:
            add_factor(f"Low airport congestion ({congestion_score}/100)")

        delay_prob = int(route['delay_prob'] * 100)
        if delay_prob > 30:
            add_factor(f"High delay probability ({delay_prob}%)")
        elif delay_prob > 15:
            add_factor(f"Moderate delay probability ({delay_prob}%)")
        else:
            add_factor(f"Low delay probability ({delay_prob}%)")

        # Reliability information
        reliability = route['reliability']
        if reliability > 0.85:
            add_factor(f"High airline reliability ({reliability:.2f})")
        elif reliability > 0.70:
            add_factor(f"Moderate airline reliability ({reliability:.2f})")
        else:
            add_factor(f"Lower airline reliability ({reliability:.2f})")

        # Confidence score
        confidence_score = route['confidence_score']
        confidence_label = route['confidence_label']
        add_factor(f"Confidence score: {confidence_score}% ({confidence_label})")

        # Business rules
        for rule in route.get("business_rules_applied", []):
            add_factor(rule)

        # Data source
        add_factor(f"Data source: {route.get('data_source', 'openflights')}")

        # Simulation mode specific information
        if simulation_mode:
            add_factor("Simulation mode: Adjusted parameters applied")
            if route.get("sim_weather_level") is not None:
                weather_level = route.get("sim_weather_level")
                if weather_level > 0.7:
                    add_factor(f"Simulated adverse weather conditions (level: {weather_level})")
                elif weather_level > 0.4:
                    add_factor(f"Simulated moderate weather (level: {weather_level})")
                else:
                    add_factor(f"Simulated favorable weather (level: {weather_level})")

            if route.get("sim_congestion_level") is not None:
                congestion = route.get("sim_congestion_level")
                add_factor(f"Simulated congestion level: {congestion}")

            if route.get("sim_delay_factor") is not None:
                delay_factor = route.get("sim_delay_factor")
                add_factor(f"Simulated delay factor: {delay_factor}")

            if route.get("sim_reliability_factor") is not None:
                reliability_factor = route.get("sim_reliability_factor")
                add_factor(f"Simulated reliability factor: {reliability_factor}")

            if route.get("sim_fuel_price") is not None:
                fuel_price = route.get("sim_fuel_price")
                add_factor(f"Simulated fuel price adjustment: {fuel_price}%")

        # Risk assessment
        risk = route['risk']
        if risk > 0.6:
            add_factor(f"High operational risk ({int(risk * 100)}%)")
        elif risk > 0.3:
            add_factor(f"Moderate operational risk ({int(risk * 100)}%)")
        else:
            add_factor(f"Low operational risk ({int(risk * 100)}%)")

        # Cost information
        cost = route['cost']
        add_factor(f"Total cost: ₹{int(cost)}")

        # Time information
        time = route['time']
        add_factor(f"Estimated transit time: {time} hrs")

        route["reason"] = reasons[0] if reasons else "Alternative feasible route"
        route["key_factors"] = reasons
        route["eta"] = f"{route['time']} hrs"
        return route

    def _build_cost_breakdown(self, route, payload, cargo_rule, weather_risk, congestion_risk, reliability):
        actual_weight = payload["cargo_weight"]
        volumetric_weight = payload["volumetric_weight"]
        chargeable_weight = payload["chargeable_weight"]
        
        distance_km = float(route.get("distance", 0))
        
        source_country = route.get("source_country", "IN")
        destination_country = route.get("destination_country", "IN")
        
        is_domestic = source_country in ["IN", "India"] and destination_country in ["IN", "India"]
        
        if is_domestic:
            route_type = "Domestic"
            base_charge = 500.0
            distance_rate = 0.8
            weight_rate = 25.0
            handling_fee = 500.0
            fuel_rate_per_km = 0.15
        else:
            route_type = "International"
            base_charge = 2500.0
            distance_rate = 2.5
            weight_rate = 60.0
            handling_fee = 2500.0
            fuel_rate_per_km = 0.40
            
        distance_charge = distance_km * distance_rate
        weight_charge = chargeable_weight * weight_rate
        base_cost = base_charge + distance_charge + weight_charge
        
        fuel_surcharge = distance_km * fuel_rate_per_km
        
        stops = int(route.get("stops", 0))
        handling_fee_total = handling_fee + (stops * cargo_rule.get("handling_fee_per_stop", 0.0))
        
        cargo_markup = base_cost * (cargo_rule.get("base_markup", 1.0) - 1.0)
        
        adjusted_cost = base_cost + fuel_surcharge + handling_fee_total + cargo_markup
        
        cost_multiplier = 1.0
        weather_adj = weather_risk * 0.10
        congestion_adj = congestion_risk * 0.15
        otp_adj = (1.0 - reliability) * 0.10
        
        cost_multiplier += weather_adj + congestion_adj + otp_adj
        cost_multiplier = max(1.0, min(cost_multiplier, 1.5))
        
        final_cost = round(adjusted_cost * cost_multiplier, 2)
        
        return {
            "routeType": route_type,
            "actualWeight": round(actual_weight, 2),
            "volumetricWeight": round(volumetric_weight, 2),
            "chargeableWeight": round(chargeable_weight, 2),
            "distanceKm": round(distance_km, 2),
            "baseCharge": round(base_charge, 2),
            "distanceCharge": round(distance_charge, 2),
            "weightCharge": round(weight_charge, 2),
            "fuelSurcharge": round(fuel_surcharge, 2),
            "airportHandlingFee": round(handling_fee_total, 2),
            "weatherAdjustment": round(weather_adj, 4),
            "congestionAdjustment": round(congestion_adj, 4),
            "otpAdjustment": round(otp_adj, 4),
            "costMultiplier": round(cost_multiplier, 4),
            "finalCost": final_cost,
            "total": final_cost,
            "currency": "INR"
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
            reasons.append("Route support type could not be verified from OpenFlights.")

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

    def generate(self, source, destination, payload=None, context=None):
        normalized = None
        try:
            normalized = self._get_payload(payload)
            mode = normalized.get("mode", "realtime")

            if mode not in ["realtime", "simulation"]:
                raise ValueError(f"Invalid mode '{mode}'. Allowed values: 'realtime' or 'simulation'")

            # Normalize mode back into payload to ensure consistency everywhere
            normalized["mode"] = mode

            simulation_mode = mode == "simulation"
            priority = normalized["priority"]

            routes = self._fetch_routes(source, destination, normalized, context=context)
            if not routes:
                return {
                    "mode": "air",
                    "simulation": simulation_mode,
                    "status": "no_routes",
                    "message": f"No valid air routes found between {source} and {destination}",
                    "best": None,
                    "alternatives": [],
                    "all": [],
                }

            # Always compute realtime baseline first
            realtime_payload = normalized.copy()
            realtime_payload["mode"] = "realtime"
            realtime_payload["simulation"] = {}

            realtime_enriched = self._engineer_features(routes, source, destination, realtime_payload, context=context)
            realtime_filtered = self._apply_constraints(realtime_enriched, realtime_payload)
            realtime_ranked = score_routes(realtime_filtered, priority)

            # If simulation mode → apply simulation to ALL routes
            if simulation_mode:
                import copy
                sim_routes = copy.deepcopy(routes)
                simulated_enriched = self._engineer_features(sim_routes, source, destination, normalized, context=context)
                filtered = self._apply_constraints(simulated_enriched, normalized)
                ranked = score_routes(filtered, priority)
            else:
                filtered = realtime_filtered
                ranked = realtime_ranked

            if not filtered:
                return {
                    "mode": "air",
                    "simulation": simulation_mode,
                    "status": "no_routes",
                    "message": f"No valid air routes found between {source} and {destination}",
                    "best": None,
                    "alternatives": [],
                    "all": [],
                }

            explained = [self._explain_route(route, priority, simulation_mode) for route in ranked]

            best = explained[0] if explained else None
            alternatives = explained[1:] if len(explained) > 1 else []

            return {
                "mode": "air",
                "simulation": simulation_mode,
                "best": best,
                "alternatives": alternatives,
                "all": explained,
                "constraints_applied": {
                    "max_stops": normalized.get("max_stops"),
                    "budget_limit": normalized.get("budget_limit"),
                    "deadline_hours": normalized.get("deadline_hours"),
                    "routes_before": len(routes),
                    "routes_after": len(filtered),
                }
            }

        except Exception as e:
            logger.exception("Air pipeline failed")
            return {
                "mode": "air",
                "simulation": normalized.get("mode") == "simulation" if normalized else False,
                "best": None,
                "alternatives": [],
                "all": [],
                "error": str(e)
            }
