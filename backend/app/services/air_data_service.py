from typing import List

from app.services.airport_locator_service import resolve_city_to_airport


def is_configured() -> bool:
    """
    No external flight schedule provider is configured in the free-stack version.
    Route generation falls back to internal candidate generation plus free enrichment.
    """
    return False


def get_airport_on_time_probability(airport_code: str, date_str: str):
    """
    Placeholder for future live on-time integrations.
    The free-stack version uses heuristic congestion risk instead.
    """
    return None


def get_live_air_routes(source: str, destination: str, departure_date: str) -> List[dict]:
    """
    Free-stack mode does not use a paid flight schedule provider.
    Returning an empty list forces the pipeline into airport-resolution + fallback routing.
    """
    _ = departure_date
    source_airport = resolve_city_to_airport(source)
    destination_airport = resolve_city_to_airport(destination)

    # Keep side effects minimal but ensure airport resolution is available to the pipeline.
    _ = source_airport, destination_airport
    return []
