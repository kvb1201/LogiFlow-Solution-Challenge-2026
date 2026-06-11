# System Design

## Design Principles

### 1. Modular Pipeline Architecture
Each transport mode is a self-contained pipeline implementing a common `BasePipeline` interface:

```python
class BasePipeline:
    mode: str
    name: str
    def generate(self, source, destination, payload=None, context=None) -> dict
```

Pipelines can be developed, tested, and deployed independently. Adding a new transport mode requires only implementing this interface and registering it in `pipeline_registry.py`.

### 2. Separation of Concerns

| Layer | Responsibility |
|-------|---------------|
| **Routes** (`app/routes/`) | HTTP handling, request validation, response formatting, auth guards |
| **Pipelines** (`app/pipelines/`) | Business logic, data fetching, scoring per transport mode |
| **Services** (`app/services/`) | External API integrations, compose, auth, ML stores, geocoding |
| **Models** (`app/models/`) | SQLAlchemy domain models + Pydantic request/response schemas |
| **Middleware** (`app/middleware/`) | Rate limits, optimize concurrency/cache |
| **Utils** (`app/utils/`) | Cross-cutting concerns (RequestContext, coordinates) |

### 3. Data Integrity Over Convenience
- Pipelines return `{status: "no_routes"}` rather than fabricating data
- Road pipeline validates corridor drivability **before** calling TomTom (trans-oceanic corridors rejected)
- Mock/fallback routes are never injected as real results in comparator scoring
- Every route is tagged with `data_source` for transparency
- Fallback road estimates (when TomTom times out) get reduced confidence (×0.35) in hybrid normalization

### 4. Honest Empty States
- Frontend `InvalidCorridorCard` surfaces `no_routes` as actionable UX, not error banners
- Comparator shows per-mode unavailable reasons in `unavailable_modes`
- Air/water/rail all return HTTP 200 with `status: "no_routes"` when no valid path exists

---

## Performance Optimizations

### RequestContext (Per-Request Cache)
A lightweight key-value store shared across all pipelines within a single HTTP request:

| Without RequestContext | With RequestContext |
|----------------------|-------------------|
| Road fetches weather for Mumbai | Road fetches weather for Mumbai |
| Rail fetches weather for Mumbai (duplicate) | Rail reads from cache (0ms) |
| Air fetches weather for Mumbai (duplicate) | Air reads from cache (0ms) |
| **3 API calls** | **1 API call** |

### Tiered Caching
```
L1: RequestContext     → per-request (ms lifetime)
L2: In-memory dict     → application lifetime (TTL-based)
L3: Redis              → persistent across restarts (production)
L4: Supabase           → rail geometry, ML metrics, air reference, compose legs
L5: Static JSON        → frontend/public fallbacks
```

### Compose Leg Cache
Successful compose leg results are cached with SHA256 keys:
- L1: in-process memory
- L2: Redis (`REDIS_URL`)
- L3: Supabase `compose_leg_cache` (TTL default 6h via `COMPOSE_LEG_CACHE_TTL_S`)

### Reduced Gemini Usage
- Default mode: template-based explanations (0ms latency)
- Gemini only called when `explanation_mode: "detailed"`
- Results cached in-memory (1-hour TTL, 200-entry cap)
- Timeout reduced to 5s with template fallback

### Parallel Pipeline Execution
- **Comparator**: `ThreadPoolExecutor(max_workers=4)` — latency ≈ slowest pipeline
- **Compose**: configurable `COMPOSE_PARALLEL_WORKERS` (8 on Cloud Run team-3mo)
- **Rail engineer**: `RAIL_ENGINEER_MAX_EXTERNAL_LOOKUPS=1` limits hot-path API fan-out

### Frontend Optimizations
- Supabase direct REST for rail geometry and ML metrics (bypasses backend cold start)
- `/api/warm-backend` preloads rail stations/model-info on focus
- Compose proxied through Next.js route handler for 90s Vercel `maxDuration`
- `BackendWarmup` component pings every 3 minutes while tab is open

---

## Scalability

### Stateless Backend
- JWT sessions (no server-side session store)
- All ephemeral state in RequestContext (per-request) or Redis (shared)
- Planner persistence in Postgres/SQLite via SQLAlchemy async
- Horizontally scalable on Cloud Run (concurrency 40, max 3 instances on team-3mo)

