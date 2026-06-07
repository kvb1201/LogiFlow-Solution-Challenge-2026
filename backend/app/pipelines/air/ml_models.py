from app.pipelines.air.config import AIRLINE_RELIABILITY
from app.services.otp_scoring_service import get_otp_scoring_service


def _source_weather_payload(weather_context: dict | None) -> dict:
    """Extract departure-city weather from route weather context."""
    if not weather_context:
        return {"condition": "Clear", "temp": 30, "rain": 0}
    source = weather_context.get("source_weather") or {}
    return {
        "condition": source.get("condition", "Clear"),
        "temp": source.get("temp", 30),
        "rain": source.get("rain", 0),
    }


def score_route_otp(
    route,
    departure_date,
    weather_context=None,
    inbound_delay_minutes: float | int = 0,
) -> dict:
    """Run OTP congestion scoring for a route's departure airport."""
    source_airport = (route.get("source_airport") or {}).get("code", "")
    return get_otp_scoring_service().score(
        departure_airport=source_airport,
        departure_time=departure_date,
        weather_data=_source_weather_payload(weather_context),
        inbound_delay_minutes=inbound_delay_minutes,
    )


def predict_delay_probability(route, source, destination, departure_date, weather_context=None):
    base_delay = float(route.get("delay_risk", 0.2))
    stops = int(route.get("stops", 0))
    reliability = AIRLINE_RELIABILITY.get(route.get("airline", ""), 0.72)
    weather_risk = (
        float((weather_context or {}).get("combined_weather_risk", 0.06))
        if weather_context
        else 0.06
    )

    inbound_delay = float(route.get("inbound_delay_minutes", 0) or 0)
    otp_result = score_route_otp(
        route,
        departure_date,
        weather_context=weather_context,
        inbound_delay_minutes=inbound_delay,
    )
    congestion_risk = round(max(0.02, 1 - otp_result["adjustedOTP"]), 3)

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
        otp_result,
    )
