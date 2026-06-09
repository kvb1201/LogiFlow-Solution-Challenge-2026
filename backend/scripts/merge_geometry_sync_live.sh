#!/usr/bin/env bash
# Merge all active shard logs into one file: logs/GEOMETRY_SYNC_LIVE.log
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=logs/GEOMETRY_SYNC_LIVE.log
MANIFEST=logs/geometry_sync_active.manifest

./scripts/tail_geometry_sync.sh --status >/dev/null 2>&1 || true

if [[ ! -f "$MANIFEST" ]] || [[ ! -s "$MANIFEST" ]]; then
  echo "No active geometry sync workers." >> "$OUT"
  exit 0
fi

files=()
while IFS= read -r line; do
  log=$(echo "$line" | sed -n 's/.*log=\(.*\)/\1/p')
  [[ -f "$log" ]] && files+=("$log")
done < "$MANIFEST"

{
  echo "===== GEOMETRY SYNC LIVE MERGE started $(date -u '+%Y-%m-%d %H:%M:%S UTC') ====="
  echo "Watching ${#files[@]} shard log(s)"
} >> "$OUT"

exec tail -F "${files[@]}" >> "$OUT" 2>&1
