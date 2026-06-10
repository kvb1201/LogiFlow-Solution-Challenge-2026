# Architecture

## System overview

LogiFlow is a **multi-modal cargo logistics optimizer**. Each transport mode (road, rail, air, water) is an independent pipeline. A **hybrid comparator** and **composer** layer normalize outputs, score across modes, and build chained itineraries.

```
Client (Next.js / Capacitor)
      │
      ▼
Vercel /api/* proxy + warm-backend
      │
      ▼
FastAPI (Render)
      │
      ├─ /road/optimize
      ├─ /railway/optimize
      ├─ /air/optimize
      ├─ /water/optimize
      ├─ /compare/routes (alias /comparator/routes)
      ├─ /optimize (Comparator UI)
      ├─ /compose
      ├─ /intent/parse
      └─ /locations/resolve
      │
      ▼
Pipelines (road · rail · air · water · hybrid)
      │
      ▼
Services (Gemini · weather · geocoder · location funnel · Supabase caches)
```

## Request lifecycle (comparator)

1. Client sends `POST /comparator/routes` with source, destination, priority
2. `HybridPipeline.generate()` creates a per-request `RequestContext`
3. `ThreadPoolExecutor(max_workers=4)` runs road, rail, air, and water in parallel (**30s timeout** each)
4. Modes returning `{status: "no_routes"}` or timing out are marked unavailable
5. **Normalizer** maps each result to `{mode, time_hr, cost_inr, risk, confidence}`
6. **Scorer** applies Pareto checks and priority-weighted ranking
7. **Explainer** returns template text (default) or Gemini detail (`explanation_mode: "detailed"`)
8. JSON response with `recommended_mode`, `comparison`, `tradeoffs`, `available_modes`

## Component breakdown

### Pipelines (`app/pipelines/`)

| Pipeline | Data sources | Key logic |
|----------|-------------|-----------|
| **Road** | TomTom, OpenWeather | Routing → ML delay → toll/GST cost |
| **Rail** | CSV, delay scrape, ConfirmTkt scrape | Location funnel → route finder → tariff → delay ML |
| **Air** | OpenFlights + Supabase airports/routes (intl) | Airport resolution → lane ranking → OTP scoring |
| **Water** | 13-port sea-lane graph | Port mapping → BFS → risk breakdown |
| **Hybrid** | All four modes | Parallel run → normalize → score → explain |

### Shared services (`app/services/`)

| Service | Purpose |
|---------|---------|
| `location_funnel.py` | Canonical city + station cluster resolution (PDF + IATA) |
| `route_geometry_store.py` | Supabase read/write for `train_route_geometry` |
| `rail_ml_metrics_store.py` | Supabase snapshot of rail ML quantifiers |
| `station_pdf_index.py` | Parser/index for `station_name.pdf` |
| `geometry_audit.py` | Per-train schedule vs map geometry audit |
| `gemini_explainer.py` / `gemini_service.py` | AI explanations |
| `weather_service.py` | Origin/destination weather |
| `geocoding_service.py` | City → coordinates |
| `supabase_client.py` | REST client for Supabase tables |

### Routes (`app/routes/`)

| Router | Prefix | Notes |
|--------|--------|-------|
| `rail_routes` | `/railway` | Optimize, geometry, model-info, station search |
| `road_routes` | `/road` | TomTom optimization |
| `air_routes` | `/air` | Domestic + international lanes |
| `water_routes` | `/water` | Port routing |
| `comparator` | `/comparator` | Cross-mode compare |
| `compose` | `/compose` | Chained multimodal legs |
| `intent_routes` | `/intent` | NL shipment brief parsing |
| `location_routes` | `/locations` | Funnel debug / resolve-pair |
| `planner_routes` | `/planner` | Saved reports, trip monitoring |

## Supabase (read caches)

| Table | Purpose | Frontend access |
|-------|---------|-----------------|
| `station_coordinates` | Rail map station lat/lng | Backend only |
| `train_route_geometry` | Per-train corridor polylines | Backend → API |
| `rail_ml_metrics` | Delay ML quantifiers (`id=current`) | **Direct from Vercel** |
| `airports` / `air_routes` / `otp_baselines` | Air pipeline data | Backend |

Rail ML metrics bypass Render cold start: the railway page reads `rail_ml_metrics` via `NEXT_PUBLIC_SUPABASE_URL` + anon key.

## Parallel execution

```python
with ThreadPoolExecutor(max_workers=4) as executor:
    futures = {
        "road": executor.submit(safe_call, road_pipeline, "road"),
        "rail": executor.submit(safe_call, rail_pipeline, "rail"),
        "air":  executor.submit(safe_call, air_pipeline, "air"),
        "water": executor.submit(safe_call, water_pipeline, "water"),
    }
    for name, future in futures.items():
        results[name] = future.result(timeout=30)
```

## Caching tiers

```
L1: RequestContext     → per-request (weather, geocode)
L2: In-memory dict     → application lifetime
L3: Redis              → optional shared cache (REDIS_URL)
L4: Supabase           → rail geometry + ML metrics (persistent)
L5: Static JSON        → frontend/public fallbacks
```

## Reliability

- Frontend warms Render via `/api/warm-backend` on load, tab focus, and every 3 minutes
- GitHub Actions pings `/health` every 5 minutes when `BACKEND_URL` secret is set
- Rail schedule preload is off by default on 512MB Render instances
