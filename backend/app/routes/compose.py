from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional

from app.services.route_composer import RouteComposer
from app.utils.request_context import RequestContext

router = APIRouter()


class ComposeCargo(BaseModel):
    weight: float = 100
    type: str = "general"


class ComposeConstraints(BaseModel):
    excluded_modes: List[str] = Field(default_factory=list)
    max_transshipments: Optional[int] = None
    budget_max_inr: Optional[float] = None
    budget_limit: Optional[float] = None
    delay_tolerance_hours: Optional[float] = None


class ComposeOptions(BaseModel):
    max_hubs: int = 2
    budget_seconds: int = 42
    include_road_water: bool = False


class ComposeRequest(BaseModel):
    source: str
    destination: str
    priority: str = "balanced"
    departure_date: Optional[str] = None
    cargo_weight_kg: float = 100
    cargo_type: str = "General"
    cargo: Optional[ComposeCargo] = Field(default_factory=ComposeCargo)
    constraints: Optional[ComposeConstraints] = Field(default_factory=ComposeConstraints)
    compose_options: Optional[ComposeOptions] = Field(default_factory=ComposeOptions)
    scenario_brief: Optional[str] = None


@router.post("/compose")
def compose_multimodal(data: ComposeRequest):
    context = RequestContext()
    composer = RouteComposer()

    payload = {
        "priority": (data.priority or "balanced").lower(),
        "cargo_weight_kg": data.cargo.weight if data.cargo else data.cargo_weight_kg,
        "cargo_type": data.cargo.type if data.cargo else data.cargo_type,
        "departure_date": data.departure_date,
        "scenario_brief": data.scenario_brief,
        "budget": (
            (data.constraints.budget_limit or data.constraints.budget_max_inr)
            if data.constraints
            else None
        ),
        "constraints": data.constraints.dict() if data.constraints else {},
        "compose_options": data.compose_options.dict() if data.compose_options else {},
    }

    return composer.compose(data.source, data.destination, payload, context=context)
