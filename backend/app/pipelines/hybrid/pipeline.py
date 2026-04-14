# This pipeline combines road, rail, and air results, then attaches Gemini-backed natural-language explainability.
from app.services.pipeline_registry import get_pipeline
from .normalizer import normalize_road, normalize_rail, normalize_air
from .explain import build_hybrid_explanations


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


        # --- NEW: relative normalization ---
        candidates = normalized

        best_time = min(c["time_hr"] for c in candidates)
        best_cost = min(c["cost_inr"] for c in candidates)
        best_risk = min(c["risk"] for c in candidates)

        for c in candidates:
            c["norm_time"] = c["time_hr"] / max(best_time, 1e-6)
            c["norm_cost"] = c["cost_inr"] / max(best_cost, 1e-6)
            c["norm_risk"] = c["risk"] / max(best_risk, 1e-6)

        # --- NEW: dominance check ---
        def dominates(a, b):
            better_or_equal = (
                a["time_hr"] <= b["time_hr"] and
                a["cost_inr"] <= b["cost_inr"] and
                a["risk"] <= b["risk"]
            )
            strictly_better = (
                a["time_hr"] < b["time_hr"] or
                a["cost_inr"] < b["cost_inr"] or
                a["risk"] < b["risk"]
            )
            return better_or_equal and strictly_better

        dominant = None
        for c1 in candidates:
            if all(dominates(c1, c2) for c2 in candidates if c1 != c2):
                dominant = c1
                break

        # --- NEW: non-linear penalty ---
        def compute_penalty(c):
            penalty = 0

            if c["norm_time"] > 2:
                penalty += 0.4
            elif c["norm_time"] > 1.5:
                penalty += 0.2

            if c["norm_cost"] > 3:
                penalty += 0.3
            elif c["norm_cost"] > 2:
                penalty += 0.15

            return penalty

        # --- NEW: priority weights ---
        if priority == "cost":
            w = {"time": 0.2, "cost": 0.6, "risk": 0.2}
        elif priority == "time":
            w = {"time": 0.6, "cost": 0.2, "risk": 0.2}
        elif priority == "safety":
            w = {"time": 0.2, "cost": 0.2, "risk": 0.6}
        else:
            w = {"time": 0.4, "cost": 0.3, "risk": 0.3}

        # --- NEW: scoring ---
        if dominant:
            best = dominant
            ranked = sorted(candidates, key=lambda x: (
                x["time_hr"], x["cost_inr"], x["risk"]
            ))
        else:
            for c in candidates:
                penalty = compute_penalty(c)
                c["score"] = (
                    w["time"] * c["norm_time"] +
                    w["cost"] * c["norm_cost"] +
                    w["risk"] * c["norm_risk"]
                ) + penalty

            ranked = sorted(candidates, key=lambda x: x["score"])
            best = ranked[0]

        # --- cleanup temp fields ---
        for c in candidates:
            c.pop("norm_time", None)
            c.pop("norm_cost", None)
            c.pop("norm_risk", None)
            c.pop("score", None)

        # --- explainability ---
        explanations = build_hybrid_explanations(priority, ranked)
        reason = explanations["reason"]
        tradeoffs = explanations["tradeoffs"]
        mode_insights = explanations["mode_insights"]
        route_explanations = explanations["route_explanations"]

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
                    "confidence": round(r["confidence"], 2),
                    "explanation": route_explanations.get(r["mode"], "")
                }
                for r in ranked
            ],
            "best_per_mode": {
                "road": road_best,
                "rail": rail_best,
                "air": air_best
            }
        }
