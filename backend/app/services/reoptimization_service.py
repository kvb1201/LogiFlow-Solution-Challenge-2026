from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from app.models.domain import ShipmentReport
from app.utils.coordinates import get_coords


# ---------------------------------------------------------------------------
# Thresholds for reoptimization recommendation
# ---------------------------------------------------------------------------
_TIME_THRESHOLD_MINUTES = 15    # must save > 15 min
_COST_THRESHOLD_PCT     = 5.0   # must save > 5%
_RISK_THRESHOLD_PCT     = 5.0   # must reduce > 5%


def _number(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def extract_plan_metrics(result: Optional[dict[str, Any]]) -> dict[str, Optional[float]]:
    if not isinstance(result, dict):
        return {"cost": None, "time": None, "risk": None}

    candidates: list[Any] = [
        result.get("best"),
        result.get("recommended"),
        result.get("route"),
        (result.get("all") or [None])[0] if isinstance(result.get("all"), list) else None,
    ]
    candidates.append(result)

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        cost = _number(
            candidate.get("cost")
            or candidate.get("total_cost")
            or candidate.get("cost_inr")
            or candidate.get("estimated_cost")
        )
        time = _number(
            candidate.get("time")
            or candidate.get("duration_hr")
            or candidate.get("total_time")
            or candidate.get("time_hr")
            or candidate.get("estimated_time")
        )
        risk = _number(
            candidate.get("risk")
            or candidate.get("risk_score")
            or candidate.get("total_risk_score")
            or candidate.get("delay_probability")
        )
        if cost is not None or time is not None or risk is not None:
            return {"cost": cost, "time": time, "risk": risk}

    return {"cost": None, "time": None, "risk": None}


def _fallback_result(
    report: ShipmentReport,
    current_location: str,
    remaining_stops: list[str],
    destination: str,
    reason: str,
) -> dict[str, Any]:
    origin_coords = get_coords(current_location)
    dest_coords = get_coords(destination)
    base_time = max(float(report.estimated_time or 8) * 0.65, 1.0)
    if origin_coords and dest_coords:
        from math import asin, cos, radians, sin, sqrt

        lat1, lon1 = origin_coords
        lat2, lon2 = dest_coords
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        distance_km = 2 * 6371.0 * asin(sqrt(a))
        base_time = max(distance_km / 55.0, 1.0)

    cost = max(float(report.estimated_cost or 10000) * 0.7, 2500)
    risk = min(1.0, max(0.05, float(report.risk_score or 0.2) + 0.08))
    best = {
        "route_id": f"reopt-fallback-{report.id[:8]}",
        "source": current_location,
        "destination": destination,
        "stops": remaining_stops,
        "waypoints": [current_location, *remaining_stops, destination],
        "cost": round(cost),
        "time": round(base_time, 2),
        "risk": round(risk, 3),
        "reason": reason,
        "data_source": "reoptimization_fallback",
    }
    return {
        "mode": report.mode,
        "best": best,
        "all": [best],
        "reoptimization_fallback": True,
        "fallback_reason": reason,
    }


def _run_pipeline(
    report: ShipmentReport,
    current_location: str,
    remaining_stops: list[str],
    destination: str,
) -> dict[str, Any]:
    payload = dict(report.optimization_input or {})
    payload.update(
        {
            "stops": remaining_stops,
            "mode": payload.get("mode") or "realtime",
            "cargo_type": report.cargo_type or payload.get("cargo_type") or "General",
            "cargo_weight_kg": payload.get("cargo_weight_kg") or 100,
            "traffic_aware": payload.get("traffic_aware", True),
        }
    )

    try:
        from app.utils.request_context import RequestContext

        context = RequestContext()
        if report.mode == "road":
            from app.pipelines.road.pipeline import RoadPipeline

            return RoadPipeline().generate(current_location, destination, payload, context=context)
        if report.mode == "air":
            from app.pipelines.air.pipeline import AirPipeline

            return AirPipeline().generate(current_location, destination, payload, context=context)
        if report.mode == "water":
            from app.pipelines.water.pipeline import WaterPipeline

            return WaterPipeline().generate(current_location, destination, payload, context=context)
        if report.mode == "hybrid":
            from app.pipelines.hybrid.pipeline import HybridPipeline

            return HybridPipeline().generate(current_location, destination, payload, context=context)
        if report.mode == "rail":
            from app.pipelines.rail.pipeline import RailPipeline

            return RailPipeline().generate(current_location, destination, payload, context=context)
    except Exception as exc:
        return _fallback_result(report, current_location, remaining_stops, destination, str(exc))

    return _fallback_result(report, current_location, remaining_stops, destination, "Unsupported mode for live reoptimization")


def build_reoptimization_recommendation(
    report: ShipmentReport,
    current_location: str,
    remaining_stops: list[str],
    destination: str,
) -> dict[str, Any]:
    cleaned_stops = [s.strip() for s in remaining_stops if s and s.strip()]
    current_result = report.optimization_result or {}
    updated_result = _run_pipeline(report, current_location, cleaned_stops, destination)

    current_metrics = {
        "cost": report.estimated_cost,
        "time": report.estimated_time,
        "risk": report.risk_score,
    }
    extracted_current = extract_plan_metrics(current_result)
    current_metrics = {
        key: current_metrics[key] if current_metrics[key] is not None else extracted_current[key]
        for key in current_metrics
    }
    updated_metrics = extract_plan_metrics(updated_result)

    eta_delta = None
    if current_metrics["time"] is not None and updated_metrics["time"] is not None:
        eta_delta = round((updated_metrics["time"] - current_metrics["time"]) * 60)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "parent_report_id": report.id,
        "mode": report.mode,
        "current_location": current_location,
        "remaining_stops": cleaned_stops,
        "destination": destination,
        "current_plan": {
            "source": report.source,
            "destination": report.destination,
            "stops": report.stops or [],
            "metrics": current_metrics,
        },
        "updated_plan": {
            "source": current_location,
            "destination": destination,
            "stops": cleaned_stops,
            "metrics": updated_metrics,
            "optimization_result": updated_result,
        },
        "eta_delta_minutes": eta_delta,
        "recommended_action": "save_revision",
    }


