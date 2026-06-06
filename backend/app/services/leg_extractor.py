"""Extract normalized legs from black-box pipeline responses (road/air/water/rail)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Leg:
    mode: str
    source: str
    destination: str
    time_hr: float
    cost_inr: float
    risk: float
    segments: list[dict[str, Any]] = field(default_factory=list)
    pipeline_raw: dict[str, Any] | None = None
    status: str = "ok"


_PRIORITY_ALIASES = {
    "cost": "cheap",
    "cheap": "cheap",
    "time": "fast",
    "fast": "fast",
    "safe": "safe",
    "balanced": "balanced",
}


def _to_hr(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        v = float(value)
        return v if v > 0 else 0.0
    except (TypeError, ValueError):
        return 0.0


def _to_cost(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return 0.0


def _to_risk(value: Any) -> float:
    if value is None:
        return 0.3
    try:
        r = float(value)
        if r > 1:
            r = r / 100.0
        return min(1.0, max(0.0, r))
    except (TypeError, ValueError):
        return 0.3


def extract_best_route(res: Any, mode: str, priority: str = "balanced") -> dict[str, Any] | None:
    """Mirror hybrid/pipeline.py extract_best — do not reshape pipeline internals."""
    canon = _PRIORITY_ALIASES.get((priority or "balanced").lower().strip(), "balanced")

    if isinstance(res, list):
        return res[0] if res else None

    if not isinstance(res, dict):
        return None

    if res.get("status") == "no_routes":
        return None

    if mode == "rail":
        if canon == "cheap":
            candidate = res.get("cheapest")
        elif canon == "fast":
            candidate = res.get("fastest")
        elif canon == "safe":
            candidate = res.get("safest")
        else:
            candidate = (
                res.get("cheapest")
                or res.get("fastest")
                or res.get("safest")
                or res.get("best")
            )
    else:
        candidate = res.get("best") or res.get("best_route")

    if not candidate:
        if res.get("all"):
            return res["all"][0]
        if res.get("alternatives"):
            return res["alternatives"][0]

    return candidate


def route_to_leg(
    route: dict[str, Any] | None,
    mode: str,
    source: str,
    destination: str,
) -> Leg | None:
    if not route or not isinstance(route, dict):
        return None

    time_hr = _to_hr(route.get("time") or route.get("time_hr"))
    cost_inr = _to_cost(route.get("cost") or route.get("cost_inr"))
    risk = _to_risk(route.get("risk"))

    if time_hr <= 0 and cost_inr <= 0:
        return None

    segments = route.get("segments") or []
    if not isinstance(segments, list):
        segments = []

    return Leg(
        mode=mode,
        source=source,
        destination=destination,
        time_hr=time_hr,
        cost_inr=cost_inr,
        risk=risk,
        segments=segments,
        pipeline_raw=route,
        status="ok",
    )


def leg_to_dict(leg: Leg) -> dict[str, Any]:
    from app.services.transfer_detail import enrich_leg

    return enrich_leg({
        "mode": leg.mode,
        "source": leg.source,
        "destination": leg.destination,
        "time_hr": round(leg.time_hr, 2),
        "cost_inr": int(round(leg.cost_inr)),
        "risk": round(leg.risk, 3),
        "segments": leg.segments,
        "status": leg.status,
    })
