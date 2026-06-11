# Deployment

## Production topology (current)

| Component | Platform | URL |
|-----------|----------|-----|
| **Frontend** | Vercel | https://logi-flow-solution-challenge-2026.vercel.app |
| **Backend API** | GCP Cloud Run (asia-south1) | https://logiflow-api-sbexkjk72q-el.a.run.app |
| **Database (planner)** | Postgres (production) or SQLite (local) | via `DATABASE_URL` |
| **Cache / geometry** | Supabase + optional Redis | https://mwvohdvtxwltzkyuboaz.supabase.co |
| **Custom domain** | Cloudflare (optional) | https://logiflow.in · https://api.logiflow.in |

**Primary backend deploy path:** [gcp-deployment.md](./gcp-deployment.md)

---

## Backend (GCP Cloud Run) — recommended

### Quick deploy

```bash
./scripts/deploy-gcp-cloud-run.sh
```

Or: GitHub Actions → **Deploy API to GCP Cloud Run** (push to `main` on `backend/**`).

### Service profile (team-3mo)

| Setting | Value |
|---------|-------|
| Service name | `logiflow-api` |
| Region | `asia-south1` |
| CPU / Memory | 2 CPU · 2 GiB |
| Min instances | 1 (always-warm) |
| Max instances | 3 |
| Timeout | 300s |
| Concurrency | 40 |

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Google Gemini (intent, explanations, hybrid) |
| `TOMTOM_API_KEY` | ✅ | TomTom routing |
| `ORS_API_KEY` | recommended | OpenRouteService fallback geocoding |
| `OPENWEATHER_API_KEY` | recommended | Weather enrichment |
| `JWT_SECRET` | ✅ | JWT signing secret |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth (same as frontend) |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_KEY` | ✅ | Supabase service/anon key |
| `REDIS_URL` | recommended | Shared cache (compose legs, rate limits) |
| `DATABASE_URL` | ✅ (prod) | Postgres for planner (`postgresql+asyncpg://…`) |
| `GROQ_API_KEY` | ❌ | Groq fallback (intent, rail explain, Whisper) |
| `RAILRADAR_API_KEY` | ❌ | Live train data |
| `RAIL_PRELOAD_ON_STARTUP` | ❌ | Default `false` — preload 2017 CSV on boot |
| `WATER_AUTO_TRAIN` | ❌ | Default `off` in Dockerfile |
| `COMPOSE_PARALLEL_WORKERS` | ❌ | Default `8` on team-3mo profile |
| `RATE_LIMIT_ENABLED` | ❌ | Set `false` in tests |

Secrets are loaded from `backend/.env` at deploy time by `deploy-gcp-cloud-run.sh` (never committed).

### Health check

```bash
curl https://logiflow-api-sbexkjk72q-el.a.run.app/health
# → {"status":"ok"}
```

---

## Backend (Render) — legacy

Render was the original production host (512 MB RAM free tier). The team migrated to Cloud Run for compose/stream workloads that OOM'd on Render.

Render setup remains documented for reference:

| Setting | Value |
|---------|-------|
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Python Version | 3.11+ |

Render free tier sleeps after ~15 min idle (30–90s cold start). Use Cloud Run team-3mo profile or external keep-alive instead.

---

## Frontend (Vercel)

### Setup

| Setting | Value |
|---------|-------|
| Root Directory | `frontend` |
| Framework Preset | Next.js |
| Build Command | `npm run build` |

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | ✅ | Cloud Run API for server-side rewrites and warmup |
| `NEXT_PUBLIC_API_URL` | ✅ | Same URL for SSR fallback |
| `NEXT_PUBLIC_COMPOSE_URL` | ✅ | Direct compose URL (long hybrid runs) |
| `GOOGLE_CLIENT_ID` | ✅ | Google Sign-In (server-readable) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | ✅ | Google Sign-In (client) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `NEXT_PUBLIC_RAILRADAR_API_KEY` | ❌ | Live train map |
| `NEXT_PUBLIC_SITE_URL` | ❌ | Canonical URL for SEO/sitemap (e.g. `https://logiflow.in`) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | ✅ | GA4 default `G-S710XF91X1` — see [gcp-optimization.md](./gcp-optimization.md) |
| `NEXT_PUBLIC_SITE_URL` | ❌ | Canonical URL for SEO (`https://logiflow.in` when on custom domain) |

