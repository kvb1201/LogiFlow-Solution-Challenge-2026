# API Contract

## Base URL

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:8000` |
| Production | *Render deployment URL* |

---

## `POST /api/optimize`

The primary endpoint. Runs all pipelines and returns the hybrid comparison.

### Request

```json
{
  "source": "Delhi",
  "destination": "Mumbai",
  "priority": "balanced",
  "cargo_weight_kg": 500,
  "cargo_type": "General",
  "departure_date": "2026-06-15",
  "explanation_mode": "template"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | string | ✅ | Origin city name |
| `destination` | string | ✅ | Destination city name |
| `priority` | string | ❌ | `"fast"`, `"cheap"`, `"safe"`, `"balanced"` (default: `"balanced"`) |
| `cargo_weight_kg` | number | ❌ | Cargo weight in kg (default: 100) |
| `cargo_type` | string | ❌ | Cargo category (default: `"General"`) |
| `departure_date` | string | ❌ | ISO date for rail schedules |
| `explanation_mode` | string | ❌ | `"template"` (fast, default) or `"detailed"` (Gemini AI) |

### Response — Success

```json
{
  "priority": "balanced",
  "recommended_mode": "rail",
  "reason": "RAIL provides the best balance of time (12.5 hours), cost (Rs.850), and risk (15%).",
  "available_modes": ["road", "rail", "air"],
  "comparison": [
    {
      "mode": "rail",
      "time_hr": 12.5,
      "cost_inr": 850,
      "risk": 0.15,
      "confidence": 0.78,
      "explanation": "RAIL ranks first because it best balances time, cost, and risk."
    },
    {
      "mode": "road",
      "time_hr": 8.2,
      "cost_inr": 3200,
      "risk": 0.25,
      "confidence": 0.72,
      "explanation": "ROAD is an alternative to RAIL, with 4.3 hours faster, Rs.2350 more expensive."
    }
  ],
  "tradeoffs": [
    "ROAD is 4.3 hrs lower time compared to RAIL",
    "ROAD is 2350 Rs. higher cost compared to RAIL"
  ],
  "mode_insights": {
    "road": ["Flexible door-to-door delivery"],
    "rail": ["Cost-effective for bulk transport"]
  },
  "best_per_mode": {
    "road": { "...full road route..." },
    "rail": { "...full rail route..." },
    "air": null
  },
  "unavailable_modes": {
    "air": "Air transport not available for this route"
  }
}
```

### Response — No Routes (any mode)

When a specific pipeline finds no routes:

```json
{
  "mode": "rail",
  "status": "no_routes",
  "message": "No railway routes found between Delhi and Kochi",
  "best": null,
  "alternatives": [],
  "all": []
}
```

### Response — All Modes Unavailable

```json
{
  "error": "No routes available for any transport mode",
  "available_modes": [],
  "unavailable_modes": {
    "road": "Road transport not available for this route",
    "rail": "Rail transport not available for this route",
    "air": "Air transport not available for this route"
  }
}
```

---

## `POST /api/road/optimize`

Road-only optimization.

### Request
```json
{
  "source": "Delhi",
  "destination": "Mumbai"
}
```

### Response
```json
{
  "best": { "type": "Road", "mode": "road", "time": 14.5, "cost": 12500, "risk": 0.25, "segments": [...] },
  "alternatives": [...],
  "all": [...]
}
```

---

## `POST /api/rail/optimize`

Rail cargo optimization with detailed train data.

### Request
```json
{
  "origin_city": "Delhi",
  "destination_city": "Mumbai",
  "cargo_weight_kg": 200,
  "cargo_type": "General",
  "priority": "cost",
  "departure_date": "2026-06-15"
}
```

### Response
Returns `{cheapest, fastest, safest, route_metadata, weather_context}` or `{error: "..."}`.

---

## `POST /api/air/routes`

Air route lookup.

### Request
```json
{
  "origin": "Delhi",
  "destination": "Mumbai"
}
```

### Response
Returns route list or `{status: "no_routes", message: "..."}`.

---

## `POST /api/water/optimize`

Water route lookup.

### Request
```json
{
  "source": "Mumbai",
  "destination": "Kochi"
}
```

### Response
Returns `{best, alternatives, all}`.

---

## Common Response Patterns

| Pattern | When | HTTP Status |
|---------|------|-------------|
| Normal result | Routes found | 200 |
| `status: "no_routes"` | No routes for a mode | 200 |
| `error: "..."` | Pipeline failure | 200 (with error field) |
| Server error | Unhandled exception | 500 |
