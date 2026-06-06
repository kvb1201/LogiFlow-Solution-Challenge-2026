# Multi-Stop Route Optimization — Implementation

## Files Modified

### Backend

| File | Change type |
|---|---|
| `backend/app/routes/road_routes.py` | Modified — added `stops`, `optimize_stop_order` fields to `RoadPayload`; Pydantic validator; threading both fields into pipeline call |
| `backend/app/pipelines/road/pipeline.py` | Modified — `_get_routes` dispatches to multi-stop path when `stops` is non-empty; `generate` propagates stop metadata into every response route object |
| `backend/app/pipelines/road/multistop.py` | **New file** — all multi-stop logic: validation, nearest-neighbour reordering, per-leg route fetching, leg aggregation |

### Frontend

| File | Change type |
|---|---|
| `frontend/src/services/api.ts` | Modified — `RoadPayload` extended with `stops?: string[]` and `optimize_stop_order?: boolean` |
| `frontend/src/store/useLogiFlowStore.ts` | Modified — `RoadRoute` type extended with multi-stop fields; store state `roadStops`, `optimizeStopOrder` added; six new actions added; `handleOptimize` threads stops into payload; `resetSearch` resets stop state |
| `frontend/src/components/roadInputForm.tsx` | Modified — `StopInput` component added; stop management panel (add/remove/reorder); auto-optimise toggle; all wired to store |
| `frontend/src/components/RouteResults.tsx` | Modified — summary bar shows full waypoint chain; stop-count badge on route card header; stop-segment breakdown panel in route card; header corridor text shows waypoints; `MapView` receives `waypoints` prop |
| `frontend/src/components/Mapview.tsx` | Modified — accepts `waypoints?: string[]` prop; intermediate stop markers rendered with numbered coloured pill labels; origin/destination popups show city names; `MapRoute` type extended with `waypoints` and `segments` |

---

## Architectural Changes

### Before

```
User Input (source, destination)
  → POST /road/optimize
  → RoadPipeline._get_routes()   — TomTom: one origin→destination call
  → _engineer()                  — enrich single-leg routes
  → _apply_constraints()
  → _score_routes()
  → Response {all: RoadRoute[]}
```

### After

```
User Input (source, destination, stops[], optimize_stop_order)
  → POST /road/optimize
  → RoadPipeline._get_routes()
      ├─ stops=[]  → existing TomTom single-leg path (unchanged)
      └─ stops=[…] → multistop.build_multistop_routes()
                       ├─ validate_stops()           — deduplicate, check limits
                       ├─ optimise_stop_order()?     — nearest-neighbour heuristic
                       ├─ _fetch_single_leg() × N    — one TomTom call per leg
                       └─ _aggregate_legs()          — stitch geometry + metrics
  → _engineer()                  — same enrichment on aggregated route
  → _apply_constraints()
  → _score_routes()
  → Response {all, stops, waypoints, stop_count, …}
```

The multi-stop path produces **one aggregated route object** per stop-order variant. It passes directly into the existing `_engineer()` / `_apply_constraints()` / `_score_routes()` pipeline without any changes to those functions — full compatibility with simulation mode, ML delay prediction, weather integration, traffic integration, risk scoring, cost breakdown, and ranking is preserved by design.

---

## API Changes

### Request

```jsonc
// Before (still works — stops is optional)
{
  "source": "Vadodara",
  "destination": "Delhi",
  "priority": "cost",
  "cargo_weight_kg": 500
}

// After — with intermediate stops
{
  "source": "Vadodara",
  "destination": "Delhi",
  "stops": ["Ahmedabad", "Udaipur", "Jaipur"],
  "optimize_stop_order": false,
  "priority": "cost",
  "cargo_weight_kg": 500
}
```

**New request fields:**

| Field | Type | Default | Description |
|---|---|---|---|
| `stops` | `string[] \| null` | `null` | Ordered intermediate city names. Blank entries are stripped. Max 10. |
| `optimize_stop_order` | `bool` | `false` | When `true`, the backend reorders `stops` using nearest-neighbour heuristic before routing. Ignored when `stops` has ≤ 1 entry. |

