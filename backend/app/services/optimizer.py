

from app.services.pipeline_registry import PIPELINES
from app.services.scorer import score_route
from app.services.enricher import enrich_segment


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

    if not routes:
        return {"error": "No routes available after applying constraints"}

    preferred = data.preferences.preferred_mode if data.preferences else None

    # Score routes
    for r in routes:
        r["score"] = score_route(r, data.priority, preferred)

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
            "explanation": f"Selected based on {data.priority.lower()} priority",
        },
        "alternatives": [
            {
                "mode": r["type"],
                "time": r["time"],
                "cost": r["cost"],
                "risk": r["risk"],
            }
            for r in routes[1:]
        ],
    }