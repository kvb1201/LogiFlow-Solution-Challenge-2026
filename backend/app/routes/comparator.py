"""
Route Comparison API - Multi-modal route comparator.
Orchestrates parallel execution of different transport modes for comprehensive route comparison.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional
from app.pipelines.hybrid import HybridPipeline

router = APIRouter(prefix="/compare", tags=["comparator"])

# ------------------ Request Schema ------------------

class Preferences(BaseModel):
    preferred_mode: Optional[str] = None

class Constraints(BaseModel):
    excluded_modes: List[str] = Field(default_factory=list)
    risk_threshold: Optional[float] = None
    delay_tolerance_hours: Optional[float] = None
    max_transshipments: Optional[int] = None
    budget_max_inr: Optional[float] = None

class CompareRequest(BaseModel):
    """Request to compare routes across multiple transport modes."""
    source: str
    destination: str
    priority: str = "balanced"
    cargo_weight_kg: float = 100
    cargo_type: str = "General"
    preferences: Optional[Preferences] = Field(default_factory=Preferences)
    constraints: Optional[Constraints] = Field(default_factory=Constraints)

# ------------------ API ------------------

@router.post("/routes")
def compare_routes(data: CompareRequest):
    """
    Compare routes across multiple transport modes.
    
    Returns route options with detailed comparison metrics for each mode.
    
    Args:
        source: Origin city/location
        destination: Destination city/location
        priority: Optimization priority (balanced, cost/cheap, time/fast, safety/safe)
        cargo_weight_kg: Weight of cargo in kilograms
        cargo_type: Type of cargo
        preferences: Preferred transport mode(s)
        constraints: Route constraints and thresholds
    
    Returns:
        List of routes with comparison metadata
    """
    comparator = HybridPipeline()
    
    # Prepare payload matching HybridPipeline expectations
    payload = {
        "priority": data.priority,
        "cargo_weight_kg": data.cargo_weight_kg,
        "cargo_type": data.cargo_type,
    }
    if data.preferences:
        payload["preferred_mode"] = data.preferences.preferred_mode
    if data.constraints:
        payload["constraints"] = data.constraints.dict()
    
    return comparator.generate(data.source, data.destination, payload=payload)
