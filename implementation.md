# Real-Time Condition Intelligence Upgrade

## Architecture

The upgrade replaces synthetic heuristic signals with real signals from the pipeline wherever available, using graceful fallback to the existing deterministic heuristics.

```
optimization_result.best
  ├── traffic_level      (TomTom)          ─┐
  ├── traffic_factor     (TomTom/ML)        ├── Phase 2 Traffic
  ├── predicted_delay    (ML model)         ─── Phase 4 Delay
  └── weather{}          (OpenWeather)      ─── Phase 3 Weather
         ├── temp
         ├── rain
         └── condition

        ↓ condition_snapshot.py
ConditionSnapshot
  ├── traffic_score      0-100
  ├── weather_score      0-100
  ├── delay_score        0-100
  ├── route_adherence_score 0-100
  ├── eta_variance_score 0-100
  ├── confidence_score   0-100
  └── signal_sources     ["tomtom","weather_api","ml_delay_model"]

        ↓ compute_health_from_snapshot()
health_score + health_level

        ↓ build_snapshot_breakdown()
health_breakdown (per-factor with source attribution)
```

---

## Phase 1 — ConditionSnapshot

```python
@dataclass
class ConditionSnapshot:
    # Real signal values
    traffic_level:          Optional[float]   # 0–1 from TomTom
    traffic_delay_minutes:  int
    predicted_delay_hours:  Optional[float]   # ML model
    temperature:            Optional[float]   # °C
    precipitation:          Optional[float]   # mm/h
    visibility:             Optional[float]   # km
    weather_condition:      Optional[str]     # "Rain", "Clear", etc.

    # Computed 0–100 scores
    traffic_score, weather_score, delay_score,
    route_adherence_score, eta_variance_score

    # Confidence + provenance
    confidence_score: int          # 0–100
    signal_sources:   list[str]   # ["tomtom", "weather_api", "ml_delay_model"]

    # Per-factor human-readable explanations
    traffic_explanation, weather_explanation, delay_explanation,
    adherence_explanation, eta_explanation
```

---

## Phase 2 — Traffic Score from TomTom

**Signal:** `optimization_result.best.traffic_level` (0–1) or `traffic_factor` (≥1 multiplier)

**Formula (traffic_level path):**
```python
speed_kmh = max(5, 55 * (1 - traffic_level * 0.8))
delay_min = (route_km / speed_kmh - route_km / 55) * 60
traffic_score = max(0, 100 * (1 - traffic_level))
```

**Fallback:** deterministic city-density hash from V1 when no TomTom data.

**Source attribution:** `"tomtom"` added to `signal_sources` when real data used.

**Validated:** `traffic_level=0.68` → `traffic_score=32` (severe congestion).

---

## Phase 3 — Weather Score from OpenWeather

**Signal priority:**
1. `optimization_result.best.weather` — pipeline-cached, most reliable (marked as real signal)
2. Live OpenWeather API call (only if API key present in env)
3. Heuristic fallback (no signal_sources entry)

**Score formula:**
```python
impact = rain_mm/10 * 0.40 + visibility_penalty + temp_extreme_penalty
# Storm override: min impact = 0.50
weather_score = max(0, 100 * (1 - impact * mode_susceptibility))
```

**Validated:** `rain=8.5mm/h, condition="Rain"` → `weather_score=56`.

---

## Phase 4 — ML Delay Score

**Signal:** `optimization_result.best.predicted_delay` (hours)

**Formula:**
```python
delay_score = max(0, 100 - predicted_delay_hours * 20)
# 0h→100, 1h→80, 2h→60, 3h→40, 4h→20, 5h+→0
```

**Fallback:** proxy derived from `traffic_score * 0.6 + weather_score * 0.4`.

**Validated:** `predicted_delay=1.8h` → `delay_score=64`.

---

## Phase 5 — Confidence Score

```
Base (route + progress always available): +15
TomTom traffic signal:                    +35
Pipeline-cached weather (real):           +25
ML delay prediction:                      +25
Total possible:                           100
```

Key distinction: `weather_api` is only added to sources when weather came through the optimization pipeline (cached in `best.weather`) — not from a fallback heuristic. This prevents phantom confidence inflation when no pipeline has run.

**Validated:**
- All 3 real signals → confidence = 100
- No optimization_result (no pipeline) → confidence = 15 (base only)

---

## Phase 6 — Health Engine Upgrade

**New weights** (designed for real signal dominance):

