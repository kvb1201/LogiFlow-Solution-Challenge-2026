#!/usr/bin/env bash
# Live view of all running geometry sync workers (verbose detailed logs).
set -euo pipefail
cd "$(dirname "$0")/.."
LOGS=logs
MANIFEST="$LOGS/geometry_sync_active.manifest"

collect_active_logs() {
  : > "$MANIFEST"
  local count=0
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    local shard args log
    args=$(ps -p "$pid" -o args= 2>/dev/null || true)
    shard=$(echo "$args" | sed -n 's/.*--shard \([0-9]*\).*/\1/p')
    log=$(lsof -p "$pid" 2>/dev/null | awk '/geometry_sync_.*\.log$/ {print $NF; exit}')
    if [[ -n "$log" && -f "$log" ]]; then
      echo "shard=$shard pid=$pid log=$log" >> "$MANIFEST"
      count=$((count + 1))
    fi
  done < <(pgrep -f "sync_rail_supabase.py --full" 2>/dev/null | sort -u || true)
  echo "$count"
}

print_status() {
  local n uploads
  echo "══════════════════════════════════════════════════════════════"
  echo "  GEOMETRY SYNC — LIVE LOG VIEWER"
  echo "══════════════════════════════════════════════════════════════"
  echo ""
  if [[ ! -f "$MANIFEST" ]] || [[ ! -s "$MANIFEST" ]]; then
    echo "  No running workers found."
    echo "  Start sync: make sync-rail-geometry-parallel SHARDS=6"
    echo ""
    return 1
  fi
  echo "  Active workers:"
  while IFS= read -r line; do
    shard=$(echo "$line" | sed -n 's/.*shard=\([0-9]*\).*/\1/p')
    pid=$(echo "$line" | sed -n 's/.*pid=\([0-9]*\).*/\1/p')
    log=$(echo "$line" | sed -n 's/.*log=\(.*\)/\1/p')
    uploads=$(grep -c "UPLOAD #" "$log" 2>/dev/null || echo 0)
    pairs=$(grep -o 'PAIR \[[0-9]*/[0-9]*\]' "$log" 2>/dev/null | tail -1 || echo "PAIR [?/?]")
    echo "    shard $shard  pid $pid  uploads=$uploads  $pairs"
    echo "      → $log"
  done < "$MANIFEST"
  echo ""
  echo "  Combined live stream (all shards merged):"
  echo "    $LOGS/GEOMETRY_SYNC_LIVE.log"
  echo ""
  echo "  JSONL audit per shard:"
  while IFS= read -r line; do
    log=$(echo "$line" | sed -n 's/.*log=\(.*\)/\1/p')
    jsonl="${log%.log}.jsonl"
    [[ -f "$jsonl" ]] && echo "    $jsonl"
  done < "$MANIFEST"
  echo ""
  echo "  Press Ctrl+C to stop tailing."
  echo "══════════════════════════════════════════════════════════════"
  echo ""
}

main() {
  local n
  n=$(collect_active_logs)
  if [[ "$n" == "0" ]]; then
    print_status || true
    echo "Showing last combined live log if it exists:"
    if [[ -f "$LOGS/GEOMETRY_SYNC_LIVE.log" ]]; then
      tail -50 "$LOGS/GEOMETRY_SYNC_LIVE.log"
    fi
    exit 1
  fi

  if [[ "${1:-}" == "--status" ]]; then
    print_status
    exit 0
  fi

  print_status
  local files=()
  while IFS= read -r line; do
    log=$(echo "$line" | sed -n 's/.*log=\(.*\)/\1/p')
    files+=("$log")
  done < "$MANIFEST"
  exec tail -f "${files[@]}"
}

main "$@"
