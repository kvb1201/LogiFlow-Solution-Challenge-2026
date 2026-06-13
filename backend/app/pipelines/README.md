# Pipelines

Each transport mode lives under `app/pipelines/{road,rail,air,water,hybrid}/`.

| Pipeline | Entry | API | Frontend page | Tests |
|----------|-------|-----|---------------|-------|
| Road | `road/pipeline.py` | `POST /road/optimize` | `/road` | `test_*road*`, `test_route_validity.py` |
| Rail | `rail/pipeline.py` | `POST /railway/optimize` | `/railway` | `test_rail_*`, `test_location_funnel.py` |
| Air | `air/pipeline.py` | `POST /air/optimize` | `/air` | `test_international_air.py`, OTP tests |
| Water | `water/pipeline.py` | `POST /water/optimize` | `/water` | water `test.py` |
| Hybrid | `hybrid/pipeline.py` | `POST /optimize` | `/comparator` | comparator tests |
| Compose | `services/route_composer.py` | `POST /compose` | `/hybrid` | `test_route_composer_*` |

## Registry

`app/services/pipeline_registry.py` registers `road`, `rail`, `water`, `air`. `hybrid` is loaded lazily to avoid circular imports.

## Shared services

| Service | Used by |
|---------|---------|
| `location_funnel.py` | All modes — canonical city/station resolution |
| `geo_hub_finder.py` | Compose — rural village hub discovery |
| `hub_spatial_index.py` | Compose — nearest station lookup (9k+ index) |
| `compose_leg_cache.py` | Compose — L1/L2/L3 leg result cache |
| `weather_service.py` | Road, rail, air, water |
| `gemini_explainer.py` | Hybrid comparator explanations |

## Conventions

- Return `{status: "no_routes"}` instead of fabricating data
- Tag routes with `data_source` where applicable
- Keep normalized output compatible with `hybrid/normalizer.py`
- Use `RequestContext` for per-request caching across pipelines
- Road: validate corridor drivability before calling TomTom
- Air: reject routes below `MIN_CONFIDENCE = 60`
- Water: reject inland cities beyond 400 km port threshold

## Per-pipeline docs

| Doc | Path |
|-----|------|
| Road | [docs/pipelines/road.md](../../../docs/pipelines/road.md) |
| Rail | [docs/pipelines/rail.md](../../../docs/pipelines/rail.md) |
| Air | [docs/pipelines/air.md](../../../docs/pipelines/air.md) + [air/README.md](air/README.md) |
| Water | [docs/pipelines/water.md](../../../docs/pipelines/water.md) + [water-pipeline-plan.md](../../../docs/miscellaneous/water-pipeline-plan.md) |
| Hybrid | [docs/pipelines/hybrid.md](../../../docs/pipelines/hybrid.md) |
| Rail walkthrough | [rail-walkthrough.md](../../../docs/pipelines/rail-walkthrough.md) |
