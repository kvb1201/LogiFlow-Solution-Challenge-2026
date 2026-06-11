# LogiFlow Frontend

Next.js 16 App Router application for the LogiFlow multi-modal cargo logistics optimizer.

**Live:** https://logi-flow-solution-challenge-2026.vercel.app  
**Backend:** https://logiflow-api-sbexkjk72q-el.a.run.app (proxied via `/api/backend`)

---

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Styling | Tailwind CSS 4 · custom cockpit design system |
| State | Zustand 5 (auth, pipeline, planner stores) |
| Maps | Leaflet · Mapbox GL |
| Charts | Recharts |
| Analytics | Vercel Analytics · Speed Insights |
| Auth | Google Identity Services → JWT |

---

## Pages

| Route | File | Auth | Description |
|-------|------|------|-------------|
| `/` | `app/page.tsx` | Public | Home · AI intent · mode picker |
| `/landing` | `app/landing/page.tsx` | Public | Marketing landing |
| `/login` | `app/login/page.tsx` | Public | Google Sign-In |
| `/dashboard` | `app/dashboard/page.tsx` | Protected | Post-login hub |
| `/reports` | `app/reports/page.tsx` | Protected | Saved plans list |
| `/reports/[id]` | `app/reports/[id]/page.tsx` | Protected | Plan detail · route health |
| `/railway` | `app/railway/page.tsx` | Public | Rail optimizer + map |
| `/road` | `app/road/page.tsx` | Public | Road optimizer |
| `/air` | `app/air/page.tsx` | Public | Air cargo optimizer |
| `/water` | `app/water/page.tsx` | Public | Maritime optimizer |
| `/hybrid` | `app/hybrid/page.tsx` | Public | Multimodal compose |
| `/comparator` | `app/comparator/page.tsx` | Public | 4-mode comparison |
| `/waiting` | `app/waiting/page.tsx` | Public | Traffic queue (429/503) |
| `/terms` | `app/terms/page.tsx` | Public | Terms & Conditions |
| `/privacy` | `app/privacy/page.tsx` | Public | Privacy Policy |

### API route handlers

| Route | File | Purpose |
|-------|------|---------|
| `POST /api/compose` | `app/api/compose/route.ts` | Long compose proxy (90s maxDuration) |
| `GET /api/warm-backend` | `app/api/warm-backend/route.ts` | Wake Cloud Run + optional rail preload |

---

## Project structure

```
frontend/src/
├── app/                    # Pages + layouts + API routes
├── components/
│   ├── auth/               # Login, guards, dashboard
│   ├── cockpit/            # Home, landing, pipeline chrome
│   ├── hybrid/             # Compose results, leg timeline
│   ├── planner/            # Reports, route health, notifications
│   ├── comparator/         # Comparator results chrome
│   ├── rail/               # ML quantifiers, metrics strip
│   ├── legal/              # Legal page layout
│   └── forms/              # Shared form primitives
├── services/
│   ├── api.ts              # Pipeline API client (~1900 lines)
│   └── plannerApi.ts       # Authenticated planner CRUD
├── store/
│   ├── useAuthStore.ts     # JWT + user session
│   ├── useLogiFlowStore.ts # Pipeline state (all modes)
│   └── usePlannerStore.ts  # Reports + notifications
├── hooks/                  # Autorun, STT, city search, loading steps
└── lib/                    # Metrics, themes, traffic queue, intent apply
```

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `BACKEND_URL` | Server-side backend URL (rewrites, compose proxy, warmup) |
| `NEXT_PUBLIC_API_URL` | Public backend URL; browser falls back to `/api/backend` |
| `NEXT_PUBLIC_COMPOSE_URL` | Direct compose URL for long hybrid runs |
| `GOOGLE_CLIENT_ID` | Google OAuth (server) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth (client) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase REST (geometry, ML metrics) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_RAILRADAR_API_KEY` | Live train map |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for SEO (`/sitemap.xml`, Open Graph) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4 — default `G-S710XF91X1` (always on) |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for SEO |

Copy `frontend/.env.example` to `.env.local` for local dev. Production values in `vercel.json`.

---

## Development

```bash
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev          # http://localhost:3000
npm run dev:clean    # clear cache + dev
npm run build
npm run lint
```

Backend must be running on port 8000 (or update `.env.local`).

---

## SEO & analytics (zero default client cost)

| Route | Purpose |
|-------|---------|
| `/sitemap.xml` | Public pages for search engines (build-time) |
| `/robots.txt` | Crawl rules; auth routes excluded |

Per-pipeline `<title>` and meta descriptions live in `src/app/*/layout.tsx` and `src/lib/seo.ts`.  
GA4 uses `@next/third-parties/google` (`afterInteractive`) and is **on by default** via `GA_MEASUREMENT_ID` in `src/lib/seo.ts`.

Full Google Cloud optimization state: [docs/gcp-optimization.md](../docs/gcp-optimization.md)

---

## API proxying

Browser requests never hit Cloud Run directly for most calls:

- `/api/backend/*` → `{BACKEND_URL}/*`
- `/api/auth/*` → `{BACKEND_URL}/auth/*`
- `/api/planner/*` → `{BACKEND_URL}/planner/*`
- `/railradar/*` → RailRadar API

Configured in `next.config.ts`. SSR uses `BACKEND_URL` or `NEXT_PUBLIC_API_URL` directly.

Supabase REST calls (rail geometry, ML metrics) go **directly** from the browser to Supabase for latency.

---

## Auth

1. `GoogleSignInButton` loads Google Identity Services
2. Credential sent to `POST /api/auth/login`
3. JWT stored in `sessionStorage` + `useAuthStore`
4. `AuthInitializer` validates via `GET /api/auth/me` on load
5. `ProtectedRoute` guards `/dashboard`, `/reports/*`
6. `lib/apiClient.ts` attaches Bearer token to planner calls

---

## Key features

- **AI intent parsing** — `AiBriefPanel` on home/dashboard; STT via Web Speech API
- **Shipment autorun** — intent confirmation auto-triggers optimize on target mode page
- **Traffic queue** — 429/503 redirects to `/waiting` with auto-resume
- **Backend warmup** — `BackendWarmup` pings on load, focus, every 3 min
- **Invalid corridor UX** — `InvalidCorridorCard` for road `no_routes`
- **Save to planner** — `SaveReportModal` persists optimization to `/planner/reports`

---

## Deployment

Deployed on Vercel. See [docs/deployment.md](../docs/deployment.md).

`vercel.json` contains production env vars. Redeploy after changing `NEXT_PUBLIC_*` values.
