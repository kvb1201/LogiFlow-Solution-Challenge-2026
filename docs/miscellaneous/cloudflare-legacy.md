# Legacy — not used in production

LogiFlow **no longer routes traffic through Cloudflare Workers**.

## Current production path

```
Browser → Vercel (frontend + /api/* rewrites) → GCP Cloud Run API
```

Env vars (`BACKEND_URL`, `NEXT_PUBLIC_API_URL`) point directly at Cloud Run. See [docs/deployment.md](../docs/deployment.md).

## What remains here (archived)

| Path | Was |
|------|-----|
| `workers/logiflow-render-proxy.js` | Edge proxy in front of **Render**; later repointed to Cloud Run. **Not wired in Vercel.** |
| `../scripts/configure_logiflow_in_cloudflare.py` | Optional DNS for `api.logiflow.in` via Cloudflare. **Deprecated** — use Cloud Run URL or GCP Load Balancer + Cloud Armor if you need edge DDoS on a custom API domain. |

Do not deploy the worker unless you explicitly want a separate edge proxy again.
