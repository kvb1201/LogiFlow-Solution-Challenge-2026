from app.services.pipeline_registry import get_pipeline
from .normalizer import normalize_road, normalize_rail, normalize_air
from .comparator import score_routes
from .explain import generate_tradeoffs, generate_mode_insights, generate_reason


class HybridPipeline:
    def generate(self, source, destination, payload=None):
        payload = payload or {}
        priority = payload.get("priority") or "balanced"

        road_pipeline = get_pipeline("road")
        rail_pipeline = get_pipeline("rail")
        air_pipeline = get_pipeline("air")

        # --- PARALLEL PIPELINE EXECUTION WITH TIMEOUT ---
        from concurrent.futures import ThreadPoolExecutor

        def safe_call(pipeline, name):
            try:
                return pipeline.generate(source, destination, payload)
            except Exception as e:
                print(f"[HYBRID ERROR] {name} pipeline failed: {e}")
                return {}

        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                "road": executor.submit(safe_call, road_pipeline, "road"),
                "rail": executor.submit(safe_call, rail_pipeline, "rail"),
                "air": executor.submit(safe_call, air_pipeline, "air")
            }

            results = {}

            for name, future in futures.items():
                try:
                    results[name] = future.result()
                    if results[name]:
                        print(f"[HYBRID SUCCESS] {name} returned data")
                    else:
                        print(f"[HYBRID EMPTY] {name} returned empty result")
                except Exception as e:
                    print(f"[HYBRID ERROR] {name} execution error: {e}")
                    results[name] = {}

        road_res = results.get("road", {})
        rail_res = results.get("rail", {})
        air_res = results.get("air", {})

        # --- extract best routes ---
        road_best = road_res.get("best")

        # Debug print for rail_res
        print("\n[HYBRID DEBUG] rail_res:", rail_res, "\n")

        if priority == "cost":
            rail_best = rail_res.get("cheapest")
        elif priority == "time":
            rail_best = rail_res.get("fastest")
        elif priority == "safety":
            rail_best = rail_res.get("safest")
        else:
            rail_best = (
                rail_res.get("cheapest") or
                rail_res.get("fastest") or
                rail_res.get("safest") or
                rail_res.get("best")
            )

        # 🔥 Fallback handling if structured keys are missing
        if not rail_best:
            if isinstance(rail_res, dict):
                if rail_res.get("all"):
                    rail_best = rail_res["all"][0]
                elif rail_res.get("alternatives"):
                    rail_best = rail_res["alternatives"][0]
            elif isinstance(rail_res, list) and len(rail_res) > 0:
                rail_best = rail_res[0]

        air_best = air_res.get("best") or air_res.get("best_route")

        normalized = []

        if road_best:
            print("[HYBRID DEBUG] Using ROAD best route")
            nr = normalize_road(road_best)
            if nr:
                normalized.append(nr)
            else:
                print("[HYBRID DEBUG] Road normalization failed")

        if rail_best:
            print("[HYBRID DEBUG] Using RAIL best route")
            nr = normalize_rail(rail_best)
            if nr:
                normalized.append(nr)
            else:
                print("[HYBRID DEBUG] Rail normalization failed")

        if air_best:
            print("[HYBRID DEBUG] Using AIR best route")
            nr = normalize_air(air_best)
            if nr:
                normalized.append(nr)
            else:
                print("[HYBRID DEBUG] Air normalization failed")

        if not normalized or len(normalized) == 0:
            print("[HYBRID DEBUG] No normalized routes")
            print(f"  road_best: {road_best}")
            print(f"  rail_best: {rail_best}")
            print(f"  air_best: {air_best}")
            print(f"  raw results: {results}")
            return {"error": "No routes available"}

        ranked = score_routes(normalized, priority)
        best = ranked[0]

        # --- explainability ---
        reason = generate_reason(best, priority)
        tradeoffs = generate_tradeoffs(ranked)
        mode_insights = {r["mode"]: generate_mode_insights(r) for r in ranked}

        return {
            "priority": priority,
            "recommended_mode": best["mode"],
            "reason": reason,
            "tradeoffs": tradeoffs,
            "mode_insights": mode_insights,
            "comparison": [
                {
                    "mode": r["mode"],
                    "time_hr": round(r["time_hr"], 2),
                    "cost_inr": int(r["cost_inr"]),
                    "risk": round(r["risk"], 2),
                    "confidence": round(r["confidence"], 2)
                }
                for r in ranked
            ],
            "best_per_mode": {
                "road": road_best,
                "rail": rail_best,
                "air": air_best
            }
        }