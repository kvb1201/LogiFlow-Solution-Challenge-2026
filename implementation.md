# Reoptimization V1

## Architecture

Reoptimization V1 is a three-step, single-button workflow that operates on the **remaining journey only** (current_location → destination, not source → destination).

```
POST /reoptimize-v1
  ↓
reads current_location from optimization_result
  ↓
runs pipeline: current_location → destination
  ↓
computes improvement vs current remaining metrics
  ↓
applies thresholds
  ↓
returns comparison + recommendation

POST /accept-reoptimization  (if user accepts)
  ↓
replaces route_intelligence in optimization_result
  ↓
preserves current_location + progression_base_* (immutable tracking)
  ↓
updates estimated_cost, estimated_time, risk_score
```

---

## Step 1 — Endpoint: `POST /planner/reports/{id}/reoptimize-v1`

No request body. Reads everything it needs from the stored report:
- `optimization_result.current_location` → reopt start point
- `optimization_result.route_intelligence.route_cities` → remaining stops
- `report.mode`, `report.cargo_type`, `report.optimization_input` → pipeline config
- `report.estimated_time`, `report.estimated_cost`, `report.risk_score` → current metrics

Falls back to `report.source` if no `current_location` is stored (trip not yet updated).

---

## Step 2 — Remaining Journey Calculation

Uses `split_route_at_location(route_cities, current_location)` to derive remaining stops. Runs `_run_pipeline(report, current_location, remaining_stops, destination)` — the same pipeline already used by the existing reoptimization service.

---

## Step 3 — Current Route Metrics

Rather than using the full original ETA (which includes the already-completed portion), the current route metrics are scaled to the **remaining distance**:

```python
remaining_ratio = remaining_km / total_km
current_metrics = {
    "time": original_estimated_time × remaining_ratio,
    "cost": original_estimated_cost × remaining_ratio,
    "risk": report.risk_score,
}
```

This makes the comparison fair — both current and alternative represent the remaining journey.

---

## Step 4 — Comparison

```json
{
  "current_route":  { "metrics": { "eta_minutes": 76, "cost": 8200, "risk": 0.18 } },
  "alternative_route": { "metrics": { "eta_minutes": 55, "cost": 7100, "risk": 0.14 } },
  "improvement": {
    "time_saved_minutes": 21,
    "cost_pct_change": 13.4,
    "risk_pct_change": 22.2
  }
}
```

---

## Step 5 — Recommendation Engine

**Thresholds (any one must be exceeded):**

| Metric | Threshold |
|---|---|
| Time saved | > 15 minutes |
| Cost reduction | > 5% |
| Risk reduction | > 5% |

```python
def _should_recommend_switch(improvement) -> (bool, str):
    reasons = []
    if time_saved > 15:  reasons.append(f"Saves {time_saved}m")
    if cost_pct > 5:     reasons.append(f"Reduces cost by {cost_pct}%")
    if risk_pct > 5:     reasons.append(f"Reduces risk by {risk_pct}%")
    return bool(reasons), "; ".join(reasons) or "Does not meet thresholds"
```

Returns `recommend_switch: true/false` and `recommendation_reason` string.

---

## Step 6 — UI: ReoptimizeV1Panel

Added to `RouteHealthCard.tsx` as a standalone sub-component (no props except `reportId`). It manages its own loading/accepted state and reads from the store.

**States:**
1. **Button** — "Reoptimize Route" (default, before running)
2. **Loading** — spinner while pipeline runs
3. **Results** — two-column comparison (Current Route / Alternative Route), improvement deltas, recommendation badge, action buttons
4. **Accepted** — success message

The panel appears below the Recommended Action section and above the Route Corridor section.

---

## Step 7 — Accept: `POST /planner/reports/{id}/accept-reoptimization`

Body:
```json
{
  "optimization_result": { ... },  // alternative route's pipeline result
  "estimated_cost": 7100,
  "estimated_time": 0.9167,
  "risk_score": 0.14
}
```

`apply_reoptimization_v1` merges the new result while preserving:
- `current_location`
- `current_location_updated_at`
- `progression_base_location`
- `progression_base_time`
- adds `reoptimized_at` timestamp

These keys are copied from the existing `optimization_result` into the new one before persisting. This ensures automatic progression continues correctly from the current location with the new route intelligence.

---

## Progress Tracking After Accept

Because `current_location`, `progression_base_location`, and `progression_base_time` are preserved, automatic progression (`resolve_current_location`) continues without interruption. The driver is still at the same city. The new `route_intelligence.route_cities` replaces the old remaining route, so future ETA/distance calculations use the optimized corridor.

---

## Files Modified

| File | Change |
|---|---|
| `backend/app/services/reoptimization_service.py` | Added `build_reoptimization_v1`, `apply_reoptimization_v1`, `_compute_improvement`, `_should_recommend_switch`, `_resolve_current_location_for_reopt`, threshold constants |
| `backend/app/models/report.py` | Added `AcceptReoptimizationRequest` Pydantic model |
| `backend/app/routes/planner_routes.py` | Added `POST /reoptimize-v1` and `POST /accept-reoptimization` endpoints |
| `frontend/src/services/plannerApi.ts` | Added `ReoptimizationV1Response`, `ReoptimizationV1RouteMetrics` types; `reoptimizeTripV1`, `acceptReoptimization` functions; restored missing `id` field on `ShipmentNotification` |
| `frontend/src/store/usePlannerStore.ts` | Added `reoptimizationV1`, `reoptimizationV1Loading` state; `runReoptimizationV1`, `acceptReoptimizationV1`, `dismissReoptimizationV1` actions |
| `frontend/src/components/planner/RouteHealthCard.tsx` | Added `ReoptimizeV1Panel` sub-component; wired into render |

---

## Validation Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ 16/16 pages |
| Backend `py_compile` | ✅ All files OK |
| Improvement exceeds all thresholds → recommend_switch=True | ✅ (30m / 20% / 33%) |
| Improvement below all thresholds → recommend_switch=False | ✅ (1m / 0.5% / 0.7%) |
| Only time threshold met → recommend_switch=True | ✅ (24m alone) |
| current_location used as start point | ✅ bharuch, not Surat |
| No current_location → fallback to source | ✅ |
| Reoptimization starts from current_location, not source | ✅ |
| Comparison metrics use remaining journey, not full journey | ✅ |
| Accept preserves current_location + progression_base | ✅ |
| Progress tracking continues after accept | ✅ |
