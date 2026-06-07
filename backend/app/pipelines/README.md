# Pipelines

Each transport mode lives under `app/pipelines/{road,rail,air,water,hybrid}/`.

| Pipeline | Entry | Tests |
|----------|-------|-------|
| Road | `road/pipeline.py` | `backend/tests/test_*road*` |
| Rail | `rail/pipeline.py` | `test_rail_*`, `test_location_funnel.py` |
| Air | `air/pipeline.py` | `test_international_air.py`, OTP tests |
| Water | `water/pipeline.py` | water route tests |
| Hybrid | `hybrid/pipeline.py` | comparator / compose tests |

Shared resolution: `app/services/location_funnel.py` (all modes).

Conventions:
- Return `{status: "no_routes"}` instead of fabricating data
- Tag routes with `data_source` where applicable
- Keep the normalized output schema compatible with `hybrid/normalizer.py`