# ---------------------------------------------------------------------------
# Reoptimization V1 — starts from current_location (not source)
# ---------------------------------------------------------------------------

def _resolve_current_location_for_reopt(report: ShipmentReport) -> str:
    """
    Get the confirmed current location from optimization_result.
    Falls back to source if none set.
    """
    opt = report.optimization_result or {}
    loc = (opt.get("current_location") or "").strip()
    return loc or report.source


def _compute_improvement(
    current: dict[str, Optional[float]],
    alternative: dict[str, Optional[float]],
) -> dict[str, Any]:
    """
    Compute improvement metrics between current and alternative routes.
    Returns structured comparison dict.
    """
    time_saved_minutes: Optional[int] = None
    cost_difference: Optional[float] = None
    risk_difference: Optional[float] = None
    cost_pct_change: Optional[float] = None
    risk_pct_change: Optional[float] = None

    cur_time = current.get("time")
    alt_time = alternative.get("time")
    if cur_time is not None and alt_time is not None:
        time_saved_minutes = int(round((cur_time - alt_time) * 60))

    cur_cost = current.get("cost")
    alt_cost = alternative.get("cost")
    if cur_cost is not None and alt_cost is not None:
        cost_difference = round(cur_cost - alt_cost, 2)
        if cur_cost > 0:
            cost_pct_change = round((cur_cost - alt_cost) / cur_cost * 100, 1)

    cur_risk = current.get("risk")
    alt_risk = alternative.get("risk")
    if cur_risk is not None and alt_risk is not None:
        risk_difference = round(cur_risk - alt_risk, 4)
        if cur_risk > 0:
            risk_pct_change = round((cur_risk - alt_risk) / cur_risk * 100, 1)

    return {
        "time_saved_minutes": time_saved_minutes,
        "cost_difference": cost_difference,
        "cost_pct_change": cost_pct_change,
        "risk_difference": risk_difference,
        "risk_pct_change": risk_pct_change,
    }


def _should_recommend_switch(improvement: dict[str, Any]) -> tuple[bool, str]:
    """
    Apply thresholds to determine whether to recommend switching routes.
    Recommendation requires at least ONE threshold to be exceeded.
    """
    reasons: list[str] = []

    tsm = improvement.get("time_saved_minutes") or 0
    if tsm > _TIME_THRESHOLD_MINUTES:
        reasons.append(f"Saves {tsm}m")

    cpc = improvement.get("cost_pct_change") or 0
    if cpc > _COST_THRESHOLD_PCT:
        reasons.append(f"Reduces cost by {cpc:.1f}%")

    rpc = improvement.get("risk_pct_change") or 0
    if rpc > _RISK_THRESHOLD_PCT:
        reasons.append(f"Reduces risk by {rpc:.1f}%")

    if reasons:
        return True, "; ".join(reasons)
    return False, "Alternative route does not meet improvement thresholds"


