# GCP & Google Cloud optimization — current state

**Last updated:** June 2026  
**Purpose:** Single source of truth for Google Cloud / Google ecosystem features enabled on LogiFlow, their performance impact, and how to revert.

---

## Quick summary

| Feature | Status | Performance impact | Platform |
|---------|--------|-------------------|----------|
| Cloud Run API (team-3mo) | ✅ Live | Backend only — faster API, no frontend slowdown | GCP |
| Vercel Analytics | ✅ Live | Minimal (Vercel-optimized) | Vercel |
| Vercel Speed Insights | ✅ Live | Minimal | Vercel |
| Build-time SEO (metadata, sitemap, robots) | ✅ Live | **Zero client JS** — HTML `<head>` only | Next.js |
| JSON-LD structured data | ✅ Live | **Zero client JS** — inline server script | Next.js |
| Google Analytics 4 (GA4) | ✅ Live | Small — `@next/third-parties` loads `afterInteractive` (non-blocking) | Google Analytics |
| Firebase on GCP project | ✅ Enabled | None on website | GCP + Firebase |
| Google Search Console | 📋 Manual | None — dashboard only | Google Search |
| GA4 → BigQuery export | 📋 Optional | None on website | GCP BigQuery |
| Cloud Monitoring alerts | 📋 Recommended | None on website | GCP |

**Frontend performance rule:** No SEO or analytics feature was added that ships JavaScript to every page unless explicitly opted in via environment variable (GA4).

---

## Production infrastructure (GCP)

| Resource | Value |
|----------|-------|
| GCP project | `project-6d6f652b-7066-4341-806` |
| Cloud Run service | `logiflow-api` |
| Region | `asia-south1` |
| URL | https://logiflow-api-sbexkjk72q-el.a.run.app |
| Deploy profile | `team-3mo` (min-instances=1, 2 CPU, 2 GiB) |
| Revision | See `gcloud run services describe logiflow-api` |

Deploy: `./scripts/deploy-gcp-cloud-run.sh` or GitHub Action **Deploy API to GCP Cloud Run**.

Details: [gcp-deployment.md](./gcp-deployment.md)

---

## SEO (zero client-performance cost)

Implemented in Next.js App Router — all **build-time or server-rendered**, no extra client bundles.

| File | Role |
|------|------|
| `frontend/src/lib/seo.ts` | Canonical URL, per-page titles/descriptions, Open Graph |
| `frontend/src/app/sitemap.ts` | `/sitemap.xml` — public routes only |
| `frontend/src/app/robots.ts` | `/robots.txt` — blocks `/api/`, auth, dashboard |
| `frontend/src/components/seo/JsonLd.tsx` | `WebApplication` schema on every page (inline, ~200 bytes) |
| `frontend/src/app/*/layout.tsx` | Per-pipeline metadata (hybrid, rail, road, air, water, comparator) |

**Excluded from indexing:** `/login`, `/dashboard`, `/reports`, `/waiting`, `/api/*`

**Verify after deploy:**
```bash
curl -sI https://logi-flow-solution-challenge-2026.vercel.app/sitemap.xml | head -5
curl -s https://logi-flow-solution-challenge-2026.vercel.app/robots.txt
```

**Custom domain:** Set `NEXT_PUBLIC_SITE_URL=https://logiflow.in` in Vercel Production env and redeploy so canonical URLs and sitemap use the custom domain.

### Google Search Console (manual, no code)

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property: `https://logiflow.in` or the Vercel URL
3. Verify via DNS (your registrar) or HTML tag
4. Submit sitemap: `https://<your-domain>/sitemap.xml`

---

## Google Analytics 4 (enabled by default)

GA4 is linked to the GCP project via **Firebase** (enabled June 2026 on `project-6d6f652b-7066-4341-806`).

| Item | Value |
|------|-------|
| Measurement ID | `G-S710XF91X1` |
| Web stream | LogiFlow Production |
| Stream URL | `https://logi-flow-solution-challenge-2026.vercel.app` |
| GA4 property | `525291588` (account `385057417`) |
| Firebase web app | `LogiFlow Web` (`1:689785530973:web:d49ee0effad82c5753bbb4`) |

