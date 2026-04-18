# Rail Pipeline

## Overview

The Rail pipeline finds train routes between Indian cities using a **tiered data fetching strategy**: lightweight web scraping as the primary source and CSV datasets as fallback. All session-based IRCTC scraping has been removed to avoid legal risk and improve stability.

## Flow

```
Input: source city, destination city, departure date
  │
  ├─ 1. Station Resolution → city name → station code(s)
  ├─ 2. Data Fetching (tiered):
  │     ├─ Tier 1: RailYatri HTML scrape (primary)
  │     ├─ Tier 2: ConfirmTkt HTML scrape (fallback)
  │     └─ Tier 3: CSV dataset (offline fallback)
  ├─ 3. Validation → station codes, duration, distance checks
  ├─ 4. Feature Engineering → speed, punctuality, risk factors
  ├─ 5. Tariff Calculation → official parcel van rates
  ├─ 6. ML Predictions → delay, duration factor
  ├─ 7. Decision Engine → multi-objective ranking
  │
  ▼
Output: {cheapest, fastest, safest} OR {status: "no_routes"}
```

## Key Features

### Lightweight Scraping (No Session/Auth)
- **RailYatri**: Simple GET request to public HTML page, JSON extraction
- **ConfirmTkt**: Next.js `__NEXT_DATA__` payload extraction from public page
- Both use strict timeouts: 3s connect, 4s read, 6s total budget
- No cookies, no authorization headers, no browser spoofing

### CSV Fallback
- Offline Indian Railways schedule dataset
- Used only when both scrapers fail
- Tagged as `data_source: "csv_fallback"`

### Data Validation
All scraped routes are validated before acceptance:
- Station code: 2–5 uppercase letters (`^[A-Z]{2,5}$`)
- Duration: > 0 and ≤ 4320 minutes (72 hours max)
- Distance: > 0 km

### Cost Calculation
- Official Indian Railways **Parcel Van tariff** schedule
- Scale-based pricing (S/L/P) by weight and distance
- Weather and risk surcharges

### Data Source Tagging
Every route includes a `data_source` field:
- `"scraped"` — from RailYatri or ConfirmTkt
- `"csv_fallback"` — from offline CSV dataset

### Circuit Breaker
- Trips after 5 consecutive scraping failures
- Fast-fails for 60 seconds, then enters half-open recovery
- Prevents cascading failures

## Output Structure

**When routes found:**
```json
{
  "cheapest": { "type": "Rail", "mode": "rail", "time": 18.5, "cost": 850, "risk": 0.15, ... },
  "fastest":  { "type": "Rail", "mode": "rail", "time": 12.0, "cost": 1200, "risk": 0.20, ... },
  "safest":   { "type": "Rail", "mode": "rail", "time": 16.0, "cost": 950, "risk": 0.10, ... }
}
```

**When no routes found:**
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