def build_reoptimization_v1(report: ShipmentReport) -> dict[str, Any]:
    """
    Reoptimization V1 — generates an alternative for the REMAINING journey.

    Reads current_location from optimization_result (not from user input).
    Starts pipeline from current_location → destination.

    Returns a structured comparison + recommendation.
    """
    current_location = _resolve_current_location_for_reopt(report)
    destination = report.destination

    # Remaining stops: waypoints after current_location in the full route
    from app.services.trip_progress import (
        _cumulative_distances,
        _distance_along_route,
        split_route_at_location,
    )

    opt_result = report.optimization_result or {}
    ri = opt_result.get("route_intelligence") or {}
    route_cities: list[str] = ri.get("route_cities") or []

    # Use route_cities to determine remaining stops
    if route_cities:
        _, remaining_after = split_route_at_location(route_cities, current_location)
        # remaining stops = route cities after current_location, excluding destination
        remaining_stops = [
            c for c in remaining_after
            if c.lower() != destination.lower()
        ]
    else:
        # Fallback: use declared stops
        all_waypoints = [report.source, *(report.stops or []), destination]
        current_norm = current_location.lower()
        split_idx = next(
            (i for i, wp in enumerate(all_waypoints) if wp.lower() == current_norm), 0
        )
        remaining_stops = [
            wp for wp in all_waypoints[split_idx + 1:]
            if wp.lower() != destination.lower()
        ]

    # Run the pipeline from current_location
    pipeline_result = _run_pipeline(report, current_location, remaining_stops, destination)
    if not pipeline_result:
        pipeline_result = _fallback_result(
            report, current_location, remaining_stops, destination, "Pipeline returned empty result"
        )

    # Extract metrics
    alternative_metrics = extract_plan_metrics(pipeline_result)

    # Current metrics: use report's stored values (represent remaining journey from progress)
    # These are what the original plan expected for the full remaining journey
    from app.services.trip_progress import derive_progress_and_eta
    current_remaining: dict[str, Optional[float]] = {}
    if route_cities:
        dyn = derive_progress_and_eta(
            current_location=current_location,
            route_cities=route_cities,
            mode=report.mode or "road",
            original_estimated_time_hours=report.estimated_time,
        )
        remaining_km = dyn.get("remaining_distance_km") or 0.0
        total_km = dyn.get("total_route_km") or 1.0
        if total_km > 0 and report.estimated_time:
            remaining_ratio = remaining_km / total_km
            current_remaining = {
                "time": round(report.estimated_time * remaining_ratio, 4),
                "cost": round((report.estimated_cost or 0) * remaining_ratio, 2),
                "risk": report.risk_score,
            }
        else:
            current_remaining = {
                "time": report.estimated_time,
                "cost": report.estimated_cost,
                "risk": report.risk_score,
            }
    else:
        current_remaining = {
            "time": report.estimated_time,
            "cost": report.estimated_cost,
            "risk": report.risk_score,
        }

    # Compute improvement
    improvement = _compute_improvement(current_remaining, alternative_metrics)

    # Apply thresholds to generate recommendation
    should_switch, recommendation_reason = _should_recommend_switch(improvement)

    # Route intelligence for the alternative
    from app.services.trip_progress import (
        enrich_optimization_result_with_intelligence,
    )
    enriched_pipeline = enrich_optimization_result_with_intelligence(
        pipeline_result, current_location, destination, remaining_stops,
        estimated_time_hours=alternative_metrics.get("time"),
    )

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "report_id": report.id,
        "mode": report.mode,
        "current_location": current_location,
        "remaining_stops": remaining_stops,
        "destination": destination,
        # Current route metrics (remaining journey)
        "current_route": {
            "source": current_location,
            "destination": destination,
            "metrics": {
                "eta_minutes": int(round((current_remaining.get("time") or 0) * 60)),
                "cost": current_remaining.get("cost"),
                "risk": current_remaining.get("risk"),
            },
        },
        # Alternative route metrics
        "alternative_route": {
            "source": current_location,
            "destination": destination,
            "metrics": {
                "eta_minutes": int(round((alternative_metrics.get("time") or 0) * 60)),
                "cost": alternative_metrics.get("cost"),
                "risk": alternative_metrics.get("risk"),
            },
            "optimization_result": enriched_pipeline,
        },
        # Improvement deltas
        "improvement": improvement,
        # Recommendation
        "recommend_switch": should_switch,
        "recommendation_reason": recommendation_reason,
        "thresholds": {
            "time_minutes": _TIME_THRESHOLD_MINUTES,
            "cost_pct": _COST_THRESHOLD_PCT,
            "risk_pct": _RISK_THRESHOLD_PCT,
        },
    }


def apply_reoptimization_v1(
    report: ShipmentReport,
    alternative_optimization_result: dict[str, Any],
    estimated_cost: Optional[float],
    estimated_time: Optional[float],
    risk_score: Optional[float],
    now: datetime,
) -> dict[str, Any]:
    """
    Apply the accepted alternative route to the shipment.

    Replaces:
      - optimization_result.route_intelligence (new remaining route)
      - optimization_result.best / all (new pipeline result)
    
    Preserves:
      - optimization_result.current_location
      - optimization_result.progression_base_location
      - optimization_result.progression_base_time
      - original source / destination on the report

    Returns the new optimization_result dict to store.
    """
    existing = dict(report.optimization_result or {})

    # Preserve progression rebasing metadata
    preserved = {
        k: existing[k]
        for k in (
            "current_location",
            "current_location_updated_at",
            "progression_base_location",
            "progression_base_time",
        )
        if k in existing
    }

    # Build new optimization_result from the alternative
    new_result = dict(alternative_optimization_result)
    new_result.update(preserved)
    new_result["reoptimized_at"] = now.isoformat()

    return new_result