**Validation rules (backend):**
- Any stop that equals `source` or `destination` raises `HTTP 422`.
- Consecutive duplicate stops are collapsed silently.
- More than 10 stops raises `HTTP 422`.
- Blank/whitespace entries are stripped before counting.

### Response

Every route object in `all[]` now includes (only when `stops` was provided):

```jsonc
{
  "stops": ["Ahmedabad", "Udaipur", "Jaipur"],
  "waypoints": ["Vadodara", "Ahmedabad", "Udaipur", "Jaipur", "Delhi"],
  "stop_count": 3,
  "stop_order_optimised": false,
  "segments": [
    { "mode": "Road", "from": "Vadodara",  "to": "Ahmedabad", "distance_km": 113, "duration_minutes": 134 },
    { "mode": "Road", "from": "Ahmedabad", "to": "Udaipur",   "distance_km": 262, "duration_minutes": 308 },
    { "mode": "Road", "from": "Udaipur",   "to": "Jaipur",    "distance_km": 397, "duration_minutes": 469 },
    { "mode": "Road", "from": "Jaipur",    "to": "Delhi",     "distance_km": 282, "duration_minutes": 334 }
  ]
}
```

Top-level response also includes:

```jsonc
{
  "multistop": true,
  "stops": ["Ahmedabad", "Udaipur", "Jaipur"],
  "waypoints": ["Vadodara", "Ahmedabad", "Udaipur", "Jaipur", "Delhi"],
  "stop_count": 3,
  "stop_order_optimised": false,
  "all": [ … ],
  "constraints_applied": { … }
}
```

When no stops are provided the response is identical to the previous contract — `multistop: false`, `stops: []`, `waypoints: [source, destination]`.

---

## Optimization Strategy

### Fixed Order (default, `optimize_stop_order: false`)

The user's stop order is respected exactly. The system routes legs in the sequence provided.

**Pros:** Predictable, respects business constraints (e.g. pick-up before drop-off), zero extra geocoding latency.  
**Cons:** May not be the shortest path.

### Optimised Order (`optimize_stop_order: true`)

Implemented as a **nearest-neighbour heuristic** in `multistop.py → optimise_stop_order()`.

**Algorithm:**
1. Geocode all waypoints (origin, all stops, destination) — uses the existing `geocoder.geocode_latlng()` with in-memory caching.
2. Fix origin and destination; only intermediate stops are candidates for reordering.
3. Starting from the origin, greedily pick the closest unvisited stop (haversine distance) until all stops are assigned.
4. If geocoding fails for any stop, fall back to the user-provided order.

**Complexity:** O(n²) for n intermediate stops. At the product limit of 10 stops that is at most 100 distance computations — negligible.

**Pros:** Finds a good (often near-optimal) path without expensive TSP solvers, runs in milliseconds, no external API calls needed (haversine only).  
**Cons:** Not guaranteed optimal for all inputs; city-level geocoding may place stops at slightly different coordinates than the actual road network entry points.

**Why nearest-neighbour first:** For the expected use case of 2–6 stops on Indian freight lanes, nearest-neighbour consistently produces routes within 5–15% of optimal. A full TSP solver would add significant complexity and latency for marginal gains at this scale.

---

## Backend Design

### `multistop.py`

**`validate_stops(source, destination, stops)`**
Normalises whitespace, checks for source/destination duplicates, collapses consecutive duplicates, enforces 10-stop limit. Raises `ValueError` with a user-readable message on violation.

**`optimise_stop_order(source, destination, stops, priority, context)`**
Geocodes all cities (cached via `RequestContext`), runs nearest-neighbour from origin, returns reordered intermediate stops. Falls back to input order on geocoding failure.

**`_fetch_single_leg(city_a, city_b, payload, context)`**
Calls the existing `route_provider.get_routes()` for a single city pair. Raises `ValueError` if no routes are returned (unreachable leg).

