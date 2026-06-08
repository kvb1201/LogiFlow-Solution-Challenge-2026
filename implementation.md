# Route Intelligence V3

## Phase 1 — Geometry-Based Checkpoints

### Architecture

The route intelligence pipeline now has two paths:

```
Route Geometry (present)
  ↓
Distance-Based Sampling
  ↓
Nominatim Reverse Geocode
  ↓
Place-Type Filtering
  ↓
RouteCheckpoint objects (name, place_type, distance_from_start, lat, lng, source)
  ↓
Sort by distance_from_start
  ↓
Deduplicate by normalised name
  ↓
Inject source/destination endpoints
  ↓
route_intelligence stored

Route Geometry (absent or < 3 checkpoints)
  ↓
Corridor Table Fallback
  ↓
Same RouteCheckpoint structure
```

### Sampling Intervals

| Route Length | Interval |
|---|---|
| < 100 km | 10 km |
| 100–300 km | 15 km |
| 300–800 km | 25 km |
| 800+ km | 40 km |

Implemented in `_geometry_sampling_interval_km(total_km)`.

### Place-Type Filtering

`_extract_place_name()` accepts only: `city`, `town`, `municipality`, `village`, `hamlet`.

Rejected OSM categories: `highway`, `industrial`, `suburb`, `locality`, `neighbourhood`.

Road names, motorway junctions, and industrial zones produce empty strings and are skipped.

### Checkpoint Object Structure

```json
{
  "name": "Bharuch",
  "place_type": "city",
  "distance_from_start": 45.2,
  "latitude": 21.7064,
  "longitude": 72.9974,
  "source": "geometry"
}
```

For corridor fallback: `"source": "corridor"`. For declared waypoints: `"source": "waypoint"`.

### Corridor Table as Fallback

Corridors are invoked when:
- No geometry is available in `optimization_result`
- Geometry produces fewer than 3 checkpoints

This makes them a safety net for air/rail/water routes that have no road polyline.

### Route City Generation

`route_cities` is a backward-compatible flat list of names derived from the checkpoint objects after deduplication. Used for all downstream display and corridor detection.

### Estimated Location (Phase 2 from previous spec)

`_estimate_city_from_progress()` now uses `distance_from_start` from rich checkpoint objects when available:

```python
target_km = (progress_pct / 100) * total_km
best_cp = min(checkpoints, key=lambda c: abs(c["distance_from_start"] - target_km))
return best_cp["name"]
```

This is more accurate than array-index mapping for routes with uneven checkpoint spacing.

### Corridor Detection Enhancement

`detect_corridor_status()` now has a third step for geometry-sourced checkpoints: coordinate proximity check. If a city is within 15 km of a checkpoint → `ON_ROUTE`, within 40 km → `NEAR_ROUTE`. This handles cities not present by name in the checkpoint list but physically adjacent to the route.

---

## Phase 2 — Deterministic Health Scoring Engine

### Inputs

| Input | Source |
|---|---|
| `corridor_status` | Route corridor detection |
| `overdue_minutes` | `now - expected_end_time` |
| `original_remaining_minutes` | `expected_end_time - now` |
| `updated_eta_minutes` | Remaining journey pipeline |
| `base_risk` | `report.risk_score` |
| `updated_risk` | Remaining journey pipeline |
| `pipeline_metrics` | `remaining_eval.pipeline_result.best` |

### Scoring Weights

| Component | Weight | Calculation |
|---|---|---|
| Route Adherence | 40 pts | ON_ROUTE=40, NEAR_ROUTE=24, OFF_ROUTE=4 |
| ETA Impact | 25 pts | Linear decay on eta_gap/original_remaining |
| Traffic Impact | 5 pts | From `traffic_factor` or `traffic_level` in pipeline |
| Weather Impact | 5 pts | From `weather_factor` or `weather_level` in pipeline |
| Risk Impact | 25 pts | `25 × (1 - effective_risk)` |

**Total = 100 pts**

### Determinism Guarantee

Same inputs → same output, always. No random numbers, no time-sensitive branching within the scoring function itself. `compute_health_score()` is a pure function of its arguments.

### Confidence Score (0–100)

Reflects how much of the score was backed by real pipeline data vs estimation:

