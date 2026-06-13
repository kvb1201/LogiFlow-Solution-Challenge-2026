
from typing import List, Optional

from app.services.airport_locator_service import get_airport_by_iata, resolve_city_to_airport
from app.services.route_providers.base import RouteProvider
from app.services.route_providers.openflights_provider import OpenFlightsRouteProvider


def is_configured() -> bool:
    """
    No external paid flight schedule provider is configured in the free-stack version.
    """
    return False


def get_airport_on_time_probability(airport_code: str, date_str: str) -> Optional[float]:
    """
    Baseline OTP only (no penalties). Prefer OTPScoringService.score() for full congestion metrics.
    """
    from app.services.otp_scoring_service import get_otp_scoring_service

    code = (airport_code or "").strip().upper()
    if not code:
        return None

    otp, _source = get_otp_scoring_service().lookup_baseline_otp(code, date_str)
    return round(max(0.0, min(float(otp), 1.0)), 3)


def get_live_air_routes(
    source: str,
    destination: str,
    departure_date: str,
    provider: Optional[RouteProvider] = None,
) -> List[dict]:
    """Discover direct and one-stop route candidates for the given city pair.
    
    Provider defaults to the static OpenFlights snapshot but can be swapped
    for a live API-backed provider without changing pipeline.py.
    """
    _ = departure_date
    provider = provider or OpenFlightsRouteProvider()
    
    source_airport = _resolve_airport_details(source)
    destination_airport = _resolve_airport_details(destination)
    
    source_code = source_airport.get("code") if source_airport else None
    destination_code = destination_airport.get("code") if destination_airport else None
    
    if not source_code or not destination_code:
        return []
    
    if source_code == destination_code:
        return []
    
    routes = []
    direct = provider.get_direct_route(source_airport, destination_airport)
    if direct:
        direct["source_country"] = source_airport.get("country", "IN")
        direct["destination_country"] = destination_airport.get("country", "IN")
        routes.append(direct)
    
    for route in provider.get_one_stop_routes(source_airport, destination_airport):
        route["source_country"] = source_airport.get("country", "IN")
        route["destination_country"] = destination_airport.get("country", "IN")
        routes.append(route)
    
    return routes


def _resolve_airport_details(city: str) -> Optional[dict]:
    resolved = resolve_city_to_airport(city)
    if not resolved:
        return None
        
    lookup = get_airport_by_iata(resolved.get("code", ""))
    
    result = {**lookup, **resolved} if lookup else resolved
    if "country" not in result or not result["country"]:
        result["country"] = "IN"
        
    return result
