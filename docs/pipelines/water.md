# Water Pipeline

## Overview

The Water pipeline computes port-to-port cargo shipping routes between Indian coastal cities using a **static port and shipping route dataset**. It uses BFS-based pathfinding across a port connectivity graph and applies risk modeling based on distance, seasonal weather, and port congestion.

## Flow

```
Input: source city, destination city, cargo payload
  │
  ├─ 1. Port Mapping → city name → nearest port(s)
  ├─ 2. BFS Route Search → port connectivity graph
  ├─ 3. Distance + Duration Estimation
  ├─ 4. Cost Calculation → base rate × distance × weight
  ├─ 5. Risk Modeling → weather, piracy, port delays
  │
  ▼
Output: {best, alternatives, all}
```

## Key Features

### Port Mapping
- Maps inland and coastal cities to their nearest port
- Covers major Indian ports: Mumbai (JNPT), Chennai, Kochi, Kolkata, Visakhapatnam, etc.

### BFS Route Generation
- Port connectivity modeled as a graph
- Breadth-first search finds shortest and alternative routes
- Supports multi-hop routes (e.g., Mumbai → Kochi → Colombo)

### Risk Modeling
- **Weather risk**: Seasonal monsoon patterns affect coastal shipping
- **Port congestion**: Estimated delays at major ports
- **Distance risk**: Longer routes carry higher cargo damage probability

### Cost Model
- Base rate per nautical mile × cargo weight
- Port handling charges
- Insurance surcharges for high-risk routes

## Limitations

- **Static dataset**: Routes are pre-defined, not queried from live shipping APIs
- **Estimated timings**: Transit times are approximations based on average vessel speeds
- **Limited coverage**: Only Indian coastal and major international ports

## Output Structure

```json
{
  "best": {
    "type": "Water",
    "mode": "water",
    "time": 72,
    "cost": 8500,
    "risk": 0.35,
    "segments": [
      {"mode": "Water", "from": "JNPT Mumbai", "to": "Kochi Port"}
    ]
  },
  "alternatives": [...],
  "all": [...]
}
```
