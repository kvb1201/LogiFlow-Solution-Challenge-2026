from app.pipelines.air.config import AIRLINE_RELIABILITY
from app.services.air_data_service import get_airport_on_time_probability


def predict_delay_probability(route, source, destination, departure_date, weather_context=None):
    base_delay = float(route.get("delay_risk", 0.2))
    stops = int(route.get("stops", 0))
    reliability = AIRLINE_RELIABILITY.get(route.get("airline", ""), 0.72)
    weather_risk = (
        float((weather_context or {}).get("combined_weather_risk", 0.06))
        if weather_context
        else 0.06
    )
    source_airport = (route.get("source_airport") or {}).get("code")
    on_time_probability = None
    if source_airport and departure_date:
        on_time_probability = get_airport_on_time_probability(source_airport, departure_date)
    congestion_risk = round(max(0.02, 1 - on_time_probability), 3) if on_time_probability is not None else 0.08

    delay_prob = (
        base_delay
        + weather_risk
        + congestion_risk
        + stops * 0.06
        + (1 - reliability) * 0.18
    )
    return (
        round(max(0.05, min(delay_prob, 0.95)), 3),
        weather_risk,
        reliability,
        congestion_risk,
    )
