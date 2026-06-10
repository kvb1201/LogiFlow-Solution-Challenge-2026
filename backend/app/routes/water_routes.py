
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from app.pipelines.water.port_catalog import list_ports, port_stats, search_ports, validate_port_selection


water_router = APIRouter(prefix="/water", tags=["water-cargo"])


class WaterConstraints(BaseModel):
    risk_threshold: Optional[float] = None
    delay_tolerance_hours: Optional[float] = None
    max_transshipments: Optional[int] = None
    budget_max_inr: Optional[float] = None


class WaterPayload(BaseModel):
    source: str
    destination: str
    source_port_id: Optional[str] = None
    destination_port_id: Optional[str] = None
    cargo_weight_kg: float = 100
    cargo_type: str = "General"
    priority: str = "balanced"
    departure_date: Optional[str] = None
    constraints: WaterConstraints = Field(default_factory=WaterConstraints)


@water_router.get("/ports")
def get_water_ports():
    """All PortWatch + routable ports for dropdown population."""
    stats = port_stats()
    return {"ports": list_ports(), **stats}


@water_router.get("/ports/search")
def search_water_ports(q: str = Query("", max_length=120), limit: int = Query(25, ge=1, le=50)):
    """Fast typeahead search over the in-memory port catalog."""
    return {"ports": search_ports(q, limit=limit)}


@water_router.post("/optimize")
def optimize_water(payload: WaterPayload):
    try:
        from app.pipelines.water.pipeline import WaterPipeline
        from app.utils.request_context import RequestContext

        try:
            origin = validate_port_selection(
                label="Origin port",
                name=payload.source,
                port_id=payload.source_port_id,
            )
            destination = validate_port_selection(
                label="Destination port",
                name=payload.destination,
                port_id=payload.destination_port_id,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        pipeline = WaterPipeline()
        context = RequestContext()
        results = pipeline.generate(
            origin.name,
            destination.name,
            {
                "priority": payload.priority,
                "cargo_weight_kg": payload.cargo_weight_kg,
                "cargo_type": payload.cargo_type,
                "departure_date": payload.departure_date,
                "source_port_id": origin.id,
                "destination_port_id": destination.id,
                "constraints": payload.constraints.dict(),
            },
            context=context,
        )
        if isinstance(results, dict) and results.get("status") == "no_routes":
            raise HTTPException(status_code=400, detail=results.get("message", "No water routes found"))
        return results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@water_router.get("/health")
def water_health():
    return {"status": "water api working"}

