# Deployment

## Backend (Render)

### Setup

1. Create a new **Web Service** on [Render](https://render.com)
2. Connect your GitHub repository
3. Set the following:

| Setting | Value |
|---------|-------|
| **Root Directory** | `backend` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Python Version** | 3.10+ |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `TOMTOM_API_KEY` | ✅ | TomTom routing API key |
| `REDIS_URL` | ❌ | Redis connection URL (omit for in-memory cache) |
| `RAIL_PERMANENT_CACHE` | ❌ | Set to `true` to persist rail cache indefinitely |
| `GEMINI_MODEL` | ❌ | Gemini model (default: `gemini-2.5-flash`) |
| `GEMINI_TIMEOUT_S` | ❌ | Gemini timeout in seconds (default: `5`) |
| `SUPABASE_URL` | ❌ | Supabase project URL (geometry + ML metrics sync) |
| `SUPABASE_KEY` | ❌ | Supabase service/anon key for backend upserts |
| `RAIL_PRELOAD_ON_STARTUP` | ❌ | Set `true` to preload 2017 CSV on boot (needs ≥1GB RAM) |
| `CONFIRMTKT_CONNECT_TIMEOUT_S` | ❌ | ConfirmTkt connect timeout (default: `3`) |
| `CONFIRMTKT_READ_TIMEOUT_S` | ❌ | ConfirmTkt read timeout (default: `4`) |

### Health Check

```
GET /health
→ {"status": "ok"}
```

### Render cold start (free tier)

On the **free** plan, Render stops your service after **~15 minutes** of no traffic. The next request can take **30–90 seconds** to boot (503 errors until uvicorn is ready).

**You cannot make a sleeping free instance start instantly** — something must either keep it awake or you upgrade to always-on.

| Option | Cost | Effect |
|--------|------|--------|
| **Render Starter** ($7/mo) | Paid | Instance never sleeps — instant responses |
| **GitHub Actions keep-alive** | Free | Pings `/health` every 14 min (see `.github/workflows/warm-render-backend.yml`). Add repo secret `BACKEND_URL`. |
| **UptimeRobot / cron-job.org** | Free | External monitor hits `https://your-api.onrender.com/health` every 5–14 min |
| **App warmup** (built-in) | Free | Frontend pings `/api/warm-backend` on load and before optimize |

The built-in warmup reduces 503s for users but the **first visitor after a long idle gap** may still wait ~30s while Render boots.

### Alternatives to Render

| Platform | Fits this FastAPI app? | Cold start |
|----------|--------------------------|------------|
| **Firebase Hosting** | Frontend only — does not run Python/FastAPI | N/A |
| **Firebase Cloud Functions** | Possible with heavy refactor; 60s timeout limits; not ideal for 13s+ `/optimize` | Can be slow |
| **Google Cloud Run** | ✅ Good fit — containerize backend, set `min-instances: 1` for always warm | ~0s with min instances ($) |
| **Fly.io / Railway** | ✅ Similar to Render | Paid tiers stay warm |
| **Render Starter** | ✅ Easiest — no code changes | Always on |

**Recommendation:** Stay on Render + enable the GitHub keep-alive workflow, or upgrade to **Render Starter** if you need guaranteed instant startup for demos.

---

## Frontend (Vercel)

### Setup

1. Create a new project on [Vercel](https://vercel.com)
2. Connect your GitHub repository
3. Set the following:

| Setting | Value |
|---------|-------|
| **Root Directory** | `frontend` |
| **Framework Preset** | Next.js |
| **Build Command** | `npm run build` |
| **Output Directory** | `.next` (auto-detected) |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | ✅ (prod) | Render API URL for server-side rewrites and warmup |
| `NEXT_PUBLIC_API_URL` | ✅ (fallback) | Same URL if `BACKEND_URL` is not set |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ (prod) | `https://mwvohdvtxwltzkyuboaz.supabase.co` — **map geometry** + ML metrics (browser → Supabase direct) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ (prod) | Supabase **anon** key (same as `SUPABASE_KEY` in backend `.env`) |

**Critical:** `NEXT_PUBLIC_*` vars are baked in at **build time**. After adding or changing them in Vercel → **Redeploy** (Deployments → ⋯ → Redeploy).

Without these two vars, the train map never loads geometry from Supabase (it falls back to Render, which can cold-start for 30–90s).

Verify after deploy: open the site → DevTools → Network → filter `train_route_geometry` — you should see requests to `*.supabase.co`, not only `onrender.com`.

The railway delay-model panel and **route map** both fetch **Supabase first**, then fall back to Render.

### Vercel Web Analytics & Speed Insights

The frontend includes `@vercel/analytics` and `@vercel/speed-insights` in `src/app/layout.tsx`.

After deploy, enable in the Vercel dashboard (one-time per project):

1. **Project → Analytics → Web Analytics → Enable**
2. **Project → Speed Insights → Enable**

Data appears after the next production deploy and real traffic. View under **Analytics** and **Speed Insights** tabs.

### Auto-deploy when collaborators push (Hobby plan workaround)

Vercel **blocks** production deploys on private repos when the commit author is not the Vercel team owner. The workflow `.github/workflows/deploy-vercel-production.yml` fixes this:

- **Collaborator pushes to `main`** (`github.actor` is not `kvb1201`) → deploy **immediately** as Kaveh (rewrite commit author + Vercel CLI).
- **Kaveh pushes to `main` himself** → workflow **skipped**; Vercel’s normal Git deploy handles it.
- **Manual test:** Actions → “Deploy frontend to Vercel” → Run workflow.

#### One-time setup — **Kaveh only** (~10 minutes)

**Step 1 — Vercel access token**

1. Log in to [vercel.com](https://vercel.com) as **kvb1201**
2. **Account Settings** → **Tokens** → **Create**
3. Name: `github-actions-logiflow`, scope: full account (or this project)
4. Copy the token (shown once)

**Step 2 — Org ID and Project ID**

1. Open project **logi-flow-solution-challenge-2026**
2. **Settings → General** → copy **Project ID** → `prj_WipexBr8rHsUP7b0PC8uPYJjxnBu`
3. **Team Settings → General** → copy **Team ID** → `team_QNI9cRl0sS1VVLoJhfHRq3sD` (verify it matches)

**Step 3 — GitHub repo secrets**

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** for each:

| Secret name | Value |
|-------------|--------|
| `VERCEL_TOKEN` | Token from Step 1 |
| `VERCEL_ORG_ID` | Team ID from Step 2 |
| `VERCEL_PROJECT_ID` | `prj_WipexBr8rHsUP7b0PC8uPYJjxnBu` |
| `VERCEL_GIT_EMAIL` | `kavyabhatiya44@gmail.com` (must match his GitHub verified email) |
| `VERCEL_GIT_NAME` | `Bhatiya Kavya Vishnukumar` (his GitHub display / git name) |

**Step 4 — Confirm Vercel env vars are set**

In Vercel project → **Settings → Environment Variables** (Production):

- `BACKEND_URL` = `https://logiflow-solution-challenge-2026.onrender.com`
- `NEXT_PUBLIC_API_URL` = same
- `NEXT_PUBLIC_SUPABASE_URL` = `https://mwvohdvtxwltzkyuboaz.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Supabase anon key

**Step 5 — Test**

1. GitHub → **Actions** → **Deploy frontend to Vercel** → **Run workflow**
2. Wait for green check (~3–5 min)
3. Open https://logi-flow-solution-challenge-2026.vercel.app

After setup, any collaborator push to `main` triggers an immediate production deploy under Kaveh’s Vercel identity. Ignore red **BLOCKED** rows from Vercel’s native Git hook on collaborator commits — the Action deploy is the one that matters.

Verify: GitHub → **Actions** → latest **Deploy frontend to Vercel** run should be green; Vercel should show a new **READY** production deployment (via CLI, not blocked).

### Supabase sync (after deploy or retrain)

From `backend/` with `SUPABASE_URL` + `SUPABASE_KEY` in `.env`:

```bash
make sync-rail-ml-metrics          # ML quantifiers → rail_ml_metrics
make sync-rail-geometry-trains TRAINS=100   # corridor geometry
make audit-rail-geometry TRAINS=100         # schedule vs map audit
```

---

## Mobile (Capacitor — Android)

### Prerequisites

- Node.js 18+
- Android Studio with SDK 33+
- Java 17

### Setup

```bash
cd frontend

# Install Capacitor
npm install @capacitor/core @capacitor/cli
npx cap init LogiFlow com.logiflow.app --web-dir=out

# Add Android platform
npx cap add android

# Build and sync
npm run build
npx cap sync android
```

### Build APK

```bash
# Open in Android Studio
npx cap open android

# Or build from command line
cd android
./gradlew assembleDebug
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

### Configuration

In `capacitor.config.ts`:
```typescript
const config: CapacitorConfig = {
  appId: 'com.logiflow.app',
  appName: 'LogiFlow',
  webDir: 'out',
  server: {
    url: 'https://logiflow-api.onrender.com',  // Production API
    cleartext: true,  // For local dev with HTTP
  }
};
```

---

## Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Add API keys
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

### Redis (Optional)
```bash
# macOS
brew install redis
brew services start redis

# Or use Docker
docker run -d -p 6379:6379 redis:alpine
```

Without Redis, the backend falls back to in-memory caching automatically.
