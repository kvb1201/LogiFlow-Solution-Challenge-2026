# LogiFlow Backend

FastAPI application for multi-modal cargo route optimization.

**Production:** https://logiflow-api-sbexkjk72q-el.a.run.app (GCP Cloud Run, asia-south1)

---

## Stack

| Layer | Technology |
|-------|------------|
| Framework | FastAPI · Uvicorn · Python 3.11+ |
| ORM | SQLAlchemy async (SQLite local · Postgres prod) |
| ML | scikit-learn (road, rail, water delay models) |
| AI | Gemini 2.5 Flash · Groq fallback |
| Cache | Redis (optional) · Supabase · in-memory |
| Auth | Google OAuth → JWT (PyJWT) |

---

## Quick start

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # add API keys
uvicorn app.main:app --reload --port 8000
# or: make dev
```

Health check: `GET http://localhost:8000/health` → `{"status":"ok"}`

---

## Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI bootstrap
│   ├── routes/              # 13 API routers
│   ├── pipelines/           # road · rail · air · water · hybrid
│   ├── services/            # compose · auth · geocoder · ML stores
│   ├── models/              # SQLAlchemy + Pydantic schemas
│   ├── middleware/          # rate limits · optimize guard
│   └── config/database.py   # async DB engine
├── data/                    # airports · routes · PortWatch · delay scrape
├── scripts/                 # ML training · Supabase sync · scrapers
├── tests/                   # pytest suite
├── Dockerfile               # Cloud Run image
└── Makefile                 # dev · sync · audit commands
```

---

## API routes

| Prefix | Router | Description |
|--------|--------|-------------|
| `/health` | main | Liveness |
| `/auth` | auth_routes | Google login, session |
| `/road` | road_routes | TomTom road optimization |
| `/railway` | rail_routes | Rail optimize, simulate, geometry, live trains |
| `/air` | air_routes | Air cargo optimization |
| `/water` | water_routes | Maritime optimization, port catalog |
| `/optimize` | optimize | Hybrid comparator |
| `/compose` | compose | Multimodal itinerary composition |
| `/intent` | intent_routes | NL shipment brief parsing |
| `/locations` | location_routes | Location funnel debug |
| `/planner` | planner_routes | Saved reports, trip lifecycle (JWT) |
| `/explain` | explain_routes | Route explanations |
| `/speech` | speech_routes | Groq Whisper transcription |

Full contract: [docs/api_contract.md](../docs/api_contract.md)

---

## Pipelines

See [app/pipelines/README.md](app/pipelines/README.md) and [docs/pipelines/](../docs/pipelines/).

| Mode | Entry | Endpoint |
|------|-------|----------|
| Road | `pipelines/road/pipeline.py` | `POST /road/optimize` |
| Rail | `pipelines/rail/pipeline.py` | `POST /railway/optimize` |
| Air | `pipelines/air/pipeline.py` | `POST /air/optimize` |
| Water | `pipelines/water/pipeline.py` | `POST /water/optimize` |
| Hybrid | `pipelines/hybrid/pipeline.py` | `POST /optimize` |
| Compose | `services/route_composer.py` | `POST /compose` |

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | ✅ | Intent, explanations, hybrid |
| `TOMTOM_API_KEY` | ✅ | Road routing |
| `JWT_SECRET` | ✅ (prod) | JWT signing |
| `GOOGLE_CLIENT_ID` | ✅ (prod) | Google OAuth |
| `SUPABASE_URL` / `SUPABASE_KEY` | ✅ (prod) | Geometry, ML, air, compose cache |
| `DATABASE_URL` | prod | Postgres planner DB |
| `REDIS_URL` | recommended | Shared cache |
| `ORS_API_KEY` | recommended | Geocoding fallback |
| `OPENWEATHER_API_KEY` | recommended | Weather |
| `GROQ_API_KEY` | optional | Intent/rail fallback, Whisper |
| `RAILRADAR_API_KEY` | optional | Live train data |

See `.env.example` for full list.

---

## Testing

```bash
pytest tests/
make test                    # if defined in Makefile
RATE_LIMIT_ENABLED=false pytest tests/test_security_limits.py
```

Pipeline-local tests: `app/pipelines/{mode}/test.py`

---

## Deployment

```bash
./scripts/deploy-gcp-cloud-run.sh
```

See [docs/gcp-deployment.md](../docs/gcp-deployment.md) and [docs/deployment.md](../docs/deployment.md).

---

## Makefile commands

```bash
make dev                     # start backend
make sync-rail-ml-metrics    # push ML metrics to Supabase
make sync-rail-geometry-trains TRAINS=100
make audit-rail-geometry TRAINS=100
make train-delay-ml          # retrain rail delay model
make prod-audit              # check production health
```
