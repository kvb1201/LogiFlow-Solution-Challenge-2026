# Live Signal Refresh Upgrade

## Architecture

Route Health now evaluates CURRENT conditions. The evaluation sequence is:

```
evaluate_route_health(report, location)
  ↓
Resolve Current Location (automatic / manual)
  ↓
refresh_condition_signals(current_location → destination)   ← NEW
  ↓ live TomTom + live Weather + fresh ML
build_condition_snapshot(live_signals > stored > heuristic)  ← UPGRADED
  ↓
compute_health_from_snapshot()
  ↓
build_snapshot_breakdown()
  ↓
append_condition_history()                                   ← includes freshness
  ↓
RouteHealthResponse (signal_freshness, signals_refreshed_at) ← NEW fields
```

Shipment state (current_location, route_intelligence, progression) is unchanged.

---

## Phase 1 — LiveSignals dataclass

```python
@dataclass
class LiveSignals:
    traffic_level:         Optional[float]   # 0–1 live TomTom
    traffic_delay_hr:      Optional[float]
    traffic_distance_km:   Optional[float]
    temperature:           Optional[float]   # live OpenWeather
    precipitation:         Optional[float]
    weather_condition:     Optional[str]
    predicted_delay_hours: Optional[float]   # fresh ML prediction
    refreshed_at:          Optional[str]     # ISO timestamp
    traffic_freshness:     str               # "live"|"fallback"|"unavailable"
    weather_freshness:     str               # "live"|"unavailable"
    delay_freshness:       str               # "live"|"heuristic"|"unavailable"
```

---

## Phase 2 — Fresh TomTom Traffic

`refresh_condition_signals` calls `route_provider.get_routes(current_location, destination)` — the same function used by the planning pipeline. No new routing code.

```python
routes = get_routes(current_location, destination, payload={}, context=context)
live.traffic_level    = routes[0]["traffic_level"]
live.traffic_delay_hr = routes[0]["traffic_delay_hr"]
live.traffic_freshness = "live" if not is_fallback_route else "fallback"
```

Only runs for `road` and `hybrid` modes.

---

## Phase 3 — Fresh Weather

Calls `get_weather(current_location)` (OpenWeather API), keyed on `current_location` (not source). Only makes the API call if `OPENWEATHER_API_KEY` is present.

```python
weather = get_weather(current_location)
live.temperature       = weather["temp"]
live.precipitation     = weather["rain"]
live.weather_condition = weather["condition"]
live.weather_freshness = "live"
```

---

## Phase 4 — Fresh ML Delay

Re-runs `predict_delay()` with fresh `traffic_level` and weather:

```python
adjusted_time, _, _ = predict_delay(
    base_time_hours=route_km / speed_kmh,
    weather={"temp": live.temperature, "rain": live.precipitation, ...},
    traffic_level=live.traffic_level,
)
live.predicted_delay_hours = adjusted_time - base_time_hr
live.delay_freshness = "live" if we had real inputs else "heuristic"
```

---

## Phase 5 — Signal Priority in build_condition_snapshot

```
Priority 1: live_signals    (just fetched — seconds ago)
Priority 2: stored signals  (optimization_result.best from pipeline run)
Priority 3: heuristic       (deterministic city-hash fallback)
```

Each signal is resolved independently. Traffic can be live while weather is stored, etc.

---

## Phase 6 — Confidence from Freshness

```python
confidence = 15                                    # base: always
conf += {"live":35, "stored":20, "fallback":5}[traffic_freshness]
conf += {"live":25, "stored":15}[weather_freshness]
conf += {"live":25, "heuristic":12, "stored":12}[delay_freshness]
```

| Scenario | Confidence |
|---|---|
| All live signals | 100 |
| All stored signals | 62 |
| Fallback heuristics only | 15–27 |

---

## Phase 7 — Health Evaluation Sequence

When `GET /route-health` is called on an active trip with a known current location, the full sequence runs:

