#!/usr/bin/env bash
# Run in a dedicated Terminal tab — progress prints every 25 train-days (~30s early on).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f data/ir_delay_scrape/.collector.lock
export PYTHONUNBUFFERED=1
exec ./venv/bin/python scripts/collect_ir_delay_history.py \
  --days 3 --resume --strategy history --sleep 1.1
