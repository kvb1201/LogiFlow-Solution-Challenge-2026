# Water Pipeline Expansion Plan

> **Status (June 2026):** The target architecture below has been **largely implemented**. The production pipeline uses ~350 PortWatch ports, chokepoint stress, marine weather, trained ML models (`water_delay_model.pkl`, `water_eta_model.pkl`), and PortWatch disruption data. See [docs/pipelines/water.md](../../../docs/pipelines/water.md) for the current production doc.

## Original plan: current state vs target

| Component | Current | Target |
|---|---|---|
| Port database | 27 hand-crafted ports in `config.py` | ~350 global ports from `Ports.csv` (vessel_count > 500) |
| Congestion | Static `base_congestion` float | Rolling index from `Daily_Ports_Data.csv` |
| Weather risk | Calendar monsoon hack (`if month in {6,7,8,9}`) | Marine API wave height + Forecast API wind at runtime |
| Chokepoints | Not modelled | `Daily_Chokepoints_Data.csv` stress index on all 28 |
| Disruptions | Not modelled | `portwatch_disruptions_database.csv` event scoring |
| Transit time | Haversine / vessel speed estimate | Spillover `average_transit_days` observed data + ML model |
| ML model | Heuristic stubs only | GradientBoosting trained on ERA5 + PortWatch data |

---

## Data sources

| File | Location | Used for |
|---|---|---|
| `Ports.csv` | `backend/data/water/` | Rebuild `config.py` PORTS list — global ~350 ports |
| `PortWatch_chokepoints_database.csv` | `backend/data/water/` | `CHOKEPOINTS` dict in config, chokepoint risk component |
| `Daily_Ports_Data.csv` | `backend/data/water/` | Pre-aggregate `PORT_CONGESTION_INDEX` at startup |
| `Daily_Chokepoints_Data.csv` | `backend/data/water/` | `CHOKEPOINT_STRESS` index at startup |
| `portwatch_disruptions_database.csv` | `backend/data/water/` | `DISRUPTIONS_BY_PORT` dict, disruption risk score |
| `Spillover_simulator_port-level_impact.csv` | `backend/data/water/` | `SPILLOVER_TRANSIT_DAYS` dict — real observed transit days |
| `Spillover_simulator_country-level_impact.csv` | `backend/data/water/` | Offline only — cargo value-at-risk calibration |
| `Spillover_simulator_supply-chain_impact.csv` | `backend/data/water/` | Offline only — too large for runtime (576MB) |
| Marine Weather API | open-meteo.com | Runtime wave height, wave period, ocean current per port |
| Forecast API | open-meteo.com | Runtime wind + precipitation for departure date |
| Historical Weather API (ERA5) | open-meteo.com | Offline ML training dataset only |

API docs saved in: `backend/app/pipelines/water/OPENMETEO_API_REFERENCE.md`

---

## Phase 1 — Data Loader + Rebuilt Config

### New file: `water/data_loader.py`
Loads all PortWatch CSVs once at import time into fast in-memory dicts:

```
PORTWATCH_PORTS          dict[portid → PortMeta]
PORTWATCH_CHOKEPOINTS    dict[portid → ChokepointMeta]
DISRUPTIONS_BY_PORT      dict[portid → list[Event]]
SPILLOVER_TRANSIT_DAYS   dict[(from_portid, to_portid) → float days]
PORT_CONGESTION_INDEX    dict[portid → float 0-1]    (pre-aggregated from Daily_Ports_Data)
CHOKEPOINT_STRESS        dict[portid → float 0-1]    (from Daily_Chokepoints_Data)
```

Port filter: `vessel_count_total > 500` → ~350 global ports.
All ports currently in `SEA_LANES` included regardless of vessel count.

`infrastructure_quality` derivation:
```
container_ratio = vessel_count_container / vessel_count_total
quality = 0.65 + 0.33 * container_ratio   (maps to 0.65–0.98 range)
```

New fields added to each port: `import_share`, `LOCODE`, `vessel_count_total`,
`vessel_count_container`, `vessel_count_tanker`.

`PORT_CONGESTION_INDEX` computation:
```
rolling_30d = mean portcalls over last 30 days from Daily_Ports_Data
baseline    = mean portcalls over 2019–2023 full year
index       = clamp(rolling_30d / baseline, 0.1, 1.0)
```

`CHOKEPOINT_STRESS` computation:
```
recent_7d   = mean n_total transits over last 7 days from Daily_Chokepoints_Data
baseline    = mean n_total over full dataset period
stress      = clamp(1 - (recent_7d / baseline), 0.0, 1.0)
             (high stress = fewer ships transiting = disruption/rerouting)
```

