#!/usr/bin/env bash
# Render Mermaid sources to PNG + SVG in docs/diagrams/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MMD="$ROOT/mermaid"
PNG="$ROOT/png"
SVG="$ROOT/svg"

mkdir -p "$PNG" "$SVG"

for file in "$MMD"/*.mmd; do
  base="$(basename "$file" .mmd)"
  echo "Rendering $base..."
  npx --yes @mermaid-js/mermaid-cli@11 -c "$ROOT/mermaid-config.json" -i "$file" -o "$PNG/$base.png" -b white -w 1920
  npx --yes @mermaid-js/mermaid-cli@11 -c "$ROOT/mermaid-config.json" -i "$file" -o "$SVG/$base.svg" -b white
done

echo "Done. PNGs: $PNG  SVGs: $SVG"
