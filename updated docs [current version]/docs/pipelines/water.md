# Water Pipeline

## Overview

The Water pipeline computes port-to-port cargo shipping routes using the **PortWatch dataset** (~350 global ports with `vessel_count > 500`). It uses best-first search across a sparse sea-lane adjacency graph, **chokepoint awareness**, marine weather (Open-Meteo), and trained ML models for delay/ETA prediction.

The pipeline enforces **strict correctness**: inland cities without nearby ports receive an explicit `no_routes` response rather than fabricated fallback routes.

**Entry:** `backend/app/pipelines/water/pipeline.py`  
**API:** `POST /water/optimize` · `GET /water/ports` · `GET /water/ports/search`  
**Frontend:** `/water` → `WaterPageClient` → `waterInputForm` → `WaterRouteResults` · `SeaMapView`

## Flow

```
Input: source city, destination city, cargo payload
  │
  ├─ 1. Port Mapping → city name → nearest port(s) within 400km
  │     └─ No port within threshold? → return no_routes
  │
  ├─ 2. Best-First Search → sea-lane adjacency graph
  │     └─ No path found? → return no_routes
  │
  ├─ 3. Route Engineering (per path):
  │     ├─ Road legs: city ↔ port (truck speed + distance)
  │     ├─ Sea legs: port → port (vessel speed + handling)
  │     ├─ Cost model: road + sea + port fees + transshipment
  │     ├─ Risk model: weather + congestion + security + transshipment
  │     └─ ML hooks: ETA adjustment, port congestion prediction
  │
  ├─ 4. Constraint Filtering
  │     └─ All filtered out? → return no_routes
  │
  ▼
Output: [sorted routes] OR {status: "no_routes"}
```

## Key Features

### Strict Port Mapping
- Maps cities to the nearest ports using Haversine distance
- **400km threshold**: cities further than 400km from any port return `[]`
- Prevents inland cities (Delhi, Jaipur, etc.) from being artificially connected to distant ports
- Returns up to 2 candidate ports per city

### Sea-Lane Graph
- ~350 global ports from PortWatch `Ports.csv` (filtered `vessel_count_total > 500`)
- Sparse adjacency list (`SEA_LANES`) built from observed port-pair connectivity
- **Chokepoint stress** from `Daily_Chokepoints_Data.csv` (Suez, Malacca, Bab el-Mandeb, Gibraltar, etc.)
- No "teleportation": routes only exist along defined sea lanes
- Default max transshipments: configurable (typically 3)

### Best-First Search (Route Generation)
- Dijkstra-style search with Haversine edge distances
- Port-call penalty (60km equivalent) discourages unnecessary transshipments
- Returns up to 5 paths per port pair, ordered by total distance
- Returns `[]` if no valid path exists — no fabricated fallbacks

### Cost Model
- **Road legs**: `₹/km/ton × distance + handling base`
- **Sea legs**: `base/kg + per-kg-per-nautical-mile × distance`
- **Port fees**: `₹800 per port call`
- **Transshipment fees**: `₹1,200 per intermediate stop`

### Risk Model
Composite risk (0–1) from weighted components:

| Component | Weight | Factors |
|-----------|--------|---------|
| Weather | 0.30 | Monsoon season (Jun–Sep), sea distance |
| Congestion | 0.30 | Per-port base congestion + ML prediction |
| Security | 0.25 | Per-port base security risk |
| Transshipment | 0.15 | Number of intermediate port calls |

### Constraint Filtering
Routes are filtered against user-provided constraints:
- `risk_threshold` — maximum acceptable risk score
- `delay_tolerance_hours` — maximum acceptable delay
- `max_transshipments` — maximum intermediate port stops
- `budget_max_inr` — maximum total cost

If all routes fail constraints, the pipeline returns `no_routes` instead of ignoring the filters.

### ML Models
- `water_delay_model.pkl` — GradientBoosting delay hours prediction
- `water_eta_model.pkl` — ETA multiplier adjustment
- Training data from PortWatch spillover simulator CSVs (`delay_dataset.py`)
- Auto-train on startup unless `WATER_AUTO_TRAIN=off` (disabled in production Dockerfile)

### Marine Weather
- Open-Meteo marine/forecast APIs via `marine_weather_service.py`
- See `OPENMETEO_API_REFERENCE.md` for endpoint details

## Data files (`backend/data/water/`)

| File | Purpose |
|------|---------|
| `Ports.csv` | Global port catalog (~350 ports) |
| `PortWatch_chokepoints_database.csv` | Chokepoint definitions |
| `Daily_Chokepoints_Data.csv` | Daily chokepoint stress index |
| `portwatch_disruptions_database_*.csv` | Port disruption events |
| `Spillover_simulator*.csv` | ML training transit days (large — gitignored from deploy) |

## Limitations

- **Static graph**: Sea lanes are pre-defined from PortWatch, not live AIS tracking
- **Estimated timings**: Transit times based on average vessel speed (~16 knots)
- **Port proximity**: Cities >400 km from coast return `no_routes`
- **Congestion**: Uses PortWatch baselines + ML, not real-time berth occupancy

## Output Structure

**When routes found** (returns a list):
```json
[
  {
    "type": "Water",
    "mode": "water",
    "time": 106.48,
    "cost": 6955,
    "risk": 0.351,
    "segments": [
      {"mode": "Road", "from": "Mumbai", "to": "JNPT, Navi Mumbai"},
      {"mode": "Water", "from": "JNPT", "to": "Mormugao Port, Goa"},
      {"mode": "Water", "from": "Mormugao", "to": "New Mangalore Port"},
      {"mode": "Water", "from": "New Mangalore", "to": "Kochi Port"},
      {"mode": "Water", "from": "Kochi", "to": "Chennai Port"},
      {"mode": "Road", "from": "Chennai Port", "to": "Chennai"}
    ],
    "origin_port": "JNPT, Navi Mumbai",
    "destination_port": "Chennai Port",
    "distance_nm": 832.5,
    "transshipments": 3,
    "risk_breakdown": {
      "weather": 0.36,
      "congestion": 0.43,
      "security": 0.23,
      "transshipment": 0.30
    },
    "expected_delay_hours": 4.2,
    "delay_prob": 0.12,
    "reliability_score": 0.72
  }
]
```

**When no routes found** (returns a dict):
```json
{
  "mode": "water",
  "status": "no_routes",
  "message": "Delhi is too far from the coastline for water transport",
  "best": null,
  "alternatives": [],
  "all": []
}
```

### No-Routes Conditions

| Condition | Message |
|-----------|---------|
| Both cities inland | "Neither {A} nor {B} is close enough to the coastline for water transport" |
| Origin inland | "{A} is too far from the coastline for water transport" |
| Destination inland | "{B} is too far from the coastline for water transport" |
| No sea-lane path | "No maritime routes found between {A} and {B} in the current port network" |
| Constraints not met | "No water routes between {A} and {B} satisfy the given constraints" |