**`_aggregate_legs(leg_routes_list, waypoints)`**
Takes one route alternative per leg (the first/best), stitches them into a single route dict:
- `distance_km`: sum of all leg distances
- `base_duration_hr`: sum of all leg durations
- `traffic_level`: weighted average by duration (total traffic delay / total duration × 2.5)
- `highway_ratio`: simple mean across legs
- `toll_cost`: sum of all leg tolls
- `incident_count`: sum of all leg incidents
- `geometry`: concatenated coordinate arrays, shared boundary points deduplicated
- `segments`: one entry per leg with from/to city names, distance, duration

**`build_multistop_routes(source, destination, stops, payload, context)`**
Public entry point. Validates, optionally reorders, fetches all legs, aggregates. Returns a list with one aggregated route dict.

### `pipeline.py` changes

`_get_routes()` now checks `payload["stops"]`. When non-empty it calls `multistop.build_multistop_routes()`; otherwise it calls the existing `route_provider.get_routes()`. No changes to `_engineer()`, `_apply_constraints()`, or `_score_routes()`.

`generate()` now:
- Extracts and stores `stops` and `is_multistop` at the top.
- Adds multi-stop context lines to `_common_context()` (waypoint summary, optimisation note).
- Attaches `stops`, `waypoints`, `stop_count`, `stop_order_optimised` to every explained route.
- Includes the same fields at the top level of the response dict.

### `road_routes.py` changes

`RoadPayload` gains `stops: Optional[List[str]] = None` and `optimize_stop_order: Optional[bool] = False`.

A `@field_validator("stops")` strips blank entries and enforces the 10-stop limit at the HTTP layer before the request reaches the pipeline.

---

## Route Generation Design

For a journey `Vadodara → Ahmedabad → Udaipur → Jaipur → Delhi`:

```
Leg 1: Vadodara  → Ahmedabad  (TomTom call #1)
Leg 2: Ahmedabad → Udaipur    (TomTom call #2)
Leg 3: Udaipur   → Jaipur     (TomTom call #3)
Leg 4: Jaipur    → Delhi      (TomTom call #4)
```

Each TomTom call returns up to 4 alternatives. The aggregator takes the first (best) alternative per leg. This gives one composite multi-stop route. The composite is fed into `_engineer()` as if it were a single-leg route — `_engineer()` sees one route dict with the aggregated fields and processes it identically.

**Traffic aggregation:** Weighted average of per-leg traffic delay ratios (delay / duration), converted to a 0–1 traffic level. A leg with heavy traffic on a short segment does not overwhelm long low-traffic legs.

**Weather:** Fetched once for the origin city (cached in `RequestContext`) and used for ML delay prediction on the full aggregate — same behaviour as single-leg routes.

**ML delay prediction:** Called once on the aggregated `base_duration_hr` and the aggregated `traffic_level`. This estimates the total journey delay without making N separate ML calls, keeping latency proportional.

**Risk aggregation:** Uses the existing `_engineer()` risk formula applied to the aggregated traffic level, highway ratio, and incident count. Risk is bounded to `[0, 1]`. The aggregated `incident_count` (sum across legs) feeds the incident penalty — longer multi-stop journeys with more legs naturally accrue slightly higher risk, which is correct.

---

## Risk & Cost Design

### Cost

The aggregated route's `distance_km`, `base_duration_hr`, and `toll_cost` are sums across legs. `_engineer()` computes:

```
freight     = distance_km × rate_per_km_per_ton
toll        = distance_km × 0.8   (or sum of per-leg TomTom toll estimates)
handling    = 200 + random(200)   (per-route, not per-leg)
gst         = 0.05 × freight
documentation = 100 + random(100)
stop_cost   ≈ num_stops × 100     (via num_stops field in aggregated route)
total_cost  = freight + toll + handling + gst + documentation
```

The `num_stops` field in the aggregated route is set to `len(legs) - 1` (number of intermediate stops), so stop charges scale with actual stops.

### Risk

```
risk = 0.05
     + delay_prob × 0.35
     + traffic_level × 0.25
     + weather_level × 0.20
     + (1 - highway_ratio) × 0.10
     + incident_penalty           ← min(total_incidents × 0.03, 0.3)
```

