# LogiFlow — Implementation Index

Master index of implementation notes across the repository. For architecture and API details, see [docs/](./docs/).

---

## Platform overview

| Area | Doc |
|------|-----|
| System architecture | [docs/architecture.md](./docs/architecture.md) |
| Design principles | [docs/system-design.md](./docs/system-design.md) |
| API contract | [docs/api_contract.md](./docs/api_contract.md) |
| Deployment | [docs/deployment.md](./docs/deployment.md) · [docs/gcp-deployment.md](./docs/gcp-deployment.md) |

---

## Pipelines

| Mode | Pipeline doc | Backend entry |
|------|-------------|---------------|
| Road | [docs/pipelines/road.md](./docs/pipelines/road.md) | `app/pipelines/road/pipeline.py` |
| Rail | [docs/pipelines/rail.md](./docs/pipelines/rail.md) | `app/pipelines/rail/pipeline.py` |
| Air | [docs/pipelines/air.md](./docs/pipelines/air.md) | `app/pipelines/air/pipeline.py` |
| Water | [docs/pipelines/water.md](./docs/pipelines/water.md) | `app/pipelines/water/pipeline.py` |
| Hybrid / Compose | [docs/pipelines/hybrid.md](./docs/pipelines/hybrid.md) | `app/pipelines/hybrid/` + `app/services/route_composer.py` |

---

## Feature implementation notes

| Feature | Doc |
|---------|-----|
| Authentication UX + legal pages | This file § Auth UX below |
| Road corridor validation | [backend/implementation.md](./backend/implementation.md) |
| Frontend invalid corridor handling | [frontend/implementation.md](./frontend/implementation.md) |
| Road metrics UI | [frontend/road-metrics-implementation.md](./frontend/road-metrics-implementation.md) |
| Air OTP congestion scoring | [docs/air-otp-congestion-scoring.md](./docs/air-otp-congestion-scoring.md) |
| International air routing | [docs/international-air-routing-summary.md](./docs/international-air-routing-summary.md) |
| Indian Railways data strategy | [docs/INDIAN_RAILWAYS_DATA.md](./docs/INDIAN_RAILWAYS_DATA.md) |
| Air freight pricing | [docs/air_freight_pricing_and_airport_system.md](./docs/air_freight_pricing_and_airport_system.md) |
| Water pipeline plan | [backend/app/pipelines/water/PIPELINE_PLAN.md](./backend/app/pipelines/water/PIPELINE_PLAN.md) |
| Rail walkthrough | [backend/app/pipelines/rail/walkthrough.md](./backend/app/pipelines/rail/walkthrough.md) |

---

## Auth UX + legal pages (Phases 1–7)

### Login page (`frontend/src/components/auth/LoginPage.tsx`)

- No duplicate branding (NavBar already shows logo)
- Loading overlay: "Signing you in…" with `role="status"` + `aria-live="polite"`
- `friendlyError()` maps raw backend errors to user-facing messages
- Error banner: `role="alert"`

### Legal pages

- `/terms` — Terms & Conditions via shared `LegalPage` component
- `/privacy` — Privacy Policy (Google OAuth, Supabase, Vercel Analytics, sessionStorage)
- Links on login card and `SiteFooter` (root layout)

### Google account creation

- "Create a Google account" links to `https://accounts.google.com/signup` (new tab)
- No separate LogiFlow registration — Google is sole identity provider

### Accessibility

- Focus rings on legal links (`focus-visible:ring-rail`)
- `aria-label` on sign-in container, back link, external links
- `rel="noopener noreferrer"` on `target="_blank"` links

---

## Planner subsystem

| Component | Location |
|-----------|----------|
| API routes | `backend/app/routes/planner_routes.py` |
| Domain models | `backend/app/models/domain.py` |
| Trip progress | `backend/app/services/trip_progress.py` |
| Route health | `backend/app/services/condition_intelligence.py` |
| Reoptimization | `backend/app/services/reoptimization_service.py` |
| Frontend API | `frontend/src/services/plannerApi.ts` |
| Frontend store | `frontend/src/store/usePlannerStore.ts` |
| UI | `ReportsPage`, `ReportDetailPage`, `RouteHealthCard`, `NotificationBell` |

---

## Deployment migration (Render → Cloud Run)

- **Before:** Backend on Render free tier (512 MB, cold starts, compose OOM)
- **After:** GCP Cloud Run `logiflow-api` in `asia-south1` (2 CPU, 2Gi, min 1 instance)
- Frontend `vercel.json` points to `https://logiflow-api-sbexkjk72q-el.a.run.app`
- Deploy script: `scripts/deploy-gcp-cloud-run.sh`
- CI: `.github/workflows/deploy-gcp-cloud-run.yml`

---

## Team contribution logs

| Member | File |
|--------|------|
| Kavya Bhatiya | [kavya-logiflow.md](./kavya-logiflow.md) |
| Ojas Srivastava | [ojas-logiflow.md](./ojas-logiflow.md) · [ojas-overview.md](./ojas-overview.md) |
| Shreya | [shreya-logiflow.md](./shreya-logiflow.md) |
| Samanvitha Bolisetty | [samanvitha-logiflow.md](./samanvitha-logiflow.md) |
