# LogiFlow API Contract

| Environment | Base URL |
|-------------|----------|
| Local | `http://localhost:8000` |
| Production (GCP Cloud Run) | `https://logiflow-api-sbexkjk72q-el.a.run.app` |

Frontend browser traffic uses same-origin proxy: `/api/backend/*` → backend.

Authenticated planner routes require header: `Authorization: Bearer <jwt>`.

---

## Health

`GET /health` → `{"status": "ok"}`

Rate-limit exempt. Used by warmup cron and frontend `BackendWarmup`.

---

## Authentication (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/login` | Public | Body: `{ "credential": "<google_id_token>" }` → `{ user, token }` |
| `GET` | `/auth/me` | Bearer | Current user profile |
| `GET` | `/auth/session` | Bearer | Alias for `/auth/me` |
| `POST` | `/auth/logout` | Public | Client-side token clear (no server denylist) |

---

## Intent

`POST /intent/parse`

Natural-language shipment brief → structured cities, weight, priority, mode hints, cargo type.

Rate limit: 8/min per IP.

---

## Location funnel

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/locations/resolve?place=PRYJ` | Resolve one place to canonical city + station codes |
| `GET` | `/locations/resolve-pair?source=…&destination=…` | Resolve both endpoints |

---

## Mode pipelines

| Method | Path | Body highlights |
|--------|------|-----------------|
| `POST` | `/road/optimize` | `source`, `destination`, vehicle, traffic, multi-stop, toll options |
| `POST` | `/railway/optimize` | `source`, `destination`, `weight_kg`, `cargo_type`, `departure_date`, `priority` |
| `POST` | `/railway/simulate` | Same as optimize + simulation knobs (weather, congestion multipliers) |
| `POST` | `/air/optimize` | `source`, `destination`, cargo weight/volume, `cargo_type`, constraints |
| `POST` | `/water/optimize` | `source`, `destination`, cargo details, risk/delay constraints |

Each returns ranked options or `{status: "no_routes"}` (HTTP 200).

Road additionally returns `valid: false` for physically undrivable corridors.

---

## Rail extras (`/railway`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/railway/trains/{train_number}/geometry?from_code=&to_code=` | Corridor polyline `[lng,lat]` + intermediate stops |
| `POST` | `/railway/geometry/ensure` | Backfill missing geometry to Supabase |
| `GET` | `/railway/model-info` | Delay ML metadata (no pickle load) |
| `GET` | `/railway/search/stations?query=` | Station autocomplete |
| `GET` | `/railway/search/trains?query=` | Train number search |
| `GET` | `/railway/trains/between?from_code=&to_code=` | Trains between station codes |
| `GET` | `/railway/trains/{n}/delay` | Average delay per station |
| `GET` | `/railway/trains/{n}/live` | Live train status (RailRadar) |
| `GET` | `/railway/trains/{n}/schedule` | Static schedule |
| `GET` | `/railway/stations/{code}` | Station info |
| `GET` | `/railway/stations/{code}/live` | Live station board |
| `GET` | `/railway/stations` | City→station code mappings |
| `GET` | `/railway/cargo-types` | Supported cargo types |
| `GET` | `/railway/coords?location=` | Lat/lng for location name |
| `GET` | `/railway/stats` | Loaded railway data statistics |
| `GET` | `/railway/health` | RailRadar circuit breaker + weather probe |

**Frontend note:** ML quantifiers are also in Supabase `rail_ml_metrics` (`id=current`) for instant Vercel reads.

---

## Road extras (`/road`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/road/health` | Health check |

---

## Air extras (`/air`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/air/health` | Health check |

---

## Water extras (`/water`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/water/ports` | Full port catalog + stats |
| `GET` | `/water/ports/search?query=` | Port typeahead |
| `GET` | `/water/health` | Health check |

---

