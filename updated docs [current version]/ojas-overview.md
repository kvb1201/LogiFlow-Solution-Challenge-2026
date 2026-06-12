# Ojas — What I Built on LogiFlow

**Team overview** · plain language · tech stack · how it works · where it lives

---

## Railway (backend + data)

### 1. Rail route finder & ranking engine

| | |
|---|---|
| **What it does** | Finds real train routes between two Indian cities and ranks them by cost, time, delay risk, and booking ease. |
| **Built with** | Python · FastAPI · `route_finder.py` · `engine.py` |
| **How it works** | Resolve cities to stations → search direct trains + trains with transfers → score each option by user priority (fast / cheap / safe) → return best + alternatives. |
| **Where** | `POST /railway/optimize` |

---

### 2. Live train data (RailRadar / IRCTC)

| | |
|---|---|
| **What it does** | Pulls real schedules and delay signals instead of relying only on old CSV files. |
| **Built with** | `railradar_client.py` · API key rotation · response caching |
| **How it works** | Query live APIs first → cache hot responses → fall back to offline schedule dump only if API fails. |
| **Where** | Inside rail pipeline |

---

### 3. Delay prediction (ML)

| | |
|---|---|
| **What it does** | Estimates how late a train will actually be, not just what the timetable says. |
| **Built with** | scikit-learn · scraped Indian Railways delay data · k-fold validation |
| **How it works** | Train model on historical delays → predict minutes late per route → fold into travel time and risk score → show honest accuracy metrics in UI. |
| **Where** | Inside `/railway/optimize` · simulation mode |

---

### 4. Official rail parcel pricing (IRCA tariffs)

| | |
|---|---|
| **What it does** | Calculates realistic parcel shipping cost in INR using Indian Railways tariff rules. |
| **Built with** | `tariff.py` · weight slabs · scale classification |
| **How it works** | Classify cargo weight → lookup official slab → attach `parcel_cost_inr` to each train option. |
| **Where** | Inside `/railway/optimize` response |

---

### 5. AI explanation per train

| | |
|---|---|
| **What it does** | Short plain-English note on why a specific train was recommended. |
| **Built with** | Gemini / Groq · RailYatri metadata |
| **How it works** | After ranking, optionally ask LLM with train details + user priority → attach explanation (with timeout so it never blocks the whole response). |
| **Where** | `llm_explanation` field on rail results |

---

### 6. Rail simulation mode

| | |
|---|---|
| **What it does** | Demo/test routes with adjustable delay scenarios without hitting live APIs every time. |
| **Built with** | Separate simulate endpoint · scenario multipliers |
| **How it works** | User sets knobs → scale ML baseline delay → return same result shape as live optimize for UI. |
| **Where** | `POST /railway/simulate` |

---

### 7. Station catalog (9,500+ entries)

| | |
|---|---|
| **What it does** | Match city names and station codes offline so routing works even when geocoders fail. |
| **Built with** | `stations.json` · fuzzy station resolver |
| **How it works** | “Mumbai”, “CSTM”, “BOM” → same station → lat/lng for maps. |
| **Where** | Location funnel + rail pipeline |

---

### 8. Fix: Render running out of memory

| | |
|---|---|
| **What it does** | Stopped the backend from crashing on Render’s 512MB free tier. |
| **Built with** | Lazy loading of huge schedule files |
| **How it works** | Don’t load 180k-row CSV at startup — only load when first rail request comes in. |
| **Where** | Rail data loader |

---

## Railway (maps & geometry)

### 9. Train route lines on the map

| | |
|---|---|
| **What it does** | Draw the actual path a train takes, station to station. |
| **Built with** | `geometry_builder.py` · station coordinates |
| **How it works** | Walk route segments in order → build polyline → attach to each ranked train option. |
| **Where** | `geometry` field on rail results · Map component |

---

### 10. Supabase geometry storage

| | |
|---|---|
| **What it does** | Pre-save all train route shapes so maps load instantly without waking the backend. |
| **Built with** | Supabase · bulk sync scripts · on-demand backfill |
| **How it works** | Upload all-India geometries once → frontend reads from Supabase → map draws before Render is even warm. |
| **Where** | Sync scripts in `scripts/` · Makefile targets |

