# Water Pipeline

## Overview

The Water pipeline computes port-to-port cargo shipping routes between Indian coastal cities using a **static port and shipping route dataset**. It uses best-first search across a sparse sea-lane adjacency graph and applies risk modeling based on distance, seasonal weather, and port congestion.

The pipeline enforces **strict correctness**: inland cities without nearby ports receive an explicit "no routes" response rather than fabricated fallback routes.

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
- 13 major Indian ports (7 west coast, 6 east coast)
- Sparse adjacency list (`SEA_LANES`) modeling realistic coastal connectivity
- No "teleportation": routes only exist along defined sea lanes
- Default max transshipments: 3 (Indian coastal routes chain through multiple ports)

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

### ML Hooks
- `predict_eta_adjustment()` — adjusts estimated arrival time based on sea distance, transshipments, and season
- `predict_port_congestion()` — predicts port-level congestion for risk calculation

## Limitations

- **Static dataset**: Sea lanes and ports are pre-defined, not queried from live shipping APIs
- **Estimated timings**: Transit times are approximations based on average vessel speed (16 knots)
- **India-only coverage**: 13 major Indian ports — no international routes
- **No live tracking**: Port congestion uses base estimates, not real-time data

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