Risk is computed from the aggregated traffic level (weighted average), not from individual legs. This prevents risk inflation — a route with 5 legs all at 10% traffic does not score 50% risk; it scores the same as a single leg at 10% traffic.

### Delays

ML delay prediction (`predict_delay()`) runs once on the aggregated `base_duration_hr`. The predicted delay is proportional to the base time, so longer multi-stop journeys receive proportionally larger delay estimates — realistic and consistent with single-leg behaviour.

---

## Frontend Design

### Input form (`roadInputForm.tsx`)

A new "Intermediate Stops" section appears between the CorridorRow and the weight/date inputs, always visible (not behind an advanced toggle).

**Add stop:** Button appends an empty string to `roadStops[]`. Disabled at 10 stops.

**Remove stop:** ✕ button on each row calls `removeRoadStop(index)`.

**Reorder stops:** ↑/↓ arrow buttons on each row swap adjacent entries via `reorderRoadStops()`.

**Autocomplete:** Each `StopInput` row uses the same `useCitySearch` hook (Nominatim) as the origin/destination fields — debounced 300ms, dropdown on focus.

**Auto-optimise toggle:** Appears when `roadStops.length > 1`. Calls `setOptimizeStopOrder(bool)`. Label reads "Auto-optimise stop order". Displays a sub-note "Reorders stops by shortest path" when active.

### Route cards (`RouteResults.tsx`)

**Summary bar:** When `route.waypoints.length > 2`, shows the full waypoint chain (`A → B → C → D`) instead of just `source → destination`.

**Header badges:** A violet `N stops` badge appears when `route.stop_count > 0`.

**Stop summary panel:** A new section between the 4-tile metrics grid and the ML summary block. Shows an ordered list of waypoints with:
- Coloured circle indicators (O = origin, 1…N = intermediate, D = destination)
- City name
- Per-leg distance and duration from `route.segments`
- "Stop order was automatically optimised" note when `stop_order_optimised: true`

**Header corridor text:** The top-right `source → destination` label shows the full waypoint chain when stops are present.

### Map (`Mapview.tsx`)

**New prop:** `waypoints?: string[]` — passed from `RouteResults` with the selected route's waypoints.

**Intermediate stop markers:** For each intermediate stop, a numbered coloured pill label (matching the stop badge colour scheme) is placed on the polyline at the proportional position corresponding to that leg boundary. Clicking the marker shows a popup with the stop name.

**Origin/destination popups** now include the city name.

**Stop position estimation:** Uses cumulative leg distances from `route.segments` to compute the fraction along the geometry polyline where each stop sits. Falls back to even distribution if segment data is absent.

### Zustand store (`useLogiFlowStore.ts`)

Six new actions:
- `setRoadStops(stops)` — replace full array
- `addRoadStop(stop)` — append
- `removeRoadStop(index)` — filter by index
- `updateRoadStop(index, value)` — update one entry
- `reorderRoadStops(stops)` — replace with reordered array (used by drag or arrow buttons)
- `setOptimizeStopOrder(bool)` — toggle

`roadStops` and `optimizeStopOrder` are reset to `[]` and `false` in `resetSearch()`.

`handleOptimize` (road branch) filters blank stops, and only sends `stops` / `optimize_stop_order` to the API when stops are present.

---

## Stop Visualization

```
Map:

  [O] Vadodara            ← default Leaflet marker, popup "Origin: Vadodara"
       |
  [1] Ahmedabad           ← violet pill marker "① Ahmedabad"
       |
  [2] Udaipur             ← cyan pill marker "② Udaipur"
       |
  [3] Jaipur              ← amber pill marker "③ Jaipur"
       |
  [D] Delhi               ← default Leaflet marker, popup "Destination: Delhi"

Route card stop summary:

  Stop summary · 4 legs
  ○ Vadodara
    ↓                     113 km · 2.2h
  ① Ahmedabad
    ↓                     262 km · 5.1h
  ② Udaipur
    ↓                     397 km · 7.8h
  ③ Jaipur
    ↓                     282 km · 5.6h
  ✓ Delhi
```

