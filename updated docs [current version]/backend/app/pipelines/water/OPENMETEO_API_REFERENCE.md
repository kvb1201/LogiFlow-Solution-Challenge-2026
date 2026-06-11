# Open-Meteo API Reference — Water Pipeline

**Consumer:** `backend/app/pipelines/water/marine_weather_service.py`  
**Pipeline doc:** [docs/pipelines/water.md](../../../docs/pipelines/water.md)

## 1. Marine Weather API
**URL:** `https://marine-api.open-meteo.com/v1/marine`
**Use:** Runtime risk calculation — wave height, wind, ocean current per port coordinates

### Key parameters
- `latitude`, `longitude` — WGS84, comma-separated for multiple locations
- `hourly` — comma-separated variable list
- `daily` — daily aggregations
- `current` — current conditions snapshot
- `forecast_days` — 1–8 (default 5)
- `past_days` — 0–92
- `start_date`, `end_date` — ISO8601 yyyy-mm-dd
- `cell_selection=sea` — prefer sea grid cells (important for port coords)

### Variables we use (hourly)
| Variable | Unit | Purpose |
|---|---|---|
| `wave_height` | m | Primary weather risk input |
| `wind_wave_height` | m | Wind-driven wave component |
| `swell_wave_height` | m | Swell component |
| `wave_period` | seconds | Sea state severity |
| `wave_direction` | ° | Direction waves come from |
| `wind_wave_peak_period` | seconds | Peak period |
| `ocean_current_velocity` | km/h | Current speed affecting voyage |
| `ocean_current_direction` | ° | Current direction |
| `sea_surface_temperature` | °C | Corrosion/cargo risk proxy |

### Variables we use (daily aggregations)
| Variable | Unit | Purpose |
|---|---|---|
| `wave_height_max` | m | Worst-case daily wave |
| `wind_wave_height_max` | m | Wind wave worst case |
| `wave_period_max` | seconds | Worst-case period |

### Python usage pattern
```python
import openmeteo_requests
import pandas as pd
import requests_cache
from retry_requests import retry

cache_session = requests_cache.CachedSession('.cache', expire_after=3600)
retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
openmeteo = openmeteo_requests.Client(session=retry_session)

url = "https://marine-api.open-meteo.com/v1/marine"
params = {
    "latitude": 18.95,        # JNPT lat
    "longitude": 72.95,       # JNPT lon
    "hourly": [
        "wave_height",
        "wind_wave_height",
        "swell_wave_height",
        "wave_period",
        "ocean_current_velocity",
        "sea_surface_temperature",
    ],
    "daily": [
        "wave_height_max",
        "wave_period_max",
    ],
    "forecast_days": 7,
    "cell_selection": "sea",
}
responses = openmeteo.weather_api(url, params=params)
response = responses[0]

hourly = response.Hourly()
# Variables(index) order must match the hourly list above
wave_height         = hourly.Variables(0).ValuesAsNumpy()
wind_wave_height    = hourly.Variables(1).ValuesAsNumpy()
swell_wave_height   = hourly.Variables(2).ValuesAsNumpy()
wave_period         = hourly.Variables(3).ValuesAsNumpy()
ocean_current_vel   = hourly.Variables(4).ValuesAsNumpy()
sea_surface_temp    = hourly.Variables(5).ValuesAsNumpy()

dates = pd.date_range(
    start=pd.to_datetime(hourly.Time(), unit="s", utc=True),
    end=pd.to_datetime(hourly.TimeEnd(), unit="s", utc=True),
    freq=pd.Timedelta(seconds=hourly.Interval()),
    inclusive="left",
)
df = pd.DataFrame({
    "date": dates,
    "wave_height": wave_height,
    "wind_wave_height": wind_wave_height,
    "swell_wave_height": swell_wave_height,
    "wave_period": wave_period,
    "ocean_current_velocity": ocean_current_vel,
    "sea_surface_temperature": sea_surface_temp,
})
```

### Response JSON structure
```json
{
  "latitude": 18.95,
  "longitude": 72.95,
  "utc_offset_seconds": 0,
  "hourly": {
    "time": ["2024-01-01T00:00", "2024-01-01T01:00", ...],
    "wave_height": [1.2, 1.4, ...],
    "wind_wave_height": [0.8, 0.9, ...]
  },
  "hourly_units": { "wave_height": "m" }
}
```

### Risk mapping (how we convert to risk score 0–1)
```
wave_height < 1.0m  → sea_risk = 0.1  (calm)
wave_height 1–2.5m  → sea_risk = 0.3  (moderate)
wave_height 2.5–4m  → sea_risk = 0.6  (rough)
wave_height > 4m    → sea_risk = 0.9  (very rough)
ocean_current_velocity > 15 km/h → +0.1 bonus risk
```

---

