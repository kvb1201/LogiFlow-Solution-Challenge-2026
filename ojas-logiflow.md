# Ojas Srivastava — LogiFlow Contributions

**Role:** Technical Lead & Principal Engineer · Primary branch: `ojasdev` · Stack: Next.js, FastAPI, Python ML, Supabase, Vercel, GCP Cloud Run

> Personal resume-style log of what I built on LogiFlow. Category-wise, human-readable. Not pushed to GitHub.

---

## One-line summary

Led end-to-end engineering and production delivery of LogiFlow — Next.js platform migration, rail pipeline, multimodal compose, AI intent parsing, live maps, ML delay prediction, Supabase geometry sync, deployment hardening, and DDoS protection on a student budget.

---

## Product & platform leadership

- Owned the **`ojasdev` branch** as the main development line; merged large feature sets into `main` for production (Vercel + GCP Cloud Run).
- Resolved major **merge conflicts** and restored the **cockpit UI** when parallel team work diverged — kept the product shippable.
- Standardized the app around a single **“logistics control center”** experience: dark cockpit theme, mode-based navigation, consistent planner flows across rail / road / air / water / hybrid / comparator.
- Removed **developer-facing copy and leaked secrets** from production after GitGuardian flags; moved all keys to environment variables.
- Added **production audit tooling** (`make prod-audit`) to verify Render backend and Vercel frontend health in one command.

---

## Frontend — platform & architecture

- **Migrated the entire frontend** from Vite + React (`.jsx`) to **Next.js App Router + TypeScript** — new layout, routing, build pipeline, and typed API layer.
- Set up **same-origin API proxying** (`/api/backend`) so the browser never talks to Render directly; SSR uses the backend URL server-side.
- Introduced **Zustand** global store (`useLogiFlowStore`) for corridor, cargo, constraints, and planner state across all mode pages.
- Built **backend warmup** on page load so Render free-tier cold starts feel invisible to users.
- Fixed **Turbopack dev 404s** by clearing stale cache on start and narrowing Next.js rewrites.
- Integrated **Vercel Web Analytics** and **Speed Insights** for production observability.

---

## Frontend — UI / UX & design system

- Designed the **cockpit visual language**: mesh gradients, ambient backdrops, mode accent colors (rail / road / air / water / hybrid), Space Grotesk + Inter typography.
- Built reusable cockpit shell: **`AmbientBackdrop`**, **`HomePage`**, **`ModeIcon`**, **`PipelineModePage`**, shared **`NavBar`**.
- Created **animated landing page** with hero grid, gradient orbs, and multimodal entry points.
- Added **loading experiences** per mode (`RailwayLoading`, `MultimodalPipelineLoading`) so long optimize calls show pipeline progress instead of blank screens.
- Made **InputForm**, **RailwayDashboard**, and mode pages **responsive** across mobile and desktop.
- Built the **traffic waiting room** — full-screen queue UI for 429/503 with countdown, corridor display, and auto-resume when capacity frees up (no raw error pages for users).

---

## Frontend — railway experience

- Built the **Railway Dashboard** — train search, ranked options, cost/risk/delay breakdown, map corridor, and recommendation cards.
- Wired **live map** with source/destination markers, route geometry polyline, and intermediate stops.
- Integrated **station autocomplete** with click-to-select UX (fixed mouse/touch selection bugs).
- Surfaced **ML delay predictions** and honest metrics in the UI (simulation vs live modes).
- Added **rail simulation mode** controls and branding polish for demo vs production data.

---

## Frontend — road, air & water

- Built **road planner UI** — toll/highway toggles, vehicle type, traffic-aware routing, multi-stop support, simulation sliders.
- Redesigned **air cargo UI** — layout, loading states, detailed cost breakdown, flight leg display.
- Built **water / maritime UI** — port-based routing, static PortWatch data integration, empty-state when no sea route exists.
- Added **Waterways navigation** and dedicated water route results with risk/cost/time comparison.

---

## Frontend — hybrid, compose & comparator

