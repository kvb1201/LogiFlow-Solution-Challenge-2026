from datetime import datetime
from typing import Dict, Tuple

import joblib
import pandas as pd

# Load trained ML model
_artifact = joblib.load("app/models/delay_model.pkl")
_model = _artifact["model"]
_FEATURES = _artifact["features"]
_traffic_map = _artifact.get("traffic_map", {})


def traffic_factor(hour: int, is_weekend: bool = False) -> float:
    """
    Simple heuristic traffic model based on time of day and weekend.
    Returns a multiplicative factor for travel time.
    """
    # Peak hours
    if 8 <= hour <= 11:
        return 1.3
    if 17 <= hour <= 20:
        return 1.4

    # Weekend slightly higher leisure traffic (tunable)
    if is_weekend:
        return 1.1

    return 1.0


def weather_factor(weather: Dict) -> float:
    """
    Compute delay factor from weather dict.
    Expected keys: {"temp": float, "rain": float, "condition": str}
    """
    if weather is None:
        weather = {}

    factor = 1.0

    rain = weather.get("rain", 0) or 0
    condition = (weather.get("condition") or "").lower()

    # Rain impact (mm/hr)
    if rain > 2:
        factor += 0.2

    # Severe weather
    if any(x in condition for x in ["storm", "thunderstorm"]):
        factor += 0.3

    # Visibility issues
    if any(x in condition for x in ["fog", "mist"]):
        factor += 0.15

    return factor


def _ml_delay_probability(hour: int, weather: Dict, is_weekend: bool, utilization: float, demand: float) -> float:
    """
    Build feature vector and predict delay probability using trained ML model.
    """
    if weather is None:
        weather = {}

    # Map traffic based on heuristic hour
    if 8 <= hour <= 11 or 17 <= hour <= 20:
        traffic_label = "Heavy"
    elif 12 <= hour <= 16:
        traffic_label = "Moderate"
    else:
        traffic_label = "Clear"

    traffic_score = _traffic_map.get(traffic_label, 1)

    temp = weather.get("temp", 25)
    humidity = weather.get("humidity", 50)

    row = {
        "traffic_score": traffic_score,
        "Temperature": temp,
        "Humidity": humidity,
        "Asset_Utilization": utilization,
        "Demand_Forecast": demand
    }

    df = pd.DataFrame([row])[_FEATURES]

    prob = _model.predict_proba(df)[0][1]
    return prob


def predict_delay(
    base_time_hours: float,
    weather: Dict,
    utilization: float = 70,
    demand: float = 70,
    current_dt: datetime | None = None,
    is_weekend: bool | None = None,
) -> Tuple[float, float, float]:
    """
    Combine traffic + weather to produce adjusted time.

    Returns:
        adjusted_time_hours, traffic_factor, weather_factor
    """
    now = current_dt or datetime.now()
    hour = now.hour

    if is_weekend is None:
        is_weekend = now.weekday() >= 5  # 5=Sat, 6=Sun

    t_factor = traffic_factor(hour, is_weekend)
    w_factor = weather_factor(weather)

    delay_prob = _ml_delay_probability(
        hour,
        weather,
        is_weekend,
        utilization,
        demand
    )

    # Cap ML influence to avoid unrealistic delays
    ml_factor = 1 + min(delay_prob, 0.5) * 0.3

    # Avoid double counting traffic (handled inside ML)
    adjusted_time = base_time_hours * w_factor * ml_factor

    return adjusted_time, t_factor, w_factor