### Independent Pipelines
- Each pipeline can be scaled, rate-limited, or disabled independently
- Circuit breaker on RailRadar (5 failures → 60s fast-fail)
- Pipelines feature-flagged via environment variables (`WATER_AUTO_TRAIN`, `RAIL_PRELOAD_ON_STARTUP`)

### Cache-First Architecture
- Station data cached for 30 days
- Train schedules cached for 24 hours
- Gemini explanations cached for 1 hour
- Compose legs cached for 6 hours
- Redis shared across all Cloud Run instances in production

---

## Fault Tolerance

### `safe_call` Wrapper
Every pipeline execution in hybrid mode is wrapped:

```python
def safe_call(pipeline, name):
    try:
        return pipeline.generate(source, destination, payload, context=context)
    except Exception as e:
        print(f"[HYBRID ERROR] {name} pipeline failed: {e}")
        return {}
```

### Timeout Protection
Each pipeline has a 30-second timeout in comparator mode. If exceeded:
- Pipeline is marked as unavailable
- Remaining modes proceed normally
- Response includes `unavailable_modes` explanation

### Traffic Queue (Frontend)
When backend returns 429 (rate limit) or 503 (concurrency saturated):
- `TrafficQueueError` thrown in `api.ts`
- User redirected to `/waiting` with sessionStorage context
- Auto-resume when backend accepts requests again

### Graceful Degradation

| Failure | Behavior |
|---------|----------|
| 1 pipeline fails | Other modes compared normally |
| 2 pipelines fail | Single mode returned as recommendation |
| All pipelines fail | Error response with `available_modes: []` |
| Gemini API fails | Template-based explanation used |
| Groq fails (intent) | Regex parser fallback |
| Redis unavailable | In-memory cache used |
| Supabase unavailable | CSV/static JSON fallbacks |
| Weather API fails | Default weather factor (1.0) applied |
| TomTom fails (road) | Haversine fallback with reduced confidence |

### Circuit Breaker (Rail)
- Trips after 5 consecutive RailRadar failures
- Fast-fails for 60 seconds
- Half-open recovery probe after timeout

---

## Authentication & Authorization

### Google OAuth → JWT
1. Frontend sends Google ID token to `POST /auth/login`
2. Backend verifies audience against `GOOGLE_CLIENT_ID` / `GOOGLE_ALLOWED_CLIENT_IDS`
3. JWT issued (HS256, 7-day expiry, `sub` = user id)
4. All `/planner/*` routes require `Authorization: Bearer <token>`
5. Report ownership enforced: cross-user access returns 403

### Frontend Guards
- `ProtectedRoute`: redirects unauthenticated users to `/login`
- `PublicRoute`: redirects authenticated users to `/dashboard`
- Client-side only (no Next.js middleware) — API routes still enforce JWT server-side

---

## Planner & Trip Monitoring

### Report lifecycle
```
draft → planned → active → completed
                    ↓
                 cancelled
```

### Route health (`GET /planner/reports/{id}/route-health`)
- `condition_intelligence` scores traffic, weather, schedule adherence (0–100)
- `trip_progress` computes deviation from planned route
- Triggers reoptimization when thresholds exceeded

### Reoptimization v1
- `POST /planner/reports/{id}/reoptimize-v1` — replan from `current_location` to destination
- `POST /planner/reports/{id}/accept-reoptimization` — apply alternative route
- Notifications created for significant deviations

---

## Deployment Topology

```
GitHub (main)
    ├─ push backend/** → GitHub Actions → GCP Cloud Run (logiflow-api, asia-south1)
    └─ push frontend/** → Vercel (or GitHub Actions deploy-vercel-production.yml)

Vercel frontend
    ├─ rewrites /api/backend/* → Cloud Run
    ├─ rewrites /api/auth/* → Cloud Run
    ├─ rewrites /api/planner/* → Cloud Run
    └─ direct Supabase REST (geometry, ML metrics)

Cloud Run (team-3mo profile)
    ├─ 2 CPU · 2Gi RAM · min 1 instance
    ├─ 300s timeout · concurrency 40
    └─ env from backend/.env at deploy time
```

Legacy Render deployment is documented in [deployment.md](./deployment.md) for reference but is no longer the production target.
