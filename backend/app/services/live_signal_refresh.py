"""
Live Signal Refresh — fetches fresh TomTom + Weather + ML signals
for the REMAINING journey (current_location → destination).

Phase 1: refresh_condition_signals()
  - Reuses route_provider.get_routes() for TomTom
  - Reuses weather_service.get_weather() for weather
  - Reuses ml_service.predict_delay() for delay
  - Returns LiveSignals with freshness metadata

Signal priority in build_condition_snapshot:
  1. Live refreshed (this module)
  2. Stored optimization_result.best
  3. Heuristic fallback
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class LiveSignals:
    """Container for live-refreshed condition signals."""
    # Traffic
    traffic_level: Optional[float] = None       # 0–1 from TomTom (live)
    traffic_delay_hr: Optional[float] = None    # hours
    traffic_distance_km: Optional[float] = None # remaining route km

    # Weather
    temperature: Optional[float] = None
    precipitation: Optional[float] = None       # mm/h
    weather_condition: Optional[str] = None

    # ML delay
    predicted_delay_hours: Optional[float] = None

    # Freshness metadata
    refreshed_at: Optional[str] = None          # ISO timestamp
    traffic_freshness: str = "unavailable"      # "live" | "fallback" | "unavailable"
    weather_freshness: str = "unavailable"      # "live" | "unavailable"
    delay_freshness: str = "unavailable"        # "live" | "heuristic" | "unavailable"

    def signal_freshness(self) -> dict[str, str]:
        return {
            "traffic": self.traffic_freshness,
            "weather": self.weather_freshness,
            "delay":   self.delay_freshness,
        }

    def any_live(self) -> bool:
        return "live" in (self.traffic_freshness, self.weather_freshness, self.delay_freshness)


def refresh_condition_signals(
    current_location: str,
    destination: str,
    mode: str = "road",
    cargo_type: str = "General",
    context: Any = None,
) -> LiveSignals:
    """
    Phase 1–4: Fetch fresh signals for current_location → destination.

    Reuses existing services — no new routing logic.
    Road mode: TomTom via route_provider.get_routes()
    All modes: OpenWeather via weather_service.get_weather()
    All modes: predict_delay() via ml_service

    Returns a LiveSignals object with freshness metadata.
    Gracefully degrades — never raises.
    """
    live = LiveSignals(refreshed_at=datetime.utcnow().isoformat())
    mode_key = (mode or "road").lower()

    # ── Phase 2: Fresh TomTom traffic (road/hybrid only) ─────────────
    if mode_key in ("road", "hybrid"):
        try:
            from app.pipelines.road.route_provider import get_routes
            routes = get_routes(current_location, destination, payload={}, context=context)
            if routes and isinstance(routes, list) and len(routes) > 0:
                best = routes[0]
                live.traffic_level    = best.get("traffic_level")
                live.traffic_delay_hr = best.get("traffic_delay_hr")
                live.traffic_distance_km = best.get("distance_km")

                # "live" if TomTom actually responded (not a fallback)
                is_fallback = "fallback" in str(best.get("route_id", ""))
                live.traffic_freshness = "fallback" if is_fallback else "live"
                print(f"[LiveRefresh] TomTom {current_location}→{destination}: "
                      f"traffic_level={live.traffic_level} freshness={live.traffic_freshness}")
        except Exception as exc:
            print(f"[LiveRefresh] TomTom fetch failed: {exc}")
            live.traffic_freshness = "unavailable"
    else:
        # Non-road modes: no TomTom, keep as unavailable
        live.traffic_freshness = "unavailable"

    # ── Phase 3: Fresh weather (all modes) ───────────────────────────
    try:
        from app.services.weather_service import get_weather
        import os
        if os.getenv("OPENWEATHER_API_KEY"):
            weather = get_weather(current_location)
            if weather and weather.get("temp") is not None:
                live.temperature        = weather.get("temp")
                live.precipitation      = float(weather.get("rain") or 0)
                live.weather_condition  = weather.get("condition", "Clear")
                live.weather_freshness  = "live"
                print(f"[LiveRefresh] Weather {current_location}: "
                      f"temp={live.temperature} rain={live.precipitation}")
        else:
            live.weather_freshness = "unavailable"
    except Exception as exc:
        print(f"[LiveRefresh] Weather fetch failed: {exc}")
        live.weather_freshness = "unavailable"

    # ── Phase 4: Fresh ML delay prediction ───────────────────────────
    try:
        from app.services.ml_service import predict_delay

        # Build weather dict for ML (use live if available)
        ml_weather: dict[str, Any] = {}
        if live.temperature is not None:
            ml_weather = {
                "temp": live.temperature,
                "rain": live.precipitation or 0,
                "condition": live.weather_condition or "Clear",
            }

        # Use live traffic_level for ML if available
        ml_traffic_level = live.traffic_level

        # Estimate base travel time from distance
        speed_map = {"road": 55.0, "air": 700.0, "rail": 80.0, "water": 25.0, "hybrid": 55.0}
        speed_kmh = speed_map.get(mode_key, 55.0)
        route_km = live.traffic_distance_km or 200.0
        base_time_hr = route_km / speed_kmh

        adjusted_time, t_factor, w_factor = predict_delay(
            base_time_hours=base_time_hr,
            weather=ml_weather,
            traffic_level=ml_traffic_level,
        )
        predicted_delay_hr = max(0.0, adjusted_time - base_time_hr)
        live.predicted_delay_hours = round(predicted_delay_hr, 3)
        live.delay_freshness = "live" if (ml_traffic_level is not None or ml_weather) else "heuristic"
        print(f"[LiveRefresh] ML delay: base={base_time_hr:.2f}h adjusted={adjusted_time:.2f}h "
              f"delay={predicted_delay_hr:.2f}h freshness={live.delay_freshness}")
    except Exception as exc:
        print(f"[LiveRefresh] ML delay failed: {exc}")
        live.delay_freshness = "unavailable"

    return live