Production values are baked into `frontend/vercel.json`. After changing env vars in Vercel dashboard → **Redeploy**.

**Critical:** `NEXT_PUBLIC_*` vars are embedded at **build time**.

### API rewrites (`next.config.ts`)

| Browser path | Proxied to |
|--------------|------------|
| `/api/auth/*` | `{BACKEND_URL}/auth/*` |
| `/api/planner/*` | `{BACKEND_URL}/planner/*` |
| `/api/backend/*` | `{BACKEND_URL}/*` |
| `/railradar/*` | `https://api.railradar.org/api/v1/*` |

### Vercel route handlers

| Route | Purpose |
|-------|---------|
| `POST /api/compose` | Long-running compose proxy (90s `maxDuration`) |
| `GET /api/warm-backend` | Wakes Cloud Run; optional rail preload (`?lite=1` skips) |

### Verify Supabase direct reads

After deploy: DevTools → Network → filter `train_route_geometry` or `rail_ml_metrics` — requests should hit `*.supabase.co`.

### Vercel Web Analytics & Speed Insights

Enabled in `src/app/layout.tsx`. One-time dashboard enable per project:
1. Project → Analytics → Web Analytics → Enable
2. Project → Speed Insights → Enable

### Auto-deploy for collaborators

Workflow `.github/workflows/deploy-vercel-production.yml` deploys as team owner when collaborators push to `main`. See workflow file for required GitHub secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).

---

## Supabase sync (after deploy or retrain)

From `backend/` with `SUPABASE_URL` + `SUPABASE_KEY` in `.env`:

```bash
make sync-rail-ml-metrics          # ML quantifiers → rail_ml_metrics
make sync-rail-geometry-trains TRAINS=100   # corridor geometry
make audit-rail-geometry TRAINS=100         # schedule vs map audit
```

### Migrations (`supabase/migrations/`)

| Migration | Table |
|-----------|-------|
| `20260606100000_create_airports.sql` | `airports` |
| `20260606100001_create_air_routes.sql` | `air_routes` |
| `20260606100002_create_otp_baselines.sql` | `otp_baselines` |
| `20260607100000_create_rail_ml_metrics.sql` | `rail_ml_metrics` |
| `20260610100000_create_compose_leg_cache.sql` | `compose_leg_cache` |

---

## Mobile (Capacitor — Android)

### Prerequisites

- Node.js 18+
- Android Studio with SDK 33+
- Java 17

### Build APK

```bash
cd frontend
npm install @capacitor/core @capacitor/cli
npx cap init LogiFlow com.logiflow.app --web-dir=out
npx cap add android
npm run build
npx cap sync android
npx cap open android
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

### Configuration (`capacitor.config.ts`)

```typescript
const config: CapacitorConfig = {
  appId: 'com.logiflow.app',
  appName: 'LogiFlow',
  webDir: 'out',
  server: {
    url: 'https://logiflow-api-sbexkjk72q-el.a.run.app',
    cleartext: true,
  }
};
```

APK download: [Google Drive](https://drive.google.com/file/d/11l_qnlY7JiAerHGyBcq2wIVn0NtWNXNl/view?usp=sharing)

---

## Local development

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

### Redis (optional)

```bash
brew install redis && brew services start redis
# or: docker run -d -p 6379:6379 redis:alpine
```

Without Redis, backend falls back to in-memory caching.

### Production audit

```bash
make prod-audit   # checks Cloud Run health + Vercel frontend
```

---

## Platform comparison

| Platform | RAM | Timeout | Cold start | LogiFlow fit |
|----------|-----|---------|------------|--------------|
| **GCP Cloud Run** (team-3mo) | 2 GiB | 300s | ~0s (min 1) | ✅ **Production** |
| GCP Cloud Run (free) | 1 GiB | 300s | ~5–15s | ✅ Student budget |
| Render free | 512 MB | 30s | 30–90s | ❌ OOM on compose |
| Render Starter | 512 MB+ | — | Always on | ✅ Simple alternative |
| Vercel | — | 10s (serverless) | — | Frontend only |
