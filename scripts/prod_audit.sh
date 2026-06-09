#!/usr/bin/env bash
# Production audit — verify Render backend + Vercel frontend are healthy.
# Usage: ./scripts/prod_audit.sh [--quick]
#   --quick  health checks + frontend pages only (no optimize/compose)
set -uo pipefail

BACKEND="${BACKEND_URL:-https://logiflow-solution-challenge-2026.onrender.com}"
FRONTEND="${FRONTEND_URL:-https://logi-flow-solution-challenge-2026.vercel.app}"
TODAY=$(date -u +%Y-%m-%d)
QUICK=0
[[ "${1:-}" == "--quick" ]] && QUICK=1

PASS=0
FAIL=0
WARN=0
RESULTS=()

log_result() {
  local status="$1" name="$2" code="$3" ms="$4" note="$5"
  RESULTS+=("$status|$name|$code|${ms}ms|$note")
  case "$status" in
    PASS) ((PASS++)) ;;
    FAIL) ((FAIL++)) ;;
    WARN) ((WARN++)) ;;
  esac
}

timed_get() {
  local name="$1" url="$2" expect="${3:-200}"
  local start end ms code body
  start=$(python3 -c 'import time; print(int(time.time()*1000))')
  code=$(curl -s -o /tmp/prod_audit_body.json -w "%{http_code}" --max-time 180 "$url" || echo "000")
  end=$(python3 -c 'import time; print(int(time.time()*1000))')
  ms=$((end - start))
  body=$(head -c 200 /tmp/prod_audit_body.json 2>/dev/null | tr '\n' ' ')
  if [[ "$code" == "$expect" ]]; then
    log_result "PASS" "$name" "$code" "$ms" "$body"
  elif [[ "$code" =~ ^(401|403)$ && "$expect" == "auth" ]]; then
    log_result "PASS" "$name" "$code" "$ms" "auth required (expected)"
  elif [[ "$code" =~ ^502$ && "$expect" == "warn502" ]]; then
    log_result "WARN" "$name" "$code" "$ms" "transient gateway (retry later)"
  else
    log_result "FAIL" "$name" "$code" "$ms" "$body"
  fi
}

timed_post() {
  local name="$1" url="$2" json="$3" expect="${4:-200}" max_time="${5:-180}"
  local start end ms code body
  start=$(python3 -c 'import time; print(int(time.time()*1000))')
  code=$(curl -s -o /tmp/prod_audit_body.json -w "%{http_code}" --max-time "$max_time" \
    -X POST -H "Content-Type: application/json" -d "$json" "$url" || echo "000")
  end=$(python3 -c 'import time; print(int(time.time()*1000))')
  ms=$((end - start))
  body=$(head -c 300 /tmp/prod_audit_body.json 2>/dev/null | tr '\n' ' ')
  if [[ "$code" == "$expect" ]]; then
    log_result "PASS" "$name" "$code" "$ms" "$body"
  else
    log_result "FAIL" "$name" "$code" "$ms" "$body"
  fi
}

json_has_field() {
  local field="$1"
  python3 -c "
import json, sys
try:
    d = json.load(open('/tmp/prod_audit_body.json'))
    v = d
    for part in '${field}'.split('.'):
        v = v[part]
    sys.exit(0 if v else 1)
except Exception:
    sys.exit(1)
" 2>/dev/null
}

json_body_lacks() {
  local pattern="$1"
  ! grep -qiE "$pattern" /tmp/prod_audit_body.json 2>/dev/null
}