### Updated `water/config.py`
- `PORTS` list generated from `data_loader.py` — global ~350 ports
- New ports added to `SEA_LANES`:
  Krishnapatnam, Hazira, Pipavav, Dahej, Dhamra, Kakinada, Kattupalli (India)
  Colombo (Sri Lanka), Aden (Yemen), Sohar (Oman), Durban (South Africa),
  Colombo, Tanjung Pelepas (Malaysia), Port Klang expansion
- New `CHOKEPOINTS` dict from `PortWatch_chokepoints_database.csv` — all 28
- New `ROUTE_CHOKEPOINTS` — maps sea lane pairs to transited chokepoints:
  ```python
  ("jnpt", "jebel_ali"):   ["chokepoint6"],           # Hormuz
  ("jebel_ali", "port_said"): ["chokepoint4", "chokepoint1"],  # Bab-el-Mandeb + Suez
  ("chennai", "singapore"): ["chokepoint5"],            # Malacca
  ("kochi", "singapore"):   ["chokepoint5"],            # Malacca
  ("port_said", "rotterdam"): ["chokepoint8"],          # Gibraltar
  ("singapore", "shanghai"): ["chokepoint11"],          # Taiwan Strait
  ```

---

## Phase 2 — Replace Stubs with Real Data

### Updated `water/ml_models.py`

**`predict_port_congestion(port_id)`** (replaces static lookup):
```python
from water.data_loader import PORT_CONGESTION_INDEX
return PORT_CONGESTION_INDEX.get(port_id, 0.4)
```

**New `predict_chokepoint_stress(chokepoint_ids: list[str]) → float`**:
```python
from water.data_loader import CHOKEPOINT_STRESS
stresses = [CHOKEPOINT_STRESS.get(cid, 0.0) for cid in chokepoint_ids]
return max(stresses) if stresses else 0.0
```

**Updated `predict_eta_adjustment(...)`**:
- Accepts `from_portid`, `to_portid`, `chokepoint_ids`
- Checks `SPILLOVER_TRANSIT_DAYS` for observed real transit time
- Multiplies by chokepoint stress index
- Falls back to haversine / `VESSEL_SPEED_KNOTS` if pair not in data
- Returns `(eta_multiplier, expected_delay_hours, transit_days_source)`

### New `water/marine_weather_service.py`

Two runtime functions:

**`get_port_marine_conditions(lat, lon) → MarineConditions`**
- Calls Marine API: `wave_height`, `wind_wave_height`, `swell_wave_height`,
  `wave_period`, `ocean_current_velocity`, `sea_surface_temperature`
- Returns 7-day max aggregates
- Cached 1 hour per coordinate
- `cell_selection=sea`

**`get_departure_wind_conditions(lat, lon, departure_date) → WindConditions`**
- Calls Forecast API: `wind_speed_10m`, `wind_gusts_10m`, `precipitation`,
  `precipitation_probability`, `weather_code`, `pressure_msl`
- Returns conditions for the departure date window
- Storm flag: `weather_code in {95, 96, 99}`
- `wind_speed_unit=kn`, `cell_selection=sea`

Risk conversion:
```python
def wave_height_to_risk(wave_height_m: float) -> float:
    if wave_height_m < 1.0:  return 0.10   # calm
    if wave_height_m < 2.5:  return 0.30   # moderate
    if wave_height_m < 4.0:  return 0.60   # rough
    return 0.90                              # very rough / storm

def wind_to_risk(wind_knots: float, storm_flag: bool) -> float:
    base = min(wind_knots / 64.0, 1.0)     # Beaufort 12 ≈ 64kn
    return min(base + (0.3 if storm_flag else 0.0), 1.0)
```

---

## Phase 3 — Disruption-Aware Risk

### Updated `water/engineer.py`

**New `disruption_risk_score(port_ids: list[str]) → float`**:
```python
severity_weights = {"RED": 0.15, "ORANGE": 0.08, "GREEN": 0.03}
recency_multiplier = 1.5   # events < 1 year old
lookback_years = 5

score = 0.0
for port_id in port_ids:
    events = DISRUPTIONS_BY_PORT.get(port_id, [])
    for event in events:
        if event.year >= current_year - lookback_years:
            w = severity_weights.get(event.alertlevel, 0.03)
            if event.year >= current_year - 1:
                w *= recency_multiplier
            score += w
return clamp(score / max(len(port_ids), 1), 0.0, 1.0)
```

**Updated `risk_breakdown`** (6 components):
```python
risk_breakdown = {
    "weather":       weather_risk,       # Marine API wave height
    "congestion":    congestion_risk,    # PORT_CONGESTION_INDEX
    "security":      security_risk,      # unchanged (port meta)
    "transshipment": trans_risk,         # unchanged
    "chokepoint":    chokepoint_risk,    # CHOKEPOINT_STRESS
    "disruption":    disruption_risk,    # disruptions DB
}
```