---

## Compare & chain modes

### 11. Comparator (all modes at once)

| | |
|---|---|
| **What it does** | One corridor → compare rail, road, air, water side by side → highlight the winner. |
| **Built with** | `HybridPipeline` · `ComparatorPageClient` |
| **How it works** | Run each mode engine in parallel → normalize numbers → apply user priority → return comparison table + recommended mode. |
| **Where** | `/comparator` · `POST /optimize` |

---

### 12. Multimodal compose (chain legs)

| | |
|---|---|
| **What it does** | Build journeys like truck → train → flight when no single mode is best. |
| **Built with** | `RouteComposer` · hub catalog · leg cache |
| **How it works** | Pick hub cities → try templates (rail+air, rail+road, rail+rail) → score full chain → cache legs so repeat searches are fast. |
| **Where** | `/hybrid` · `POST /compose` |

---

### 13. Village / rural routing

| | |
|---|---|
| **What it does** | Handle small villages that don’t have direct rail/air access. |
| **Built with** | Rural hub discovery · nearest metro snap |
| **How it works** | Detect remote location → route via nearest big hub city → then compose normally. |
| **Where** | Inside `/compose` |

---

### 14. Long compose timeout on Vercel

| | |
|---|---|
| **What it does** | Compose can take 60–90s; normal API routes timeout too early. |
| **Built with** | Next.js `/api/compose` proxy |
| **How it works** | Browser calls same-origin proxy → Next forwards to Render with extended serverless budget. |
| **Where** | `POST /api/compose` |

---

## AI & natural language

### 15. Shipment brief → auto-fill form

| | |
|---|---|
| **What it does** | Type a paragraph about your shipment → app fills origin, destination, weight, budget, etc. |
| **Built with** | Gemini/Groq · `intent_parser.py` · `AiBriefPanel` |
| **How it works** | LLM returns structured JSON → validate corridor → update shared store → optionally navigate to correct mode page and auto-run optimize. |
| **Where** | Home + mode pages · `POST /intent/parse` |

---

### 16. Hinglish & mixed-language support

| | |
|---|---|
| **What it does** | Understand Hindi-English mixed briefs common in India. |
| **Built with** | Prompt tuning · error sanitization |
| **How it works** | Route mixed text through AI parser → show friendly errors, not raw API failures. |
| **Where** | `POST /intent/parse` |

---

### 17. Confirm before navigate + auto-run

| | |
|---|---|
| **What it does** | After AI fills the form, user confirms → lands on right page → optimization starts automatically. |
| **Built with** | `IntentConfirmModal` · `shipmentAutorun.ts` |
| **How it works** | Set autorun flag in session → push to `/hybrid` or `/comparator` → hook runs optimize once on mount. |
| **Where** | Home flow |

---

### 18. “Why this route?” explanations

| | |
|---|---|
| **What it does** | Generate a narrative explaining a recommendation. |
| **Built with** | `POST /explain` · Gemini · generic fallback template |
| **How it works** | Send route metadata to LLM → return text; if API down, use template fallback. |
| **Where** | Explain button on results |

---

### 19. Voice input on brief

| | |
|---|---|
| **What it does** | Speak your shipment description instead of typing. |
| **Built with** | Web Speech API · `ParagraphInputWithStt` |
| **How it works** | Mic → transcribe → user edits → parse. |
| **Where** | AiBriefPanel |

---

## Location & geocoding

### 20. Central location funnel

| | |
|---|---|
| **What it does** | One place that converts any city/station/airport name into what all pipelines understand. |
| **Built with** | `location_funnel.py` · alias tables · geocoding fallbacks |
| **How it works** | Every pipeline calls `corridor_endpoints()` first so rail, road, air, water agree on origin/destination. |
| **Where** | Internal — all optimize endpoints |

---

## Frontend (website)

### 21. Next.js migration & app shell

