# Route Intelligence + Smart Route Health — Implementation

## Architecture Overview

All route intelligence is stored inside `optimization_result` (existing JSON column on `ShipmentReport`). No new tables, no new pipelines, no schema migration required. The upgrade enriches the existing `trip_progress.py` service and `planner_routes.py` endpoint, and updates the `RouteHealthCard.tsx` and `ReportDetailPage.tsx` frontend components.

---

## Phase 1 — Route Intelligence Layer

### What was built
`build_route_intelligence(source, destination, stops, optimization_result, estimated_time_hours)` in `trip_progress.py`.

### Checkpoint Generation Logic
- Collect declared waypoints (source → stops → destination)
- For each consecutive pair, call `_intermediate_cities_between()` which looks up a static hardcoded corridor table covering major Indian road corridors (Gujarat, Mumbai–Pune–Hyderabad, Delhi–Mumbai, Delhi–Kolkata, Delhi–Chennai, etc.)
- Deduplicate while preserving order
- If `route_cities` still has < 4 entries, attempt geometry-based reverse geocoding from `optimization_result.best.geometry`

### Checkpoint Density
| Route distance | Target checkpoints |
|---|---|
| < 300 km | 3 |
| 300–700 km | 4 |
| 700–1200 km | 5 |
| 1200–1800 km | 6 |
| > 1800 km | 8 |

Checkpoints are evenly sampled from `route_cities` and always include source and destination.

### Route City Generation Logic
Corridor table `_intermediate_cities_between()` uses exact and partial endpoint matching. Example: `Surat → Ahmedabad` resolves to `['bharuch', 'vadodara', 'anand', 'nadiad']`. Corridors support both directions.

### Storage
`optimization_result.route_intelligence = { checkpoints, route_cities, source, destination, total_km_estimate }`

Injected at report creation time via `enrich_optimization_result_with_intelligence()` called in `POST /planner/reports`.

### Backward Compatibility
Existing reports without `route_intelligence` fall back to the old `estimate_trip_location()` segment-interpolation logic.

---

## Phase 2 — Estimated Location Upgrade

### Logic
`_estimate_city_from_progress(route_intelligence, progress_percentage)`:
- Maps `0–100%` progress linearly across `route_cities` index
- Returns the city at `int(progress / 100 * (len(route_cities) - 1))`
- Never returns "Between A and B" when route intelligence exists

### Fallback (old reports)
Segment interpolation is preserved. To reduce "Between" labels even in fallback: if `segment_ratio >= 0.85` returns `end_name`, if `<= 0.15` returns `start_name`.

### Confidence
- Route intelligence path: `"high"`
- Coordinate interpolation path: `"medium"`
- No coordinates: `"low"`

---

## Phase 3 — Route Corridor Detection

### Detection Logic (`detect_corridor_status`)

**Step 1 — Exact match:**  
Normalize current city with `_normalize_city()` (lowercases, strips punctuation, applies aliases). Compare against each city in `route_intelligence.route_cities`. Match → `ON_ROUTE`.

**Step 2 — Fuzzy/near match:**  
`_normalize_city()` applies `_NEAR_CITY_MAP` which maps satellite towns to canonical cities (e.g. Karjan → vadodara, Petlad → anand, Noida → delhi). If the canonical form matches a route city → `NEAR_ROUTE`. Also checks substring containment (e.g. "New Delhi" ↔ "Delhi") → `NEAR_ROUTE`.

**Step 3 — Off route:**  
No match → `OFF_ROUTE`.

### Deviation level mapping (for legacy display)
- `ON_ROUTE` → `deviation_level: "none"`
- `NEAR_ROUTE` → `deviation_level: "minor"`
- `OFF_ROUTE` → `deviation_level: "major"`

---

## Phase 4 — Remaining Journey Evaluation

`evaluate_remaining_journey(report, current_location, progress_percentage)`:
1. Computes remaining waypoints from current progress index
2. Calls `_run_remaining_pipeline()` → dispatches to the existing road/air/water/hybrid/rail pipeline from `current_location` to `destination`
3. Falls back to `_fallback_result()` (haversine-based estimate) if pipeline fails
4. Returns `{ updated_eta_minutes, updated_cost, updated_risk, remaining_stops }`

This evaluation is **temporary** — used only for the health check response, not persisted.

---

## Phase 5 — Health Scoring Engine

`_compute_health_score(corridor_status, remaining_eval, overdue_minutes, base_risk, report)`:

Deterministic rules (in priority order):

| Corridor | Delay condition | Health level | Delay risk | Action |
|---|---|---|---|---|
| OFF_ROUTE | any significant delay OR high risk | `at_risk` | high | reoptimize |
| OFF_ROUTE | no significant delay | `moderate` | medium | reoptimize |
| NEAR_ROUTE | significant delay OR high risk | `at_risk` | high | reoptimize |
| NEAR_ROUTE | no significant delay | `moderate` | medium | monitor |
| ON_ROUTE | significant delay OR high risk | `moderate` | medium | monitor |
| ON_ROUTE | overdue ≥ 60min | `at_risk` | high | reoptimize |
| ON_ROUTE | no issues | `healthy` | low | continue |

**"Significant delay"** = `updated_eta_minutes - original_remaining_minutes > 15` OR `overdue_minutes >= 30`  
**"High risk"** = `updated_risk > 0.55` OR `base_risk > 0.65`

