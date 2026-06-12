# GCP Cloud Run deployment

**Production backend** for LogiFlow.

| | |
|---|---|
| Project ID | `project-6d6f652b-7066-4341-806` |
| Project number | `689785530973` |
| Service | `logiflow-api` |
| Region | `asia-south1` |
| URL | https://logiflow-api-sbexkjk72q-el.a.run.app |

Cloud Run provides **2 GiB RAM**, **300s timeout**, and **always-warm min instances** on the team-3mo profile — enough for compose/stream where Render's 512 MB OOM'd.

---

## Deploy profiles

| Profile | Min instances | CPU | Memory | Use case |
|---------|---------------|-----|--------|----------|
| `team-3mo` (default) | 1 | 2 | 2Gi | Production — always-warm, parallel compose |
| `free` | 0 | 1 | 1Gi | Student budget — scale to zero |

Set via `DEPLOY_PROFILE=free ./scripts/deploy-gcp-cloud-run.sh`.

---

## One-time GCP setup

1. Open [Google Cloud Console](https://console.cloud.google.com/?project=project-6d6f652b-7066-4341-806).
2. Enable billing (required for Cloud Run API even on free tier).
3. Install [gcloud CLI](https://cloud.google.com/sdk/docs/install).

```bash
gcloud auth login
gcloud config set project project-6d6f652b-7066-4341-806
```

4. Create a deploy service account (for GitHub Actions):

```bash
gcloud iam service-accounts create logiflow-deploy \
  --display-name="LogiFlow Cloud Run deploy"

SA="logiflow-deploy@project-6d6f652b-7066-4341-806.iam.gserviceaccount.com"

for ROLE in run.admin cloudbuild.builds.editor storage.admin iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding project-6d6f652b-7066-4341-806 \
    --member="serviceAccount:${SA}" --role="roles/${ROLE}"
done

gcloud iam service-accounts keys create gcp-sa-key.json --iam-account="$SA"
```

Add JSON contents as GitHub secret **`GCP_SA_KEY`** (then delete local file).

---

## Deploy

### Option A — GitHub Actions (recommended)

1. Add secret `GCP_SA_KEY`.
2. Push to `main` with `backend/**` changes, or Actions → **Deploy API to GCP Cloud Run** → Run workflow.
3. Service URL appears in job summary.

### Option B — Local script

```bash
chmod +x scripts/deploy-gcp-cloud-run.sh
./scripts/deploy-gcp-cloud-run.sh
```

The script:
- Builds Docker image via Cloud Build
- Deploys with team-3mo defaults (2 CPU, 2Gi, min 1 instance)
- Loads secrets from `backend/.env` (ORS, TomTom, Gemini, Supabase, JWT, etc.)
- Sets runtime tuning: `COMPOSE_PARALLEL_WORKERS=8`, `WATER_AUTO_TRAIN=off`, `RAIL_PRELOAD_ON_STARTUP=false`

---

## Environment variables (Cloud Run)

Loaded automatically from `backend/.env` during deploy. Required keys:

| Variable | Required |
|----------|----------|
| `GEMINI_API_KEY` | ✅ |
| `TOMTOM_API_KEY` | ✅ |
| `ORS_API_KEY` | recommended |
| `OPENWEATHER_API_KEY` | recommended |
| `SUPABASE_URL` | ✅ |
| `SUPABASE_KEY` | ✅ |
| `JWT_SECRET` | ✅ |
| `GOOGLE_CLIENT_ID` | ✅ |
| `REDIS_URL` | recommended |
| `DATABASE_URL` | if using Postgres planner |
| `GROQ_API_KEY` | optional |
| `RAILRADAR_API_KEY` | optional |

Runtime defaults baked into deploy:

```
WATER_SKIP_CONGESTION_SCAN=1
WATER_AUTO_TRAIN=off
RAIL_PRELOAD_ON_STARTUP=false
COMPOSE_LEG_SUPABASE=1
RURAL_HUB_SUPABASE=1
COMPOSE_PARALLEL_WORKERS=8
COMPOSE_RAIL_API_BUDGET_S=10
RAIL_ENGINEER_MAX_EXTERNAL_LOOKUPS=1
```

---

## Point the frontend at Cloud Run

Update `frontend/vercel.json` (or Vercel dashboard):

```json
"BACKEND_URL": "https://logiflow-api-sbexkjk72q-el.a.run.app",
"NEXT_PUBLIC_API_URL": "https://logiflow-api-sbexkjk72q-el.a.run.app",
"NEXT_PUBLIC_COMPOSE_URL": "https://logiflow-api-sbexkjk72q-el.a.run.app"
```

Redeploy Vercel after changing env vars.

Custom domain for the API: point DNS at Cloud Run or use a GCP HTTPS Load Balancer (+ optional Cloud Armor). Cloudflare Workers are **not** in the production path — see [cloudflare-legacy.md](./miscellaneous/cloudflare-legacy.md).

---

## Dockerfile

`backend/Dockerfile` — Python 3.11-slim, exposes port 8080:

```dockerfile
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

`.gcloudignore` strips venv, tests, large scrape corpora, and PDFs from the build context.

---

## Health & smoke tests

```bash
curl https://logiflow-api-sbexkjk72q-el.a.run.app/health
# → {"status":"ok"}
```

Compose stream:

```bash
curl -N -X POST https://logiflow-api-sbexkjk72q-el.a.run.app/compose/stream \
  -H "Content-Type: application/json" \
  -d '{"source":"Phulpur, India","destination":"Lucknow, India","priority":"balanced","compose_options":{"budget_seconds":40}}'
```

---

## Free tier notes

- **Cloud Run**: ~2M requests/month free; `min-instances=0` scales to zero (~5–15s cold start).
- **team-3mo profile**: min 1 instance avoids cold start; fits ~$300/3mo student credits.
- **Cloud Build**: 120 build-minutes/day free.
- Keep-alive: frontend `/api/warm-backend` + optional GitHub workflow with `BACKEND_URL` secret.
