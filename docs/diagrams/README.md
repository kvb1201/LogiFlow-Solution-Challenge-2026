# LogiFlow Documentation Diagrams (Local)

Local copies of the LogiFlow architecture diagrams. These mirror the diagrams on the [Miro board](https://miro.com/app/board/uXjVGolTIkk=/).

## Folders

| Folder | Format | Use for |
|--------|--------|---------|
| `mermaid/` | `.mmd` source | Edit and re-render |
| `png/` | PNG images | Docs, slides, README |
| `svg/` | SVG vectors | Scalable print / web |

## Diagram index

| File | Title |
|------|-------|
| `01-system-architecture` | LogiFlow system architecture |
| `02-user-journey` | End-to-end user journey |
| `03-railway-pipeline` | Railway pipeline flow |
| `04-comparator-hybrid` | Comparator / hybrid pipeline |
| `05-multimodal-compose` | Multimodal compose flow |
| `06-ai-intent-parsing` | AI intent parsing flow |
| `07-deployment-infrastructure` | Deployment & infrastructure |
| `08-caching-architecture` | Caching tiers (L1–L5) |
| `09-authentication-flow` | Google OAuth + JWT sequence |
| `10-database-erd` | Database schema ERD |
| `11-road-air-water` | Road / air / water pipelines |
| `12-frontend-routes-state` | Frontend routes & Zustand state |
| `13-security-rate-limiting` | Security & rate limiting |
| `14-planner-route-health` | Planner & route health |
| `15-comparator-api-sequence` | Comparator API sequence |

## Re-render after edits

```bash
./docs/diagrams/render-diagrams.sh
```

Requires Node.js (`npx` downloads `@mermaid-js/mermaid-cli` automatically).

## Export from Miro (pixel-perfect originals)

Miro MCP cannot bulk-download diagram images. For exact Miro styling:

1. Open https://miro.com/app/board/uXjVGolTIkk=/
2. Select a diagram (or frame multiple items)
3. **Export** → PNG / PDF / SVG (Miro menu or right-click)

## Miro links

- [Board home](https://miro.com/app/board/uXjVGolTIkk=/)
- [Documentation index doc](https://miro.com/app/board/uXjVGolTIkk=/?moveToWidget=3458764675178384783)
