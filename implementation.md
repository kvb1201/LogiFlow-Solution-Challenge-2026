# Shipment Tracking Consistency Refactor

## Architecture

### Immutable vs Mutable vs Derived

| Field | State | Where stored |
|---|---|---|
| `source` | Immutable | `ShipmentReport.source` |
| `destination` | Immutable | `ShipmentReport.destination` |
| `route_intelligence.route_cities` | Immutable | `optimization_result.route_intelligence` |
| `route_intelligence.checkpoints` | Immutable | `optimization_result.route_intelligence` |
| `route_geometry` | Immutable | `optimization_result.best.geometry` |
| `current_location` | **Only mutable state** | `optimization_result.current_location` |
| `progress_percentage` | Derived | Never stored |
| `completed_cities` | Derived | Never stored |
| `remaining_cities` | Derived | Never stored |
| `remaining_distance_km` | Derived | Never stored |
| `remaining_eta_minutes` | Derived | Never stored |
| `shipment_health` | Derived | Never stored |
| `recommendation` | Derived | Never stored |

---

## Requirement 1 — Route Corridor is Immutable

The `update-location` endpoint previously trimmed `route_intelligence.route_cities` and mutated `report.stops`. Both are removed.

The endpoint now writes only `optimization_result.current_location`. Nothing else changes.

Before (broken):
```python
# Was trimming route_cities — caused backtracking bug
route_intelligence["route_cities"] = full_rc[split_idx:]
route_intelligence["completed_cities"] = full_rc[:split_idx]
report.stops = remaining_stops  # was being trimmed
```

After (correct):
```python
existing_result["current_location"] = current_location
existing_result["current_location_updated_at"] = now.isoformat()
# Nothing else written — route_cities, stops, checkpoints untouched
```

---

## Requirement 2 — Only `current_location` is Mutable

`ShipmentLocationUpdateRequest` accepts only `{ current_location: str }`. No metric fields.

The backend records the location and returns the updated report. All derived values are computed on the next call to `GET /route-health`.

---

## Dynamic Progress Calculation (Requirement 3)

### `derive_progress_and_eta(current_location, route_cities, mode, original_estimated_time_hours)`

**Formula:**
```
covered_km     = project(current_location) onto route polyline
progress_pct   = (covered_km / total_route_km) × 100
remaining_km   = total_route_km - covered_km
```

**Projection algorithm:**
For each consecutive segment in `route_cities`:
1. Compute the nearest-point on the segment to `current_location` using vector projection (dot product, clamped to `[0,1]`)
2. Compute perpendicular distance from city to that projected point
3. Take the segment with minimum perpendicular distance
4. `covered_km = cumulative_up_to_segment_start + t × segment_length`

This handles any city — both cities explicitly listed in `route_cities` and intermediate corridor cities like Karjan (between Bharuch and Vadodara).

**Validated results (Surat → Vadodara corridor):**

| City | Progress | ETA |
|---|---|---|
| Surat | 0% | ~240m |
| Ankleshwar | 68.4% | 87m |
| Bharuch | 72.6% | 76m |
| Karjan | 88.2% | 33m |
| Vadodara | 100% | 0m |

---

## Dynamic Remaining ETA (Requirement 4)

**Formula:**
```
remaining_eta = remaining_km / speed_kmh × 60  (geometry path)
             OR original_time × (remaining_km / total_km)  (time_ratio fallback)
```

**Speed model:**
| Mode | Speed |
|---|---|
| road | 55 km/h |
| rail | 80 km/h |
| air | 700 km/h |
| water | 25 km/h |

The pipeline ETA (`updated_eta_minutes` from `evaluate_remaining_journey`) takes precedence over the speed-model ETA when available.

The response field `progress_derived_from` indicates which method was used: `"geometry"`, `"time_ratio"`, or `"unavailable"`.

---

## Dynamic Corridor Rendering (Requirement 5)

### `split_route_at_location(route_cities, current_location)`

Computes `(completed_cities, remaining_cities)` at query time. Never persisted.

Algorithm:
1. Exact name match (case-insensitive)
2. Coordinate proximity: if current city is within 30 km of a route checkpoint, treat as that checkpoint

**Example: Bharuch selected on Surat → Vadodara**
```
route_cities:  [Surat, kosamba, ankleshwar, bharuch, karjan, Vadodara]
current:       bharuch

completed:     [Surat, kosamba, ankleshwar]
remaining:     [karjan, Vadodara]
```