---

## Phase 6 — Smarter Reoptimization Trigger

`should_recommend_reoptimization(current_metrics, updated_metrics)`:

Recommends reoptimization only if improvement exceeds **any** threshold:

| Metric | Threshold |
|---|---|
| ETA improvement | > 15 minutes |
| Risk reduction | > 5% relative |
| Cost reduction | > 5% relative |

If below thresholds, `recommended_action` is downgraded from `"reoptimize"` to `"monitor"`. Reason string is included in response for UI display.

---

## Phase 7 — Route Health UI Upgrade

`RouteHealthCard.tsx` updated to display:

| Field | Source |
|---|---|
| Estimated Location | Phase 2 city (never "Between A and B") + confidence badge |
| Current Location | User input or estimated |
| Corridor Status | Phase 3 `ON_ROUTE / NEAR_ROUTE / OFF_ROUTE` with icon + color |
| Updated ETA | Phase 4 `updated_eta_minutes` |
| Updated Cost | Phase 4 `updated_cost` |
| Updated Risk | Phase 4 `updated_risk` |
| Reoptimization Reason | Phase 6 `reoptimization_reason` |
| Regenerate Plan button | Phase 8 — prefills from current location |

Corridor status uses the same LogiFlow colour system: emerald for ON_ROUTE, amber for NEAR_ROUTE, red for OFF_ROUTE.

---

## Phase 8 — Regenerate Plan Fix

Both locations where "Regenerate Plan" was a static link are now dynamic:

**`RouteHealthCard.tsx` — `handleRegeneratePlan()`:**
- Determines `currentLoc` from actual input → corridor_matched_city → estimated label
- Finds `currentLoc` index in full waypoint array
- Sets `source = currentLoc`, `stops = remaining intermediate stops`, `destination = report.destination`
- Navigates to `/{mode}?source=...&destination=...&stops=...`

**`ReportDetailPage.tsx` — General Actions "Regenerate Plan":**
- For `active` trips: reads `routeHealth.actual_location.label || corridor_matched_city || estimated_location.label`
- Slices waypoints array to compute remaining stops
- For non-active trips: falls back to original source/destination

---

## Files Modified

### Backend
| File | Change |
|---|---|
| `backend/app/services/trip_progress.py` | Complete rewrite — added Phases 1–6 |
| `backend/app/routes/planner_routes.py` | Import new functions, inject `route_intelligence` on report creation, expose new fields from health endpoint |

### Frontend
| File | Change |
|---|---|
| `frontend/src/services/plannerApi.ts` | Extended `RouteHealthResponse` type with Phase 3–6 fields |
| `frontend/src/components/planner/RouteHealthCard.tsx` | Phases 7 + 8 — full UI upgrade + smart Regenerate Plan |
| `frontend/src/components/planner/ReportDetailPage.tsx` | Phase 8 — smart Regenerate Plan in General Actions + added `routeHealth` to store destructure |

---

## Validation Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ 16/16 pages generated |
| Python syntax check (`py_compile`) | ✅ All files OK |
| Phase 1 — route intelligence generation | ✅ `['Surat', 'bharuch', 'vadodara', 'anand', 'nadiad', 'Ahmedabad']` |
| Phase 2 — estimated location (20%) | ✅ `bharuch` (not "Between Surat and Bharuch") |
| Phase 2 — estimated location (45%) | ✅ `vadodara` |
| Phase 2 — estimated location (85%) | ✅ `nadiad` |
| Phase 3 — ON_ROUTE (Vadodara) | ✅ |
| Phase 3 — ON_ROUTE (Karjan via near-map → vadodara) | ✅ |
| Phase 3 — ON_ROUTE (Petlad via near-map → anand) | ✅ |
| Phase 3 — OFF_ROUTE (Indore) | ✅ |
| Phase 6 — recommend when ETA +30m, risk -33%, cost -10% | ✅ |
| Phase 6 — no recommend when below thresholds | ✅ |
| Existing reports load (no route_intelligence) | ✅ Fallback path preserved |

---

## Known Limitations

1. **Corridor table is static** — covers major Indian routes. Niche corridors (e.g. Gangtok, Leh) won't have intermediate cities and will fall back to declared waypoints only. The geometry-based enrichment can fill some gaps for road routes with geometry data.

2. **Phase 4 pipeline call is synchronous** — adds latency to the route-health endpoint (~1–3s for road, longer for hybrid). For trips with no `started_at`/`expected_end_time`, progress is 0% and the evaluation is skipped.

3. **Near-city map is curated** — covers common satellite towns. Unknown towns adjacent to route cities will fall through to OFF_ROUTE even if physically close. Can be extended by adding entries to `_NEAR_CITY_MAP`.

4. **Corridor detection is text-based, not geographic** — it does not compute actual road distance to determine ON vs NEAR. A city 30km off-route could be ON_ROUTE if it shares a name with a route city. Geographic distance validation can be added as a future enhancement.

5. **Reverse geocoding for geometry enrichment** — the `_extract_route_cities_from_geometry()` function calls Nominatim and is rate-limited (2s between calls). It only activates when route has fewer than 4 known cities and geometry is available. For most routes the corridor table is sufficient.
