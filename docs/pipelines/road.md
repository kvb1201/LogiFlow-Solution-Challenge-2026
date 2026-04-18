# Road Pipeline

## Overview

The Road pipeline generates optimized truck routes between Indian cities using the **TomTom Routing API** for real-world route geometry, combined with **ML-based delay prediction** and weather/traffic risk integration.

## Flow

```
Input: source city, destination city, cargo payload
  │
  ├─ 1. Geocode cities → lat/lng coordinates
  ├─ 2. TomTom Route API → distance, duration, route geometry
  ├─ 3. Weather Service → temperature, precipitation, visibility
  ├─ 4. ML Delay Prediction → predicted delay (hours)
  ├─ 5. Cost Model → ₹/km × distance + toll estimates
  ├─ 6. Risk Scoring → composite risk from weather + traffic + delay
  │
  ▼
Output: {best, alternatives, all}
```

## Key Features

### TomTom Route Generation
- Real-time routing with traffic awareness
- Calculates actual road distance (not straight-line)
- Provides estimated travel time with current traffic conditions

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
