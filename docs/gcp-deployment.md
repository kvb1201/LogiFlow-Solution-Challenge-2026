# GCP Cloud Run deployment (student / free tier)

Project **number**: `689785530973`  
Project **ID**: `project-6d6f652b-7066-4341-806`

Cloud Run gives **1 GiB RAM** and **300s request timeout** on the free tier — enough for compose/stream where Render’s 512 MB OOMs.

## One-time GCP setup

1. Open [Google Cloud Console](https://console.cloud.google.com/?project=project-6d6f652b-7066-4341-806).

2. Enable billing (required for Cloud Run API even on free tier — you stay within free quotas if traffic is modest).

3. Install [gcloud CLI](https://cloud.google.com/sdk/docs/install) locally, or use **GitHub Actions** (below).

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

Add the JSON file contents as GitHub secret **`GCP_SA_KEY`** (then delete the local file).

## Deploy

### Option A — GitHub Actions (recommended)

1. Add secret `GCP_SA_KEY`.
2. Actions → **Deploy API to GCP Cloud Run** → **Run workflow**.
3. Copy the Cloud Run URL from the job summary.

### Option B — Local script

```bash
chmod +x scripts/deploy-gcp-cloud-run.sh
./scripts/deploy-gcp-cloud-run.sh
```

## Environment variables (Cloud Run console)

After first deploy, set **Variables & secrets** on the `logiflow-api` service:

| Variable | Required |
|----------|----------|
| `GEMINI_API_KEY` | ✅ |
| `TOMTOM_API_KEY` | ✅ |
| `SUPABASE_URL` | ✅ |
| `SUPABASE_KEY` | ✅ |
| `JWT_SECRET` | ✅ |
| `GOOGLE_CLIENT_ID` | ✅ |
| `REDIS_URL` | recommended |
| `DATABASE_URL` | if using Postgres planner |

Memory-safe defaults are baked into the Dockerfile / deploy script.

## Point the frontend at GCP

In `frontend/vercel.json` (or Vercel dashboard):

```json
"BACKEND_URL": "https://logiflow-api-XXXXXX-uc.a.run.app",
"NEXT_PUBLIC_API_URL": "https://logiflow-api-XXXXXX-uc.a.run.app",
"NEXT_PUBLIC_COMPOSE_URL": "https://logiflow-api-XXXXXX-uc.a.run.app"
```

Or update the Cloudflare worker origin in `cloudflare/workers/logiflow-render-proxy.js` to the Cloud Run URL.

## Free tier notes

- **Cloud Run**: ~2M requests/month free; scales to zero when idle (cold start ~5–15s).
- **Cloud Build**: 120 build-minutes/day free — enough for student deploys.
- **1 GiB RAM** service uses more of the free memory quota than 512 MB Render but avoids OOM.
- Keep `min-instances=0` to avoid charges; use GitHub **Warm Render backend** workflow with `BACKEND_URL` set to your Cloud Run URL.

## Health check

```bash
curl https://YOUR-SERVICE-uc.a.run.app/health
# → {"status":"ok"}
```

Compose stream:

```bash
curl -N -X POST https://YOUR-SERVICE-uc.a.run.app/compose/stream \
  -H "Content-Type: application/json" \
  -d '{"source":"Phulpur, India","destination":"Lucknow, India","priority":"balanced","compose_options":{"budget_seconds":40}}'
```
