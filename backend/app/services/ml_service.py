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
    DEPRECATED: Do not use heuristic traffic.
    Kept only for backward compatibility.
    Always returns neutral factor.
    """
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


def _ml_delay_probability(hour: int, weather: Dict, is_weekend: bool, traffic_score: float, demand: float) -> float:
    """
    Build feature vector and predict delay probability using trained ML model.
    """
    if weather is None:
        weather = {}

    # Direct traffic usage (no heuristic)
    # utilization is no longer used to infer traffic
    # assume traffic_level already mapped before calling ML
    # traffic_score = utilization  # now utilization carries traffic signal directly

    temp = weather.get("temp", 25)
    humidity = weather.get("humidity", 50)

    row = {
        "traffic_score": traffic_score,
        "Temperature": temp,
        "Humidity": humidity,
        "Asset_Utilization": traffic_score * 100,  # approximate utilization from traffic
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
    traffic: int | None = None,
    traffic_level: float | None = None,
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

    # Use categorical traffic (0/1/2) when provided; otherwise use real traffic_level.
    if traffic is not None:
        t_factor = 1 + (0.15 * float(traffic))
    elif traffic_level is not None:
        # amplify real traffic signal (raw values are too small ~0.05–0.3)
        t_factor = 1 + (float(traffic_level) * 2.5)
    else:
        t_factor = traffic_factor(hour, is_weekend)

    w_factor = weather_factor(weather)

    # Pass traffic into ML.
    if traffic is not None:
        traffic_input = float(traffic)
    elif traffic_level is not None:
        # pass amplified and normalized signal to ML (keep within [0,1])
        traffic_input = min(float(traffic_level) * 5.0, 1.0)
    else:
        traffic_input = 0.5

    # Simulation override (if synthetic inputs are passed via extreme values)
    if traffic_level is not None and traffic_level > 0.8:
        traffic_input = 1.0

    delay_prob = _ml_delay_probability(
        hour,
        weather,
        is_weekend,
        traffic_input,
        demand
    )
    # prevent completely flat or extreme ML output
    delay_prob = max(min(delay_prob, 0.95), 0.05)

    # Increase ML influence (previous cap was suppressing variation)
    ml_factor = 1 + (delay_prob * 0.4)

    # Avoid double counting traffic (handled inside ML)
    adjusted_time = base_time_hours * t_factor * w_factor * ml_factor

    # Ensure traffic_factor is never the neutral default when traffic is known
    if traffic is not None and t_factor == 1.0 and traffic > 0:
        t_factor = 1 + (0.15 * float(traffic))

    return adjusted_time, t_factor, w_factor