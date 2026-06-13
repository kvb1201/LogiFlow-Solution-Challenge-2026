# LogiFlow Documentation

Central index for all project documentation. Everything lives under `docs/` — nothing else at the repo root.

**Status:** Project complete (Google Solution Challenge 2026 submission).

---

## Core

| Document | Description |
|----------|-------------|
| [architecture.md](./architecture.md) | System overview, API map, data flow, production URLs |
| [system-design.md](./system-design.md) | Design principles and scalability notes |
| [deployment.md](./deployment.md) | Vercel, Cloud Run, env vars, Supabase sync, Android APK |
| [gcp-deployment.md](./gcp-deployment.md) | Cloud Run setup and team deployment profile |
| [gcp-optimization.md](./gcp-optimization.md) | SEO, monitoring, optional GA4 — current state |

---

## Pipelines

Each mode is documented as a first-class pipeline. Backend entry points live under `backend/app/pipelines/`.

| Mode | Document | API |
|------|----------|-----|
| Road | [pipelines/road.md](./pipelines/road.md) | `POST /road/optimize` |
| Rail | [pipelines/rail.md](./pipelines/rail.md) | `POST /railway/optimize` |
| Rail (walkthrough) | [pipelines/rail-walkthrough.md](./pipelines/rail-walkthrough.md) | — |
| Air | [pipelines/air.md](./pipelines/air.md) | `POST /air/optimize` |
| Water | [pipelines/water.md](./pipelines/water.md) | `POST /water/optimize` |
| Hybrid & comparator | [pipelines/hybrid.md](./pipelines/hybrid.md) | `POST /optimize` · `/comparator/routes` |

---

## Miscellaneous

Domain-specific and feature-level references — air pricing, railway data, API schemas, implementation notes, and legacy Cloudflare notes.

| Document | Topic |
|----------|-------|
| [miscellaneous/api_contract.md](./miscellaneous/api_contract.md) | Request / response schemas |
| [miscellaneous/INDIAN_RAILWAYS_DATA.md](./miscellaneous/INDIAN_RAILWAYS_DATA.md) | Railway data sourcing & delay scrape |
| [miscellaneous/air-otp-congestion-scoring.md](./miscellaneous/air-otp-congestion-scoring.md) | Airport OTP congestion index |
| [miscellaneous/air_freight_pricing_and_airport_system.md](./miscellaneous/air_freight_pricing_and_airport_system.md) | Air freight pricing model |
| [miscellaneous/international-air-routing.md](./miscellaneous/international-air-routing.md) | International route graph (full) |
| [miscellaneous/international-air-routing-summary.md](./miscellaneous/international-air-routing-summary.md) | International routing summary |
| [miscellaneous/backend-road-corridor-validation.md](./miscellaneous/backend-road-corridor-validation.md) | Road corridor validity gate |
| [miscellaneous/frontend-invalid-corridor-ux.md](./miscellaneous/frontend-invalid-corridor-ux.md) | Invalid corridor UX component |
| [miscellaneous/road-metrics-ui.md](./miscellaneous/road-metrics-ui.md) | Road metrics UI implementation |
| [miscellaneous/water-pipeline-plan.md](./miscellaneous/water-pipeline-plan.md) | Water pipeline planning notes |
| [miscellaneous/water-openmeteo-api-reference.md](./miscellaneous/water-openmeteo-api-reference.md) | Open-Meteo API reference (water) |
| [miscellaneous/cloudflare-legacy.md](./miscellaneous/cloudflare-legacy.md) | Legacy Cloudflare Worker (deprecated) |

---

## Diagrams

Pre-rendered PNGs, SVGs, and Mermaid sources for architecture, journeys, pipelines, and deployment.

→ [diagrams/README.md](./diagrams/README.md)

Key exports used in the root README:

| File | Subject |
|------|---------|
| [diagrams/png/01-system-architecture.png](./diagrams/png/01-system-architecture.png) | End-to-end system |
| [diagrams/png/02-user-journey.png](./diagrams/png/02-user-journey.png) | Shipment brief → ranked routes |
| [diagrams/png/04-comparator-hybrid.png](./diagrams/png/04-comparator-hybrid.png) | Comparator & compose |

---

## Presentation kit

Slide copy, bullet lists, and one-slide diagrams for the Solution Challenge prototype deck.

→ [ppt-info/README.md](./ppt-info/README.md)

---

## Repository map (code)

```
backend/app/pipelines/   # road · rail · air · water · hybrid
backend/app/routes/      # REST handlers
backend/app/services/    # compose · intent · auth · ML stores
frontend/src/app/        # Next.js pages
frontend/src/components/ # UI (planner · maps · comparator)
supabase/migrations/     # airports · routes · ML · compose cache
```
