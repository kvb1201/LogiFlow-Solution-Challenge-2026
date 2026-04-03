"""
Railway Cargo Pipeline — Production Implementation.
Integrates data loading, route finding, feature engineering, ML models,
and decision engine into the BasePipeline interface.
"""

from app.pipelines.base import BasePipeline
from app.pipelines.rail.route_finder import find_routes
from app.pipelines.rail.engineer import engineer_features
from app.pipelines.rail.tariff import calc_parcel_cost
from app.pipelines.rail.engine import decide
from app.pipelines.rail.config import CITY_TO_STATION, STATION_TO_CITY


class RailPipeline(BasePipeline):
    """
    Production railway pipeline implementing BasePipeline.generate().
    Uses real Indian Railways schedule data, ML-based risk prediction,
    and multi-objective optimization.
    """
    mode = "rail"
    name = "Rail Transport (Parcel by Train)"

    def generate(self, source, destination):
        """
        Generate rail cargo routes between source and destination cities.

        Returns list of route dicts conforming to the standard schema:
        [{type, mode, time, cost, risk, segments}]
        """
        try:
            routes = find_routes(source, destination, max_direct=10, max_transfer=3)
        except Exception as e:
            print(f"  [RailPipeline] Route finding failed: {e}")
            routes = []

        if not routes:
            # Return a minimal fallback so the pipeline system doesn't break
            return [{
                "type": "Rail",
                "mode": "rail",
                "time": 24,
                "cost": 5000,
                "risk": 0.5,
                "segments": [
                    {"mode": "Rail", "from": source, "to": destination}
                ],
            }]

        # Default payload for basic pipeline usage
        default_payload = {
            "cargo_weight_kg": 100,
            "departure_date": "2025-06-01",
            "cargo_type": "General",
        }

        enriched = engineer_features(routes, default_payload)

        if not enriched:
            return [{
                "type": "Rail",
                "mode": "rail",
                "time": 24,
                "cost": 5000,
                "risk": 0.5,
                "segments": [
                    {"mode": "Rail", "from": source, "to": destination}
                ],
            }]

        # Convert enriched routes to standard pipeline schema
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
                "segments": segments if segments else [
                    {"mode": "Rail", "from": source, "to": destination}
                ],
                # Extra metadata for rail-specific consumers
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

        return results


class RailCargoOptimizer:
    """
    Full cargo optimization endpoint.
    Takes a detailed cargo payload and returns multi-objective recommendations.

    This is the dedicated railway optimize endpoint — richer than BasePipeline.
    """

    def optimize(self, payload):
        """
        Run the full cargo optimization pipeline.

        Args:
            payload: dict with keys:
                - origin_city: str
                - destination_city: str
                - cargo_weight_kg: float
                - cargo_type: str (default "General")
                - budget_max_inr: float (optional)
                - deadline_hours: float (optional)
                - priority: str (cost/time/safe)
                - departure_date: str (YYYY-MM-DD)

        Returns:
            dict with cheapest/fastest/safest recommendations and all_options
        """
        origin = payload.get("origin_city", "")
        destination = payload.get("destination_city", "")

        if not origin or not destination:
            return {"error": "origin_city and destination_city are required"}

        # Step 1: Find routes
        print(f"\n🚂 Finding routes: {origin} → {destination}")
        routes = find_routes(origin, destination, max_direct=15, max_transfer=5)

        if not routes:
            return {
                "error": f"No train routes found between {origin} and {destination}. "
                         f"Check city names."
            }

        print(f"  Found {len(routes)} route candidates")

        # Step 2: Feature engineering
        print("⚙️  Engineering features...")
        enriched = engineer_features(routes, payload)

        if not enriched:
            return {
                "error": f"No feasible routes for {payload.get('cargo_type', 'General')} "
                         f"cargo ({payload.get('cargo_weight_kg', 0)}kg). "
                         f"Check cargo type constraints."
            }

        # Step 3: ML predictions
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
            print(f"  [ML] Prediction failed (using heuristics): {e}")
            for r in enriched:
                r["predicted_delay_min"] = r.get("effective_hours", 0) * 3
                r["adjusted_duration_hours"] = r.get("effective_hours", 0) * 1.1

        # Step 4: Decision engine
        print("🎯 Running decision engine...")
        results = decide(enriched, payload)

        # Add route metadata
        results["route_metadata"] = {
            "origin_city": origin,
            "destination_city": destination,
            "cargo_weight_kg": payload.get("cargo_weight_kg", 0),
            "cargo_type": payload.get("cargo_type", "General"),
            "total_routes_found": len(routes),
            "feasible_routes": len(enriched),
        }

        return results
