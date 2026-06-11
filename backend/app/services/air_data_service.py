
import csv
import math
import os
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Set

from app.services.airport_locator_service import get_airport_by_iata, resolve_city_to_airport
from app.services.air_store import get_international_routes

DEFAULT_OPENFLIGHTS_ROUTES_PATH = Path(__file__).resolve().parents[2] / "data" / "routes.dat"
OPENFLIGHTS_ROUTES_PATH = os.getenv("OPENFLIGHTS_ROUTES_PATH", str(DEFAULT_OPENFLIGHTS_ROUTES_PATH))

AIRLINE_CODE_TO_NAME = {
    "6E": "IndiGo",
    "AI": "Air India",
    "AK": "AirAsia",
    "G8": "Go First",
    "I5": "AirAsia India",
    "QP": "Akasa Air",
    "SG": "SpiceJet",
    "UK": "Vistara",
    "9W": "Jet Airways",
    "EK": "Emirates",
    "QR": "Qatar Airways",
    "EY": "Etihad Airways",
    "SQ": "Singapore Airlines",
    "LH": "Lufthansa",
    "BA": "British Airways",
    "AF": "Air France",
    "KL": "KLM",
    "CX": "Cathay Pacific",
    "JL": "Japan Airlines",
    "KE": "Korean Air",
    "AA": "American Airlines",
    "UA": "United Airlines",
    "DL": "Delta Air Lines",
    "TK": "Turkish Airlines",
    "QF": "Qantas",
    "AC": "Air Canada",
    "FX": "FedEx Express",
    "5Y": "Atlas Air",
    "CV": "Cargolux",
}


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


def get_live_air_routes(source: str, destination: str, departure_date: str) -> List[dict]:
    """
    Use the checked-in OpenFlights route snapshot as a free route-support dataset.
    Returns direct and one-stop candidates when OpenFlights supports the airport pair.
    Returns an empty list when no route support exists (pipeline surfaces no_routes).
    """
    _ = departure_date
    source_airport = _resolve_airport_details(source)
    destination_airport = _resolve_airport_details(destination)

    source_code = source_airport.get("code")
    destination_code = destination_airport.get("code")
    if not source_code or not destination_code:
        return []

    if source_code == destination_code:
        # Don't support intra-city flights even if the dataset has loops
        return []

    routes = []
    direct = _build_direct_route(source_airport, destination_airport)
    if direct:
        direct["source_country"] = source_airport.get("country", "IN")
        direct["destination_country"] = destination_airport.get("country", "IN")
        routes.append(direct)

    for route in _build_one_stop_routes(source_airport, destination_airport):
        route["source_country"] = source_airport.get("country", "IN")
        route["destination_country"] = destination_airport.get("country", "IN")
        routes.append(route)
        
    return routes


def _resolve_airport_details(city: str) -> dict:
    resolved = resolve_city_to_airport(city)
    lookup = get_airport_by_iata(resolved.get("code", ""))
    
    result = {**lookup, **resolved} if lookup else resolved
    if "country" not in result or not result["country"]:
        result["country"] = "IN"
        
    return result


def _build_direct_route(source_airport: dict, destination_airport: dict) -> Optional[dict]:
    source_code = source_airport["code"]
    destination_code = destination_airport["code"]
    airlines = sorted(_get_pair_airlines(source_code, destination_code))
    if not airlines:
        return None

    graph = _load_openflights_graph()
    intl_edge = graph.get("international_edges", {}).get((source_code, destination_code))
    if intl_edge:
        distance = int(round(float(intl_edge["distance_km"])))
        duration = float(intl_edge["duration_hours"])
        data_source = "international_routes"
    else:
        distance = _estimate_path_distance_km([source_airport, destination_airport]) or 1050
        duration = _estimate_duration_hours(distance, stops=0)
        data_source = "openflights_routes.dat"

    return {
        "airline": _choose_airline_name(airlines),
        "stops": 0,
        "distance": distance,
        "duration": duration,
        "delay_risk": 0.18,
        "cargo_types": ["general", "fragile", "perishable"],
        "source_airport": source_airport,
        "destination_airport": destination_airport,
        "segments": [
            {
                "mode": "Air",
                "from": source_airport.get("code", ""),
                "to": destination_airport.get("code", ""),
                "support_type": "direct",
            }
        ],
        "data_source": data_source,
        "route_support_type": "direct",
        "supported_by": data_source,
        "supporting_airlines": [_format_airline_name(code) for code in airlines[:5]],
    }


