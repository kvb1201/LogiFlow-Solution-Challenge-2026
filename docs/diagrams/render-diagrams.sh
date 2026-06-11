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
  npx --yes @mermaid-js/mermaid-cli@11 -i "$file" -o "$PNG/$base.png" -b transparent -w 1920
  npx --yes @mermaid-js/mermaid-cli@11 -i "$file" -o "$SVG/$base.svg" -b transparent
done

echo "Done. PNGs: $PNG  SVGs: $SVG"
