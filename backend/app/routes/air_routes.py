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


@air_router.post("/optimize")
def optimize_air(payload: AirCargoPayload):
    try:
        from app.pipelines.air import AirPipeline

        pipeline = AirPipeline()
        result = pipeline.generate(
            payload.source,
            payload.destination,
            {
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
            },
        )

        # AirPipeline currently returns a dict with best/alternatives/all.
        # Keep backward compatibility with older list-style outputs.
        if isinstance(result, dict):
            ranked_routes = result.get("all") or []
            best_route = result.get("best")
            alternatives = result.get("alternatives") or []
        else:
            ranked_routes = result or []
            best_route = ranked_routes[0] if ranked_routes else None
            alternatives = ranked_routes[1:] if len(ranked_routes) > 1 else []

        return {
            "mode": "air",
            "best_route": best_route,
            "alternatives": alternatives,
            "ranked_routes": ranked_routes,
            "total_routes": len(ranked_routes),
            "constraints_applied": {
                "budget_limit": payload.budget_limit,
                "deadline_hours": payload.deadline_hours,
                "max_stops": payload.max_stops,
                "cargo_type": payload.cargo_type,
                "cargo_weight_kg": payload.cargo_weight_kg,
            },
        }

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
