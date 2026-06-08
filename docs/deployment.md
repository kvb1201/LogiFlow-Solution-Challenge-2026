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
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ (prod) | Supabase URL — railway ML panel reads `rail_ml_metrics` directly |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ (prod) | Supabase anon key (read-only public tables) |

The railway delay-model panel fetches **Supabase first**, then `public/data/rail-ml-metrics.json`, then Render `/railway/model-info`. This avoids waiting for Render cold start on Vercel.

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
