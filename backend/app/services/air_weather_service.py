from app.services.airport_locator_service import resolve_city_to_airport
from app.services.weather_service import get_weather, get_weather_by_coords


def _condition_penalty(condition: str) -> float:
    normalized = (condition or "").lower()
    if normalized in {"thunderstorm", "tornado", "squall"}:
        return 0.22
    if normalized in {"rain", "drizzle", "mist"}:
        return 0.12
    if normalized in {"snow", "fog", "haze"}:
        return 0.15
    if normalized in {"clouds"}:
        return 0.05
    return 0.02


def _fetch_weather_for_location(city: str, airport: dict | None, context=None) -> dict:
    cache_key = f"weather:{city}:{(airport or {}).get('code', '')}"
    if context and context.has(cache_key):
        weather = context.get(cache_key)
        print(f"[CACHE HIT] {cache_key}")
    else:
        lat = (airport or {}).get("lat")
        lng = (airport or {}).get("lng")
        if lat is not None and lng is not None:
            weather = get_weather_by_coords(float(lat), float(lng))
        else:
            weather = get_weather(city)
        print(f"[API CALL] {cache_key}")
        if context:
            context.set(cache_key, weather)
    return weather


def _single_city_weather_risk(city: str, airport: dict | None = None, context=None) -> dict:
    weather = _fetch_weather_for_location(city, airport, context=context)

    temp = float(weather.get("temp", 30))
    rain = float(weather.get("rain", 0))
    condition = weather.get("condition", "Clear")

    rain_penalty = min(rain / 20.0, 0.2)
    temp_penalty = 0.08 if temp > 40 or temp < 5 else 0.02
    condition_penalty = _condition_penalty(condition)
    risk = round(min(0.35, rain_penalty + temp_penalty + condition_penalty), 3)

    return {
        "city": city,
        "airport_code": (airport or {}).get("code"),
        "temp": temp,
        "rain": rain,
        "condition": condition,
        "risk": risk,
    }


def get_route_weather_context(source: str, destination: str, context=None) -> dict:
    source_airport = resolve_city_to_airport(source)
    destination_airport = resolve_city_to_airport(destination)

    source_weather = _single_city_weather_risk(source, airport=source_airport, context=context)
    destination_weather = _single_city_weather_risk(
        destination, airport=destination_airport, context=context
    )
    combined = round((source_weather["risk"] + destination_weather["risk"]) / 2, 3)

    return {
        "source_weather": source_weather,
        "destination_weather": destination_weather,
        "combined_weather_risk": combined,
        "source_airport": source_airport,
        "destination_airport": destination_airport,
    }