def _build_one_stop_routes(source_airport: dict, destination_airport: dict) -> List[dict]:
    source_code = source_airport["code"]
    destination_code = destination_airport["code"]
    graph = _load_openflights_graph()
    direct_distance = _estimate_path_distance_km([source_airport, destination_airport])

    outgoing = graph["outgoing"].get(source_code, set())
    incoming = graph["incoming"].get(destination_code, set())
    candidate_hubs = [
        hub
        for hub in outgoing.intersection(incoming)
        if hub not in {source_code, destination_code}
    ]

    ranked_hubs = []
    for hub_code in candidate_hubs:
        hub_airport = get_airport_by_iata(hub_code) or {"code": hub_code, "name": hub_code}
        if None in {hub_airport.get("lat"), hub_airport.get("lng")}:
            continue

        path_distance = _estimate_path_distance_km([source_airport, hub_airport, destination_airport])
        if not path_distance:
            continue
        if direct_distance and path_distance > direct_distance * 2.25:
            continue

        ranked_hubs.append((path_distance, -graph["degree"].get(hub_code, 0), hub_code, hub_airport))

    ranked_hubs.sort()

    routes = []
    for distance, _, hub_code, hub_airport in ranked_hubs[:3]:
        first_leg_airlines = sorted(_get_pair_airlines(source_code, hub_code))
        second_leg_airlines = sorted(_get_pair_airlines(hub_code, destination_code))
        if not first_leg_airlines or not second_leg_airlines:
            continue

        routes.append(
            {
                "airline": _choose_airline_name(first_leg_airlines + second_leg_airlines),
                "stops": 1,
                "distance": distance,
                "duration": _estimate_duration_hours(distance, stops=1),
                "delay_risk": 0.3,
                "cargo_types": ["general", "fragile", "perishable"],
                "source_airport": source_airport,
                "destination_airport": destination_airport,
                "hub_airport": hub_airport,
                "segments": [
                    {
                        "mode": "Air",
                        "from": source_airport.get("code", ""),
                        "to": hub_code,
                        "support_type": "one_stop",
                    },
                    {
                        "mode": "Air",
                        "from": hub_code,
                        "to": destination_airport.get("code", ""),
                        "support_type": "one_stop",
                    },
                ],
                "data_source": "openflights_routes.dat",
                "route_support_type": "one_stop",
                "supported_by": "openflights_routes.dat",
                "supporting_airlines": [
                    _format_airline_name(code)
                    for code in (first_leg_airlines + second_leg_airlines)[:6]
                ],
            }
        )

    return routes


def _estimate_duration_hours(distance_km: float, stops: int) -> float:
    cruise_hours = distance_km / 720.0
    handling_hours = 0.6 + stops * 1.2
    return round(cruise_hours + handling_hours, 2)


def _estimate_path_distance_km(airports: List[dict]) -> int:
    total = 0.0
    for first, second in zip(airports, airports[1:]):
        lat1, lng1 = first.get("lat"), first.get("lng")
        lat2, lng2 = second.get("lat"), second.get("lng")
        if None in {lat1, lng1, lat2, lng2}:
            return 0
        total += _distance_km(float(lat1), float(lng1), float(lat2), float(lng2))
    return int(round(total))


def _choose_airline_name(airline_codes: List[str]) -> str:
    for code in airline_codes:
        name = AIRLINE_CODE_TO_NAME.get(code)
        if name:
            return name
    if airline_codes:
        return _format_airline_name(airline_codes[0])
    return "Multiple carriers"


def _format_airline_name(code: str) -> str:
    if code == "INT":
        return "International carriers"
    return AIRLINE_CODE_TO_NAME.get(code, code)


def _get_pair_airlines(source_code: str, destination_code: str) -> Set[str]:
    airlines = _load_openflights_graph()["pair_airlines"].get((source_code, destination_code), set())
    if airlines:
        return airlines
    if _has_route_support(source_code, destination_code):
        return {"INT"}
    return set()


def _has_route_support(source_code: str, destination_code: str) -> bool:
    graph = _load_openflights_graph()
    return destination_code in graph["outgoing"].get(source_code, set())


def _merge_international_routes(graph: Dict[str, Dict]) -> None:
    """Add international hub edges from Supabase or checked-in CSV fallback."""
    for route in get_international_routes():
        source = route["source_iata"]
        dest = route["destination_iata"]
        graph["outgoing"][source].add(dest)
        graph["incoming"][dest].add(source)
        graph["degree"][source] += 1
        graph["degree"][dest] += 1
        graph["pair_airlines"][(source, dest)].add("INT")
        graph["international_edges"][(source, dest)] = {
            "distance_km": route["distance_km"],
            "duration_hours": route["duration_hours"],
        }


@lru_cache(maxsize=1)
def _load_openflights_graph() -> Dict[str, Dict]:
    graph = {
        "outgoing": defaultdict(set),
        "incoming": defaultdict(set),
        "degree": defaultdict(int),
        "pair_airlines": defaultdict(set),
        "international_edges": {},
    }

    if OPENFLIGHTS_ROUTES_PATH and os.path.exists(OPENFLIGHTS_ROUTES_PATH):
        with open(OPENFLIGHTS_ROUTES_PATH, "r", encoding="utf-8") as handle:
            reader = csv.reader(handle)
            for row in reader:
                if len(row) < 9:
                    continue

                airline_code, _, source_code, _, destination_code, _, _, _, _ = row[:9]
                source_code = (source_code or "").strip().upper()
                destination_code = (destination_code or "").strip().upper()
                airline_code = (airline_code or "").strip().upper()

                if len(source_code) != 3 or len(destination_code) != 3:
                    continue

                graph["outgoing"][source_code].add(destination_code)
                graph["incoming"][destination_code].add(source_code)
                graph["degree"][source_code] += 1
                graph["degree"][destination_code] += 1
                if airline_code:
                    graph["pair_airlines"][(source_code, destination_code)].add(airline_code)

    _merge_international_routes(graph)
    return graph


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c
