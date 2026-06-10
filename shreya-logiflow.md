# Shreya — LogiFlow Contributions

**Role:** Water / maritime pipeline owner + comparator + cockpit UI redesign · Branch: `shreya` · Stack: FastAPI, PortWatch, ML, Next.js, Mapbox/OpenSeaMap

> Personal resume-style log of what you built on LogiFlow. Category-wise, human-readable. Share with teammates — not pushed to GitHub.

---

## One-line summary

Built LogiFlow's **maritime water pipeline** (PortWatch data, ML models, chokepoints, global ports), integrated water into the **comparator**, and led the **cockpit UI redesign** — HomePage, NavBar, AmbientBackdrop, and design tokens.

---

## Water / maritime pipeline (primary ownership)

- Implemented the **maritime water pipeline** from Phase 1 through Phase 5.
- Integrated **PortWatch dataset** — ports, daily calls, disruptions, chokepoints, spillover data.
- Rebuilt pipeline with **trained ML models** replacing stubs; reads from real CSV sources.
- Added **distance-based interpolation** for port pairs missing direct routes.
- Expanded **global port network** — grew coverage to 47+ ports with better error handling.
- Implemented **infrastructure-weighted routing** and geocoding for international cities.
- Added **chokepoint awareness** on maritime paths (Suez, Malacca-style routing constraints).
- Fixed **SEA_LANES connectivity**, `max_legs` formula, and port endpoint resolution bugs.
- Removed incorrect **rail location_funnel** dependency from water pipeline (water-only geocoding).
- Shipped **water optimize API endpoint** and wired frontend water page.

---

## Water ML & analytics

- Created and tested **ML models for water delay/risk** (Phase 4–5).
- Added **automated insight generation** on water route results.
- Built **detailed cost breakdowns** per maritime leg in the UI.
- Improved **data loader** performance for large PortWatch CSV files.
- Gitignored **100MB+ PortWatch CSVs** — keep heavy data local, repo stays deployable.

---

## Water frontend

- Built **water input form** and **WaterRouteResults** component.
- Added **OpenSeaMap** interactive live map for water simulation mode.
- Improved **simulation mode UI** — toggles, presets, sliders for maritime scenarios.
- Enhanced **results page** and loading states for long port-graph searches.
- Fixed **duplicate content bug** in WaterRouteResults that broke Vercel builds.
- Maintained **water ports registry** (`water-ports.ts`) for frontend port autocomplete.

---

## Comparator mode

- Refactored **hybrid → comparator** naming across pipeline pages and store.
- Updated **PipelineModePage** to be mode-generic (works for comparator, not just hybrid).
- Integrated **water transport into comparator** — normalize water results alongside rail/road/air.
- Fixed and **tested comparator page** end-to-end with all modes.
- Updated **comparator logic** and Gemini prompt constraints for fair cross-mode comparison.
- Added **`generate_generic_explanation`** for AI-driven comparator recommendations.

---

## Cockpit UI redesign

- Redesigned **AmbientBackdrop** — per-mode secondary accents, vignette, stronger bottom fade.
- Redesigned **HomePage** — new hero headline, stat chips, 3-column mode cards with colour strips.
- Redesigned **NavBar** — colour-tinted active items, cleaner logo, tighter spacing.
- Redesigned **PipelineModeLanding** — mode icon tile, accent badge, smoother entry animation.
- Updated **globals.css** — refined design tokens, utility classes, spring animations.
- Updated **layout.tsx** metadata — page title and description for SEO/sharing.
- Touched **PipelineResultsChrome** for consistent results layout across modes.

---

## Hybrid & shared backend

- Updated **hybrid normalizer** and **explain** modules for comparator compatibility.
- Extended **water payload** types across API, store, and pipeline files.
- Wrote **water pipeline API reference** documentation.
- Updated **pipeline plan** doc for team reference on maritime extension phases.

---

## Scale of contribution (reference)

| Metric | Value |
|--------|-------|
| Commits on `main` | ~55 |
| Primary areas owned | Water/maritime pipeline, comparator integration, cockpit UI redesign |

---

*For raw git history: `git log main --author="shreya"`.*
