# Rail Pipeline

## Overview

The rail pipeline finds parcel-feasible train routes between Indian cities, ranks them by cost/time/risk, predicts delay from scraped history, and renders corridor geometry on the map. It uses a **tiered schedule strategy** (RailRadar live → delay-scrape cache → 2017 CSV) plus a centralized **location funnel** for station resolution.

**Entry:** `backend/app/pipelines/rail/pipeline.py` (`RailCargoOptimizer` for `/railway/optimize`)  
**API:** `POST /railway/optimize` · `POST /railway/simulate` · `GET /railway/trains/{n}/geometry`  
**Frontend:** `/railway` → `RailwayDashboard` → `InputForm` · `Map` · `RailMlQuantifiers`

## Flow

```
Input: source, destination, cargo weight/type, departure date
  │
  ├─ 1. Location funnel → city / station code → canonical city + station cluster
  ├─ 2. Schedule sources (per train, best available):
  │     ├─ delay_scrape JSON (runningstatus.in corpus)
  │     ├─ railways_online cache
  │     └─ Train_details_22122017.csv (796k direct pairs, lazy-loaded)
  ├─ 3. Route finder → direct + transfer routes between station clusters
  ├─ 4. Feature engineering → tariff, punctuality, booking ease, risk
  ├─ 5. Delay ML → GradientBoosting on scraped ir_train_delays.csv
  ├─ 6. Decision engine → cheapest / fastest / safest
  │
  ▼
Output: {cheapest, fastest, safest} OR {status: "no_routes"}
```

## Location resolution

All pipelines share `app/services/location_funnel.py`:

- Parses `backend/data/station_name.pdf` (~7,400 stations) into district clusters
- Merges curated `CITY_TO_STATION` clusters and IATA codes from `airports.csv`
- Expands a single code like `PRYJ` to the full Prayagraj district station set for route search

Debug endpoints:

- `GET /locations/resolve?place=PRYJ`
- `GET /locations/resolve-pair?source=PRYJ&destination=BSB`

## Schedule & data sources

| Source | Role | Tag |
|--------|------|-----|
| ConfirmTkt / RailYatri scrape | Live trains-between-stations | `scraped` |
| `ir_train_delays.csv` + delay_scrape JSON | Per-train halts for geometry & ML labels | `delay_scrape` / `schedule` |
| `Train_details_22122017.csv` | Offline fallback (11,113 trains) | `csv_fallback` |

The 2017 CSV is **lazy-loaded** by default (`RAIL_PRELOAD_ON_STARTUP=false`) to save memory on Cloud Run/Render.

### Simulation mode

`POST /railway/simulate` accepts user-controlled weather/congestion multipliers and returns the same result shape as optimize — used for demo/testing without live API fan-out.

## Delay ML

Trained via `make train-delay-ml` on scraped `ir_train_delays.csv`:

- **15,650** labeled train-day rows (current corpus)
- **5-fold GroupKFold** grouped by `train_number`
- Leave-one-date-out backtests on held-out scrape dates
- Model: GradientBoostingRegressor (`gbm`); HistGradientBoosting optional

Current CV metrics (see `scraped_delay_metrics.json`):

| Metric | Value |
|--------|-------|
| CV MAE | 22.7 min |
| ±15 min hit rate | 59.3% |
| ±30 min hit rate | 80.9% |
| Backtest ±30 min (mean) | 80.1% |

UI quantifiers are served from **Supabase** (`rail_ml_metrics`) so Vercel does not wait for backend latency. Fallback: `frontend/public/data/rail-ml-metrics.json`, then `GET /railway/model-info`.

Sync after training:

```bash
make train-delay-ml
make sync-rail-ml-metrics
```

## Map geometry & Supabase

Corridor polylines are built per train leg in `geometry_builder.py` and cached in Supabase `train_route_geometry`:

```bash
make sync-rail-geometry-trains TRAINS=100
make audit-rail-geometry TRAINS=100
```

The audit compares **independent schedule halts** vs **map stops** per train (same count + order). Current result: **82/100 pass**, 18 fail (schedule gaps or legacy geometry mismatches).

Station coordinates live in Supabase `station_coordinates` (~9,500 rows).

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/railway/optimize` | Full cargo optimization |
| `GET` | `/railway/trains/{n}/geometry` | Map corridor + stops |
| `GET` | `/railway/model-info` | ML metadata (JSON only, no pickle load) |
| `GET` | `/railway/search/stations` | Station autocomplete |

## Output structure

**When routes found:**

```json
{
  "cheapest": { "mode": "rail", "time": 18.5, "cost": 850, "risk": 0.15, "train_number": "12303", "segments": [...] },
  "fastest": { ... },
  "safest": { ... }
}
```

**When no routes:**

```json
{
  "mode": "rail",
  "status": "no_routes",
  "message": "No railway routes found between Delhi and Kochi"
}
```

## Related docs

- [Indian Railways data ecosystem](../miscellaneous/INDIAN_RAILWAYS_DATA.md)
- [Rail ML pipeline PDF](../../frontend/public/docs/rail-ml-pipeline.pdf) (generated via `make rail-ml-doc`)
