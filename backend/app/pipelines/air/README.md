# Airway Pipeline

This folder contains the air cargo decision engine for LogiFlow.

**API:** `POST /air/optimize` · **Frontend:** `/air`  
**Docs:** [docs/pipelines/air.md](../../../docs/pipelines/air.md) · [OTP scoring](../../../docs/miscellaneous/air-otp-congestion-scoring.md) · [International routing](../../../docs/miscellaneous/international-air-routing-summary.md)

## Goal

The airway pipeline selects the best air cargo option using:

- route time
- freight cost
- operational risk
- delay probability
- cargo constraints

The pipeline is a scoring-based decision engine backed by checked-in OpenFlights route data — not a live commercial schedule API.

## Current Stack

The current version uses a free-stack architecture:

- `OurAirports CSV` (India-focused snapshot) for airport lookup and coordinates
- `OpenFlights routes.dat` (India intra-country snapshot) for direct and one-stop route support
- `air_otp_stats.json` for airport on-time probability baselines
- `Nominatim` / unified geocoder for cities not in static mappings
- `OpenWeather` for live weather enrichment
- internal scoring engine for route ranking

There is no paid flight schedule API in the active code path.

## End-to-End Flow

1. Receive user input (source, destination, priority, cargo, constraints).
2. Resolve airports:
   - normalize city aliases (`Bangalore` → `Bengaluru`)
   - static city-airport mappings
   - nearest airport from `backend/data/airports.csv` (within 100 km)
3. Generate candidate routes from `backend/data/routes.dat`:
   - direct airport pairs when supported
   - up to three one-stop hub chains when supported
   - **no synthetic fallback** when OpenFlights has no match
4. Enrich routes:
   - weather risk (OpenWeather)
   - airport OTP from `air_otp_stats.json`
   - airline reliability table
   - stop-based delay penalty
5. Apply constraints (`max_stops`, `budget_limit`, cargo type).
6. Score and rank by priority.
7. Return best route, alternatives, and metadata — or `status: no_routes` (HTTP 200).

## Files and Responsibilities

| File | Role |
|------|------|
| `pipeline.py` | Orchestration: fetch → engineer → constrain → score → explain |
| `config.py` | Static city-airport mappings, aliases, airline reliability |
| `engine.py` | Priority-weighted ranking |
| `ml_models.py` | Delay probability heuristics (OTP + weather + reliability) |

## Service Layer

| Service | Role |
|---------|------|
| `air_data_service.py` | OpenFlights graph, OTP lookup, route candidate builder |
| `airport_locator_service.py` | City → airport resolution |
| `air_weather_service.py` | Weather → route risk signals |
| `geocoding_service.py` | City geocoding when not in static map |

## Data Files

Checked in under `backend/data/` (regenerate with `make fetch-air-data`):

| File | Source | Contents |
|------|--------|----------|
| `airports.csv` | [OurAirports](https://ourairports.com/data/) | ~115 Indian airports with IATA + coordinates |
| `routes.dat` | [OpenFlights](https://openflights.org/data.html) | ~1,050 intra-India route records |
| `otp-baselines.json` | Internal baselines | Airport OTP for congestion scoring via `OTPScoringService` |

Optional env overrides:

- `OURAIRPORTS_CSV_PATH`
- `OPENFLIGHTS_ROUTES_PATH`
- `AIR_OTP_STATS_PATH`

## Data Source Labels in Responses

| Label | Meaning |
|-------|---------|
| `openflights` / `openflights_routes.dat` | Route backed by checked-in OpenFlights snapshot |

When no OpenFlights support exists for an airport pair, the API returns `status: no_routes` with HTTP 200 (not 404).

## Constraint Handling

- cargo type filtering (general / fragile / perishable)
- `max_stops`
- `budget_limit`
- `deadline_hours`

## Setup

### Required

Air data files must be present. From repo root:

```bash
make fetch-air-data    # download + trim India snapshots
make verify-air-data   # CI smoke check
```

Or commit the generated files (recommended for zero-setup deploys).

### Optional

Add to `backend/.env`:

```
OPENWEATHER_API_KEY=...
```

## How to Test

From `backend/`:

```powershell
python scripts/verify_air_data.py
python -m app.pipelines.air.test
```

API example (Swagger at `/docs`):

```json
{
  "source": "Delhi",
  "destination": "Mumbai",
  "priority": "fast",
  "departure_date": "2026-04-10",
  "cargo_weight_kg": 500,
  "cargo_type": "fragile",
  "max_stops": 1,
  "budget_limit": 10000
}
```

## What Is Not Active Yet

- paid commercial flight schedule APIs
- trained delay ML model (OTP baselines are used instead)
- real cargo tariff APIs
- flight path map geometry

These can be added without changing the core scoring structure.

See also: [docs/miscellaneous/air-otp-congestion-scoring.md](../../../docs/miscellaneous/air-otp-congestion-scoring.md)

"The air pipeline resolves cities to Indian airports using static mappings plus OurAirports, finds route support from a trimmed OpenFlights snapshot, enriches with weather and OTP baselines, and ranks options with a weighted scoring engine. When no route exists in the dataset, it returns a clean `no_routes` response — no fabricated flights."