## 2. Forecast API (wind + precipitation for departure date)
**URL:** `https://api.open-meteo.com/v1/forecast`
**Use:** Runtime — get wind speed and precipitation for a user's chosen departure date (up to 16 days ahead)

### Key parameters
- `latitude`, `longitude` — WGS84
- `hourly` — variable list
- `forecast_days` — 1–16
- `start_date`, `end_date` — ISO8601
- `cell_selection=sea` — use for port/ocean locations
- `wind_speed_unit=kn` — return in knots for maritime use

### Variables we use (hourly)
| Variable | Unit | Purpose |
|---|---|---|
| `wind_speed_10m` | km/h (or kn) | Port approach conditions |
| `wind_gusts_10m` | km/h | Extreme wind risk |
| `wind_direction_10m` | ° | Direction |
| `precipitation` | mm | Cargo damage risk |
| `precipitation_probability` | % | Probability |
| `weather_code` | WMO | Storm flag (95,96,99 = thunderstorm) |
| `pressure_msl` | hPa | Pressure system tracking |

### Python usage pattern
```python
url = "https://api.open-meteo.com/v1/forecast"
params = {
    "latitude": 18.95,
    "longitude": 72.95,
    "hourly": [
        "wind_speed_10m",
        "wind_gusts_10m",
        "wind_direction_10m",
        "precipitation",
        "precipitation_probability",
        "weather_code",
        "pressure_msl",
    ],
    "forecast_days": 16,
    "wind_speed_unit": "kn",
    "cell_selection": "sea",
}
responses = openmeteo.weather_api(url, params=params)
response = responses[0]

hourly = response.Hourly()
wind_speed   = hourly.Variables(0).ValuesAsNumpy()   # knots
wind_gusts   = hourly.Variables(1).ValuesAsNumpy()
wind_dir     = hourly.Variables(2).ValuesAsNumpy()
precip       = hourly.Variables(3).ValuesAsNumpy()
precip_prob  = hourly.Variables(4).ValuesAsNumpy()
weather_code = hourly.Variables(5).ValuesAsNumpy()
pressure     = hourly.Variables(6).ValuesAsNumpy()
```

### Storm detection from weather_code
```python
STORM_CODES = {95, 96, 99}   # thunderstorm codes
is_storm = int(weather_code) in STORM_CODES
```

---

## 3. Historical Weather API (ERA5 — ML training only)
**URL:** `https://archive-api.open-meteo.com/v1/archive`
**Use:** OFFLINE ONLY — build training dataset for water delay ML model
**Note:** `expire_after=-1` (never expire — historical data doesn't change)

### Key parameters
- `latitude`, `longitude` — WGS84
- `start_date`, `end_date` — ISO8601, required (ERA5 from 1940)
- `hourly` — variable list
- `cell_selection=sea`
- `models=era5` — explicitly use ERA5 for consistency

### Variables we use (hourly)
| Variable | Unit | Purpose in training |
|---|---|---|
| `wind_speed_10m` | km/h | Feature: wind at departure |
| `wind_gusts_10m` | km/h | Feature: extreme wind |
| `precipitation` | mm | Feature: rain at port |
| `weather_code` | WMO | Feature: storm flag |
| `pressure_msl` | hPa | Feature: pressure system |

### Python usage pattern
```python
cache_session = requests_cache.CachedSession('.cache', expire_after=-1)  # never expire
retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
openmeteo = openmeteo_requests.Client(session=retry_session)

url = "https://archive-api.open-meteo.com/v1/archive"
params = {
    "latitude": 18.95,
    "longitude": 72.95,
    "start_date": "2019-01-01",
    "end_date": "2023-12-31",
    "hourly": [
        "wind_speed_10m",
        "wind_gusts_10m",
        "precipitation",
        "weather_code",
        "pressure_msl",
    ],
    "cell_selection": "sea",
    "models": "era5",
}
responses = openmeteo.weather_api(url, params=params)
response = responses[0]

hourly = response.Hourly()
wind_speed   = hourly.Variables(0).ValuesAsNumpy()
wind_gusts   = hourly.Variables(1).ValuesAsNumpy()
precipitation = hourly.Variables(2).ValuesAsNumpy()
weather_code = hourly.Variables(3).ValuesAsNumpy()
pressure_msl = hourly.Variables(4).ValuesAsNumpy()

dates = pd.date_range(
    start=pd.to_datetime(hourly.Time(), unit="s", utc=True),
    end=pd.to_datetime(hourly.TimeEnd(), unit="s", utc=True),
    freq=pd.Timedelta(seconds=hourly.Interval()),
    inclusive="left",
)
df = pd.DataFrame({
    "date": dates,
    "wind_speed_10m": wind_speed,
    "wind_gusts_10m": wind_gusts,
    "precipitation": precipitation,
    "weather_code": weather_code,
    "pressure_msl": pressure_msl,
})
```

---

## Install
```bash
pip install openmeteo-requests requests-cache retry-requests numpy pandas
```
