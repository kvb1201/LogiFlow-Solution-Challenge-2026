from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional


air_router = APIRouter(prefix="/air", tags=["air-cargo"])


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

        return {
            "mode": "air",
            "best_route": result[0] if result else None,
            "alternatives": result[1:] if len(result) > 1 else [],
            "ranked_routes": result,
            "total_routes": len(result),
            "constraints_applied": {
                "budget_limit": payload.budget_limit,
                "deadline_hours": payload.deadline_hours,
                "max_stops": payload.max_stops,
                "cargo_type": payload.cargo_type,
                "cargo_weight_kg": payload.cargo_weight_kg,
            },
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@air_router.get("/health")
def air_health():
    return {"status": "air api working"}
