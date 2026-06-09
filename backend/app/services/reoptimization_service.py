from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from app.models.domain import ShipmentReport
from app.utils.coordinates import get_coords


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
