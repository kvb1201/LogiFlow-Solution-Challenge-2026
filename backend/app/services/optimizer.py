from app.services.pipeline_registry import PIPELINES
from app.services.enricher import enrich_segment
from app.services.validator import validate_route


def generate_all_routes(source, destination, constraints):
    routes = []

    excluded = constraints.get("excluded_modes", []) if constraints else []

    for pipeline in PIPELINES:
        if pipeline.mode in excluded:
            continue

        routes.extend(pipeline.generate(source, destination))

    return routes


def optimize_routes(data):
    # Generate routes using pipelines
    routes = generate_all_routes(
        data.source,
        data.destination,
        data.constraints.dict() if data.constraints else {},
    )

    # Apply budget and deadline constraints (if provided)
    if data.constraints:
        budget = data.constraints.budget
        deadline = data.constraints.deadline_hours

        filtered_routes = []
        for r in routes:
            if budget is not None and r.get("cost", float("inf")) > budget:
                continue
            if deadline is not None and r.get("time", float("inf")) > deadline:
                continue
            filtered_routes.append(r)

        # If no routes satisfy constraints, return informative response
        if not filtered_routes:
            return {
                "error": "No routes satisfy given constraints",
                "routes_before_filter": len(routes)
            }

        routes = filtered_routes

    if not routes:
        return {"error": "No routes available after applying constraints"}

    preferred = data.preferences.preferred_mode if data.preferences else None

    for r in routes:
        validate_route(r)

    # Precompute normalization factors (min-max normalization)
    max_cost = max(r.get("cost", 1) for r in routes)
    min_cost = min(r.get("cost", 0) for r in routes)

    max_time = max(r.get("time", 1) for r in routes)
    min_time = min(r.get("time", 0) for r in routes)

    # Score routes (priority + cargo aware)
    cargo_type = data.cargo_type if hasattr(data, "cargo_type") else "general"

    for r in routes:
        cost = r.get("cost", 0)
        time = r.get("time", 0)
        risk = r.get("risk", 0)

        # Min-max normalization for better spread
        cost_norm = (cost - min_cost) / (max_cost - min_cost) if max_cost != min_cost else 0
        time_norm = (time - min_time) / (max_time - min_time) if max_time != min_time else 0
        risk_norm = risk  # already 0–1

        # Base weights from priority
        if data.priority == "cheapest":
            w_cost, w_time, w_risk = 0.6, 0.25, 0.15
        elif data.priority == "fastest":
            w_cost, w_time, w_risk = 0.2, 0.6, 0.2
        elif data.priority == "safest":
            w_cost, w_time, w_risk = 0.15, 0.25, 0.6
        else:
            w_cost, w_time, w_risk = 0.33, 0.33, 0.34

        # Adjust weights based on cargo type
        if cargo_type == "fragile":
            w_risk += 0.15
            w_cost -= 0.05
            w_time -= 0.10
        elif cargo_type == "perishable":
            w_time += 0.15
            w_risk += 0.05
            w_cost -= 0.20

        # Normalize weights
        total_w = w_cost + w_time + w_risk
        w_cost, w_time, w_risk = w_cost/total_w, w_time/total_w, w_risk/total_w

        # Final score (lower is better)
        r["score"] = (
            w_cost * cost_norm +
            w_time * time_norm +
            w_risk * risk_norm
        )

        # Attach debug info (very useful for frontend explainability)
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

    # Debug: ensure variation in scoring
    # print([ (r["type"], r["score"]) for r in routes ])

    # Sort routes based on score
    routes.sort(key=lambda x: x["score"])

    best = routes[0]

    return {
        "best_route": {
            "type": best["type"],
            "total_time": best["time"],
            "total_cost": best["cost"],
            "risk": best["risk"],
            "segments": [enrich_segment(s) for s in best["segments"]],
            "explanation": f"Selected as best route for {data.priority.lower()} priority and {cargo_type} cargo",
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