# Air Pipeline

## Overview

The Air pipeline finds cargo-feasible flight routes using **OpenFlights** plus **Supabase** tables (`airports`, `air_routes`, `otp_baselines`) for domestic and international lanes. It resolves cities via the shared location funnel, scores **OTP congestion risk** with weather/time penalties, applies volumetric cargo pricing, and returns only routes above the confidence threshold. No mock or fabricated routes are returned.

**Entry:** `backend/app/pipelines/air/pipeline.py`  
**API:** `POST /air/optimize`  
**Frontend:** `/air` → `AirPageClient` → `AirInputForm` → `AirResults`

See also [international air routing](../international-air-routing-summary.md) · [OTP scoring](../air-otp-congestion-scoring.md).

## Flow

```
Input: source city, destination city, cargo payload
  │
  ├─ 1. Airport Resolution → city name → nearest airport(s)
  ├─ 2. Route Lookup → OpenFlights dataset matching
  ├─ 3. Confidence Scoring → MIN_CONFIDENCE = 60
  ├─ 4. Route Filtering → reject low-confidence / mock routes
  │
  ▼
Output: {best, alternatives, all} OR {status: "no_routes"}
```

## Key Features

### Data sources
- `backend/data/routes.dat` — OpenFlights India snapshot (direct + one-stop)
- `backend/data/international_routes.csv` — international hub edges (offline fallback)
- Supabase `airports` / `air_routes` / `otp_baselines` — global reference (via `air_store.py`)
- `backend/data/otp-baselines.json` + `otp-regions.json` — OTP lookup chain

### Airport Resolution
- City name → IATA airport code mapping
- Handles multi-airport cities (e.g., Mumbai: BOM)
- Falls back to nearest airport by distance if exact match unavailable

### Confidence Filtering
- Each route is assigned a `confidence_score` (0–100)
- Routes below `MIN_CONFIDENCE = 60` are rejected
- Mock/fallback routes are explicitly blocked (no fake data)

### No-Routes Handling
When no valid air routes exist between two cities:
- Response returns `{status: "no_routes"}`
- No mock or fabricated routes are injected
- Frontend displays a clear "No air routes found" message

### Data Source Tagging
- `"data_source": "openflights"` — real dataset routes
- Mock routes are never returned

## Output Structure

**When routes found:**
```json
{
  "best": {
    "type": "Air",
    "mode": "air",
    "time": 2.5,
    "cost": 15000,
    "risk": 0.1,
    "confidence_score": 85,
    "data_source": "openflights",
    "airline": "IndiGo",
    "stops": 0,
    "segments": [
      {"mode": "Air", "from": "DEL", "to": "BOM", "airline": "IndiGo"}
    ]
  },
  "alternatives": [...],
  "all": [...]
}
```

**When no routes found:**
```json
{
  "mode": "air",
  "status": "no_routes",
  "message": "No air routes found between Delhi and Jaisalmer",
  "best": null,
  "alternatives": [],
  "all": []
}
```