- Built **Hybrid page** — multimodal compose flow, results breakdown per leg, road-unavailable fallbacks, save-to-report.
- Built **Comparator page** — side-by-side mode comparison, recommended mode highlight, step wizard (corridor → constraints → results).
- Implemented **shipment autorun** — after AI brief confirms a corridor, user lands on the right mode page and optimization starts automatically.
- Added **regenerate-from-URL** hooks so shared links can re-trigger planning.

---

## Frontend — AI brief & natural language

- Built **`AiBriefPanel`** — user types a plain-language shipment brief (with optional speech-to-text).
- Connected brief to **intent parser API**; fills origin, destination, cargo, budget, deadline, mode preference into the planner form.
- Added **intent confirmation modal** on home before routing user to the correct pipeline.
- Fixed **Hinglish / mixed-language briefs** routing through Gemini correctly.
- Extended intent parsing with **departure date** extraction and better dev workflow for testing parsers.
- Added AI brief to **dashboard** and **reports** pages for post-planning edits.

---

## Frontend — maps & geospatial

- Built **Mapbox-based map component** with dark CARTO tiles, fit-to-bounds, and leg polylines.
- Added **automatic coordinate fetch** for origin/destination so markers appear as soon as cities are entered.
- Fixed **corridor geometry** bugs — duplicate trains, swapped origin/destination, intermediate stop rendering.
- Loaded **rail geometry from Supabase** on the frontend so maps work without waiting for Render to wake up.

---

## Frontend — auth, reports & planner

- Integrated **auth flow** — login page, protected routes, auth store initialization.
- Built **reports list and detail** pages with saved corridor plans.
- Added **Save Report modal** from planner results.
- Built **Route Health** and planner dashboard cards for saved shipment overview.

---

## Backend — core API & app structure

- Extended **FastAPI `main.py`** — CORS for Vercel, rate-limit middleware wiring, route registration for all modes.
- Created and maintained API routes: **rail, road, air, water, optimize, compose, intent, explain, auth, comparator, planner, location**.
- Added **`backend/run`** script and **project Makefiles** for one-command local dev (`make dev`).
- Hardened **Python 3.9** compatibility on Render for compose and rail pipelines.

---

## Backend — railway pipeline (largest subsystem)

- Built the **rail cargo decision engine** from scratch — data loading, route finding, scoring, ranking, parcel pricing.
- Integrated **RailRadar / IRCTC Connect** for live train schedules, delays, and availability-style signals.
- Built **RailYatri client** and **LLM-generated train explanations** for why a train was recommended.
- Implemented **official IRCA parcel tariff** lookup with scale-based classification and slab tables.
- Added **route geometry builder** — polyline from station coordinates along train path.
- Built **ML delay prediction** — trained models on scraped IR delay data with k-fold CV; surfaced RMSE and accuracy honestly in UI.
- Added **IR delay scraping pipeline** and supporting data assets for model training.
- Expanded **offline station catalog to 9,524 entries** so routing works without hitting external geocoders every time.
- Fixed **Render OOM (512MB)** by lazy-loading massive rail schedule files only when needed.
- Deduplicated **duplicate train options** across hub API loops.
- Wrote **rail pipeline engineering log** documenting 119+ commits of rail work as a readable story.

---

## Backend — road, air & water pipelines

- Built **road optimize pipeline** — OSRM/routing provider integration, toll avoidance, traffic simulation knobs.
- Built **air cargo pipeline** — airport graph, leg assembly, cost/time/risk scoring.
- Built **water pipeline** — PortWatch port graph, maritime route options, disruption awareness.
- Improved **water empty states** when no valid port pair exists.

---

## Backend — hybrid, compose & comparator

- Built **HybridPipeline** — runs multiple mode engines and scores combined recommendations.
- Built **RouteComposer** — chains legs across modes with hub selection, transshipment limits, budget/time constraints.
- Added **multimodal compose** with offline geocoding and short-corridor direct routes (skip unnecessary hubs).
- Added **rural village routing** — resolve villages to nearest metro hubs before compose.
- Hardened compose for **Vercel serverless timeouts** (proxy route with extended budget).
- Built **comparator API** — returns side-by-side mode comparison for one corridor.

---

## Backend — AI, intent & explanations

