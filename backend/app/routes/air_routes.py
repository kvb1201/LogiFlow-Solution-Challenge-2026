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
        from app.utils.request_context import RequestContext

        pipeline = AirPipeline()
        context = RequestContext()
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
            context=context,
        )

        # Ensure result is a dict (new pipeline contract)
        if not isinstance(result, dict):
            raise Exception(f"Invalid pipeline response: {type(result)}")

        return {
            "mode": "air",
            "best_route": result.get("best"),
            "alternatives": result.get("alternatives", []),
            "ranked_routes": result.get("all", []),
            "total_routes": len(result.get("all", [])),
            "constraints_applied": {
                "budget_limit": payload.budget_limit,
                "deadline_hours": payload.deadline_hours,
                "max_stops": payload.max_stops,
                "cargo_type": payload.cargo_type,
                "cargo_weight_kg": payload.cargo_weight_kg,
            },
            "error": result.get("error")
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@air_router.get("/health")
def air_health():
    return {"status": "air api working"}
