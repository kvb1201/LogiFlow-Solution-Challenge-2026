from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional, List

# Create router
road_router = APIRouter(prefix="/road", tags=["road-cargo"])

# Maximum intermediate stops allowed per request
MAX_STOPS = 10


# Request schema
class RoadPayload(BaseModel):
    source: str
    destination: str
    cargo_weight_kg: float = 100
    cargo_type: str = "General"
    budget: Optional[float] = None
    deadline_hours: Optional[float] = None
    priority: str = "balanced"
    avoid_tolls: Optional[bool] = False
    avoid_highways: Optional[bool] = False
    traffic_aware: Optional[bool] = True

    # Multi-stop support — optional list of intermediate waypoints
    stops: Optional[List[str]] = None
    # When True the pipeline will reorder stops to minimise cost/time/risk
    optimize_stop_order: Optional[bool] = False

    mode: Optional[str] = None
    simulation: Optional[dict] = None

    @field_validator("stops")
    @classmethod
    def validate_stops(cls, v):
        if v is None:
            return v
        if len(v) > MAX_STOPS:
            raise ValueError(f"Maximum {MAX_STOPS} intermediate stops are supported.")
        # Strip whitespace and filter blank entries
        cleaned = [s.strip() for s in v if s and s.strip()]
        return cleaned if cleaned else None


# Main optimization endpoint
@road_router.post("/optimize")
def optimize_road(payload: RoadPayload):
    try:
        from app.pipelines.road.pipeline import RoadPipeline
        from app.utils.request_context import RequestContext

        pipeline = RoadPipeline()
        context = RequestContext()

        # Resolve mode (single source of truth)
        mode = payload.mode or "realtime"

        result = pipeline.generate(
            payload.source,
            payload.destination,
            {
                "mode": mode,
                "priority": payload.priority,
                "budget": payload.budget,
                "deadline_hours": payload.deadline_hours,
                "cargo_weight_kg": payload.cargo_weight_kg,
                "cargo_type": payload.cargo_type,
                "avoid_tolls": payload.avoid_tolls,
                "avoid_highways": payload.avoid_highways,
                "traffic_aware": payload.traffic_aware,
                "simulation": payload.simulation,
                # Pass multi-stop fields through to the pipeline
                "stops": payload.stops or [],
                "optimize_stop_order": payload.optimize_stop_order or False,
            },
            context=context,
        )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Health check endpoint
@road_router.get("/health")
def road_health():
    return {"status": "road api working"}