**Implementation:** `@next/third-parties/google` in `frontend/src/app/layout.tsx` — always on, `afterInteractive` (non-blocking).

**Configured in:** `frontend/vercel.json`, `frontend/src/lib/seo.ts` (`GA_MEASUREMENT_ID` fallback), `NEXT_PUBLIC_GA_MEASUREMENT_ID` in Vercel Production.

**Dashboard:** [Google Analytics](https://analytics.google.com/analytics/web/#/a385057417p525291588/reports/intelligenthome) → Realtime to verify traffic after deploy.

### Disable GA4 (if you notice slowdown)

1. Remove `NEXT_PUBLIC_GA_MEASUREMENT_ID` from Vercel → redeploy, **or**
2. Set `NEXT_PUBLIC_GA_MEASUREMENT_ID=` (empty) in Vercel to override the code fallback.

### Link GA4 → BigQuery (GCP)

1. GA4 Admin → Product links → BigQuery links
2. Select GCP project `project-6d6f652b-7066-4341-806`
3. Enable daily export — useful for team dashboards without touching the live site

### Vercel Analytics vs GA4

| | Vercel Analytics | GA4 |
|--|------------------|-----|
| Status | Always on | Opt-in via env |
| Best for | Page views, Web Vitals | Funnels, campaigns, BigQuery |
| Perf | Optimized by Vercel | Small extra script when enabled |

Keep both if you need BigQuery; otherwise Vercel Analytics alone is enough for speed.

---

## Frontend environment variables (Google ecosystem)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SITE_URL` | Recommended for production | Canonical URL for SEO (e.g. `https://logiflow.in`) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | ✅ Default `G-S710XF91X1` | GA4 measurement ID (override in Vercel to change/disable) |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical URL for SEO/sitemap |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | ✅ | Google Sign-In (existing) |

Template: `frontend/.actual.env`

---

## GCP features — recommended next steps (no frontend impact)

These do **not** change the website bundle; they improve observability and ops.

| Feature | Benefit | Action |
|---------|---------|--------|
| **Cloud Monitoring** | Alert on 5xx, latency, instance count | GCP Console → Monitoring → Uptime + alert policies on Cloud Run |
| **Cloud Logging** | Search API errors | Already on by default for Cloud Run |
| **Error Reporting** | Group Python tracebacks | Enable in GCP Console → Error Reporting |
| **Cloud Trace** | Latency breakdown for compose | Optional — add OpenTelemetry later |
| **Secret Manager** | Rotate API keys without redeploy | Migrate from `.env` at deploy time |
| **Cloud Armor** | DDoS / rate limit at edge | Only if using custom domain + Load Balancer |
| **BigQuery** | GA4 + custom compose analytics | Link GA4 export |

---

## Performance verification

After any change in this doc’s scope, confirm no regression:

```bash
cd frontend && npm run build
# Check First Load JS for / and /hybrid in build output — should match pre-change ± few KB
```

Production checks:
- [Vercel Speed Insights](https://vercel.com) dashboard (Web Vitals)
- Lighthouse on `/` and `/hybrid` — target LCP &lt; 2.5s, no new render-blocking scripts (GA off = baseline)

---

## Revert guide

If a deploy feels slower or unwanted:

### Revert entire GCP optimization commit
```bash
git revert <commit-sha>   # creates a new commit undoing SEO + GA wiring
git push origin main
```

### Disable GA4 only (keep SEO)
Remove or empty `NEXT_PUBLIC_GA_MEASUREMENT_ID` in Vercel → redeploy. Or revert the GA commit below.

### Disable SEO metadata only
Revert files under `frontend/src/lib/seo.ts`, `frontend/src/app/sitemap.ts`, `frontend/src/app/robots.ts`, and pipeline `layout.tsx` files. SEO has **no runtime cost**, so reverting is only needed for content reasons, not speed.

### Revert Cloud Run profile
```bash
DEPLOY_PROFILE=free ./scripts/deploy-gcp-cloud-run.sh   # scale to zero (slower cold starts)
```

---

## Related docs

- [gcp-deployment.md](./gcp-deployment.md) — Cloud Run deploy
- [deployment.md](./deployment.md) — Full stack topology
- [architecture.md](./architecture.md) — System design