| Data available | Points |
|---|---|
| Base (corridor + progress always present) | 50 |
| `updated_eta_minutes` from pipeline | +15 |
| `updated_risk` from pipeline | +10 |
| Traffic data | +12 |
| Weather data | +13 |

### Output

```json
{
  "health_score": 96,
  "health_level": "healthy",
  "confidence": 75,
  "component_scores": {
    "adherence": 40.0,
    "eta": 24.2,
    "traffic": 5.0,
    "weather": 5.0,
    "risk": 22.0
  },
  "inputs": { ... }
}
```

---

## Phase 3 — Smart Reoptimization Recommendation

### Thresholds

| Score | Level | Action |
|---|---|---|
| 80–100 | Healthy | `continue` |
| 60–79 | Moderate | `monitor` |
| 40–59 | Suggest | `suggest_reoptimization` |
| 0–39 | At Risk | `strongly_recommend_reoptimization` |

### Improvement Gate

Even when the score indicates reoptimization, the system checks whether the improvement meets thresholds before issuing the recommendation. If improvement is below threshold, the action is downgraded to `monitor`.

Thresholds: ETA improvement > 15 min OR risk reduction > 5% OR cost reduction > 5%.

### Output

```json
{
  "action": "suggest_reoptimization",
  "label": "Reoptimization suggested",
  "suggest_reoptimization": true,
  "improvement_meets_threshold": true,
  "improvement_reasons": ["ETA improves by 30m", "Risk reduces by 33%"],
  "health_score": 50
}
```

Returned in `evaluate_route_health()` as `"recommendation"` key. Never triggers automatic reoptimization.

---

## Files Modified

| File | Change |
|---|---|
| `backend/app/services/trip_progress.py` | Complete rewrite — geometry pipeline, deterministic health engine, threshold recommendations |
| `frontend/src/services/plannerApi.ts` | `RouteHealthResponse` extended with `health_confidence`, `health_component_scores`, `recommendation` |
| `frontend/src/components/planner/RouteHealthCard.tsx` | `ACTION_LABELS` extended for new action strings, recommended action uses `recommendation.label`, confidence/components displayed |

---

## Validation Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ 16/16 pages |
| Backend `py_compile` | ✅ All files OK |
| Sampling interval < 100 km → 10 km | ✅ |
| Sampling interval 100–300 km → 15 km | ✅ |
| Sampling interval 300–800 km → 25 km | ✅ |
| Sampling interval 800+ km → 40 km | ✅ |
| Corridor fallback activated when no geometry | ✅ |
| Corridor checkpoints have `name`, `distance_from_start`, `place_type` | ✅ |
| Route ordering preserved (source first, dest last) | ✅ |
| Determinism (3 identical calls → identical scores) | ✅ |
| Confidence score present in output | ✅ |
| Component breakdown present | ✅ |
| Traffic factor lowers score | ✅ |
| Phase 3 score=95 → continue | ✅ |
| Phase 3 score=70 → monitor | ✅ |
| Phase 3 score=50 → suggest_reoptimization | ✅ |
| Phase 3 score=20 → strongly_recommend | ✅ |
| Improvement below threshold → downgraded to monitor | ✅ |
| Clear improvement → reasons listed | ✅ |
| Existing shipment update flow intact | ✅ |

---

## Known Limitations

1. **Geometry path requires Nominatim access** — reverse geocoding requires an outbound HTTP connection to `nominatim.openstreetmap.org`. On air/rail/water routes where geometry is absent, the corridor fallback is used automatically with no latency penalty.

2. **Nominatim rate limit** — enforced at 1 request/second via a global lock. For a 500 km road route with 25 km sampling, that's ~20 geocoding calls taking ~20 seconds at route creation time. This is a one-time cost stored in `optimization_result`.

3. **Traffic/weather in health score depends on pipeline** — the 5+5 pt traffic/weather components only score non-trivially when the remaining-journey pipeline returns `traffic_factor`/`weather_factor`. Air and water routes may not populate these, leaving those components at full 5 pts each (neutral, not a penalty).

4. **OFF_ROUTE score floor** — an OFF_ROUTE shipment with no delay and low risk scores ~59 (just below `at_risk` threshold of 60). This is correct: being off-route is inherently a health concern regardless of other factors. The adherence component contributes only 4 pts (10% of 40) for OFF_ROUTE.
