# Architecture

## System Overview

LogiFlow is a **multi-modal cargo logistics optimizer** built on a modular pipeline architecture. Each transport mode (road, rail, air, water) operates as an independent pipeline with its own data sources, feature engineering, and scoring logic. A centralized **Hybrid Engine** executes all pipelines in parallel, normalizes outputs into a common schema, and selects the optimal mode using priority-weighted scoring.

```
Client Request
      │
      ▼
┌──────────┐
│  FastAPI  │─────────── /api/optimize ──────────┐
│  Router   │                                     │
└──────────┘                                     ▼
                                         ┌───────────────┐
                                         │ HybridPipeline │
                                         │   .generate()  │
                                         └───────┬───────┘
                              ┌──────────────────┼──────────────────┐
                              ▼                  ▼                  ▼
                     ThreadPoolExecutor (max_workers=3)
                     ┌──────────┐ ┌──────────┐ ┌──────────┐
                     │   Road   │ │   Rail   │ │   Air    │
                     │ Pipeline │ │ Pipeline │ │ Pipeline │
                     └────┬─────┘ └────┬─────┘ └────┬─────┘
                          │            │             │
                          ▼            ▼             ▼
                     ┌──────────────────────────────────┐
                     │         Normalizer               │
                     │  (road → {mode, time, cost,      │
                     │   risk, confidence, meta})        │
                     └───────────────┬──────────────────┘
                                     ▼
                     ┌──────────────────────────────────┐
                     │    Scorer (priority-weighted)     │
                     │  dominance check → penalty →     │
                     │  weighted sum → rank              │
                     └───────────────┬──────────────────┘
                                     ▼
                     ┌──────────────────────────────────┐
                     │   Explainer (template / Gemini)   │
                     └───────────────┬──────────────────┘
                                     ▼
                              JSON Response
```

---

## Request Lifecycle

1. **Client** sends `POST /api/optimize` with `{source, destination, priority}`
2. **FastAPI router** delegates to `HybridPipeline.generate()`
3. **RequestContext** is created — a shared in-memory store for cross-pipeline caching (weather, geocoding)
4. **ThreadPoolExecutor** runs Road, Rail, and Air pipelines in parallel with a **30-second timeout** per pipeline
5. Each pipeline returns its best route(s) or `{status: "no_routes"}`
6. **Normalizer** converts each mode's output to a common schema: `{mode, time_hr, cost_inr, risk, confidence}`
7. **Scorer** applies priority weights and ranks candidates
8. **Explainer** generates human-readable tradeoff analysis (template-based by default; Gemini AI if `explanation_mode: "detailed"`)
9. Response is returned with `recommended_mode`, `comparison`, `tradeoffs`, and `available_modes`

---

## Component Breakdown

### Pipelines (`app/pipelines/`)

| Pipeline | Data Sources | Key Logic |
|----------|-------------|-----------|
| **Road** | TomTom API, weather service | Route generation → ML delay prediction → risk scoring |
| **Rail** | RailYatri scrape, ConfirmTkt scrape, CSV fallback | Station resolution → scraping (Tier 1/2) → tariff calculation |
| **Air** | OpenFlights dataset | Airport resolution → route matching → confidence filtering |
| **Water** | Static port/route dataset | Port mapping → BFS pathfinding → risk modeling |
| **Hybrid** | All of the above | Parallel execution → normalization → scoring → explanation |

### Shared Services (`app/services/`)

| Service | Purpose |
|---------|---------|
| `weather_service.py` | Fetches weather data for origin/destination cities |
| `gemini_explainer.py` | Gemini AI explanation generation with caching |
| `gemini_service.py` | General Gemini API wrapper |
| `ml_service.py` | ML model loading and inference |
| `geocoding_service.py` | City → coordinates resolution |
| `pipeline_registry.py` | Dynamic pipeline discovery and instantiation |
| `air_data_service.py` | OpenFlights data loading and route lookup |
| `airport_locator_service.py` | City → nearest airport resolution |

### Utilities (`app/utils/`)

| Utility | Purpose |
|---------|---------|
| `request_context.py` | Per-request key-value cache shared across pipelines |
| `coordinates.py` | Coordinate lookups and distance calculations |

---

## Parallel Execution

The Hybrid Engine uses Python's `concurrent.futures.ThreadPoolExecutor` with `max_workers=3` to run road, rail, and air pipelines simultaneously. Each future has a **30-second timeout**:

```python
with ThreadPoolExecutor(max_workers=3) as executor:
    futures = {
        "road": executor.submit(safe_call, road_pipeline, "road"),
        "rail": executor.submit(safe_call, rail_pipeline, "rail"),
        "air":  executor.submit(safe_call, air_pipeline, "air"),
    }
    for name, future in futures.items():
        results[name] = future.result(timeout=30)
```

If a pipeline times out or throws an exception:
- It is treated as **unavailable**
- The remaining modes proceed normally
- The response includes `unavailable_modes` with an explanation

---

## RequestContext Caching

To avoid redundant API calls when multiple pipelines need the same external data (e.g., weather for the same city), a `RequestContext` object is shared:

```python
context = RequestContext()

# In road pipeline:
weather = context.get("weather:Mumbai")  # cache hit if rail already fetched it

# In rail pipeline:
context.set("weather:Mumbai", weather_data)  # stored for other pipelines
```

This eliminates duplicate weather, geocoding, and incident API calls within a single request.

---

## Caching Strategy

| Layer | Scope | TTL | Purpose |
|-------|-------|-----|---------|
| **RequestContext** | Single HTTP request | Request lifetime | Cross-pipeline dedup |
| **In-memory cache** | Application lifetime | 1 day (trains), 30 days (stations) | Avoid redundant scraping |
| **Redis** | Persistent (production) | Configurable per endpoint | Shared cache across workers |
| **Gemini cache** | Application lifetime | 1 hour | Avoid duplicate AI calls |
