"""
Dedicated Railway Cargo API routes.
Powered by RailRadar API for real Indian Railways data.
Includes Simulation Mode and Health monitoring.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict

router = APIRouter(prefix="/railway", tags=["railway-cargo"])


class CargoPayload(BaseModel):
    """Request schema for the cargo optimization endpoint."""
    origin_city: str
    destination_city: str
    cargo_weight_kg: float = 100
    cargo_type: str = "General"
    budget_max_inr: Optional[float] = None
    deadline_hours: Optional[float] = None
    priority: str = "cost"
    departure_date: str = "2025-08-15"
    special_notes: Optional[str] = None


class WeatherParams(BaseModel):
    """User-controlled weather parameters for simulation."""
    temp: float = 30.0
    rain: float = 0.0
    condition: str = "Clear"


class SimulationPayload(BaseModel):
    """Request schema for the railway simulation endpoint."""
    origin_city: str
    destination_city: str
    cargo_weight_kg: float = 100
    cargo_type: str = "General"
    priority: str = "balanced"
    weather: WeatherParams = WeatherParams()
    congestion_level: float = 0.3
    season: str = "normal"
    departure_hour: int = 12


@router.post("/optimize")
def optimize_cargo_route(payload: CargoPayload):
    """
    Main cargo optimization endpoint.
    Uses RailRadar API for real train data + real delay measurements.
    Now includes OpenWeather data for weather-aware risk scoring.

    Returns 3 recommendations (cheapest/fastest/safest) + ranked list.
    """
    from app.pipelines.rail.pipeline import RailCargoOptimizer

    optimizer = RailCargoOptimizer()
    payload_dict = payload.dict()

    if payload_dict.get("budget_max_inr") is None:
        payload_dict["budget_max_inr"] = float("inf")
    if payload_dict.get("deadline_hours") is None:
        payload_dict["deadline_hours"] = float("inf")

    results = optimizer.optimize(payload_dict)

    if "error" in results:
        raise HTTPException(status_code=404, detail=results["error"])

    return results


# ── Simulation Mode ───────────────────────────────────────────────────

@router.post("/simulate")
def simulate_cargo_route(payload: SimulationPayload):
    """
    Simulation endpoint — user controls ALL parameters.
    Set weather, congestion, season, departure hour manually.
    Returns deterministic delay, cost, risk, and ETA.

    No external API calls for weather — uses user-provided values.
    Routes still fetched from RailRadar/CSV.
    """
    from app.pipelines.rail.simulator import simulate

    payload_dict = payload.dict()
    results = simulate(payload_dict)

    if "error" in results:
        raise HTTPException(status_code=404, detail=results["error"])

    return results


# ── Health & Monitoring ───────────────────────────────────────────────

@router.get("/health")
def health_check():
    """
    Health endpoint exposing circuit breaker status and weather API status.
    """
    from app.pipelines.rail.railradar_client import get_circuit_status

    circuit = get_circuit_status()

    # Quick weather API probe
    weather_status = "unknown"
    try:
        from app.services.weather_service import get_weather
        w = get_weather("Delhi")
        if w and w.get("temp") is not None:
            weather_status = "ok"
        else:
            weather_status = "degraded"
    except Exception:
        weather_status = "error"

    return {
        "railradar_circuit_breaker": circuit,
        "weather_api_status": weather_status,
    }


# ── RailRadar-powered endpoints ───────────────────────────────────────

@router.get("/search/stations")
def search_stations(query: str):
    """Search stations by name or code via RailRadar API."""
    from app.pipelines.rail.railradar_client import search_stations as rr_search
    results = rr_search(query)
    return {"stations": results}


@router.get("/search/trains")
def search_trains(query: str):
    """Search trains by number or name via RailRadar API."""
    from app.pipelines.rail.railradar_client import search_trains as rr_search
    results = rr_search(query)
    return {"trains": results}


@router.get("/trains/between")
def trains_between(from_code: str, to_code: str):
    """Find all trains between two station codes via RailRadar API."""
    from app.pipelines.rail.railradar_client import get_trains_between
    data = get_trains_between(from_code, to_code)
    if not data:
        raise HTTPException(status_code=404, detail="No trains found or API error")
    return data


@router.get("/trains/{train_number}/delay")
def train_average_delay(train_number: str):
    """Get REAL average delay per station for a train from RailRadar API."""
    from app.pipelines.rail.railradar_client import get_average_delay
    data = get_average_delay(train_number)
    if not data:
        raise HTTPException(status_code=404, detail="Train not found or API error")
    return data


@router.get("/trains/{train_number}/live")
def train_live_status(train_number: str, journey_date: Optional[str] = None):
    """Get live tracking status for a train from RailRadar API."""
    from app.pipelines.rail.railradar_client import get_live_status
    data = get_live_status(train_number, journey_date)
    if not data:
        raise HTTPException(status_code=404, detail="Live data not available")
    return data


@router.get("/trains/{train_number}/schedule")
def train_schedule(train_number: str):
    """Get full static schedule for a train from RailRadar API."""
    from app.pipelines.rail.railradar_client import get_train_data
    data = get_train_data(train_number, data_type="static")
    if not data:
        raise HTTPException(status_code=404, detail="Train not found")
    return data


@router.get("/stations/{station_code}")
def station_info(station_code: str):
    """Get station info (name, coordinates, zone) from RailRadar API."""
    from app.pipelines.rail.railradar_client import get_station_info
    data = get_station_info(station_code)
    if not data:
        raise HTTPException(status_code=404, detail="Station not found")
    return data


@router.get("/stations/{station_code}/live")
def station_live_board(station_code: str, hours: int = 8):
    """Get live station board from RailRadar API."""
    from app.pipelines.rail.railradar_client import get_live_station_board
    data = get_live_station_board(station_code, hours)
    if not data:
        raise HTTPException(status_code=404, detail="Station data not available")
    return data


@router.get("/stations")
def list_stations():
    """List all known city-station code mappings."""
    from app.pipelines.rail.config import CITY_TO_STATION
    return {"stations": CITY_TO_STATION}


@router.get("/cargo-types")
def list_cargo_types():
    """List supported cargo types and their constraints."""
    from app.pipelines.rail.config import CARGO_CONSTRAINTS
    return {"cargo_types": CARGO_CONSTRAINTS}


@router.get("/model-info")
def model_info():
    """Get information about the trained ML models."""
    try:
        from app.pipelines.rail.ml_models import get_model_info
        return get_model_info()
    except Exception as e:
        return {"error": str(e)}


@router.get("/coords")
def get_location_coords(name: str):
    """
    Get latitude/longitude for any location name (city/town/station).
    Useful for centering the map when no routes are found.
    """
    from app.utils.coordinates import get_coords
    lat, lng = get_coords(name)
    return {"name": name, "lat": lat, "lng": lng}


@router.get("/stats")
def route_stats():
    """Get statistics about the loaded railway data."""
    try:
        from app.pipelines.rail.data_loader import get_route_stats
        return get_route_stats()
    except Exception as e:
        return {"error": str(e)}

