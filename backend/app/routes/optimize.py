
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional
from app.pipelines.hybrid.pipeline import HybridPipeline

router = APIRouter()

# ------------------ Request Schema ------------------

class Preferences(BaseModel):
    preferred_mode: Optional[str] = None


class Cargo(BaseModel):
    weight: float = 100
    type: str = "general"


class Constraints(BaseModel):
    excluded_modes: List[str] = Field(default_factory=list)
    risk_threshold: Optional[float] = None
    delay_tolerance_hours: Optional[float] = None
    max_transshipments: Optional[int] = None
    budget_max_inr: Optional[float] = None
    max_stops: Optional[int] = None
    budget_limit: Optional[float] = None

class OptimizeRequest(BaseModel):
    source: str
    destination: str
    priority: str
    departure_date: Optional[str] = None
    cargo_weight_kg: float = 100
    cargo_type: str = "General"
    cargo: Optional[Cargo] = Field(default_factory=Cargo)
    preferences: Optional[Preferences] = Field(default_factory=Preferences)
    constraints: Optional[Constraints] = Field(default_factory=Constraints)

# ------------------ API ------------------

@router.post("/optimize")
def optimize(data: OptimizeRequest):
    # Normalize priority aliases to what scorer expects.
    p = (data.priority or "").strip()
    p_l = p.lower()
    if p_l in {"fast", "cheap", "safe"}:
        data.priority = p_l.capitalize()  # fast->Fast, cheap->Cheap, safe->Safe

    pipeline = HybridPipeline()

    payload = {
        "priority": data.priority.lower(),
        "cargo_weight_kg": data.cargo.weight if data.cargo else data.cargo_weight_kg,
        "cargo_type": data.cargo.type if data.cargo else data.cargo_type,
        "budget": data.constraints.budget_limit or data.constraints.budget_max_inr if data.constraints else None,
        "max_stops": data.constraints.max_stops if data.constraints else None,
        "preferred_mode": data.preferences.preferred_mode if data.preferences else None,
        "constraints": data.constraints.dict() if data.constraints else {},
    }

    return pipeline.generate(data.source, data.destination, payload)