1. Resolve current_location (automatic progression / confirmed manual)
2. `refresh_condition_signals(current_location, destination)` — fetches live TomTom + weather + ML
3. `build_condition_snapshot(live_signals=live, optimization_result=opt)` — uses live first
4. `compute_health_from_snapshot()` — deterministic scoring from fresh data
5. `build_snapshot_breakdown()` — explainable per-factor breakdown with source
6. `append_condition_history()` — stores freshness metadata in history entry

Live refresh is skipped for: preview mode (explicit location passed), non-active trips, and trips at source (not yet moving).

---

## Phase 8 — Reoptimization upgrade

`build_reoptimization_v1` runs `_run_pipeline(current_location → destination)` which internally calls `route_provider.get_routes()` and `get_weather()` — the same live sources. The alternative route automatically benefits from live signals. The condition snapshot for comparison (`build_condition_snapshot`) will also use the freshest available data.

---

## Phase 9 — Signal Freshness UI

`SignalBadges` component updated:
- Shows per-signal freshness: `[Live Traffic]`, `[Stored Weather]`, `[Est. Delay]`
- Color coding: emerald = live, amber = stored, grey = fallback/unavailable
- Shows "refreshed Xs ago" timestamp when live signals are present

`ConditionHistoryPanel` updated:
- Each history row shows confidence% and a `Live` green badge when any live signal was present

---

## Phase 10 — History entries include freshness

```json
{
  "evaluated_at": "2026-06-10T12:00:00",
  "health_score": 71,
  "health_level": "moderate",
  "confidence_score": 100,
  "signal_freshness": {
    "traffic": "live",
    "weather": "live",
    "delay": "live"
  },
  "signals_refreshed_at": "2026-06-10T12:00:00"
}
```

No new database tables. Stored inside `optimization_result.condition_history`.

---

## Files Modified / Created

| File | Change |
|---|---|
| `backend/app/services/live_signal_refresh.py` | **New** — `LiveSignals`, `refresh_condition_signals()` |
| `backend/app/services/condition_snapshot.py` | Added `signal_freshness`, `signals_refreshed_at` to `ConditionSnapshot`; rewrote `build_condition_snapshot` with `live_signals` param + priority chain; added `_compute_confidence_from_freshness()` |
| `backend/app/services/condition_history.py` | History entries now include `confidence_score`, `signal_freshness`, `signals_refreshed_at` |
| `backend/app/services/trip_progress.py` | Added live refresh call before snapshot build; added `signal_freshness` and `signals_refreshed_at` to response |
| `frontend/src/services/plannerApi.ts` | Updated `condition_profile` type with freshness fields; added `signal_freshness`, `signals_refreshed_at` to `RouteHealthResponse`; updated `condition_history` entry type |
| `frontend/src/components/planner/RouteHealthCard.tsx` | `SignalBadges` redesigned for freshness display; `ConditionHistoryPanel` shows confidence + live badge |

---

## Validation Results

| Scenario | Expected | Result |
|---|---|---|
| A — Live traffic=0.70 overrides stored=0.15 | health drops from 94→71 | ✅ |
| B — Weather from live OpenWeather | weather_freshness="live" | ✅ (when API key present) |
| C — No live TomTom, stored signals used | traffic_freshness="stored", confidence=72 | ✅ |
| D — No signals at all → heuristics | confidence=15 | ✅ |
| E — Live all three → confidence=100 | confidence=100 | ✅ |
| F — Confidence grades: live > stored > fallback | 100 > 62 > 27 | ✅ |
| G — Shipment tracking (progress/ETA/backtrack) unchanged | bharuch=47.2% correct | ✅ |
| signal_freshness() method on LiveSignals | correct dict | ✅ |
| to_dict() includes signal_freshness + refreshed_at | present | ✅ |
| `npx tsc --noEmit` | 0 errors | ✅ |
| `npm run build` | 16/16 pages | ✅ |
| Backend `py_compile` | all OK | ✅ |
