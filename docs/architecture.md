# Architecture

## System overview

LogiFlow is a **multi-modal cargo logistics optimizer**. Each transport mode (road, rail, air, water) is an independent pipeline. A **hybrid comparator** and **composer** layer normalize outputs, score across modes, and build chained itineraries. A **planner** subsystem persists saved shipment reports with trip lifecycle and route health monitoring.

```
Client (Next.js 16 / Capacitor Android)
      │
      ▼
Vercel
  ├─ /api/auth/*        → backend /auth/*
  ├─ /api/planner/*     → backend /planner/*
  ├─ /api/backend/*     → backend /* (same-origin proxy)
  ├─ /api/compose       → long-running compose proxy (90s maxDuration)
  ├─ /api/warm-backend  → wakes Cloud Run + optional rail preload
  └─ /railradar/*       → RailRadar live train API
      │
      ▼
FastAPI (GCP Cloud Run · asia-south1)
      │
      ├─ /road/optimize
      ├─ /railway/optimize · /railway/simulate
      ├─ /air/optimize
      ├─ /water/optimize
      ├─ /optimize · /compare/routes · /comparator/routes
      ├─ /compose · /compose/stream
      ├─ /intent/parse
      ├─ /locations/resolve
      ├─ /auth/*
      └─ /planner/*
      │
      ▼
Pipelines (road · rail · air · water · hybrid)
      │
      ▼
Services (compose · location funnel · Gemini · weather · geocoder · Supabase · auth)
      │
      ▼
Data (TomTom · RailRadar · OpenFlights · PortWatch · Supabase · Redis · Postgres/SQLite)
```

**Production URLs**

| Surface | URL |
|---------|-----|
| Frontend | https://logi-flow-solution-challenge-2026.vercel.app |
| Backend API | https://logiflow-api-sbexkjk72q-el.a.run.app |
| Custom domain (optional) | https://logiflow.in · https://api.logiflow.in |

---

## Frontend architecture

### Pages (15 routes)

| Route | Component | Auth |
|-------|-----------|------|
| `/` | `HomePage` + `HomeIntentSection` | Public |
| `/landing` | `LandingPage` | Public (redirects if authed) |
| `/login` | `LoginPage` + Google Sign-In | Public |
| `/dashboard` | `Dashboard` | Protected |
| `/reports` | `ReportsPage` | Protected |
| `/reports/[id]` | `ReportDetailPage` | Protected |
| `/railway` | `RailwayDashboard` | Public |
| `/road` | `RoadPageClient` | Public |
| `/air` | `AirPageClient` | Public |
| `/water` | `WaterPageClient` | Public |
| `/hybrid` | `HybridPageClient` | Public |
| `/comparator` | `ComparatorPageClient` | Public |
| `/waiting` | `WaitingRoom` | Public |
| `/terms` · `/privacy` | `LegalPage` | Public |

### State management (Zustand)

| Store | File | Scope |
|-------|------|-------|
| `useAuthStore` | `store/useAuthStore.ts` | User, JWT, session restore via `/api/auth/me` |
| `useLogiFlowStore` | `store/useLogiFlowStore.ts` | Corridor inputs, results per mode, map coords, loading steps |
| `usePlannerStore` | `store/usePlannerStore.ts` | Saved reports, route health, reoptimization, notifications |

### API clients

- `services/api.ts` — all pipeline optimize calls, intent parse, compose streaming, Supabase direct REST for geometry/ML
- `services/plannerApi.ts` — authenticated planner CRUD and trip lifecycle
- `lib/apiClient.ts` — Bearer token attachment, 401 auto-logout

### Auth flow

1. Google Identity Services returns credential JWT
2. `POST /api/auth/login` → backend verifies → returns `{ user, token }`
3. JWT stored in `sessionStorage` + Zustand
4. `AuthInitializer` calls `GET /api/auth/me` on app load
5. `ProtectedRoute` / `PublicRoute` guard client-side (no Next.js middleware)

---

## Request lifecycle (comparator)

1. Client sends `POST /optimize` or `POST /comparator/routes` with source, destination, priority
2. `HybridPipeline.generate()` creates a per-request `RequestContext`
3. `ThreadPoolExecutor(max_workers=4)` runs road, rail, air, and water in parallel (**30s timeout** each)
4. Modes returning `{status: "no_routes"}` or timing out are marked unavailable
5. **Normalizer** maps each result to `{mode, time_hr, cost_inr, risk, confidence}`
6. **Scorer** applies Pareto checks and priority-weighted ranking
7. **Explainer** returns template text (default) or Gemini detail (`explanation_mode: "detailed"`)
8. JSON response with `recommended_mode`, `comparison`, `tradeoffs`, `available_modes`

---

## Request lifecycle (compose / hybrid page)

1. Client sends `POST /compose` (or streams via `/compose/stream`)
2. `RouteComposer` resolves source/destination via location funnel + geocoding
3. For rural villages: `geo_hub_finder` discovers nearest metro hubs
4. Hub templates built (e.g. road→rail→road, rail→air, direct road)
5. Legs executed in parallel with budget/timeout; results cached (L1 memory → L2 Redis → L3 Supabase)
6. `itinerary_scorer` ranks chained itineraries
7. Optional SSE stream emits partial ranked results

Long compose runs from Vercel use `POST /api/compose` (Next.js route handler, 90s `maxDuration`) to avoid platform timeout.

---

## Component breakdown

### Pipelines (`app/pipelines/`)