- Built **Gemini intent parser** — extracts structured shipment fields from free-text briefs.
- Built **route explanation service** — FastAPI endpoint + frontend UI for “why this route?” narratives.
- Restored **generic explanation generator** for Render deploy when Gemini is unavailable.
- Routed **Hinglish briefs** through the AI parser with sensible fallbacks.

---

## Backend — location funnel & geocoding

- Built **centralized location funnel** — one place to resolve city names, station codes, IATA codes, and aliases.
- Generalized funnel with **station + IATA alias** tables.
- Added **PDF-driven location rules** and per-train geometry audit tooling.
- Implemented **geocoding fallback chain** when primary resolver fails.
- Coordinates utility for distance calculation and map marker placement.

---

## Backend — Supabase & data infrastructure

- Synced **rail map geometry** to Supabase — bulk all-India upload, on-demand backfill for missing trains.
- Built **parallel geometry sync scripts** and Makefile targets for ops.
- Load geometry **from Supabase before waking Render** — faster maps, less backend load.
- Synced **rail ML metrics** to Supabase for dashboard display.
- Added **JSONL audit trail** for long geometry sync jobs.

---

## Security, abuse protection & reliability

- Designed **abuse protection** for a student-budget deployment:
  - **Vercel edge + GCP Cloud Run** platform DDoS mitigation (no Cloudflare Worker in path).
  - **slowapi rate limits** on heavy endpoints (8 req/min per IP on optimize / compose / intent).
  - **Concurrency cap** — max 5 simultaneous `/optimize` jobs; extra requests get 503 + waiting room.
- Added **optimize response cache** — identical corridor requests return cached result (cuts RAM and API cost).
- Built **traffic waiting room** frontend — branded queue page instead of raw 429/503 errors; auto-retries and resumes the user’s plan.
- Wrote **security limit unit tests** for rate limiter and concurrency guard.
- Updated **deployment docs** with env vars and protection architecture.

---

## Deployment, CI/CD & DevOps

- Deployed **frontend on Vercel** and **backend on GCP Cloud Run**; wired env vars (`BACKEND_URL`, `NEXT_PUBLIC_API_URL`) directly to the Cloud Run URL.
- Created **GitHub Action** for Vercel production deploy as team owner (collaborator push trigger).
- Fixed multiple **Vercel build failures** (TypeScript types, compose proxy paths, Supabase env pull in CI).
- Added **warm-render-backend** workflow to reduce cold-start pain.
- Documented full deployment in **`docs/deployment.md`** (kept up to date across infra changes).
- Removed hardcoded API keys; standardized `.env` loading for local and production.

---

## Documentation

- Wrote **rail scraping & orchestration** technical docs (session mimicry, pipeline architecture).
- Updated **README** with architecture overview, tech badges, and visual layout.
- Maintained **API contract** and **architecture** docs when endpoints changed.
- Authored **air pipeline README** and pipeline-specific docs under `docs/pipelines/`.

---

## Merge & team integration work

- Merged **`ojasdev` → `main`** repeatedly for production releases (DDoS mitigations, waiting room, intent parser, etc.).
- Merged teammate branches (**sam**, **shreya**, **main** sync PRs) while preserving cockpit UI and deploy stability.
- Resolved frontend conflicts after parallel UI experiments; chose and completed the **cockpit design** as the canonical UI.

---

## Scale of contribution (for reference only)

| Metric | Value |
|--------|-------|
| Commits on `main` (as Ojas) | ~301 |
| Distinct feature commits (deduplicated) | ~99 |
| Files touched | ~370 |
| Primary areas owned | Frontend, rail pipeline, deployment, security, AI intent, compose |

---

## Current platform state (June 2026)

- **15 frontend pages** including dashboard, reports/planner, login, waiting room, legal
- **Backend on GCP Cloud Run** (`logiflow-api`, asia-south1) — migrated from Render for compose RAM/timeout
- **Full documentation refresh** across `docs/`, `README.md`, pipeline guides
- See [ojas-overview.md](./ojas-overview.md) for detailed feature inventory

---

*This document describes outcomes and ownership — not file diffs. For raw git history: `git log main --author="Ojas Srivastava"`.*
