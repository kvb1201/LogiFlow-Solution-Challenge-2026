# Condition Intelligence V1

## Architecture

Condition Intelligence is a pure computation layer — no new database tables, no new API endpoints. It enriches the existing `evaluate_route_health` response with five deterministic condition scores, a health breakdown, and a rolling history stored inside `optimization_result`.

```
evaluate_route_health(report, location)
  ↓
compute_health_score(...)               ← existing, unchanged
  ↓
build_condition_profile(...)            ← NEW: 5 deterministic scores
  ↓
build_health_breakdown(...)             ← NEW: explains each factor
  ↓
append_condition_history(...)           ← NEW: rolling history in optimization_result
  ↓
RouteHealthResponse (extended)
```

---

## Phase 1 — ConditionProfile

```python
@dataclass
class ConditionProfile:
    traffic_score:          float   # 0–100
    weather_score:          float   # 0–100
    congestion_score:       float   # 0–100
    route_adherence_score:  float   # 0–100
    eta_variance_score:     float   # 0–100
    traffic_delay_minutes:  int
    weather_delay_minutes:  int
    traffic_explanation:    str
    weather_explanation:    str
    congestion_explanation: str
    adherence_explanation:  str
    eta_explanation:        str
```

Serialised to dict via `.to_dict()` for the API response.

---

## Phase 2 — Traffic Intelligence (deterministic)

**Function:** `build_traffic_condition(route_km, stop_count, mode, source, destination)`

**Inputs and weights:**

| Input | Contribution |
|---|---|
| Mode baseline (`road=25%, air=2%`) | Fixed per mode |
| Route length | `min(km, 1000) / 100 × per_km_rate` |
| Stop count | `min(stops, 10) × 4%` per stop |
| City density hash | `_city_density_factor(src, dst) × 15%` |

**City density factor** — deterministic proxy using `sum(ord(c) for c in combined) % 97 / 96`. Same city pair always produces the same value.

**Output:** `traffic_score = 100 × (1 − total_congestion)`, `traffic_delay_minutes` estimated from baseline travel time × congestion × 0.3.

---

## Phase 3 — Weather Intelligence (deterministic)

**Function:** `build_weather_condition(route_km, mode, source, destination)`

**Inputs:**
- Mode susceptibility (`road=0.30`, `air=0.20`, etc.)
- Geographic keyword detection: mountain/hill station cities → +0.30, monsoon/coastal cities → +0.15
- Latitude hash: `sum(ord(c) for c in source) % 50 / 50 × 0.10`

**Output:** `weather_score = 100 × (1 − weather_impact)`, delay estimated from `route_km / speed × weather_impact × 0.2`.

---

## Phase 4 — Route Adherence Score

**Function:** `build_adherence_score(corridor_status, deviation_km)`

| Status | Score | Notes |
|---|---|---|
| ON_ROUTE | 100 | No deviation |
| NEAR_ROUTE | 70 − deviation_km/2 | Floor at 40 |
| OFF_ROUTE | 20 − deviation_km/10 | Floor at 0 |

Smooth continuous penalty — not a binary step.

---

## Phase 5 — ETA Variance Score

**Function:** `build_eta_variance_score(overdue_minutes, eta_gap_minutes)`

```
total_gap = max(0, overdue_minutes) + max(0, eta_gap_minutes)
score     = max(0, 100 - total_gap / 2)
```

Perfect on-time = 100. Each minute of gap costs 0.5 points.

---

## Phase 5 — Health Breakdown (Explainable)

**Function:** `build_health_breakdown(adherence_pts, eta_pts, traffic_pts, weather_pts, risk_pts, condition_profile)`

Returns a dict with one entry per scoring factor:
```json
{
  "adherence": { "points": 40.0, "max": 40, "delta": 0, "why": "On route — no deviation detected." },
  "eta":       { "points": 20.0, "max": 25, "delta": -5, "why": "Minor variance. Projected 10m behind schedule." },
  "traffic":   { "points": 4.0,  "max": 5,  "delta": -1, "why": "Moderate traffic on this corridor." },
  "weather":   { "points": 5.0,  "max": 5,  "delta": 0,  "why": "Favourable weather conditions." },
  "risk":      { "points": 18.0, "max": 25, "delta": -7, "why": "Risk score 28%." },
  "summary":   "Biggest drag: risk (−7 pts). ..."
}
```

