# Airway Pipeline

This folder contains the air cargo decision engine for LogiFlow.

## Goal

The airway pipeline selects the best air cargo option using:

- route time
- freight cost
- operational risk
- delay probability
- cargo constraints

The pipeline is designed as a scoring-based decision engine, not as a simple route lookup.

## Current Stack

The current version uses a free-stack architecture:

- `Nominatim` for city geocoding
- `OurAirports CSV` for airport lookup
- `OpenFlights routes.dat` for direct and one-stop route support
- `OpenWeather` for live weather enrichment
- internal fallback route generation for air route candidates
- internal scoring engine for route ranking

There is no paid flight schedule API in the active code path right now.

## End-to-End Flow

The air pipeline currently follows this flow:

1. Receive user input:
   - source
   - destination
   - priority
   - cargo weight
   - cargo type
   - constraints

2. Resolve airports:
   - normalize city aliases like `Bangalore -> Bengaluru`
   - check static city-airport mappings
   - if not found, geocode the city with Nominatim
   - if `airports.csv` is present, find the nearest airport from the OurAirports dataset

3. Generate candidate routes:
   - if `routes.dat` contains a direct airport pair, build a dataset-backed direct route
   - if `routes.dat` supports a one-stop airport chain, build dataset-backed one-stop routes
   - otherwise create fallback synthetic air routes using the resolved airport pair

4. Enrich routes with operational signals:
   - weather risk from OpenWeather
   - heuristic congestion risk
   - airline reliability
   - stop-based delay penalty

5. Apply route constraints:
   - `max_stops`
   - `budget_limit`
   - cargo support

6. Score all feasible routes:
   - weighted scoring based on priority
   - lowest score wins

7. Return:
   - best route
   - alternatives
   - reasoning metadata

## Files and Responsibilities

### `pipeline.py`

This is the main orchestration file.

It is responsible for:

- normalizing priority values
- reading input payload values
- calling airport resolution and route generation
- engineering route features
- applying constraints
- invoking the scoring engine
- attaching explanation fields

This is the file where the full air decision engine is assembled.

### `config.py`

This file stores static reference data:

- city-airport mappings
- city aliases
- airline reliability defaults
- curated mock routes

It acts as the local knowledge base for the air pipeline.

### `engine.py`

This file contains the weighted scoring logic.

It defines the weights for:

- `fast`
- `cheap`
- `balanced`
- `safe`

It normalizes route values and computes a final score for ranking.

### `ml_models.py`

This file contains the delay-probability logic.

Even though it is named `ml_models`, the current implementation is heuristic-enriched rather than a trained model.

It combines:

- base route delay risk
- weather risk
- congestion fallback
- airline reliability
- number of stops

This gives an ML-style delay estimate without needing a paid historical flight API.

## Service Layer

### `app/services/air_data_service.py`

This file is now the free-stack route-support adapter.

Its job is to expose the same interface the pipeline expects while avoiding any paid provider dependency.

Current behavior:

- `is_configured()` returns `False`
- `get_live_air_routes()` reads `backend/data/routes.dat`
- it returns direct and one-stop candidates when OpenFlights supports the airport pair
- if no route support exists, it intentionally pushes the pipeline into the fallback path

This means the air pipeline stays modular and can later be reconnected to a live schedule provider without changing the main scoring code.

### `app/services/airport_locator_service.py`

This service resolves a city into an airport.

Order of resolution:

1. city alias normalization
2. static city-airport mapping
3. nearest airport from OurAirports CSV
4. final fallback airport code from city name

This file is the bridge between city-level user input and airport-level route logic.

### `app/services/geocoding_service.py`

This service geocodes city names using Nominatim.

It is only used when the city is not already covered by static mapping.

It also caches lookups to avoid repeated requests.

### `app/services/air_weather_service.py`

This service converts raw weather data into risk signals suitable for decision-making.

It computes:

- source weather risk
- destination weather risk
- combined route weather risk

### `app/services/weather_service.py`

This existing service calls OpenWeather.

If the key is missing or the request fails, it returns a safe fallback weather object so the pipeline still runs.

## Data Sources

### 1. Nominatim

Used for:

- city -> latitude/longitude geocoding

Why:

- free
- lightweight
- good enough for city lookup

### 2. OurAirports CSV

Used for:

- latitude/longitude -> nearest airport
- airport metadata lookup

Why:

- free
- local file
- no runtime API limits

### 3. OpenWeather

Used for:

- live weather enrichment

Why:

- gives route-relevant operational signals
- useful for estimating risk and delay probability

### 4. OpenFlights `routes.dat`

Used for:

- direct airport-pair validation
- one-stop route support through known hubs
- supporting-airline hints in API responses

Why:

- free local dataset
- better than blindly assuming every airport pair has a valid flight
- keeps the project demo-safe without paid API dependencies

## Data Source Labels in Responses

The pipeline now labels route origin clearly:

- `free_stack_mock_catalog`
  - route came from curated mock data for a known lane

- `free_stack_dynamic_fallback`
  - route was generated dynamically after airport resolution

- `openflights_routes.dat`
  - route is backed by the checked-in OpenFlights route snapshot

These labels make it easy to explain to teammates or judges where the route came from.

## Constraint Handling

The current air pipeline supports:

- cargo type filtering
- `max_stops`
- `budget_limit`

This makes the route selection cargo-aware instead of just distance-based.

## Why This Still Counts as Real-Time

The pipeline is not using real-time commercial flight schedules right now, but it still uses real-time operational enrichment:

- real city geocoding
- real airport selection support
- real weather enrichment
- dynamic route scoring

So the current version is best described as:

`free-stack operationally enriched air routing`

rather than:

`live commercial schedule search`

## What Is Missing Right Now

These pieces are intentionally not active:

- paid flight schedule APIs
- historical flight delay models
- real cargo tariff APIs
- confirmed daily airline schedules

These can be added later without changing the core scoring structure.

## Setup

### Required for basic fallback mode

Nothing is strictly required.

The pipeline will run even without:

- OpenWeather key
- OurAirports CSV
- OpenFlights routes data

because all services have safe fallbacks.

### Recommended setup

1. Put `airports.csv` in:

`backend/data/airports.csv`

2. Put `routes.dat` in:

`backend/data/routes.dat`

3. Optionally add:

`OPENWEATHER_API_KEY=...`

to `backend/.env`

### Optional override

If you want to store the CSV somewhere else, set:

`OURAIRPORTS_CSV_PATH=absolute_path_to_airports.csv`

If you want to store the routes snapshot somewhere else, set:

`OPENFLIGHTS_ROUTES_PATH=absolute_path_to_routes.dat`

## How to Test

### Pipeline test

Run from `backend/`:

```powershell
.\myenv\Scripts\python.exe -m app.pipelines.air.test
```

### API test

Start the server:

```powershell
.\myenv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Then test in Swagger at:

`http://127.0.0.1:8000/docs`

Use:

```json
{
  "source": "Tirupati",
  "destination": "Bangalore",
  "priority": "fast",
  "departure_date": "2026-04-10",
  "cargo_weight_kg": 500,
  "cargo_type": "fragile",
  "max_stops": 1,
  "budget_limit": 10000
}
```

## Teammate Summary

If you need a short explanation for teammates:

“Right now the air pipeline uses a free-stack design. We resolve cities to airports using static mappings plus Nominatim and optionally OurAirports, enrich routes with weather risk from OpenWeather, generate candidate air routes internally, and rank them using a weighted scoring decision engine. The architecture is modular so a live flight schedule provider can be plugged in later without changing the core logic.”
