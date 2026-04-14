"""
Railway Cargo Pipeline — Production Implementation.
Integrates data loading, route finding, feature engineering, ML models,
and decision engine into the BasePipeline interface.
"""

import os
import time

from app.pipelines.base import BasePipeline
from app.pipelines.rail.route_finder import find_routes
from app.pipelines.rail.engineer import engineer_features
from app.pipelines.rail.tariff import calc_parcel_cost
from app.pipelines.rail.engine import decide
from app.pipelines.rail.config import CITY_TO_STATION, STATION_TO_CITY

_ENABLE_LLM_EXPLANATION = os.getenv("RAIL_ENABLE_LLM_EXPLANATION", "true").lower() == "true"
_LLM_EXPLANATION_TIMEOUT_S = int(os.getenv("RAIL_LLM_EXPLANATION_TIMEOUT_S", "4"))
_OPTIMIZE_RESPONSE_BUDGET_S = float(os.getenv("RAIL_OPTIMIZE_RESPONSE_BUDGET_S", "20"))


class RailPipeline(BasePipeline):
    """
    Production railway pipeline implementing BasePipeline.generate().
    Uses real Indian Railways schedule data, ML-based risk prediction,
    and multi-objective optimization.
    """
    mode = "rail"
    name = "Rail Transport (Parcel by Train)"

    def generate(self, source, destination, payload=None):
        """
        Generate rail cargo routes between source and destination cities.705072
        """
        try:
            departure_date = (payload or {}).get("departure_date")
            # API-first route discovery; CSV is used only as fallback inside find_routes.
            routes = find_routes(
                source,
                destination,
                max_direct=10,
                max_transfer=3,
                use_api=True,
                date_of_journey=departure_date,
            )
        except Exception as e:
            print(f"  [RailPipeline] Route finding failed: {e}")
            routes = []

        if not routes:
            fallback = {
                "type": "Rail",
                "mode": "rail",
                "time": 24,
                "cost": 5000,
                "risk": 0.5,
                "segments": [{"mode": "Rail", "from": source, "to": destination}],
            }
            return {
                "best": fallback,
                "alternatives": [],
                "all": [fallback]
            }

        default_payload = {
            "cargo_weight_kg": 100,
            "departure_date": "2025-06-01",
            "cargo_type": "General",
            "origin_city": source,
            "destination_city": destination,
        }
        if payload:
            default_payload.update(payload)

        enriched = engineer_features(routes, default_payload)
        if not enriched:
            fallback = {
                "type": "Rail",
                "mode": "rail",
                "time": 24,
                "cost": 5000,
                "risk": 0.5,
                "segments": [{"mode": "Rail", "from": source, "to": destination}],
            }
            return {
                "best": fallback,
                "alternatives": [],
                "all": [fallback]
            }

        results = []
        for r in enriched:
            segments = []
            for seg in r.get("segments", []):
                segments.append({
                    "mode": "Rail",
                    "from": seg.get("from_name", seg.get("from", source)),
                    "to": seg.get("to_name", seg.get("to", destination)),
                    "train_no": seg.get("train_no", ""),
                    "train_name": seg.get("train_name", ""),
                    "departure": seg.get("departure", ""),
                    "arrival": seg.get("arrival", ""),
                    "distance_km": seg.get("distance_km", 0),
                })

            results.append({
                "type": "Rail",
                "mode": "rail",
                "time": r.get("effective_hours", 24),
                "cost": r.get("parcel_cost_inr", 5000),
                "risk": r.get("risk_score", 0.5),
                "segments": segments if segments else [{"mode": "Rail", "from": source, "to": destination}],
                "rail_details": {
                    "route_type": r.get("route_type", "direct"),
                    "distance_km": r.get("total_distance_km", 0),
                    "has_transfer": r.get("has_transfer", False),
                    "parcel_van_type": r.get("parcel_van_type", "SLR"),
                    "punctuality_pct": r.get("punctuality_pct", 60),
                    "booking_ease": r.get("booking_ease", 0.5),
                    "tariff_scale": r.get("tariff_scale", "S"),
                    "tariff_breakdown": r.get("tariff_breakdown", {}),
                },
            })
        # Sort routes by simple score (cost + time + risk)
        ranked = sorted(results, key=lambda x: (x["cost"], x["time"], x["risk"]))

        best = ranked[0]
        alternatives = ranked[1:]

        return {
            "best": best,
            "alternatives": alternatives,
            "all": ranked
        }


