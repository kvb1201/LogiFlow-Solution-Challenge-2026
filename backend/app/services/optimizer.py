from app.services.pipeline_registry import PIPELINES
from app.services.enricher import enrich_segment
from app.services.validator import validate_route


def _pipeline_priority(user_priority: str) -> str:
    """
    Map user-facing priority to pipeline-facing priority.

    Central scorer uses: Fast/Cheap/Safe
    Some pipelines expect: time/cost/safe/balanced
    """
    p = (user_priority or "").strip().lower()
    if p == "fast":
        return "time"
    if p == "cheap":
        return "cost"
    if p == "safe":
        return "safe"
    # Also accept already-normalized inputs
    if p in {"time", "cost", "safe", "balanced"}:
        return p
    return "balanced"


def _extract_payload(data) -> dict:
    constraints = data.constraints.dict() if getattr(data, "constraints", None) else {}
    return {
        "priority": _pipeline_priority(getattr(data, "priority", "")),
        "cargo_weight_kg": getattr(data, "cargo_weight_kg", 100),
        "cargo_type": getattr(data, "cargo_type", "General"),
        "constraints": constraints,
        "budget": constraints.get("budget_max_inr") or constraints.get("budget_limit"),
        "budget_max_inr": constraints.get("budget_max_inr"),
        "risk_threshold": constraints.get("risk_threshold"),
        "delay_tolerance_hours": constraints.get("delay_tolerance_hours"),
        "max_transshipments": constraints.get("max_transshipments"),
        "max_stops": constraints.get("max_stops"),
        "departure_date": getattr(data, "departure_date", None),
        "preferences": data.preferences.dict() if getattr(data, "preferences", None) else {},
        "cargo": data.cargo.dict() if getattr(data, "cargo", None) else {},
    }


def generate_all_routes(source, destination, constraints, payload=None):
    routes = []

    excluded = constraints.get("excluded_modes", []) if constraints else []

    for pipeline in PIPELINES:
        if pipeline.mode in excluded:
            continue

        try:
            if payload is not None:
                import inspect

                try:
                    sig = inspect.signature(pipeline.generate)
                    accepts_payload = len(sig.parameters) >= 3
                except Exception:
                    accepts_payload = False

                if accepts_payload:
                    out = pipeline.generate(source, destination, payload)
                else:
                    out = pipeline.generate(source, destination)
            else:
                out = pipeline.generate(source, destination)

            if isinstance(out, list):
                routes.extend(out)
            else:
                continue
        except Exception as e:
            print(f"[optimizer] pipeline '{pipeline.mode}' failed: {e}")
            continue

    return routes


def optimize_routes(data):
    payload = _extract_payload(data)

    routes = generate_all_routes(
        data.source,
        data.destination,
        data.constraints.dict() if data.constraints else {},
        payload=payload,
    )

    if data.constraints:
        budget = getattr(data.constraints, 'budget_limit', None) or getattr(data.constraints, 'budget_max_inr', None)
        deadline = getattr(data.constraints, 'delay_tolerance_hours', None)

        filtered_routes = []
        for r in routes:
            if budget is not None and r.get("cost", float("inf")) > budget:
                continue
            if deadline is not None and r.get("time", float("inf")) > deadline:
                continue
            filtered_routes.append(r)

        if not filtered_routes:
            return {
                "error": "No routes satisfy given constraints",
                "routes_before_filter": len(routes)
            }

        routes = filtered_routes

    if not routes:
        return {"error": "No routes available after applying constraints"}

    preferred = data.preferences.preferred_mode if data.preferences else None

    user_priority = (getattr(data, "priority", "") or "").strip()
    if user_priority.lower() in {"fast", "cheap", "safe"}:
        user_priority = user_priority.capitalize()

    for r in routes:
        validate_route(r)

    max_cost = max(r.get("cost", 1) for r in routes)
    min_cost = min(r.get("cost", 0) for r in routes)

    max_time = max(r.get("time", 1) for r in routes)
    min_time = min(r.get("time", 0) for r in routes)

    cargo_type = getattr(data, "cargo_type", "general")

    for r in routes:
        cost = r.get("cost", 0)
        time = r.get("time", 0)
        risk = r.get("risk", 0)

        cost_norm = (cost - min_cost) / (max_cost - min_cost) if max_cost != min_cost else 0
        time_norm = (time - min_time) / (max_time - min_time) if max_time != min_time else 0
        risk_norm = risk

        if data.priority == "cheapest" or user_priority == "Cheap":
            w_cost, w_time, w_risk = 0.6, 0.25, 0.15
        elif data.priority == "fastest" or user_priority == "Fast":
            w_cost, w_time, w_risk = 0.2, 0.6, 0.2
        elif data.priority == "safest" or user_priority == "Safe":
            w_cost, w_time, w_risk = 0.15, 0.25, 0.6
        else:
            w_cost, w_time, w_risk = 0.33, 0.33, 0.34

        if cargo_type == "fragile":
            w_risk += 0.15
            w_cost -= 0.05
            w_time -= 0.10
        elif cargo_type == "perishable":
            w_time += 0.15
            w_risk += 0.05
            w_cost -= 0.20

        total_w = w_cost + w_time + w_risk
        w_cost, w_time, w_risk = w_cost/total_w, w_time/total_w, w_risk/total_w

        r["score"] = (
            w_cost * cost_norm +
            w_time * time_norm +
            w_risk * risk_norm
        )

        r["score_breakdown"] = {
            "weights": {
                "cost": round(w_cost, 2),
                "time": round(w_time, 2),
                "risk": round(w_risk, 2)
            },
            "components": {
                "cost": cost,
                "time": time,
                "risk": risk
            },
            "normalized": {
                "cost": round(cost_norm, 3),
                "time": round(time_norm, 3),
                "risk": round(risk_norm, 3)
            }
        }

    routes.sort(key=lambda x: x["score"])

    best = routes[0]

    return {
        "best_route": {
            "type": best["type"],
            "total_time": best["time"],
            "total_cost": best["cost"],
            "risk": best["risk"],
            "segments": [enrich_segment(s) for s in best["segments"]],
            "explanation": f"Selected as best route for {user_priority.lower()} priority and {cargo_type} cargo",
        },
        "alternatives": [
            {
                "mode": r["type"],
                "time": r["time"],
                "cost": r["cost"],
                "risk": r["risk"],
                "score": r["score"]
            }
            for r in routes[1:]
        ],
    }
