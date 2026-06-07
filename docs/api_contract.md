# LogiFlow API Contract

Base URL (local): `http://localhost:8000`

Production: `https://logiflow-solution-challenge-2026.onrender.com`

---

## Health

`GET /health` → `{"status": "ok"}`

---

## Intent

`POST /intent/parse` — natural-language shipment brief → structured cities, weight, priority, mode hints.

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
| `POST` | `/road/optimize` | `source`, `destination`, vehicle, traffic options |
| `POST` | `/railway/optimize` | `source`, `destination`, `weight_kg`, `cargo_type`, `departure_date` |
| `POST` | `/air/optimize` | `source`, `destination`, cargo weight/volume |
| `POST` | `/water/optimize` | `source`, `destination`, cargo details |

Each returns ranked options or `{status: "no_routes"}`.

---

## Rail extras

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/railway/trains/{train_number}/geometry?from_code=&to_code=` | Corridor polyline + intermediate stops |
| `GET` | `/railway/model-info` | Delay ML metadata (JSON; no model pickle load) |
| `GET` | `/railway/search/stations?query=` | Station autocomplete |

**Frontend note:** ML quantifiers are also stored in Supabase `rail_ml_metrics` (`id=current`) for instant Vercel reads.

---

## Cross-mode

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/comparator/routes` | Run road + rail + air + water in parallel, rank winner |
| `POST` | `/compose` | Chained multimodal itineraries via hub templates |
| `POST` | `/explain` | Standalone explanation for a chosen route |

---

## Planner (authenticated)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/planner/reports` | Save shipment report |
| `GET` | `/planner/reports/{id}/route-health` | Smart trip monitoring |
| `POST` | `/planner/reports/{id}/execute` | Start trip lifecycle |

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

---

## Errors

- `404` / empty body — route not found for mode
- `503` — Render cold start (retry after warmup)
- `{status: "no_routes"}` — honest empty result (not an HTTP error)
