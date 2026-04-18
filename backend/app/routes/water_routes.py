
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional


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
    constraints: WaterConstraints = Field(default_factory=WaterConstraints)


@water_router.post("/optimize")
def optimize_water(payload: WaterPayload):
    try:
        from app.pipelines.water.pipeline import WaterPipeline
        from app.utils.request_context import RequestContext

        pipeline = WaterPipeline()
        context = RequestContext()
        return pipeline.generate(
            payload.source,
            payload.destination,
            {
                "priority": payload.priority,
                "cargo_weight_kg": payload.cargo_weight_kg,
                "cargo_type": payload.cargo_type,
                "constraints": payload.constraints.dict(),
            },
            context=context,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@water_router.get("/health")
def water_health():
    return {"status": "water api working"}

