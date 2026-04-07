from app.pipelines.air.config import AIRLINE_RELIABILITY


def estimate_weather_risk(source, destination):
    seed = sum(ord(ch) for ch in f"{source}-{destination}")
    return round(0.05 + (seed % 7) * 0.015, 3)


def predict_delay_probability(route, source, destination):
    base_delay = float(route.get("delay_risk", 0.2))
    stops = int(route.get("stops", 0))
    reliability = AIRLINE_RELIABILITY.get(route.get("airline", ""), 0.72)
    weather_risk = estimate_weather_risk(source, destination)

    delay_prob = (
        base_delay
        + weather_risk
        + stops * 0.06
        + (1 - reliability) * 0.18
    )
    return round(max(0.05, min(delay_prob, 0.95)), 3), weather_risk, reliability
