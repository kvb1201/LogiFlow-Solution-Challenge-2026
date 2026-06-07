from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging


air_router = APIRouter(prefix="/air", tags=["air-cargo"])
logger = logging.getLogger(__name__)


class AirCargoPayload(BaseModel):
    source: str
    destination: str
    priority: str = "balanced"
    departure_date: Optional[str] = None
    cargo_weight_kg: float = 100
    cargo_type: str = "general"
    max_stops: Optional[int] = None
    budget_limit: Optional[float] = None
    deadline_hours: Optional[float] = None

    mode: Optional[str] = None
    simulation: Optional[dict] = None


@air_router.post("/optimize")
def optimize_air(payload: AirCargoPayload):
    try:
        from app.pipelines.air import AirPipeline
        from app.utils.request_context import RequestContext

        pipeline = AirPipeline()
        context = RequestContext()

        # Resolve mode (single source of truth)
        mode = payload.mode or "realtime"

        result = pipeline.generate(
            payload.source,
            payload.destination,
            {
                "mode": mode,
                "priority": payload.priority,
                "departure_date": payload.departure_date,
                "cargo": {
                    "weight": payload.cargo_weight_kg,
                    "type": payload.cargo_type,
                },
                "constraints": {
                    "max_stops": payload.max_stops,
                    "budget_limit": payload.budget_limit,
                    "deadline_hours": payload.deadline_hours,
                },
                "simulation": payload.simulation,
            },
            context=context,
        )

        constraints_applied = {
            "budget_limit": payload.budget_limit,
            "deadline_hours": payload.deadline_hours,
            "max_stops": payload.max_stops,
            "cargo_type": payload.cargo_type,
            "cargo_weight_kg": payload.cargo_weight_kg,
        }

        # AirPipeline currently returns a dict with best/alternatives/all.
        # Keep backward compatibility with older list-style outputs.
        if isinstance(result, dict):
            ranked_routes = result.get("all") or []
            best_route = result.get("best")
            alternatives = result.get("alternatives") or []
            no_routes = (
                result.get("status") == "no_routes"
                or not ranked_routes
                or best_route is None
            )
            no_routes_message = result.get(
                "message",
                "No valid air routes found for the selected corridor",
            )
        else:
            ranked_routes = result or []
            best_route = ranked_routes[0] if ranked_routes else None
            alternatives = ranked_routes[1:] if len(ranked_routes) > 1 else []
            no_routes = not ranked_routes or best_route is None
            no_routes_message = "No valid air routes found for the selected corridor"

        if no_routes:
            return {
                "mode": "air",
                "status": "no_routes",
                "message": no_routes_message,
                "best_route": None,
                "alternatives": [],
                "ranked_routes": [],
                "total_routes": 0,
                "constraints_applied": constraints_applied,
            }

        return {
            "mode": "air",
            "best_route": best_route,
            "alternatives": alternatives,
            "ranked_routes": ranked_routes,
            "total_routes": len(ranked_routes),
            "constraints_applied": constraints_applied,
            "error": result.get("error") if isinstance(result, dict) else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        # Return a clearer API error while preserving traceback in server logs.
        logger.exception("Air optimize failed")
        message = str(e).strip() or "Unknown error"
        raise HTTPException(
            status_code=500,
            detail=f"Air optimize internal error ({type(e).__name__}): {message}",
        )


@air_router.get("/health")
def air_health():
    return {"status": "air api working"}