**Example: After backtrack to Ankleshwar**
```
route_cities:  [Surat, kosamba, ankleshwar, bharuch, karjan, Vadodara]  ← UNCHANGED
current:       ankleshwar

completed:     [Surat, kosamba]
remaining:     [bharuch, karjan, Vadodara]
```

The route_cities list is the same in both calls. No mutation required or performed.

---

## Backtracking Support (Requirement 6)

Because `route_cities` is never trimmed, selecting any city in the route — including previously "passed" cities — works correctly.

The old implementation trimmed `route_cities` to `[current_location:]` on each update. This meant that after reaching Karjan, the list became `[karjan, Vadodara]` — Bharuch was no longer selectable without a page reload.

Now: `route_cities` always contains the full route from source to destination. `split_route_at_location` recomputes the completed/remaining split every time from scratch.

---

## Route Health from Current Location (Requirement 7)

`evaluate_route_health` priority order:

1. `actual_location_name` query param (fresh user input — ephemeral check)
2. `optimization_result.current_location` (confirmed stored location)
3. Progress-based estimate (only when no confirmed location exists)

When a confirmed location exists, progress estimation is skipped entirely. The location is used directly as the driver city for all derived computations.

---

## UI: Progress/Distance/ETA display (Requirement 8)

`RouteHealthCard.tsx` progress metrics panel now shows:

| Metric | Source |
|---|---|
| Progress | `routeHealth.progress_percentage` (geometry-derived) |
| Remaining | `routeHealth.remaining_distance_km` km (+ `total_route_km` as sub-label) |
| Remaining ETA | `routeHealth.remaining_eta_minutes` (geometry or pipeline) |

Sub-labels show `"distance-based"` when `progress_derived_from === "geometry"`.

The corridor display uses `completed_cities`/`remaining_cities` from the health response — recomputed on every Evaluate.

---

## Files Modified

| File | Change |
|---|---|
| `backend/app/routes/planner_routes.py` | `update-location` endpoint: removed all route mutation, now only writes `current_location` |
| `backend/app/services/trip_progress.py` | Added `derive_progress_and_eta`, `split_route_at_location`, `_cumulative_distances`, `_distance_along_route`; rewrote `evaluate_route_health` to use dynamic derivation |
| `frontend/src/services/plannerApi.ts` | `RouteHealthResponse` extended with `remaining_distance_km`, `remaining_eta_minutes`, `covered_distance_km`, `total_route_km`, `progress_derived_from` |
| `frontend/src/components/planner/RouteHealthCard.tsx` | Progress metrics panel uses distance/ETA fields; removed "route will be trimmed" copy |

---

## Validation Results

| Scenario | Expected | Result |
|---|---|---|
| Bharuch → Ankleshwar: progress decreases | ✓ 72.6% → 68.4% | PASS |
| Bharuch → Ankleshwar: ETA increases | ✓ 76m → 87m | PASS |
| Bharuch → Ankleshwar: remaining route grows | ✓ 2 → 3 cities | PASS |
| Backtrack Karjan → Bharuch: progress decreases | ✓ 88.2% → 72.6% | PASS |
| Backtrack Karjan → Bharuch: ETA increases | ✓ 33m → 76m | PASS |
| Backtrack Karjan → Bharuch: route NOT corrupted | ✓ route unchanged | PASS |
| Forward Bharuch → Karjan: progress increases | ✓ 72.6% → 88.2% | PASS |
| Forward Bharuch → Karjan: ETA decreases | ✓ 76m → 33m | PASS |
| Forward Bharuch → Karjan: remaining route shrinks | ✓ 2 → 1 city | PASS |
| 5 operations: route_cities unchanged | ✓ immutable | PASS |
| Split at Bharuch: completed=[Surat,kosamba,ankleshwar] | ✓ | PASS |
| Split at Ankleshwar: completed=[Surat,kosamba] | ✓ | PASS |
| Split at Surat (source): completed=[] | ✓ | PASS |
| Split at Vadodara (dest): remaining=[] | ✓ | PASS |
| `npx tsc --noEmit` | 0 errors | PASS |
| `npm run build` | 16/16 pages | PASS |
| Backend `py_compile` | 0 errors | PASS |