The `summary` string identifies the largest single point loss and explains it.

---

## Phase 6 — Condition History

**Storage:** `optimization_result.condition_history` — a rolling list of up to 20 entries.

```json
{
  "evaluated_at": "2026-06-09T12:30:00",
  "health_score": 84,
  "health_level": "healthy",
  "traffic_score": 54,
  "weather_score": 96,
  "congestion_score": 63,
  "route_adherence_score": 100,
  "eta_variance_score": 92
}
```

**No new table** — fits within the existing `optimization_result` JSON column.

History is appended on every non-preview `GET /route-health` call. The `planner_routes.py` `get_route_health` handler now calls `db.commit()` + `db.refresh(report)` after `evaluate_route_health` to persist the appended history entry.

History is **not** written for preview evaluations (`actual_location_name` supplied) to avoid flooding with ephemeral location selections.

---

## Determinism Guarantee

All five condition scores are pure functions of their inputs:

- Traffic: uses city name character ordinal sum modulo a prime — same city pair, same result, always
- Weather: uses keyword detection + same hash function
- Adherence: direct formula from corridor_status + deviation_km
- ETA variance: direct formula from overdue + gap
- No `random`, `datetime.now()`, or any stochastic element in the scoring path

---

## API Response Extensions

`RouteHealthResponse` extended with three new fields:

```ts
condition_profile: {
  traffic_score, weather_score, congestion_score,
  route_adherence_score, eta_variance_score,
  traffic_delay_minutes, weather_delay_minutes,
  explanations: { traffic, weather, congestion, adherence, eta }
} | null

health_breakdown: {
  adherence: { points, max, delta, why },
  eta:       { points, max, delta, why },
  traffic:   { points, max, delta, why },
  weather:   { points, max, delta, why },
  risk:      { points, max, delta, why },
  summary: string
} | null

condition_history: Array<{
  evaluated_at, health_score, health_level,
  traffic_score, weather_score, congestion_score,
  route_adherence_score, eta_variance_score
}>
```

---

## UI Components

**`HealthBreakdownPanel`** — collapsible "Why this score?" section. Shows a horizontal progress bar and explanation for each factor. Highlights the factor with the biggest point loss. Displays traffic and weather delay estimates.

**`ConditionHistoryPanel`** — collapsible "Recent Route Health" section. Shows score, level badge, and T:/W: abbreviations for the last 10 entries. Newest first.

Both panels are inserted between the Reoptimization results and the footer in `RouteHealthCard.tsx`.

---

## Files Modified / Created

| File | Change |
|---|---|
| `backend/app/services/condition_intelligence.py` | **New** — `ConditionProfile`, all 5 scoring functions, `build_condition_profile`, `build_health_breakdown` |
| `backend/app/services/condition_history.py` | **New** — `append_condition_history`, `get_condition_history` |
| `backend/app/services/trip_progress.py` | Extended `evaluate_route_health` to build condition profile, breakdown, history |
| `backend/app/routes/planner_routes.py` | Added `db.commit()` + `db.refresh()` after health evaluation |
| `frontend/src/services/plannerApi.ts` | Extended `RouteHealthResponse` with `condition_profile`, `health_breakdown`, `condition_history` |
| `frontend/src/components/planner/RouteHealthCard.tsx` | Added `HealthBreakdownPanel`, `ConditionHistoryPanel`, imported `RouteHealthResponse` type |

---

## Validation Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ 16/16 pages |
| Backend `py_compile` | ✅ All files OK |
| Determinism: 3 identical calls → identical scores | ✅ |
| All scores in 0–100 | ✅ traffic=54, weather=96, adherence=100, eta=92.5 |
| ON_ROUTE=100, NEAR_ROUTE<ON, OFF_ROUTE<NEAR | ✅ 100 / 57.5 / 12.0 |
| ETA: on-time=100, 20m delay=90, 60m overdue=70 | ✅ |
| Health breakdown has `points`, `max`, `delta`, `why` per factor | ✅ |
| History capped at 20 entries (rolling) | ✅ 25 insertions → 20 stored |
| History stored newest-first | ✅ |
| Preview evaluations do not write history | ✅ gated on `actual_location_name` |
| Different routes produce different scores | ✅ Surat→Vadodara=62 vs Delhi→Mumbai=54 |