| Factor | Weight | Reason |
|---|---|---|
| Traffic | 35% | TomTom data is the most reliable real-time signal |
| Weather | 20% | OpenWeather gives direct impact |
| ML Delay | 20% | Predicted delay is the most outcome-relevant signal |
| Route Adherence | 15% | Corridor status already captured; reduced from 40% |
| ETA Variance | 10% | Schedule slip; reduced from 25% |

```python
health_score = round(
    traffic_score * 0.35 +
    weather_score * 0.20 +
    delay_score   * 0.20 +
    adherence     * 0.15 +
    eta_variance  * 0.10
)
```

**Validated:** all 100 → health 100; heavy traffic (0.80) → 62, light (0.05) → 98.

---

## Phase 7 — Explainable Breakdown

Each factor in `health_breakdown` now includes a `source` field:

```json
{
  "traffic":  { "points": 11.2, "max": 35, "delta": -24, "why": "Severe traffic (TomTom 68%)", "source": "TomTom" },
  "weather":  { "points": 19.8, "max": 20, "delta": 0,   "why": "Favourable weather", "source": "Weather API" },
  "delay":    { "points": 12.8, "max": 20, "delta": -7,  "why": "1.8h predicted by ML model", "source": "ML model" },
  "adherence":{ "points": 15.0, "max": 15, "delta": 0,   "why": "On route", "source": "corridor" },
  "eta":      { "points": 10.0, "max": 10, "delta": 0,   "why": "On schedule", "source": "schedule" },
  "summary":  "Biggest drag: traffic (−24 pts). Severe traffic (TomTom 68%)."
}
```

---

## Phase 8 — Condition History Upgrade

History entries now include `delay_score` via `condition_profile_dict` which contains the full snapshot. The `signal_sources` field is also stored alongside each entry.

---

## Phase 9 — Reoptimization Integration

`build_reoptimization_v1` evaluates the alternative route using `_run_pipeline`, which produces fresh `traffic_level`, `predicted_delay`, and `weather` fields. The condition snapshot for the alternative route will therefore automatically reflect real signals when the pipeline produces them.

---

## Phase 10 & 11 — Comparison and Recommendation

The `recommend_switch` logic in `_should_recommend_switch` operates on the improvement between current route metrics and alternative metrics. Because the alternative route's metrics now come from real pipeline signals (not heuristics), the recommendation changes when traffic/weather genuinely improve on the alternative.

---

## Signal Source Badges (UI)

Added `SignalBadges` component to `RouteHealthCard.tsx`:
- `[TomTom]` — blue badge when `traffic_level` from TomTom is available
- `[Weather API]` — sky badge when pipeline-cached weather is available
- `[ML Delay]` — violet badge when ML predicted_delay is available

Badges appear below the health score in the header row.

---

## Files Modified / Created

| File | Change |
|---|---|
| `backend/app/services/condition_snapshot.py` | **New** — `ConditionSnapshot`, all real-signal extractors, confidence scoring, health engine, breakdown |
| `backend/app/services/trip_progress.py` | Replaced V1 `build_condition_profile` call with `build_condition_snapshot`; added `signal_sources` to response |
| `frontend/src/services/plannerApi.ts` | Upgraded `condition_profile` type to `ConditionSnapshot` fields; added `signal_sources`, `delay_score`; updated `health_breakdown` with `delay` factor and `source` |
| `frontend/src/components/planner/RouteHealthCard.tsx` | Added `SignalBadges` component; updated `HealthBreakdownPanel` factors to include `delay`; real-data fields displayed in condition detail |

---

## Validation Results

| Scenario | Signal | Expected | Result |
|---|---|---|---|
| A — TomTom available | `traffic_level=0.68` | `traffic_score<50`, sources includes tomtom | ✅ score=32 |
| B — Weather API (cached) | `rain=8.5mm/h` | `weather_score<80`, sources includes weather_api | ✅ score=56 |
| C — ML delay | `predicted_delay=1.8h` | `delay_score<70`, sources includes ml_delay_model | ✅ score=64 |
| D — All signals | all 3 present | confidence ≥ 90 | ✅ confidence=100 |
| E — No pipeline | `opt=None` | confidence=15, no real sources | ✅ confidence=15, sources=[] |
| F — Determinism | same inputs twice | identical health scores | ✅ health=88 both |
| G — Heavy vs light traffic | `0.80` vs `0.05` | heavy < light | ✅ 62 vs 98 |
| Weights | all scores=100 | health=100 | ✅ |
| Breakdown structure | 5 factors + source | all keys present | ✅ |
| `npx tsc --noEmit` | — | 0 errors | ✅ |
| `npm run build` | — | 16/16 pages | ✅ |
| Backend `py_compile` | — | all files OK | ✅ |
