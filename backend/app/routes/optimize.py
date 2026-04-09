from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from app.services.optimizer import optimize_routes

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

# ------------------ Coordinates Mapping ------------------
from app.services.enricher import enrich_segment

# ------------------ Mock Route Generator ------------------

def generate_routes(source, destination):
    return [
        {
            "type": "Road",
            "mode": "road",
            "time": 7,
            "cost": 3000,
            "risk": 0.6,
            "segments": [
                {"mode": "Road", "from": source, "to": destination}
            ],
        },
        {
            "type": "Rail",
            "mode": "rail",
            "time": 8,
            "cost": 2000,
            "risk": 0.3,
            "segments": [
                {"mode": "Rail", "from": source, "to": destination}
            ],
        },
        {
            "type": "Water",
            "mode": "water",
            "time": 10,
            "cost": 1500,
            "risk": 0.5,
            "segments": [
                {"mode": "Water", "from": source, "to": "Port"},
                {"mode": "Water", "from": "Port", "to": destination},
            ],
        },
        {
            "type": "Hybrid",
            "mode": "hybrid",
            "time": 6,
            "cost": 2500,
            "risk": 0.4,
            "segments": [
                {"mode": "Road", "from": source, "to": "Midpoint"},
                {"mode": "Rail", "from": "Midpoint", "to": destination},
            ],
        },
    ]

# ------------------ Decision Engine ------------------

def score_route(route, priority, preferred_mode):
    time = route["time"]
    cost = route["cost"]
    risk = route["risk"]

    if priority == "Fast":
        score = time * 0.6 + cost * 0.2 + risk * 0.2
    elif priority == "Cheap":
        score = time * 0.2 + cost * 0.6 + risk * 0.2
    else:  # Safe
        score = time * 0.2 + cost * 0.2 + risk * 0.6

    # Preference boost
    if preferred_mode and route["mode"] == preferred_mode:
        score *= 0.85

    return score

# ------------------ API ------------------

@router.post("/optimize")
def optimize(data: OptimizeRequest):
    return optimize_routes(data)
