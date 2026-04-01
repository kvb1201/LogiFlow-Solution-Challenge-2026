from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

# ------------------ Request Schema ------------------

class Preferences(BaseModel):
    preferred_mode: Optional[str] = None

class Constraints(BaseModel):
    excluded_modes: List[str] = []

class OptimizeRequest(BaseModel):
    source: str
    destination: str
    priority: str
    preferences: Optional[Preferences] = Preferences()
    constraints: Optional[Constraints] = Constraints()

# ------------------ Coordinates Mapping ------------------

city_coords = {
    "Surat": (21.1702, 72.8311),
    "Mumbai": (19.0760, 72.8777),
    "Vadodara": (22.3072, 73.1812),
    "Midpoint": (21.5, 73.0),
    "Port": (21.3, 72.9),
}

def get_coords(name: str):
    return city_coords.get(name, (20.5937, 78.9629))

def enrich_segment(segment):
    frm = segment["from"]
    to = segment["to"]

    frm_lat, frm_lng = get_coords(frm)
    to_lat, to_lng = get_coords(to)

    return {
        "mode": segment["mode"],
        "from": {
            "name": frm,
            "lat": frm_lat,
            "lng": frm_lng
        },
        "to": {
            "name": to,
            "lat": to_lat,
            "lng": to_lng
        }
    }

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
    routes = generate_routes(data.source, data.destination)

    # Apply constraints (exclude modes)
    excluded = data.constraints.excluded_modes if data.constraints else []
    routes = [r for r in routes if r["mode"] not in excluded]

    if not routes:
        return {"error": "No routes available after applying constraints"}

    preferred = data.preferences.preferred_mode if data.preferences else None

    # Score routes
    for r in routes:
        r["score"] = score_route(r, data.priority, preferred)

    # Sort by best score
    routes.sort(key=lambda x: x["score"])

    best = routes[0]

    # Add explanation
    best["explanation"] = f"Selected based on {data.priority.lower()} priority"

    return {
        "best_route": {
            "type": best["type"],
            "total_time": best["time"],
            "total_cost": best["cost"],
            "risk": best["risk"],
            "segments": [enrich_segment(s) for s in best["segments"]],
            "explanation": best["explanation"],
        },
        "alternatives": [
            {
                "mode": r["type"],
                "time": r["time"],
                "cost": r["cost"],
                "risk": r["risk"],
            }
            for r in routes[1:]
        ],
    }