| Pipeline | Data sources | Key logic |
|----------|-------------|-----------|
| **Road** | TomTom, OpenWeather, ORS | Corridor validation → routing → ML delay → toll/GST cost |
| **Rail** | CSV, delay scrape, RailRadar, tariff PDFs | Location funnel → route finder → tariff → delay ML |
| **Air** | OpenFlights, Supabase airports/routes, OTP baselines | Airport resolution → lane ranking → OTP scoring |
| **Water** | PortWatch (~350 ports), chokepoints, marine weather | Port mapping → sea graph BFS → ML delay/ETA |
| **Hybrid** | All four modes | Parallel run → normalize → score → explain |

### Shared services (`app/services/`)

| Service | Purpose |
|---------|---------|
| `location_funnel.py` | Canonical city + station cluster resolution (PDF + IATA) |
| `route_composer.py` | Multimodal hub chaining, rural geo-hub discovery |
| `geo_hub_finder.py` | Geospatial hub discovery for unmapped villages |
| `hub_spatial_index.py` | 9k+ station spatial index |
| `compose_leg_cache.py` | L1/L2/L3 leg result cache |
| `route_geometry_store.py` | Supabase read/write for `train_route_geometry` |
| `rail_ml_metrics_store.py` | Supabase snapshot of rail ML quantifiers |
| `auth_service.py` | Google OAuth verify, JWT create/decode |
| `intent_parser.py` | NLP brief → structured shipment fields |
| `trip_progress.py` | Route health, progression, reopt triggers |
| `reoptimization_service.py` | Build/apply reoptimization recommendations |
| `condition_intelligence.py` | Traffic/weather/adherence scoring (0–100) |
| `gemini_explainer.py` / `gemini_service.py` | AI explanations |
| `otp_scoring_service.py` | Air OTP congestion scoring |
| `supabase_client.py` | REST client for Supabase tables |

### Routes (`app/routes/`)

| Router | Prefix | Notes |
|--------|--------|-------|
| `rail_routes` | `/railway` | Optimize, simulate, geometry, model-info, station search, live trains |
| `road_routes` | `/road` | TomTom optimization, multi-stop |
| `air_routes` | `/air` | Domestic + international lanes |
| `water_routes` | `/water` | Port catalog, optimize |
| `optimize` | `/optimize` | Hybrid comparator (primary UI endpoint) |
| `comparator` | `/comparator` | Legacy alias for compare |
| `compose` | `/compose` | Chained multimodal legs + SSE stream |
| `auth_routes` | `/auth` | Google login, session, logout |
| `planner_routes` | `/planner` | Reports, trip lifecycle, route health, notifications (JWT) |
| `intent_routes` | `/intent` | NL shipment brief parsing |
| `location_routes` | `/locations` | Funnel debug / resolve-pair |
| `explain_routes` | `/explain` | Standalone route explanation |
| `speech_routes` | `/speech` | Groq Whisper transcription |

---

## Database & Supabase

### SQLAlchemy (planner)

| Model | Purpose |
|-------|---------|
| `User` | Google-authenticated user profile |
| `UserPreferences` | User settings |
| `ShipmentReport` | Saved optimization results (24h TTL) |
| `ShipmentNotification` | Trip alerts and reoptimization notices |

Local: SQLite (`sqlite+aiosqlite:///./logiflow.db`). Production: Postgres via `DATABASE_URL`.

### Supabase tables

| Table | Purpose | Frontend access |
|-------|---------|-----------------|
| `station_coordinates` | Rail map station lat/lng | Backend only |
| `train_route_geometry` | Per-train corridor polylines | Backend → API; browser via Supabase REST fallback |
| `rail_ml_metrics` | Delay ML quantifiers (`id=current`) | **Direct from Vercel** |
| `airports` / `air_routes` / `otp_baselines` | Air pipeline reference data | Backend |
| `compose_leg_cache` | Persisted compose leg results | Backend |

Rail ML metrics bypass Cloud Run latency: the railway page reads `rail_ml_metrics` via `NEXT_PUBLIC_SUPABASE_URL` + anon key.

---

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

Compose uses a separate parallel worker pool (`COMPOSE_PARALLEL_WORKERS`, default 8 on Cloud Run team-3mo profile).

---

## Caching tiers

```
L1: RequestContext     → per-request (weather, geocode)
L2: In-memory dict     → application lifetime
L3: Redis              → optional shared cache (REDIS_URL)
L4: Supabase           → rail geometry, ML metrics, air data, compose legs
L5: Static JSON        → frontend/public fallbacks (rail-ml-metrics.json)
```

---

## Security & rate limiting

| Mechanism | Detail |
|-----------|--------|
| **JWT auth** | HS256, 7-day expiry, `JWT_SECRET` |
| **slowapi** | Per-IP limits: optimize 8/min, compose 8/min, intent 8/min, login 20/min |
| **Optimize guard** | SHA256 response cache (TTL 3600s) + concurrency semaphore (default 5) |
| **CORS** | localhost, Vercel, logiflow.in, Capacitor mobile regex |
| **Ownership** | Planner routes check `user_id` on every report operation |

---

## Reliability

- Frontend warms Cloud Run via `/api/warm-backend` on load, tab focus, and every 3 minutes
- **Traffic queue** (`/waiting`): sessionStorage context + auto-resume on 429/503
- Cloud Run **team-3mo** profile: min 1 instance, 2 CPU, 2Gi RAM, 300s timeout (always-warm for compose)
- GitHub Actions deploys backend on `main` pushes to `backend/**`
- Rail schedule preload off by default (`RAIL_PRELOAD_ON_STARTUP=false`)
