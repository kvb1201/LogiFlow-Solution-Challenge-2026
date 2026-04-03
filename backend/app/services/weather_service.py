import requests
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("OPENWEATHER_API_KEY")

# Replace with your actual API key
# API_KEY = "YOUR_OPENWEATHER_API_KEY"

def get_weather(city: str) -> dict:
    """
    Fetch weather from OpenWeather. Always returns a safe dict (never None).
    """
    fallback = {
        "temp": 30,
        "rain": 0,
        "condition": "Clear"
    }

    # If API key missing, return fallback (do not raise)
    if not API_KEY:
        return fallback

    try:
        response = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "q": city,
                "appid": API_KEY,
                "units": "metric"
            },
            timeout=3
        )

        if response.status_code == 200:
            data = response.json()

            return {
                "temp": data.get("main", {}).get("temp", 30),
                "rain": data.get("rain", {}).get("1h", 0),
                "condition": data.get("weather", [{}])[0].get("main", "Clear")
            }

    except Exception as e:
        print(f"[Weather API] Error: {e}")

    return fallback
