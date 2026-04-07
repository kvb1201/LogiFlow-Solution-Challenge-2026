
from app.services.pipeline_registry import PIPELINES
from app.services.scorer import score_route
from app.services.enricher import enrich_segment
from app.services.validator import validate_route


def _build_pipeline_payload(data):
    cargo = getattr(data, "cargo", None)
    constraints = getattr(data, "constraints", None)

    return {
        "priority": getattr(data, "priority", "balanced"),
        "preferences": data.preferences.dict() if getattr(data, "preferences", None) else {},
        "constraints": constraints.dict() if constraints else {},
        "cargo": cargo.dict() if cargo else {},
    }


def generate_all_routes(source, destination, constraints, pipeline_payload):
    routes = []

    excluded = constraints.get("excluded_modes", []) if constraints else []

    for pipeline in PIPELINES:
        if pipeline.mode in excluded:
            continue

        try:
            generated = pipeline.generate(source, destination, pipeline_payload)
        except TypeError:
            generated = pipeline.generate(source, destination)

        routes.extend(generated)

    return routes


def optimize_routes(data):
    pipeline_payload = _build_pipeline_payload(data)

    # Generate routes using pipelines
    routes = generate_all_routes(
        data.source,
        data.destination,
        data.constraints.dict() if data.constraints else {},
        pipeline_payload,
    )

    if not routes:
        return {"error": "No routes available after applying constraints"}

    preferred = data.preferences.preferred_mode if data.preferences else None

    for r in routes:
        validate_route(r)

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