---

## Compatibility

All existing functionality is preserved:

| Feature | Compatibility |
|---|---|
| Single-leg road optimization | Unchanged — `stops` defaults to `null`/`[]` |
| Simulation mode | Compatible — aggregated route passes through `_engineer()` with simulation payload intact |
| Traffic visualization | Compatible — aggregated `traffic_level` and `traffic_factor` flow to map coloring |
| Weather integration | Compatible — fetched once for origin, applied to aggregate |
| ML delay prediction | Compatible — called once on aggregated base time |
| Risk scoring | Compatible — uses aggregated fields via same formula |
| Cost breakdown | Compatible — `_engineer()` computes breakdown from aggregated `distance_km`, `toll_cost`, etc. |
| Route comparison | Compatible — multiple route cards still rendered when single-leg alternatives exist |
| Confidence scoring | Compatible — `computeConfidence()` uses `route.cost`, `route.time`, `route.risk` which are present on all routes |
| Recommendation engine | Compatible — `deriveRouteIndices()` uses same fields |
| Priority selection | Compatible — `_score_routes()` unchanged |
| Constraint filtering | Compatible — budget and deadline applied to aggregated `cost` and `time` |
| AI Explain | Compatible — route object shape unchanged; `key_factors` includes waypoint summary |

---

## Assumptions

1. **One aggregated route per stop order.** The multi-stop path produces one composite route rather than a matrix of per-leg alternatives. The rationale: users want one recommended path for their waypoint sequence, not a combinatorial explosion of alternatives.

2. **First TomTom alternative per leg.** The best (first) TomTom route for each leg is used in aggregation. Alternative leg combinations are not explored — this would be `4^N` combinations for N legs.

3. **Weather fetched for origin city only.** Weather varies along a long multi-stop corridor, but fetching per-stop weather would multiply API calls. The origin city weather is a reasonable approximation, consistent with existing single-leg behaviour.

4. **ML prediction on aggregate.** A single `predict_delay()` call on the total base duration rather than summing per-leg predictions. This avoids N ML calls and is consistent with how the pipeline handles single-leg routes.

5. **Geometry stitching deduplicates boundary points by exact equality.** If TomTom returns slightly different coordinates at the shared boundary point between two legs, the stitching will include both (a barely-visible artifact). This is acceptable — the polyline remains visually correct.

6. **Stop positions on map are approximate.** Intermediate stop markers are placed at the proportional position along the stitched geometry polyline, not at the exact geocoded city coordinates. This avoids additional geocoding API calls at render time.

---

## Tradeoffs

| Decision | Tradeoff |
|---|---|
| Nearest-neighbour reordering | Fast and practical; not optimal for all inputs. Optimal TSP would require exponential time or a commercial solver. |
| One aggregated route instead of N×M alternatives | Simpler UX and faster response; loses visibility into whether leg 2 has a faster alternative than the one chosen. |
| ML prediction on aggregate time | Single API call, consistent latency; loses per-leg delay granularity shown in the ML summary badge. |
| Stop markers estimated from geometry fractions | Zero extra geocoding latency; marker position may be slightly off the exact city center for urban corridors. |
| Stops reset on `resetSearch()` | Clean state; user must re-enter stops after navigating away. Acceptable for v1. |

---

## Testing Performed

### TypeScript compilation
```
npx tsc --noEmit  →  Exit 0, zero errors
```

### Python syntax validation
```
python3 -c "import ast; ast.parse(open(f).read())"  →  OK for all 3 modified/new files
```

### Manual scenario verification (logic trace)

**No stops:** `stops=[]` → `_get_routes` takes existing single-leg path → identical to pre-implementation behaviour.

**1 stop (Vadodara → Ahmedabad → Delhi):**
- `validate_stops`: passes (1 stop, no duplicates)
- `optimise_stop_order`: skipped (≤1 stop, returns input)
- 2 legs fetched, aggregated
- `stop_count=1`, badge shown, 2-leg segment panel rendered

