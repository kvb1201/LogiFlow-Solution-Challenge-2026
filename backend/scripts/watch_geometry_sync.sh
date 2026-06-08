#!/usr/bin/env bash
# Live dashboard — run in a dedicated Terminal tab (like delay CSV collector).
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONUNBUFFERED=1
exec ./venv/bin/python scripts/watch_geometry_sync.py "$@"
