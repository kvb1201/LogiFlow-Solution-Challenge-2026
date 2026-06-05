from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

water_router = APIRouter(prefix="/water", tags=["water-cargo"])


class WaterConstraints(BaseModel):
    risk_threshold: Optional[float] = None
    delay_tolerance_hours: Optional[float] = None
    max_transshipments: Optional[int] = None
    budget_max_inr: Optional[float] = None


class WaterPayload(BaseModel):
    source: str
    destination: str
    cargo_weight_kg: float = 100
    cargo_type: str = "General"
    priority: str = "balanced"
    constraints: Optional[WaterConstraints] = None


@water_router.post("/optimize")
def optimize_water(payload: WaterPayload) -> list[dict[str, Any]]:
    try:
        from app.pipelines.water import WaterPipeline

        pipeline = WaterPipeline()
        routes = pipeline.generate(payload.source.strip(), payload.destination.strip())
        if not isinstance(routes, list):
            routes = [routes] if routes else []
        return routes
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@water_router.get("/health")
def water_health():
    return {"status": "water api working"}
