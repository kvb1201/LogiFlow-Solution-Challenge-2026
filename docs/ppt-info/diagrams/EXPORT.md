# Diagram export guide

## Tools

1. **mermaid.live** (recommended) — paste `.mmd` file → Actions → PNG/SVG  
2. **VS Code** — Mermaid preview extension → export  
3. **CLI** — `npx @mermaid-js/mermaid-cli -i architecture-slide.mmd -o architecture-slide.png -w 1920 -H 1080`

## Per-slide sizing

| File | Slide | Suggested export |
|------|-------|------------------|
| `process-flow-slide.mmd` | 6 | 1600 × 600 px landscape |
| `ui-surface-map.mmd` | 7 | 1400 × 900 px |
| `architecture-slide.mmd` | 8 | 1920 × 1080 px landscape |
| `pipeline-internal-slide.mmd` | 15 appendix | 1600 × 900 px |

## PowerPoint insert

1. Insert → Pictures → select PNG  
2. Drag to fill content area below slide title  
3. **Crop** if template has footer band  
4. Keep diagram **one per slide** — do not shrink below readable text  

## Colors

Diagrams use dark-friendly fills to match LogiFlow UI. If template background is white, switch mermaid theme to **default** or **neutral** before export.
