import requests
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("OPENWEATHER_API_KEY")

FALLBACK_WEATHER = {
    "temp": 30,
    "rain": 0,
    "condition": "Clear",
}


def get_weather(city: str = "", lat: float | None = None, lng: float | None = None) -> dict:
    """
    Fetch weather from OpenWeather. Always returns a safe dict (never None).

    Supports city name lookup (legacy) or coordinate lookup (international airports).
    """
    if not API_KEY:
        return dict(FALLBACK_WEATHER)

    params: dict = {"appid": API_KEY, "units": "metric"}
    if lat is not None and lng is not None:
        params["lat"] = lat
        params["lon"] = lng
    elif city:
        params["q"] = city
    else:
        return dict(FALLBACK_WEATHER)

    try:
        response = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params=params,
            timeout=3,
        )

        if response.status_code == 200:
            data = response.json()
            return {
                "temp": data.get("main", {}).get("temp", 30),
                "rain": data.get("rain", {}).get("1h", 0),
                "condition": data.get("weather", [{}])[0].get("main", "Clear"),
            }

    except Exception as e:
        print(f"[Weather API] Error: {e}")

    return dict(FALLBACK_WEATHER)


def get_weather_by_coords(lat: float, lng: float) -> dict:
    """Coordinate-based weather lookup for global airports."""
    return get_weather(lat=lat, lng=lng)