class RailCargoOptimizer:
    """
    Full cargo optimization endpoint.
    Takes a detailed cargo payload and returns multi-objective recommendations.
    """

    def optimize(self, payload: dict) -> dict:
        """
        Main entry point for cargo optimization.
        """
        try:
            started_at = time.monotonic()
            origin = payload.get("origin_city", "")
            destination = payload.get("destination_city", "")

            if not origin or not destination:
                return {"error": "origin_city and destination_city are required"}

            print(f"\n🚂 Finding routes: {origin} → {destination}")
            departure_date = payload.get("departure_date")
            # API-first route discovery; CSV is used only as fallback inside find_routes.
            routes = find_routes(
                origin,
                destination,
                max_direct=15,
                max_transfer=5,
                use_api=True,
                date_of_journey=departure_date,
            )
            if not routes:
                try:
                    from app.pipelines.rail.route_finder import get_station_candidates

                    origin_codes = get_station_candidates(origin)
                    dest_codes = get_station_candidates(destination)
                    origin_hint = ", ".join([c.upper() for c in origin_codes[:6] if c])
                    dest_hint = ", ".join([c.upper() for c in dest_codes[:6] if c])
                    hint = ""
                    if origin_hint or dest_hint:
                        hint = (
                            f" You may try with the actual station codes shown here: "
                            f"{origin} → [{origin_hint or origin.upper()}], "
                            f"{destination} → [{dest_hint or destination.upper()}]."
                        )
                except Exception:
                    hint = ""
                return {
                    "error": (
                        "Sorry, this train route is not available right now on ConfirmTkt. "
                        "We are continuously expanding route coverage."
                        + hint
                    )
                }

            print(f"  Found {len(routes)} route candidates")

            print("⚙️ Engineering features...")
            enriched = engineer_features(routes, payload)
            if not enriched:
                return {
                    "error": (
                        "Sorry, this train route is not available right now for your selection. "
                        "We are continuously expanding route coverage."
                    )
                }

            try:
                from app.pipelines.rail.ml_models import predict_delay, predict_duration_factor
                print("🤖 Running ML predictions...")
                for r in enriched:
                    delay = predict_delay(r)
                    duration_factor = predict_duration_factor(r)
                    r["predicted_delay_min"] = delay
                    r["duration_factor"] = duration_factor
                    r["adjusted_duration_hours"] = round(
                        r.get("effective_hours", 0) * duration_factor + (delay / 60), 2
                    )
            except Exception as e:
                print(f"  [ML] Prediction failed: {e}")
                for r in enriched:
                    r["predicted_delay_min"] = r.get("effective_hours", 0) * 3
                    r["adjusted_duration_hours"] = r.get("effective_hours", 0) * 1.1

            print("🎯 Running decision engine...")
            results = decide(enriched, payload)

            # ── Optional LLM explainability (kept off by default for API latency) ─
            if _ENABLE_LLM_EXPLANATION:
                try:
                    elapsed = time.monotonic() - started_at
                    remaining = _OPTIMIZE_RESPONSE_BUDGET_S - elapsed
                    # Never let explanation generation block a response near timeout.
                    if remaining < 1.5:
                        raise TimeoutError("Skipping LLM explanation due to response budget.")

                    from app.services.train_explanation import generate_train_explanation

                    ctx = {
                        "origin": origin,
                        "destination": destination,
                        "railyatri_past_track_record": (
                            enriched[0].get("railyatri_past_track_record") if enriched else None
                        ),
                    }
                    priority_map = {
                        "cost": "cheapest",
                        "cheap": "cheapest",
                        "cheapest": "cheapest",
                        "time": "fastest",
                        "fast": "fastest",
                        "fastest": "fastest",
                        "speed": "fastest",
                        "safe": "safest",
                        "safety": "safest",
                        "safest": "safest",
                        "reliable": "safest",
                    }
                    target_key = priority_map.get(str(payload.get("priority", "cost")).lower(), "cheapest")
                    rec = results.get(target_key)
                    if isinstance(rec, dict):
                        llm_timeout = max(1, min(_LLM_EXPLANATION_TIMEOUT_S, int(remaining)))
                        exp = generate_train_explanation(
                            rec,
                            context=ctx,
                            timeout_s=llm_timeout,
                        )
                        if exp:
                            rec["llm_explanation"] = exp
                except Exception:
                    pass

            results["route_metadata"] = {
                "origin_city": origin,
                "destination_city": destination,
                "cargo_weight_kg": payload.get("cargo_weight_kg", 0),
                "cargo_type": payload.get("cargo_type", "General"),
                "total_routes_found": len(routes),
                "feasible_routes": len(enriched),
            }

            if enriched:
                results["weather_context"] = {
                    "weather_data": enriched[0].get("weather_data"),
                    "weather_factor": enriched[0].get("weather_factor", 1.0),
                    "weather_risk": enriched[0].get("weather_risk", 0.0),
                }

            return results
        except Exception as e:
            print(f"  [Pipeline] CRITICAL ERROR: {e}")
            import traceback
            traceback.print_exc()
            return {"error": f"Internal pipeline error: {str(e)}"}