**Updated `RISK_WEIGHTS`**:
```python
RISK_WEIGHTS = {
    "weather":       0.25,
    "congestion":    0.20,
    "security":      0.20,
    "transshipment": 0.10,
    "chokepoint":    0.15,
    "disruption":    0.10,
}
```

**Time estimate improvement**:
```python
transit_days = SPILLOVER_TRANSIT_DAYS.get((origin_port, dest_port))
if transit_days:
    sea_hr = transit_days * 24
    transit_days_source = "observed"
else:
    sea_hr = sea_nm / VESSEL_SPEED_KNOTS
    transit_days_source = "estimated"
```

**New output fields on every route**:
- `transit_days_source`: `"observed"` or `"estimated"`
- `chokepoints_transited`: list of chokepoint names on path
- `active_disruptions`: list of recent events affecting ports on path
- `marine_conditions`: `{wave_height_m, wind_speed_kn, storm_flag}`

---

## Phase 4 — ML Delay Model

### New `water/delay_dataset.py`
Builds training dataset joining:
1. `Daily_Ports_Data.csv` — portcall variance as congestion/delay proxy
2. `Daily_Chokepoints_Data.csv` — chokepoint stress on matching dates
3. ERA5 Historical API — wind + precipitation at port coords for same dates
4. `portwatch_disruptions_database.csv` — binary disruption flag per port per date

Target variable:
```
delay_hours = (portcall_variance / baseline_portcalls) * base_voyage_hours * 0.12
```

Feature set per training row:
```
sea_distance_nm          transshipments           month
origin_vessel_count      dest_vessel_count
origin_congestion_index  dest_congestion_index
chokepoint_stress_max    wave_height_m
wind_speed_kn            storm_flag
precipitation_mm         has_disruption
disruption_severity      infrastructure_quality_avg
cross_region_flag
```

~80k rows covering 2019–2023 across all major global port pairs.

### New `water/train_model.py`
```python
from sklearn.ensemble import GradientBoostingRegressor
model = GradientBoostingRegressor(n_estimators=200, max_depth=5, learning_rate=0.05)
model.fit(X_train, y_train)
# Outputs:
#   models/water_delay_model.pkl
#   models/water_eta_model.pkl
```

### Updated `water/ml_models.py`
`predict_eta_adjustment()` loads trained pkl, runs inference instead of heuristic.

---

## Final file structure

```
backend/app/pipelines/water/
├── config.py                        ← rebuilt: ~350 global ports + chokepoints
├── data_loader.py                   ← NEW: loads all PortWatch CSVs
├── marine_weather_service.py        ← NEW: Marine API + Forecast API
├── engineer.py                      ← updated: 6-component risk, real transit times
├── ml_models.py                     ← updated: real congestion + chokepoint + ML
├── ports.py                         ← minor: new fields
├── route_generator.py               ← updated: chokepoint annotation on paths
├── pipeline.py                      ← unchanged
├── delay_dataset.py                 ← NEW: build ML training data
├── train_model.py                   ← NEW: train GradientBoosting model
├── models/
│   ├── water_delay_model.pkl        ← NEW (after training)
│   └── water_eta_model.pkl          ← NEW (after training)
├── PIPELINE_PLAN.md                 ← this file
└── OPENMETEO_API_REFERENCE.md       ← API docs

backend/data/water/
├── Ports.csv
├── PortWatch_chokepoints_database.csv
├── Daily_Ports_Data.csv
├── Daily_Chokepoints_Data.csv
├── portwatch_disruptions_database.csv
├── Spillover_simulator_port-level_impact.csv
├── Spillover_simulator_country-level_impact.csv  (offline only)
└── Spillover_simulator_supply-chain_impact.csv   (offline only)
```

---

## Implementation order

1. `data_loader.py` — everything depends on this
2. `config.py` rebuild — new ports, chokepoints, expanded sea lanes
3. `marine_weather_service.py` — replaces worst hack immediately
4. `ml_models.py` congestion + chokepoint functions — replaces stubs
5. `engineer.py` updates — wires all new components together
6. `route_generator.py` — add chokepoint annotation to paths
7. `delay_dataset.py` + `train_model.py` — build + train ML model
8. Update `ml_models.py` to load trained pkl

## Notes
- `Spillover_country-level` and `supply-chain` CSVs are 269MB and 576MB —
  never load at runtime. Use offline to validate risk scores and cost model.
- Marine API and Forecast API calls are cached 1 hour. ERA5 historical calls
  are cached indefinitely (`expire_after=-1`).
- All Open-Meteo calls use `cell_selection=sea` for port coordinates.
- Port filter `vessel_count_total > 500` gives ~350 global ports.
  Adjust threshold if route graph becomes too sparse or too dense.