| | |
|---|---|
| **What it does** | Rebuilt the frontend from old React/Vite into a production Next.js app. |
| **Built with** | Next.js 16 · TypeScript · App Router · Tailwind |
| **How it works** | Pages for each mode · shared layout · typed API layer · `/api/backend` proxy so browser never hits Render directly. |
| **Where** | Entire frontend |

---

### 22. Shared app state (Zustand)

| | |
|---|---|
| **What it does** | Corridor, cargo, budget, and AI-parsed fields carry across pages. |
| **Built with** | `useLogiFlowStore.ts` |
| **How it works** | Set on home → still there on `/railway` or `/comparator` → no re-typing. |
| **Where** | All planner pages |

---

### 23. Cockpit UI & design

| | |
|---|---|
| **What it does** | Dark “control center” look — consistent across all modes. |
| **Built with** | `globals.css` tokens · `AmbientBackdrop` · `NavBar` · `HomePage` · mode accent colors |
| **How it works** | Rail = blue, road = amber, air = cyan, water = teal, hybrid = purple — same layout everywhere. |
| **Where** | All pages |

---

### 24. Railway dashboard page

| | |
|---|---|
| **What it does** | Full rail UX — station search, ranked trains, map, loading animation. |
| **Built with** | `RailwayDashboard` · `RouteResults` · `RailwayLoading` · `InputForm` |
| **How it works** | Autocomplete stations → optimize → cards with cost/delay/risk → map polyline → expand AI explanation. |
| **Where** | `/railway` |

---

### 25. Hybrid & comparator pages

| | |
|---|---|
| **What it does** | UI for mode comparison and multi-leg compose results. |
| **Built with** | `ComparatorPageClient` · `HybridPageClient` · `ComposeResults` · `MultimodalPipelineLoading` |
| **How it works** | Step wizard → loading pipeline animation → results with per-leg breakdown → save report. |
| **Where** | `/comparator` · `/hybrid` |

---

### 26. Maps everywhere

| | |
|---|---|
| **What it does** | Interactive dark map with route lines and city markers on results. |
| **Built with** | Mapbox · CARTO dark tiles · Supabase geometry fetch |
| **How it works** | Auto-geocode on city select → draw polylines → fit bounds → handle swap origin/dest. |
| **Where** | Embedded in rail, comparator, hybrid results |

---

### 27. Backend warmup (hide cold starts)

| | |
|---|---|
| **What it does** | Render free tier sleeps after idle; this pings it awake before user clicks optimize. |
| **Built with** | `backendWarmup.ts` · `/api/warm-backend` |
| **How it works** | On page load → ping until backend responds → keep pinging every few minutes while tab is open. |
| **Where** | Root layout |

---

### 28. Invalid corridor messages

| | |
|---|---|
| **What it does** | Friendly card when routing fails instead of a scary error. |
| **Built with** | `InvalidCorridorCard` · backend validation |
| **How it works** | Same city, bad geocode, or no routes → explain what went wrong + suggest fix. |
| **Where** | All mode pages |

---

### 29. Reports & save plan

| | |
|---|---|
| **What it does** | Save an optimization result and revisit it later. |
| **Built with** | `SaveReportModal` · reports pages · planner API hooks |
| **How it works** | After optimize → snapshot to backend → list on `/reports` → reopen detail · AI brief on reports too. |
| **Where** | `/reports` · `/dashboard` |

---

### 30. Auth UI wiring

| | |
|---|---|
| **What it does** | Login page and protected routes inside the app shell. |
| **Built with** | `/login` · `AuthInitializer` · `ProtectedRoute` |
| **How it works** | Check auth on load → guard dashboard/reports → NavBar shows login state. |
| **Where** | `/login` · protected pages |

---

## Production & security

### 31. Rate limits & concurrency cap

| | |
|---|---|
| **What it does** | Stop one user or bot from running unlimited heavy optimizations. |
| **Built with** | slowapi · semaphore (max 5 parallel) · response cache |
| **How it works** | 8 requests/min per IP on heavy endpoints · 6th parallel optimize gets rejected · identical requests served from 1hr cache. |
| **Where** | `/optimize`, `/compose`, `/intent/parse` |

---

### 32. Traffic waiting room