## Cross-mode

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/optimize` | Run road+rail+air+water in parallel, rank winner (Comparator UI) |
| `POST` | `/compare/routes` | Same as `/optimize` |
| `POST` | `/comparator/routes` | Legacy alias |
| `POST` | `/optimize/assistant` | Gemini follow-up Q&A on hybrid results |
| `POST` | `/compose` | Chained multimodal itineraries via hub templates |
| `POST` | `/compose/stream` | Same as compose, SSE stream of partial ranked itineraries |
| `POST` | `/explain` | Standalone explanation for a chosen route |

Rate limits: optimize 8/min, compose 8/min, assistant 5/min.

---

## Speech

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/speech/transcribe` | Audio file → text via Groq Whisper |

---

## Planner (authenticated · `/planner`)

All routes require `Authorization: Bearer <jwt>`.

### Reports CRUD

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/planner/reports` | Create shipment report (24h TTL, max per user) |
| `GET` | `/planner/reports` | List user's reports |
| `GET` | `/planner/reports/{report_id}` | Get one report |
| `PUT` | `/planner/reports/{report_id}` | Update name/status/optimization result |
| `DELETE` | `/planner/reports/{report_id}` | Delete report |

### Trip lifecycle

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/planner/reports/{id}/execute` | Start trip (`planned`/`draft` → `active`) |
| `POST` | `/planner/reports/{id}/stop` | Complete active trip |
| `POST` | `/planner/reports/{id}/cancel` | Cancel trip |
| `POST` | `/planner/reports/{id}/restart` | Re-activate completed/cancelled trip |

### Monitoring & reoptimization

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/planner/reports/{id}/route-health` | Deviation, ETA variance, condition intelligence |
| `POST` | `/planner/reports/{id}/update-location` | Persist driver `current_location` |
| `POST` | `/planner/reports/{id}/reoptimize-v1` | Replan from current location → destination |
| `POST` | `/planner/reports/{id}/accept-reoptimization` | Apply alternative route from v1 reopt |
| `POST` | `/planner/reports/{id}/reoptimize` | Generate revised plan candidate (legacy) |
| `POST` | `/planner/reports/{id}/revisions` | Save reopt as linked child report |

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/planner/notifications` | List notifications (max 50) |
| `GET` | `/planner/notifications/unread-count` | Unread count |
| `POST` | `/planner/notifications/{id}/read` | Mark one read |
| `POST` | `/planner/notifications/read-all` | Mark all read |

---

## Common response fields (normalized route)

```json
{
  "mode": "rail",
  "time": 12.5,
  "cost": 850,
  "risk": 0.15,
  "confidence": 0.8,
  "segments": [
    { "from": "NDLS", "to": "CNB", "mode": "rail", "train_number": "12303" }
  ]
}
```

### Hybrid comparator response

```json
{
  "priority": "cheap",
  "recommended_mode": "rail",
  "reason": "RAIL is the most cost-efficient option at about Rs.850.",
  "available_modes": ["road", "rail"],
  "unavailable_modes": { "air": "No air routes found" },
  "comparison": [ { "mode": "rail", "time_hr": 12.5, "cost_inr": 850, "risk": 0.15 } ],
  "tradeoffs": ["ROAD is 4.3 hrs lower time compared to RAIL"],
  "best_per_mode": { "road": {}, "rail": {}, "air": null }
}
```

### Compose response (simplified)

```json
{
  "itineraries": [
    {
      "legs": [
        { "mode": "road", "from": "Phulpur", "to": "Kanpur" },
        { "mode": "rail", "from": "Kanpur", "to": "Lucknow" }
      ],
      "total_cost_inr": 1200,
      "total_time_hr": 8.5,
      "total_risk": 0.2
    }
  ],
  "unavailable_templates": []
}
```

---

## Errors

| Code / pattern | Meaning |
|----------------|---------|
| `401` | Missing or expired JWT (planner routes) |
| `403` | Cross-user report access |
| `429` | Rate limit exceeded → frontend traffic queue |
| `503` | Concurrency saturated or cold start → retry / waiting room |
| `{status: "no_routes"}` | Honest empty result (HTTP 200, not an error) |
| `{valid: false}` | Road corridor physically undrivable |
