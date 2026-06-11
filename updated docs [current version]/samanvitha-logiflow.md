# Samanvitha Bolisetty — LogiFlow Contributions

**Role:** Air cargo pipeline owner · Branch: `sam` · Stack: FastAPI, Python, OpenFlights, Gemini, Next.js

> Personal resume-style log of what you built on LogiFlow. Category-wise, human-readable. Share with teammates — not pushed to GitHub.

---

## One-line summary

Owned LogiFlow's **air cargo pipeline** end-to-end — free-stack airport data, route graph, volumetric pricing, OTP congestion scoring, weather risk, frontend air UI, and Gemini-powered route explanations for hybrid mode.

---

## Air pipeline — backend core

- Built the **air cargo pipeline** from scratch and integrated it into backend routes (`/air/optimize`).
- Documented **airway pipeline architecture** and setup in pipeline README.
- Implemented **strict airport resolution** — 100 km threshold, no fake city-to-airport guesses.
- Added **OpenFlights route support** for real airway connectivity between airports.
- Built **free-stack air data layer** — airports, routes, and lookup services without paid aviation APIs.
- Handled **dict vs object pipeline output** edge cases with clear API error messages.
- Fixed **no-route state** — show honest empty UI instead of fallback fake flights.

---

## Air pricing, scoring & risk

- Implemented **industry-standard volumetric pricing** (chargeable weight from volume vs actual weight).
- Added **OTP congestion scoring** — airport busyness affects route ranking.
- Integrated **weather-based route risk** into air leg scoring.
- Enriched **air route ranking data** with network metrics for frontend display.
- Built **air ML models** module for pipeline scoring extensions.
- Added **simulation mode** and richer route explanations in air results.

---

## Air data services

- Created **airport locator service** — resolve city names to nearest valid airports.
- Built **air data service** and **air store** for caching airport/route lookups.
- Integrated **air weather service** and **timezone service** for leg timing accuracy.
- Maintained **airports.csv** and **routes.dat** datasets for offline routing.
- Wired services into **pipeline registry** and **optimizer** for hybrid/comparator calls.

---

## Air frontend

- Added **air cargo navigation** and data plumbing in the Next.js app.
- Built **AirPageClient** and **AirResults** — flight legs, costs, risk, and network metrics.
- **Redesigned air route results** presentation for mobile and desktop.
- Fixed **frontend error regex** for consistent mobile error display.
- Connected air page to typed **API service** and global store payloads.

---

## Hybrid mode — Gemini explanations (shared)

- Built **Gemini explainer service** for human-readable route narratives.
- Added **Gemini-aware explanation builder** with fallback text when API is unavailable.
- Attached **per-route explanations** directly in `/optimize` response payload.
- Implemented **detailed Gemini fallback chat** for hybrid assistant follow-ups.
- Integrated explainer into **hybrid pipeline** so comparator and hybrid pages show "why this route."

---

## Testing & integration

- Added **air route endpoint tests** and pipeline test suite.
- Updated **optimize routes** to register air pipeline alongside road/rail/water.
- Coordinated **geocoding service** updates for international airport resolution.
- Set up **`sam` branch** and initial air pipeline integration workflow.

---

## Scale of contribution (reference)

| Metric | Value |
|--------|-------|
| Commits on `main` | ~92 |
| Primary areas owned | Air pipeline (backend + frontend), Gemini hybrid explanations |

---

## Current platform state (June 2026)

- Air pipeline: domestic + **international routing** via Supabase `airports`/`air_routes` + CSV fallbacks
- **OTP congestion scoring** on every route (`otp_prediction`, `congestion_score`, `congestion_level`)
- Frontend: `/air` page with `AirInputForm`, `AirResults`, cargo constraint UI
- Docs: [docs/pipelines/air.md](./docs/pipelines/air.md) · [docs/air-otp-congestion-scoring.md](./docs/air-otp-congestion-scoring.md)

---

*For raw git history: `git log main --author="Bolisetty Samanvitha"`.*
