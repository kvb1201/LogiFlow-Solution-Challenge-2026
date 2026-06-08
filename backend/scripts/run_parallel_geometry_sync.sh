#!/usr/bin/env bash
# Launch parallel Supabase geometry sync workers (disjoint origin-city shards).
set -euo pipefail
cd "$(dirname "$0")/.."

SHARDS="${1:-6}"
STAGGER_SEC="${2:-15}"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
mkdir -p logs

echo "$STAMP" > logs/geometry_parallel_run.id
: > "logs/geometry_parallel_${STAMP}.pids"

echo "Launching $SHARDS workers (stagger ${STAGGER_SEC}s) stamp=$STAMP"

for i in $(seq 0 $((SHARDS - 1))); do
  nohup ./venv/bin/python scripts/sync_rail_supabase.py \
    --full --verbose --shard "$i" --shards "$SHARDS" \
    >> "logs/geometry_parallel_${STAMP}_s${i}.log" 2>&1 &
  echo "$i $!" >> "logs/geometry_parallel_${STAMP}.pids"
  echo "  shard $i PID $!"
  if [ "$i" -lt $((SHARDS - 1)) ]; then
    sleep "$STAGGER_SEC"
  fi
done

echo "All $SHARDS workers launched."
echo "PIDs: logs/geometry_parallel_${STAMP}.pids"
echo "Tail: tail -f logs/geometry_parallel_${STAMP}_s0.log"
