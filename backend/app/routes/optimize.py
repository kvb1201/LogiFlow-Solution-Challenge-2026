from fastapi import APIRouter
from pydantic import BaseModel
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
    excluded_modes: List[str] = []
    max_stops: Optional[int] = None
    budget_limit: Optional[float] = None

class OptimizeRequest(BaseModel):
    source: str
    destination: str
    priority: str
    departure_date: Optional[str] = None
    cargo: Optional[Cargo] = Cargo()
    preferences: Optional[Preferences] = Preferences()
    constraints: Optional[Constraints] = Constraints()

# ------------------ API ------------------

@router.post("/optimize")
def optimize(data: OptimizeRequest):
    pipeline = HybridPipeline()

    payload = {
        "priority": data.priority.lower(),
        "cargo_weight_kg": data.cargo.weight if data.cargo else 100,
        "cargo_type": data.cargo.type if data.cargo else "general",
        "budget": data.constraints.budget_limit if data.constraints else None,
        "max_stops": data.constraints.max_stops if data.constraints else None,
        "preferred_mode": data.preferences.preferred_mode if data.preferences else None
    }

    return pipeline.generate(data.source, data.destination, payload)
