# Route Validity Audit — Implementation Notes

## Root Cause

The original pipeline had a critical gap: **`validate_fallback_route()` was only called
inside `_fallback_routes()`**, meaning the corridor validity check was entirely bypassed
when TomTom returned a real HTTP response.

For `London → New York (Road)`, TomTom's routing API can return an apparent "route" that
internally uses ferry crossings or simply provides misleading data for trans-oceanic
corridors. Because the check only existed on the fallback path, the pipeline happily
accepted whatever TomTom returned — or, if TomTom failed, generated a haversine
fallback that the old code did not gate properly.

The result: fabricated metrics (5,569 km, 206 hrs, "Mostly highways", "Traffic Moderate",
77% confidence) were returned as if they described a real drivable road journey.

---

## Changes Made

### 1. `backend/app/pipelines/road/route_validator.py`

- Renamed `_MAX_FALLBACK_DISTANCE_KM` → `_MAX_ROAD_DISTANCE_KM` (applies to all routes,
  not just fallbacks).
- Renamed `validate_fallback_route()` → `validate_corridor()` to clarify it is a
  pre-flight check for the entire corridor, not just fallback generation.
  `validate_fallback_route()` is kept as a backward-compatible alias.
- Updated docstring of `is_physically_drivable()` to document that this now applies to
  **both** real TomTom routes and fallback estimates.
- Clarified comment: TomTom can occasionally route via ferry links; the guard prevents
  those from propagating as valid road-only routes.

### 2. `backend/app/pipelines/road/route_provider.py`

**Key fix — validity gate moved to the top of `get_routes()`**, before TomTom is called:

```python
from app.pipelines.road.route_validator import validate_corridor
corridor_valid, corridor_reason = validate_corridor((lat1, lon1), (lat2, lon2))
if not corridor_valid:
    return {"_invalid_corridor": True, "reason": corridor_reason}
```

This means **no TomTom call is made** for trans-oceanic corridors. If TomTom had already
returned a misleading result (e.g. via ferry routing), it is now discarded before any
metrics are computed.

- Added `"valid": True, "is_fallback": False, "data_source": "tomtom"` flags to real
  TomTom route dicts so downstream code can distinguish them from fallback estimates.

### 3. `backend/app/pipelines/road/pipeline.py`

- Added `_InvalidCorridorError` exception class.
- `_get_routes()` detects the `{"_invalid_corridor": True}` sentinel from
  `route_provider` and raises `_InvalidCorridorError` with the rejection reason.
- `generate()` catches `_InvalidCorridorError` and returns a clean structured response:

```json
{
  "mode": "road",
  "status": "no_routes",
  "valid": false,
  "message": "No drivable road route between Europe and North America. ...",
  "reason": "No drivable road route available.",
  "best": null,
  "alternatives": [],
  "all": []
}
```

  No distances, highways, traffic levels, weather, or confidence values are fabricated.

- `_engineer()` now propagates `valid`, `is_fallback`, `data_source`, and
  `fallback_reason` flags from the raw provider route into every enriched route dict.
- `_explain()` now prepends a disclosure message for fallback routes:
  > "Estimated route (live routing unavailable: routing service timed out). Distances,
  > times, and traffic are haversine estimates only."

### 4. `backend/app/pipelines/hybrid/normalizer.py`

- `normalize_road()` returns `None` for routes where `valid == False` (invalid/undrivable
  routes are dropped entirely from the hybrid comparison).
- For fallback routes (`is_fallback == True`), confidence is multiplied by `0.35` —
  capping it at approximately 35% of normal confidence — so fallback estimates can never
  be recommended over real-data modes.
- Passes `is_fallback` and `valid` flags through to the normalized dict.

### 5. `backend/app/pipelines/hybrid/pipeline.py`

- Added road `no_routes` detection, mirroring the existing rail/air/water handling:

```python
road_no_routes = False
if isinstance(road_res, dict) and road_res.get("status") == "no_routes":
    road_no_routes = True
    road_best = None
```

- The road normalization block now skips fallback road routes in addition to `None`
  returns from the normalizer.
- `unavailable_modes["road"]` is populated with the specific rejection reason from the
  pipeline (e.g. "No drivable road route between Europe and North America ...") instead
  of a generic string.

---

## Invariants After These Changes

| Invariant | Enforced By |
|---|---|
| Trans-oceanic road routes always return `status: "no_routes"` | `validate_corridor()` called at top of `get_routes()` |
| No fabricated distances/traffic/confidence for invalid corridors | `_InvalidCorridorError` → early return in `generate()` |
| Fallback routes never recommended over real-data routes in hybrid | `normalize_road()` applies 0.35× confidence penalty |
| Invalid routes (`valid: false`) excluded from hybrid comparison | `normalize_road()` returns `None` |
| Route explanations disclose fallback mode | `_explain()` prepends disclosure message |
| All 4 modes get consistent `no_routes` handling in hybrid | `road_no_routes` detection added to `HybridPipeline` |

---

## Validation Tests

**File:** `backend/app/pipelines/road/test_route_validity.py`

### Validator unit tests (no API calls)

| Test | Expected |
|---|---|
| London → New York | Rejected (Europe ↔ North America, ocean-separated) |
| Mumbai → London | Rejected (7,192 km exceeds 4,000 km threshold) |
| Sydney → Melbourne | Accepted (713 km, same continent) |
| Delhi → Mumbai | Accepted (1,148 km, same continent) |
| Toronto → Los Angeles | Accepted (3,494 km, same continent) |
| London → Paris | Accepted (344 km, same continent) |
| Bangalore → Chennai | Accepted (290 km, same continent) |

### Pipeline integration tests

| Test | Expected |
|---|---|
| `RoadPipeline` London → New York | `status: "no_routes"`, `valid: False`, `best: null` |
| `RoadPipeline` Mumbai → London | `status: "no_routes"`, no fabricated route |
| `RoadPipeline` Sydney → Melbourne | Not rejected as invalid corridor |
| `RoadPipeline` Delhi → Mumbai | Not rejected as invalid corridor |

**All 11 tests pass.**

Run them with:
```bash
cd backend
python3 app/pipelines/road/test_route_validity.py
```

---

## What Was NOT Changed

- Air, rail, and water pipelines: they already return clean `no_routes` responses and
  do not fabricate data.
- TomTom API call logic: if the corridor is valid and TomTom is reachable, the existing
  integration remains unchanged.
- Fallback route generation for valid corridors: still works when TomTom is unavailable,
  with correct `is_fallback: true` and `valid: false` flags and a low confidence penalty.
