# This pipeline combines road, rail, and air results, then attaches Gemini-backed natural-language explainability.
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from app.services.pipeline_registry import get_pipeline
from app.utils.request_context import RequestContext
from .normalizer import normalize_road, normalize_rail, normalize_air
from .explain import build_hybrid_explanations

# Step 3: Canonical priority labels
_PRIORITY_ALIASES = {
    "cost": "cheap",
    "cheap": "cheap",
    "cheapest": "cheap",
    "time": "fast",
    "fast": "fast",
    "fastest": "fast",
    "speed": "fast",
    "safety": "safe",
    "safe": "safe",
    "safest": "safe",
    "reliable": "safe",
    "balanced": "balanced",
}

_PIPELINE_TIMEOUT_S = 30


class HybridPipeline:
    def generate(self, source, destination, payload=None, context=None):
        payload = payload or {}
        raw_priority = payload.get("priority") or "balanced"
        priority = _PRIORITY_ALIASES.get(raw_priority.lower().strip(), "balanced")

        # Create a shared request context for cross-pipeline caching
        # (weather, geocoding, incidents) to eliminate redundant API calls.
        if context is None:
            context = RequestContext()

        road_pipeline = get_pipeline("road")
        rail_pipeline = get_pipeline("rail")
        air_pipeline = get_pipeline("air")

        # --- Step 1: PARALLEL PIPELINE EXECUTION WITH TIMEOUT ---

        def safe_call(pipeline, name):
            try:
                return pipeline.generate(source, destination, payload, context=context)
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
            timed_out_modes = []

            for name, future in futures.items():
                try:
                    results[name] = future.result(timeout=_PIPELINE_TIMEOUT_S)
                    if results[name]:
                        print(f"[HYBRID SUCCESS] {name} returned data")
                    else:
                        print(f"[HYBRID EMPTY] {name} returned empty result")
                except FuturesTimeoutError:
                    print(f"[HYBRID] Timeout: {name} (>{_PIPELINE_TIMEOUT_S}s)")
                    timed_out_modes.append(name)
                    results[name] = {}
                    future.cancel()
                except Exception as e:
                    print(f"[HYBRID ERROR] {name} execution error: {e}")
                    results[name] = {}

        road_res = results.get("road", {})
        rail_res = results.get("rail", {})
        air_res = results.get("air", {})

        # --- Step 2: extract best routes with no_routes detection ---

        def extract_best(res, mode):
            # Handle list responses
            if isinstance(res, list):
                return res[0] if res else None

            # Handle dict responses
            if isinstance(res, dict):
                if mode == "rail":
                    # priority-aware selection (using canonical labels)
                    if priority == "cheap":
                        candidate = res.get("cheapest")
                    elif priority == "fast":
                        candidate = res.get("fastest")
                    elif priority == "safe":
                        candidate = res.get("safest")
                    else:
                        candidate = (
                            res.get("cheapest") or
                            res.get("fastest") or
                            res.get("safest") or
                            res.get("best")
                        )
                else:
                    candidate = res.get("best") or res.get("best_route")

                # fallback handling
                if not candidate:
                    if res.get("all"):
                        return res["all"][0]
                    if res.get("alternatives"):
                        return res["alternatives"][0]

                return candidate

            return None

        road_best = extract_best(road_res, "road")

        # --- Detect rail "no_routes" status before extracting best ---
        rail_no_routes = False
        if isinstance(rail_res, dict) and rail_res.get("status") == "no_routes":
            rail_no_routes = True
            rail_best = None
            print(f"[HYBRID] Mode skipped: rail ({rail_res.get('message', 'no routes')})")
        elif "rail" in timed_out_modes:
            rail_no_routes = True
            rail_best = None
        else:
            rail_best = extract_best(rail_res, "rail")

        # --- Detect air "no_routes" status before extracting best ---
        air_no_routes = False
        if isinstance(air_res, dict) and air_res.get("status") == "no_routes":
            air_no_routes = True
            air_best = None
            print(f"[HYBRID] Mode skipped: air ({air_res.get('message', 'no routes')})")
        elif "air" in timed_out_modes:
            air_no_routes = True
            air_best = None
        else:
            air_best = extract_best(air_res, "air")

        normalized = []

        if road_best:
            nr = normalize_road(road_best)
            if nr:
                normalized.append(nr)
            else:
                print("[HYBRID] Road normalization failed")

        if rail_best:
            nr = normalize_rail(rail_best)
            if nr:
                normalized.append(nr)
            else:
                print("[HYBRID] Rail normalization failed")

        if air_best:
            # Reject low-confidence or fallback air routes
            air_confidence = air_best.get("confidence_score", 0)
            air_is_fallback = air_best.get("is_fallback", False)
            if air_confidence < 60:
                print(f"[HYBRID] Mode skipped: air (low confidence {air_confidence})")
                air_best = None
            elif air_is_fallback and air_best.get("data_source") == "mock":
                print(f"[HYBRID] Mode skipped: air (mock fallback, confidence={air_confidence})")
                air_best = None
            else:
                nr = normalize_air(air_best)
                if nr:
                    normalized.append(nr)
                else:
                    print("[HYBRID] Air normalization failed")

        if not normalized:
            # Step 7: available_modes will be empty
            unavailable = {}
            if not road_best:
                unavailable["road"] = "Road transport not available for this route"
            if rail_no_routes or not rail_best:
                unavailable["rail"] = "Rail transport not available for this route"
            if air_no_routes or not air_best:
                unavailable["air"] = "Air transport not available for this route"
            return {
                "error": "No routes available for any transport mode",
                "available_modes": [],
                "unavailable_modes": unavailable,
            }

        # --- Step 7: Track which modes are actually in the comparison ---
        available_modes = [c["mode"] for c in normalized]
        print(f"[HYBRID] Final modes used: {', '.join(available_modes)}")

        # --- Step 5: Clean scoring (single pass) ---
        candidates = normalized

        best_time = min(c["time_hr"] for c in candidates)
        best_cost = min(c["cost_inr"] for c in candidates)
        best_risk = min(c["risk"] for c in candidates)

        for c in candidates:
            c["norm_time"] = c["time_hr"] / max(best_time, 1e-6)
            c["norm_cost"] = c["cost_inr"] / max(best_cost, 1e-6)
            c["norm_risk"] = c["risk"] / max(best_risk, 1e-6)

        # --- dominance check ---
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

        # --- non-linear penalty ---
        def compute_penalty(c):
            penalty = 0.0
            if c["norm_time"] > 2:
                penalty += 0.4
            elif c["norm_time"] > 1.5:
                penalty += 0.2
            if c["norm_cost"] > 3:
                penalty += 0.3
            elif c["norm_cost"] > 2:
                penalty += 0.15
            return penalty

        # --- Step 3: priority weights using canonical labels ---
        if priority == "cheap":
            w = {"time": 0.2, "cost": 0.6, "risk": 0.2}
        elif priority == "fast":
            w = {"time": 0.6, "cost": 0.2, "risk": 0.2}
        elif priority == "safe":
            w = {"time": 0.2, "cost": 0.2, "risk": 0.6}
        else:  # balanced
            w = {"time": 0.4, "cost": 0.3, "risk": 0.3}

        # --- scoring ---
        if dominant:
            best = dominant
            ranked = sorted(candidates, key=lambda x: (
                x["time_hr"], x["cost_inr"], x["risk"]
            ))
        else:
            for c in candidates:
                penalty = compute_penalty(c)
                score = (
                    w["time"] * c["norm_time"] +
                    w["cost"] * c["norm_cost"] +
                    w["risk"] * c["norm_risk"]
                ) + penalty
                c["score"] = max(score, 0.0)  # Step 5: ensure no negative scores

            ranked = sorted(candidates, key=lambda x: x["score"])
            best = ranked[0]

        # --- cleanup temp fields ---
        for c in candidates:
            c.pop("norm_time", None)
            c.pop("norm_cost", None)
            c.pop("norm_risk", None)
            c.pop("score", None)

        # --- Step 6: explainability (only with available modes) ---
        explanations = build_hybrid_explanations(priority, ranked)
        reason = explanations["reason"]
        tradeoffs = explanations["tradeoffs"]
        mode_insights = explanations["mode_insights"]
        route_explanations = explanations["route_explanations"]

        # --- Step 2+7: unavailable modes ---
        unavailable_modes = {}
        if air_no_routes or air_best is None:
            unavailable_modes["air"] = "Air transport not available for this route"
        if rail_no_routes or rail_best is None:
            unavailable_modes["rail"] = "Rail transport not available for this route"
        if not road_best:
            unavailable_modes["road"] = "Road transport not available for this route"

        result = {
            "priority": priority,
            "recommended_mode": best["mode"],
            "reason": reason,
            "tradeoffs": tradeoffs,
            "mode_insights": mode_insights,
            "available_modes": available_modes,
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

        if unavailable_modes:
            result["unavailable_modes"] = unavailable_modes

        return result
