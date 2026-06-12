# Slide 8 — Architecture Diagram

**Diagram file:** `../diagrams/architecture-slide.png` (ready) or `architecture-slide.mmd`

---

## Slide title
**System architecture**

---

## Caption (one line under diagram)

Vercel hosts the Next.js client; `/api` rewrites proxy to FastAPI on **Google Cloud Run**, which runs parallel freight pipelines backed by Supabase, Redis, Postgres, external routing APIs, and **Google Gemini**.

---

## Four layers (text backup if diagram fails to export)

| Layer | Components |
|-------|------------|
| **① Experience** | Next.js 16 · Vercel · Google Sign-In · Leaflet maps |
| **② API** | FastAPI · rate limits · optimize cache · waiting room |
| **③ Engine** | Road · Rail · Air · Water pipelines · Comparator · Composer |
| **④ Data & AI** | TomTom · Weather · RailRadar · OpenFlights · PortWatch · Supabase · Redis · Postgres · Gemini · scikit-learn ML |

---

## Request path (15-sec verbal)

`Browser → Vercel → Cloud Run → (parallel pipelines) → normalize → score → Gemini explain → JSON + geometry → map render`

---

## Export instructions

1. Open `architecture-slide.mmd` in mermaid.live  
2. Export **1920×1080** landscape PNG  
3. Full-width on slide 8; use caption above in smaller text below image  

---

## Optional deeper diagram

`../diagrams/pipeline-internal-slide.mmd` — use only on a backup slide or appendix.
