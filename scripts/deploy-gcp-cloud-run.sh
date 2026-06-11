#!/usr/bin/env bash
# Deploy LogiFlow backend to Google Cloud Run.
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project project-6d6f652b-7066-4341-806
#
# Usage:
#   ./scripts/deploy-gcp-cloud-run.sh
#   GCP_PROJECT=other-id GCP_REGION=us-central1 ./scripts/deploy-gcp-cloud-run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GCP_PROJECT="${GCP_PROJECT:-project-6d6f652b-7066-4341-806}"
GCP_REGION="${GCP_REGION:-asia-south1}"
SERVICE_NAME="${SERVICE_NAME:-logiflow-api}"
IMAGE="gcr.io/${GCP_PROJECT}/${SERVICE_NAME}"
ENV_FILE="${ENV_FILE:-${ROOT}/backend/.env}"

echo "==> Project: ${GCP_PROJECT} (${GCP_REGION})"
gcloud config set project "${GCP_PROJECT}"

echo "==> Enabling APIs (idempotent)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com containerregistry.googleapis.com --quiet

echo "==> Building image ${IMAGE} ..."
gcloud builds submit "${ROOT}/backend" --tag "${IMAGE}" --timeout=1200

# Deploy profile: team-3mo = always-warm + parallel compose (~$75/mo, fits $300/3mo credits)
DEPLOY_PROFILE="${DEPLOY_PROFILE:-team-3mo}"
MIN_INSTANCES="${MIN_INSTANCES:-1}"
MAX_INSTANCES="${MAX_INSTANCES:-3}"
CLOUD_RUN_CPU="${CLOUD_RUN_CPU:-2}"
CLOUD_RUN_MEMORY="${CLOUD_RUN_MEMORY:-2Gi}"

if [[ "${DEPLOY_PROFILE}" == "team-3mo" ]]; then
  MIN_INSTANCES=1
  MAX_INSTANCES=3
  CLOUD_RUN_CPU=2
  CLOUD_RUN_MEMORY=2Gi
  echo "==> Profile: team-3mo (always-warm, parallel compose, 3-month credit budget)"
fi

# Runtime tuning + optional secrets from backend/.env (never committed).
BASE_ENV="WATER_SKIP_CONGESTION_SCAN=1,WATER_AUTO_TRAIN=off,RAIL_PERMANENT_CACHE=false,RAIL_PRELOAD_ON_STARTUP=false,COMPOSE_LEG_SUPABASE=1,RURAL_HUB_SUPABASE=1,COMPOSE_PARALLEL_WORKERS=8,COMPOSE_RAIL_API_BUDGET_S=10,RAIL_ENGINEER_MAX_EXTERNAL_LOOKUPS=1"
SECRET_ENV=""
if [[ -f "${ENV_FILE}" ]]; then
  echo "==> Loading env from ${ENV_FILE}"
  while IFS='=' read -r key value; do
    [[ -z "${key}" || "${key}" =~ ^# ]] && continue
    value="${value%$'\r'}"
    case "${key}" in
      ORS_API_KEY|TOMTOM_API_KEY|OPENWEATHER_API_KEY|REDIS_URL|GEMINI_API_KEY|GEMINI_MODEL|GROQ_API_KEY|GROQ_MODEL|RAILRADAR_API_KEY|SUPABASE_URL|SUPABASE_KEY|JWT_SECRET|GOOGLE_CLIENT_ID)
        SECRET_ENV+="${key}=${value},"
        ;;
    esac
  done < "${ENV_FILE}"
fi
ENV_VARS="${BASE_ENV}"
if [[ -n "${SECRET_ENV}" ]]; then
  ENV_VARS="${SECRET_ENV}${BASE_ENV}"
fi

echo "==> Deploying Cloud Run service ${SERVICE_NAME} ..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${GCP_REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --memory "${CLOUD_RUN_MEMORY}" \
  --cpu "${CLOUD_RUN_CPU}" \
  --timeout 300 \
  --concurrency 40 \
  --max-instances "${MAX_INSTANCES}" \
  --min-instances "${MIN_INSTANCES}" \
  --port 8080 \
  --set-env-vars "${ENV_VARS}"

URL="$(gcloud run services describe "${SERVICE_NAME}" --region "${GCP_REGION}" --format='value(status.url)')"
echo ""
echo "Deployed: ${URL}"
echo "Health:   ${URL}/health"
echo ""
echo "Next: update frontend/vercel.json BACKEND_URL + NEXT_PUBLIC_* to ${URL}"
