#!/usr/bin/env bash
# Push frontend/.actual.env to Vercel Production (idempotent).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/frontend/.actual.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Install Vercel CLI: npm i -g vercel"
  exit 1
fi

cd "${ROOT}/frontend"

echo "==> Linking Vercel project (if needed)..."
vercel link --yes 2>/dev/null || vercel link

echo "==> Syncing env vars to Production from ${ENV_FILE}"
while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  key="$(echo "${key}" | xargs)"
  [[ -z "${key}" ]] && continue
  echo "  → ${key}"
  vercel env rm "${key}" production --yes 2>/dev/null || true
  printf '%s' "${val}" | vercel env add "${key}" production
done < "${ENV_FILE}"

echo "==> Done. Redeploy production for NEXT_PUBLIC_* to take effect:"
echo "    cd frontend && vercel --prod"