| | |
|---|---|
| **What it does** | When server is busy, show a queue page instead of a raw error. |
| **Built with** | `/waiting` page · countdown · health poll · autorun on return |
| **How it works** | 429/503 → save corridor → waiting page → auto-retry → resume plan. |
| **Where** | `/waiting` |

---

### 33. Secrets & production cleanup

| | |
|---|---|
| **What it does** | Removed hardcoded API keys; hide developer/debug text from users. |
| **Built with** | Env vars · `user-facing-messages.ts` |
| **How it works** | All keys in Vercel/Render env · sanitize API errors before showing in UI. |
| **Where** | Whole app |

---

## DevOps & docs

### 34. Local dev & prod audit

| | |
|---|---|
| **What it does** | One command to run everything locally; one command to check production health. |
| **Built with** | Makefile · `scripts/prod_audit.sh` |
| **How it works** | `make dev` = backend + frontend · `make prod-audit` = ping Vercel + Worker + Render + rate limit test. |
| **Where** | Repo root |

---

### 35. CI/CD (GitHub Actions)

| | |
|---|---|
| **What it does** | Auto-deploy frontend + backend; cron-warm API. |
| **Built with** | Vercel deploy workflow · `deploy-gcp-cloud-run.yml` |
| **How it works** | Push to main → Vercel + Cloud Run deploy · health ping keeps API warm. |
| **Where** | `.github/workflows/` |

---

### 36. Documentation

| | |
|---|---|
| **What it does** | Keep repo understandable for judges and teammates. |
| **Built with** | README · `docs/deployment.md` · rail pipeline notes · engineering log |
| **How it works** | Setup instructions · architecture overview · deployment URLs updated with infra changes. |
| **Where** | Repo root + `docs/` |

---

### 37. Merge conflict resolution

| | |
|---|---|
| **What it does** | Kept the app shippable when parallel UI work diverged. |
| **Built with** | Git merges on `ojasdev` → `main` |
| **How it works** | Resolved conflicts · restored one cockpit design · merged teammate branches without breaking deploy. |
| **Where** | N/A |

---

## Supporting integrations (smaller but mine)

| # | What | Notes |
|---|------|-------|
| 39 | Road page integration | Wired road form + results into shared app shell |
| 40 | Air page integration | Redesigned air results layout to match cockpit |
| 41 | Water page integration | Empty states, hybrid payload wiring |
| 42 | IR delay scraping | Data collection pipeline for ML training |
| 43 | Vercel Analytics | Traffic + performance monitoring |
| 44 | Share link regenerate | URL params re-trigger planning |

---

## WhatsApp summary (copy-paste)

> **Rail:** live trains, delay ML, IRCA pricing, map lines, Supabase geometry, simulation mode  
> **Compare & chain:** comparator (all modes), hybrid compose (multi-leg), rural routing  
> **AI:** plain-English brief, Hinglish, auto-run, route explanations, voice input  
> **Frontend:** Next.js migration, cockpit UI, railway/hybrid/comparator pages, maps, warmup, reports  
> **Infra:** GCP Cloud Run backend, Vercel edge, rate limits, waiting queue, `make dev`, prod audit, CI deploy  
> **Also:** location funnel, auth UI wiring, docs, merge fixes

---

## Current platform state (June 2026)

| Surface | URL / detail |
|---------|--------------|
| Web app | https://logi-flow-solution-challenge-2026.vercel.app |
| API | https://logiflow-api-sbexkjk72q-el.a.run.app (GCP Cloud Run, asia-south1) |
| Pages | 15 routes: home, login, dashboard, reports, 5 mode pipelines, comparator, hybrid, waiting, legal |
| Auth | Google OAuth → JWT · planner API for saved trips |
| Docs | Full refresh in `docs/` + root `README.md` (June 2026) |

---

## Teammate areas (not mine — for clarity)

| Person | Main ownership |
|--------|----------------|
| **Kavya** | Road pipeline, auth backend, trip monitoring, route health, project foundation |
| **Samanvitha** | Air pipeline, Gemini hybrid explanations |
| **Shreya** | Water/maritime pipeline, comparator UI redesign |
