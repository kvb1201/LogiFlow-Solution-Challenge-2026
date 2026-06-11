# Kavya Bhatiya — LogiFlow Contributions

**Role:** Project founder & full-stack lead · Branch: `main` / early platform · Stack: React, FastAPI, Python ML, TomTom, Docker

> Personal resume-style log of what you built on LogiFlow. Category-wise, human-readable. Share with teammates — not pushed to GitHub.

---

## One-line summary

Founded LogiFlow and built the core platform from zero — initial repo, road logistics engine, hybrid scoring, auth/SaaS base, trip monitoring, route health intelligence, planner/reports API, and the first production deployment path.

---

## Project founding & platform

- Created the **initial repository** — README, backend skeleton, frontend scaffold, and ML folder structure.
- Wrote the **project license** and competition usage terms.
- Added **Dockerfile** and `.dockerignore` for containerized deployment.
- Modularized the **backend into pipeline packages** (road, rail, hybrid, water) for safe parallel development.
- Authored early **architecture and API contract documentation** that the team built on.
- Drove **production deployments** (frontend redeploy triggers, deployment link updates in README).

---

## Road transport pipeline (primary ownership)

- Built the **road pipeline end-to-end** — route generation, scoring, constraints, and penalty-based filtering.
- Integrated **TomTom routing API** with correct parameter handling (avoid roads, tolls, highways).
- Added **multi-stop route optimization** with improved UI and backend wiring.
- Implemented **simulation mode** — traffic level, weather level, incident count blended into road decisions.
- Added **vehicle type** and **fuel price** inputs for more realistic cost modeling.
- Built **constraints filtering** with penalty scoring and fallback when strict filters eliminate all routes.
- Enhanced **traffic simulation blending** and decision-factor transparency in results.
- Added validation to **block identical source and destination** on road optimize.
- Created **RoadPageClient** and road input form with **city search + autocomplete**.

---

## Hybrid pipeline & cross-mode scoring

- Refactored **hybrid pipeline** — relative normalization, dominance checks, and unified scoring.
- Improved **rail normalization** and fallback handling inside hybrid recommendations.
- Added **request context caching** across pipelines to cut duplicate external API calls.
- Built utility layer to **extract best route per mode** for hybrid comparison.
- Enhanced **route confidence** calculation and auto-select best route by user priority.
- Refactored **risk handling** so cost/risk/time display consistently across all mode UIs.

---

## Machine learning & live signals

- Built **logistics delay prediction** training pipeline using **HistGradientBoostingClassifier**.
- Added **ML-based route analysis** integrated into road/hybrid flows.
- Implemented **weather fetching** and traffic inputs mapped into ML features.
- Created **live signal refresh** — fetches real-time signals for remaining journey (current location → destination).
- Upgraded **Condition Intelligence V1 → V2** with deterministic scoring, health breakdown, and real-time signals.

---

## Smart trip monitoring & route health

- Built **Smart Trip Monitoring** — active trips dashboard and ongoing shipment tracking.
- Implemented **Route Health Card** — confidence display, action labels, shipment location updates.
- Shipped **Reoptimization V1** — detect when a plan degrades and recommend a fresh route.
- Integrated **reoptimization service** with planner API (`/reports/{id}/reoptimize`, accept flow).
- Added **trip progress** logic to decide when reoptimization should be suggested.
- Refactored route analysis to use a **single source of truth** for indices and insights.

---

## Planner, reports & save flow

- Built **planner API routes** — reports CRUD, route health responses, reoptimization endpoints.
- Created **ReportsPage**, **ReportDetailPage**, **SaveReportModal**, and **RouteHealthCard** frontend.
- Integrated **SaveReportModal** across rail, road, hybrid, and comparator flows.
- Enhanced **RouteHealthResponse** with `shipment_health_score` and `route_cities`.
- Fixed navigation links between **dashboard**, reports, and mode pages.

---

## Authentication & SaaS base

- Built **auth foundation** — SaaS base, login flow, protected dashboard.
- Enhanced **Google OAuth** with runtime audience resolution and better error handling.
- Improved **auth UX** — error states, legal pages, site footer integration.
- Added **health check endpoint** and backend wake functionality for hosted deploys.

---

## Water & air (supporting work)

- Added **water transport mode** to the platform and wired frontend components.
- Enhanced **water pipeline** validation — identical source/destination checks, direct port matching.
- Refactored **air and road pipelines** for cleaner error handling and response shapes.
- Improved **air no-results** feedback when search returns empty.

---

## Frontend & maps (early + ongoing)

- **Initialized frontend** with React + Vite (pre–Next.js migration).
- Built early **route optimization UI** — MapView, RouteResults, InputForm advanced options.
- Enhanced **MapView and RouteResults** with route insights, label markers, and layout polish.
- Improved **city search** with validation and API integration.
- Built **invalid corridor handling** — user-friendly cards when origin/destination cannot be routed.
- Fixed NavBar pathname null checks and road form TypeScript refs.

---

## Documentation & project hygiene

- Maintained **implementation.md** and early architecture docs.
- Refactored **API contract** and architecture documentation for team alignment.
- Removed obsolete docs when contracts moved into code.
- Updated CORS and backend URL config for Vercel ↔ Cloud Run integration.
- Built **Google OAuth auth backend** (`auth_routes.py`, `auth_service.py`) and **planner API** (reports, trip lifecycle, route health, reoptimization, notifications).
- Shipped **dashboard**, **reports list**, and **report detail** pages with `SaveReportModal` and `RouteHealthCard`.

---

## Current platform state (June 2026)

| Surface | Detail |
|---------|--------|
| Web | https://logi-flow-solution-challenge-2026.vercel.app |
| API | https://logiflow-api-sbexkjk72q-el.a.run.app |
| Auth | Google Sign-In → JWT · `/dashboard` · `/reports` |
| Planner | Trip execute/stop/cancel · route health · reoptimize v1 |

---

## Scale of contribution (reference)

| Metric | Value |
|--------|-------|
| Commits on `main` | ~225 |
| Primary areas owned | Road pipeline, trip monitoring, auth, hybrid scoring, project foundation |

---

*For raw git history: `git log main --author="Bhatiya Kavya Vishnukumar"`.*