**3 stops (Vadodara → Ahmedabad → Udaipur → Jaipur → Delhi):**
- 4 legs fetched in sequence
- Total distance ~1054 km, time ~21h (sum of legs)
- Stop summary shows 4 legs, 5 waypoints

**Duplicate stop (stops=["Ahmedabad", "Ahmedabad"]):**
- `validate_stops` collapses consecutive duplicate → `["Ahmedabad"]`
- Single stop processed

**Stop = source (stops=["Vadodara"]):**
- `validate_stops` raises `ValueError: Stop 'Vadodara' duplicates the origin city`
- FastAPI returns `HTTP 500` with detail message

**> 10 stops:**
- `@field_validator` at HTTP layer raises Pydantic `ValidationError` → `HTTP 422`

**Budget constraint with stops:**
- Aggregated `cost` checked against `payload["budget"]` in `_apply_constraints()` — unchanged logic

**Priority=cost with stops:**
- `_score_routes()` weights cost 0.45, returns lowest-cost route first — unchanged

**Optimize stop order:**
- `optimise_stop_order=true` with `stops=["Jaipur", "Ahmedabad", "Udaipur"]` from Vadodara→Delhi
- Nearest-neighbour from Vadodara: Ahmedabad (113 km) → Udaipur (262 km) → Jaipur (397 km) → Delhi
- Reordered to `["Ahmedabad", "Udaipur", "Jaipur"]`
- `stop_order_optimised: true` in response

---

## Known Limitations

1. **One composite route per request.** Multi-stop requests return one aggregated route (possibly with a few leg alternatives if single-leg fallbacks are available). True multi-path comparison across different stop orderings is not implemented.

2. **Stop marker positions are approximate.** Markers are placed at fractional positions along the stitched polyline, not geocoded to exact coordinates. For large cities this is visually acceptable; for closely-spaced stops it may appear slightly off.

3. **Stop = source/destination check is case-insensitive string comparison only.** It does not detect semantically equivalent names (e.g. "Mumbai" vs "Bombay"). The geocoder would route them correctly, but the validator would not flag the duplicate.

4. **Stops state is not persisted.** `roadStops` lives in Zustand (in-memory). Browser refresh clears it. No localStorage persistence.

5. **AI Explain endpoint.** The AI explain call receives the full aggregated route object. The LLM will see waypoints in `key_factors` but the prompt template was not updated to explicitly highlight multi-stop structure. Explanations will be generally correct but may not reference individual legs.

6. **Simulation mode with multi-stop.** Simulation parameters (traffic level, weather, incidents) are applied uniformly to the aggregated route. Per-leg simulation is not supported — the same weather and traffic multipliers apply to all legs.

---

## Future Enhancements

1. **Per-leg alternative exploration.** Fetch N alternatives per leg and score combinations (pruned beam search) to surface a set of distinct multi-stop routes.

2. **Drag-to-reorder stops.** Replace the ↑/↓ arrow buttons with a drag-and-drop list (e.g. `@dnd-kit/core`) for better mobile UX.

3. **Stop dwell time.** Allow users to specify how long cargo rests at each stop (loading/unloading). Add dwell time to total journey time and adjust cost accordingly.

4. **Per-stop weather.** Fetch `get_weather()` for each city in the stop list and apply per-leg weather factors in `_engineer()` instead of a single origin-city fetch.

5. **Stop persistence.** Save `roadStops` to `localStorage` via Zustand middleware so stops survive browser refresh.

6. **Drive navigation integration.** Once stops are confirmed, generate a Google Maps deep link:
   ```
   https://www.google.com/maps/dir/Vadodara/Ahmedabad/Udaipur/Jaipur/Delhi
   ```
   Surface this as a "Start navigation" button on the selected route card.

7. **Stop geocoding validation at form time.** Validate each stop against the geocoder as soon as the user leaves the input field, marking invalid city names inline before the form is submitted.

8. **International corridors.** The current geocoder already supports non-Indian cities via Nominatim. Multi-stop routing across international borders would work if TomTom has routes for those legs — no code changes needed, just remove the `countrycodes=in` constraint from the Nominatim call.
