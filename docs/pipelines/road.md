# Road Pipeline

## Overview

The Road pipeline generates optimized truck routes using the **TomTom Routing API** for real-world route geometry, combined with **ML-based delay prediction**, weather/traffic risk integration, and **corridor validity validation**. It supports single-leg and **multi-stop** routing with constraint filtering.

**Entry:** `backend/app/pipelines/road/pipeline.py`  
**API:** `POST /road/optimize`  
**Frontend:** `/road` → `RoadPageClient` → `roadInputForm` → `RouteResults`

## Flow

```
Input: source city, destination city, cargo payload, optional stops[]
  │
  ├─ 1. Geocode cities → lat/lng coordinates (ORS → TomTom → Nominatim)
  ├─ 2. Corridor validity gate → reject undrivable corridors (trans-oceanic, etc.)
  ├─ 3. TomTom Route API → distance, duration, route geometry (+ traffic)
  ├─ 4. Weather Service → temperature, precipitation, visibility
  ├─ 5. ML Delay Prediction → predicted delay (hours)
  ├─ 6. Cost Model → ₹/km × distance + toll + GST + handling
  ├─ 7. Risk Scoring → composite risk from weather + traffic + delay
  │
  ▼
Output: {best, alternatives, all} OR {status: "no_routes", valid: false}
```

## Key Features

### Corridor Validity Gate
- `route_validator.validate_corridor()` runs **before** TomTom is called
- Trans-oceanic corridors (e.g. London → New York) return `{status: "no_routes", valid: false}`
- TomTom ferry-routed results are also discarded if they fail drivability checks
- Hybrid normalizer drops invalid road results; fallback estimates get confidence ×0.35

### TomTom Route Generation
- Real-time routing with traffic awareness
- Calculates actual road distance (not straight-line)
- Provides estimated travel time with current traffic conditions
- Haversine fallback when TomTom times out (tagged `is_fallback: true`)

### Multi-Stop Routing
- `multistop.py` validates stop order and aggregates leg metrics
- Frontend supports adding intermediate stops in `roadInputForm.tsx`

### ML Delay Prediction
- **Model**: Gradient Boosting Regressor (scikit-learn)
- **Features**: distance, time-of-day, day-of-week, weather factors, highway ratio
- **Output**: Predicted additional delay in hours
- Trained on historical road transport data

### Weather + Traffic Integration
- Weather data fetched via shared `RequestContext` (cached across pipelines)
- Weather factor multiplies base travel time (e.g., 1.3× for heavy rain)
- Traffic congestion level (0–1) from TomTom real-time data

### Cost Model
- Base rate: `₹ per km × distance`
- Cargo weight surcharge
- Fuel and toll estimates
- Weather penalty on cost

## Output Structure

```json
{
  "best": {
    "type": "Road",
    "mode": "road",
    "time": 14.5,
    "cost": 12500,
    "risk": 0.25,
    "predicted_delay": 2.1,
    "highway_ratio": 0.82,
    "weather_factor": 1.1,
    "traffic_level": 0.35,
    "segments": [
      {"mode": "Road", "from": "Delhi", "to": "Mumbai"}
    ]
  },
  "alternatives": [...],
  "all": [...]
}
```
