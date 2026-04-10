from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

# Create router
road_router = APIRouter(prefix="/road", tags=["road-cargo"])


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

    # Simulation mode
    simulation_mode: Optional[bool] = False
    simulation: Optional[dict] = None


# Main optimization endpoint
@road_router.post("/optimize")
def optimize_road(payload: RoadPayload):
    try:
        from app.pipelines.road.pipeline import RoadPipeline

        pipeline = RoadPipeline()

        result = pipeline.generate(
            payload.source,
            payload.destination,
            {
                "priority": payload.priority,
                "budget": payload.budget,
                "deadline_hours": payload.deadline_hours,
                "cargo_weight_kg": payload.cargo_weight_kg,
                "cargo_type": payload.cargo_type,
                "avoid_tolls": payload.avoid_tolls,
                "avoid_highways": payload.avoid_highways,
                "traffic_aware": payload.traffic_aware,
                "simulation_mode": payload.simulation_mode,
                "simulation": payload.simulation,
            }
        )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Health check endpoint
@road_router.get("/health")
def road_health():
    return {"status": "road api working"}