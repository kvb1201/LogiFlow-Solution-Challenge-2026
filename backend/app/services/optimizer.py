

from app.services.pipeline_registry import PIPELINES
from app.services.scorer import score_route
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
        "budget": constraints.get("budget_max_inr"),
        # Keep original constraint names too (water pipeline reads from constraints)
        "budget_max_inr": constraints.get("budget_max_inr"),
        "risk_threshold": constraints.get("risk_threshold"),
        "delay_tolerance_hours": constraints.get("delay_tolerance_hours"),
        "max_transshipments": constraints.get("max_transshipments"),
    }


def generate_all_routes(source, destination, constraints, payload=None):
    routes = []

    excluded = constraints.get("excluded_modes", []) if constraints else []

    for pipeline in PIPELINES:
        if pipeline.mode in excluded:
            continue

        try:
            if payload is not None:
                # Prefer signature-based detection to avoid swallowing real TypeErrors.
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
                # Best-effort compatibility: ignore non-list outputs in central optimizer.
                # (Road is handled via an adapter; this is extra safety.)
                continue
        except Exception as e:
            # Never let one pipeline failure kill the multimodal optimizer.
            print(f"[optimizer] pipeline '{pipeline.mode}' failed: {e}")
            continue

    return routes


def optimize_routes(data):
    payload = _extract_payload(data)
    # Generate routes using pipelines
    routes = generate_all_routes(
        data.source,
        data.destination,
        data.constraints.dict() if data.constraints else {},
        payload=payload,
    )

    if not routes:
        return {"error": "No routes available after applying constraints"}

    preferred = data.preferences.preferred_mode if data.preferences else None

    # Normalize priority for scorer (Fast/Cheap/Safe)
    user_priority = (getattr(data, "priority", "") or "").strip()
    if user_priority.lower() in {"fast", "cheap", "safe"}:
        user_priority = user_priority.capitalize()

    for r in routes:
        validate_route(r)

    # Score routes
    for r in routes:
        r["score"] = score_route(r, user_priority, preferred)

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
            "explanation": f"Selected based on {user_priority.lower()} priority",
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