check_compose_ok() {
  local name="$1" url="$2" json="$3" max_time="${4:-120}"
  local start end ms code note
  start=$(python3 -c 'import time; print(int(time.time()*1000))')
  code=$(curl -s -o /tmp/prod_audit_body.json -w "%{http_code}" --max-time "$max_time" \
    -X POST -H "Content-Type: application/json" -d "$json" "$url" || echo "000")
  end=$(python3 -c 'import time; print(int(time.time()*1000))')
  ms=$((end - start))
  if [[ "$code" != "200" ]]; then
    note=$(head -c 120 /tmp/prod_audit_body.json 2>/dev/null | tr '\n' ' ')
    log_result "FAIL" "$name" "$code" "$ms" "$note"
    return
  fi
  if json_has_field "recommended"; then
    local rural=""
    json_has_field "rural_corridor" && rural=" · rural_corridor=true"
    log_result "PASS" "$name" "$code" "$ms" "recommended itinerary present${rural}"
  elif json_has_field "error"; then
    note=$(python3 -c "import json; print(json.load(open('/tmp/prod_audit_body.json')).get('error',''))" 2>/dev/null | head -c 120)
    log_result "FAIL" "$name" "$code" "$ms" "$note"
  else
    log_result "FAIL" "$name" "$code" "$ms" "missing recommended and error"
  fi
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           LogiFlow Production Audit                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "Backend:  $BACKEND"
echo "Frontend: $FRONTEND"
echo "Date:     $TODAY UTC"
echo "Mode:     $([[ $QUICK -eq 1 ]] && echo quick || echo full)"
echo ""

# ── Backend health ──
timed_get "backend /health" "$BACKEND/health"
timed_get "road /health" "$BACKEND/road/health"
timed_get "railway /health" "$BACKEND/railway/health"
timed_get "air /health" "$BACKEND/air/health"
timed_get "water /health" "$BACKEND/water/health"

if [[ $QUICK -eq 1 ]]; then
  for path in "/" "/hybrid" "/comparator" "/railway"; do
    timed_get "frontend $path" "$FRONTEND$path"
  done
  timed_get "vercel /api/warm-backend" "$FRONTEND/api/warm-backend?lite=1"
  goto_summary=1
else
  goto_summary=0
fi

if [[ $goto_summary -eq 0 ]]; then
  timed_get "railway /stations" "$BACKEND/railway/stations"
  timed_get "railway /model-info" "$BACKEND/railway/model-info"
  timed_get "railway search stations" "$BACKEND/railway/search/stations?query=Mumbai"
  timed_get "locations resolve Mumbai" "$BACKEND/locations/resolve?place=Mumbai"
  timed_get "railway /stats" "$BACKEND/railway/stats" "warn502"

  RAIL_JSON='{"origin_city":"Mumbai","destination_city":"Delhi","cargo_weight_kg":100,"cargo_type":"general","priority":"balanced","departure_date":"'"$TODAY"'"}'
  timed_post "POST /railway/optimize" "$BACKEND/railway/optimize" "$RAIL_JSON" "200" 300

  ROAD_JSON='{"source":"Bangalore","destination":"Chennai","priority":"fastest","cargo_weight_kg":100,"cargo_type":"general","avoid_tolls":false,"avoid_highways":false,"traffic_aware":true,"mode":"realtime"}'
  timed_post "POST /road/optimize" "$BACKEND/road/optimize" "$ROAD_JSON" "200" 120

  AIR_JSON='{"source":"Mumbai","destination":"Delhi","priority":"balanced","cargo_weight_kg":100,"cargo_type":"general"}'
  timed_post "POST /air/optimize" "$BACKEND/air/optimize" "$AIR_JSON" "200" 120

  HYBRID_JSON='{"source":"Mumbai","destination":"Delhi","priority":"balanced","cargo_weight_kg":100,"cargo_type":"General"}'
  timed_post "POST /optimize (hybrid)" "$BACKEND/optimize" "$HYBRID_JSON" "200" 300

  COMPOSE_JSON='{"source":"Bakauli","destination":"Suratiya","priority":"balanced","cargo_weight_kg":100,"cargo_type":"General","compose_options":{"max_hubs":2,"budget_seconds":55}}'
  check_compose_ok "POST /compose (rural)" "$BACKEND/compose" "$COMPOSE_JSON" 130

  VERCEL_COMPOSE='{"source":"Bakauli","destination":"Suratiya","priority":"balanced","cargo_weight_kg":100,"cargo_type":"General","compose_options":{"max_hubs":2,"budget_seconds":55}}'
  check_compose_ok "vercel /api/compose" "$FRONTEND/api/compose" "$VERCEL_COMPOSE" 130

  INTENT_JSON='{"user_brief":"Ship 200kg electronics from Mumbai to Delhi by Friday, cheapest option","context_mode":"home"}'
  timed_post "POST /intent/parse" "$BACKEND/intent/parse" "$INTENT_JSON" "200" 60
  if json_body_lacks 'GEMINI_API_KEY|GROQ_API_KEY|on the backend|Render free tier'; then
    log_result "PASS" "intent (no dev leaks)" "200" "0" "user-facing parse text clean"
  else
    log_result "FAIL" "intent (dev leak)" "200" "0" "response contains developer-only hints"
  fi
  if json_has_field "applied"; then
    log_result "PASS" "intent (applied)" "200" "0" "origin and destination detected"
  else
    log_result "WARN" "intent (applied)" "200" "0" "could not detect full corridor"
  fi

  timed_get "auth /me (no token)" "$BACKEND/auth/me" "auth"

  for path in "/" "/railway" "/road" "/air" "/water" "/hybrid" "/comparator" "/login" "/dashboard"; do
    timed_get "frontend $path" "$FRONTEND$path"
  done

  timed_get "vercel /api/warm-backend" "$FRONTEND/api/warm-backend?lite=1"
  timed_get "vercel /api/health proxy" "$FRONTEND/api/health"
fi

echo ""
echo "=== RESULTS ==="
printf "%-6s | %-38s | %4s | %8s | %s\n" "STATUS" "TEST" "CODE" "TIME" "NOTE"
printf "%s\n" "--------------------------------------------------------------------------------------------------------------"
for row in "${RESULTS[@]}"; do
  IFS='|' read -r status name code ms note <<< "$row"
  printf "%-6s | %-38s | %4s | %8s | %s\n" "$status" "$name" "$code" "$ms" "$note"
done
echo ""
echo "SUMMARY: PASS=$PASS  WARN=$WARN  FAIL=$FAIL"
echo ""
if [[ $FAIL -eq 0 ]]; then
  if [[ $WARN -eq 0 ]]; then
    echo "VERDICT: ALL CLEAR — production looks healthy."
  else
    echo "VERDICT: MOSTLY OK — $WARN warning(s). Review WARN rows above."
  fi
  exit 0
else
  echo "VERDICT: ISSUES FOUND — $FAIL failure(s). Fix FAIL rows before demo."
  exit 1
fi
