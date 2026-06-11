import csv
import math
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

from app.services.air_store import find_nearest_airport, get_airport
from app.services.geocoding_service import geocode_city, geocode_city_global

load_dotenv()

DEFAULT_OURAIRPORTS_CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "airports.csv"
OURAIRPORTS_CSV_PATH = os.getenv("OURAIRPORTS_CSV_PATH", str(DEFAULT_OURAIRPORTS_CSV_PATH))
INTL_AIRPORTS_CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "international_airports.csv"
AIRPORT_MATCH_THRESHOLD_KM = 100.0
GLOBAL_AIRPORT_MATCH_THRESHOLD_KM = 150.0

CITY_TO_AIRPORT = {
    "Delhi": {"code": "DEL", "name": "Indira Gandhi International Airport"},
    "New Delhi": {"code": "DEL", "name": "Indira Gandhi International Airport"},
    "Mumbai": {"code": "BOM", "name": "Chhatrapati Shivaji Maharaj International Airport"},
    "Bengaluru": {"code": "BLR", "name": "Kempegowda International Airport"},
    "Bangalore": {"code": "BLR", "name": "Kempegowda International Airport"},
    "Chennai": {"code": "MAA", "name": "Chennai International Airport"},
    "Hyderabad": {"code": "HYD", "name": "Rajiv Gandhi International Airport"},
    "Kolkata": {"code": "CCU", "name": "Netaji Subhas Chandra Bose International Airport"},
    "Tirupati": {"code": "TIR", "name": "Tirupati Airport"},
    "Dubai": {"code": "DXB", "name": "Dubai International Airport"},
    "Singapore": {"code": "SIN", "name": "Singapore Changi Airport"},
    "Frankfurt": {"code": "FRA", "name": "Frankfurt Airport"},
    "London": {"code": "LHR", "name": "London Heathrow Airport"},
    "New York": {"code": "JFK", "name": "John F. Kennedy International Airport"},
    "Amsterdam": {"code": "AMS", "name": "Amsterdam Airport Schiphol"},
    "Paris": {"code": "CDG", "name": "Charles de Gaulle Airport"},
    "Hong Kong": {"code": "HKG", "name": "Hong Kong International Airport"},
    "Tokyo": {"code": "NRT", "name": "Narita International Airport"},
    "Seoul": {"code": "ICN", "name": "Incheon International Airport"},
    "Chicago": {"code": "ORD", "name": "O'Hare International Airport"},
    "Los Angeles": {"code": "LAX", "name": "Los Angeles International Airport"},
    "Doha": {"code": "DOH", "name": "Hamad International Airport"},
    "Istanbul": {"code": "IST", "name": "Istanbul Airport"},
    "Sydney": {"code": "SYD", "name": "Sydney Kingsford Smith Airport"},
    "Toronto": {"code": "YYZ", "name": "Toronto Pearson International Airport"},
}

CITY_ALIASES = {
    "bangalore": "Bengaluru",
    "banglore": "Bengaluru",
    "bengaluru": "Bengaluru",
    "bombay": "Mumbai",
    "calcutta": "Kolkata",
    "madras": "Chennai",
    "tirupati": "Tirupati",
    "delhi": "Delhi",
    "new delhi": "New Delhi",
    "mumbai": "Mumbai",
    "hyderabad": "Hyderabad",
    "kolkata": "Kolkata",
    "dubai": "Dubai",
    "singapore": "Singapore",
    "frankfurt": "Frankfurt",
    "london": "London",
    "new york": "New York",
    "nyc": "New York",
    "amsterdam": "Amsterdam",
    "paris": "Paris",
    "hong kong": "Hong Kong",
    "tokyo": "Tokyo",
    "seoul": "Seoul",
    "chicago": "Chicago",
    "los angeles": "Los Angeles",
    "la": "Los Angeles",
    "doha": "Doha",
    "istanbul": "Istanbul",
    "sydney": "Sydney",
    "toronto": "Toronto",
}

_IATA_PATTERN = re.compile(r"^[A-Z]{3}$")


def normalize_city(city: str) -> str:
    raw = city.strip()
    canonical = CITY_ALIASES.get(raw.lower(), raw)
    return canonical


def _looks_like_iata(value: str) -> bool:
    token = (value or "").strip().upper()
    return bool(_IATA_PATTERN.match(token))


def resolve_city_to_airport(city: str) -> dict:
    raw = (city or "").strip()
    if _looks_like_iata(raw):
        iata_match = get_airport_by_iata(raw.upper())
        if iata_match:
            return iata_match

    canonical = normalize_city(raw)
    static = CITY_TO_AIRPORT.get(canonical)
    if static:
        details = get_airport_by_iata(static["code"])
        if details:
            return {**details, **static}
        return static

    nearest = find_nearest_airport_for_city(canonical)
    if nearest:
        return nearest

    return {"code": canonical[:3].upper(), "name": canonical}


def get_airport_by_iata(iata_code: str) -> Optional[dict]:
    if not iata_code:
        return None

    code = iata_code.strip().upper()
    from_store = get_airport(code)
    if from_store:
        return from_store

    return _load_ourairports_by_iata().get(code)


def find_nearest_airport_for_city(city: str) -> Optional[dict]:
    coords = geocode_city(city)
    use_global = False
    if not coords:
        coords = geocode_city_global(city)
        use_global = bool(coords)

    if not coords:
        return None

    airports = _load_ourairports()
    threshold = AIRPORT_MATCH_THRESHOLD_KM
    if use_global or not airports:
        global_match = find_nearest_airport(
            coords["lat"], coords["lng"], max_km=GLOBAL_AIRPORT_MATCH_THRESHOLD_KM
        )
        if global_match:
            return global_match
        threshold = GLOBAL_AIRPORT_MATCH_THRESHOLD_KM

    if not airports:
        return None

    best = None
    best_distance = float("inf")
    for airport in airports:
        if not airport.get("iata_code"):
            continue
        lat = airport.get("lat")
        lng = airport.get("lng")
        if lat is None or lng is None:
            continue

        distance = _distance_km(coords["lat"], coords["lng"], lat, lng)
        if distance < best_distance:
            best_distance = distance
            best = airport

    if not best or best_distance > threshold:
        print(
            f"[AirportLocatorService] Nearest airport {best.get('iata_code') if best else 'N/A'} "
            f"is too far ({best_distance:.1f}km) for city {city}"
        )
        return None

    return {
        "code": best["iata_code"],
        "name": best["name"],
        "lat": best["lat"],
        "lng": best["lng"],
        "city_name": best.get("municipality") or city,
        "distance_km": round(best_distance, 1),
    }


@lru_cache(maxsize=1)
def _load_ourairports() -> List[dict]:
    airports_map = {}
    total_loaded = 0
    missing_coords = 0
    missing_iata = 0
    duplicates = 0
    invalid_records = 0
    countries = set()
    domestic_count = 0
    intl_count = 0
    country_coverage = {}

    if OURAIRPORTS_CSV_PATH and os.path.exists(OURAIRPORTS_CSV_PATH):
        try:
            with open(OURAIRPORTS_CSV_PATH, "r", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    if row.get("type") not in {"large_airport", "medium_airport", "small_airport"}:
                        continue
                    if row.get("scheduled_service") not in {"yes", "1", "true", "True"}:
                        continue
                    iata = (row.get("iata_code") or "").strip()
                    if not iata:
                        missing_iata += 1
                        continue
                    try:
                        lat = float(row["latitude_deg"])
                        lng = float(row["longitude_deg"])
                    except Exception:
                        missing_coords += 1
                        invalid_records += 1
                        continue

                    country = (row.get("iso_country") or "IN").strip()
                    if iata in airports_map:
                        duplicates += 1
                        continue

                    airports_map[iata] = {
                        "iata_code": iata,
                        "name": row.get("name") or iata,
                        "municipality": row.get("municipality") or "",
                        "country": country,
                        "lat": lat,
                        "lng": lng,
                        "timezone": "Asia/Kolkata"
                    }
        except Exception as exc:
            print(f"[AirportLocatorService] Failed to load OurAirports CSV: {exc}")

    if INTL_AIRPORTS_CSV_PATH and os.path.exists(INTL_AIRPORTS_CSV_PATH):
        try:
            with open(INTL_AIRPORTS_CSV_PATH, "r", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    iata = (row.get("iata") or "").strip()
                    if not iata:
                        missing_iata += 1
                        continue
                    try:
                        lat = float(row["latitude"])
                        lng = float(row["longitude"])
                    except Exception:
                        missing_coords += 1
                        invalid_records += 1
                        continue
                        
                    country = (row.get("country") or "").strip()
                    if iata in airports_map:
                        duplicates += 1
                        continue

                    airports_map[iata] = {
                        "iata_code": iata,
                        "name": row.get("airport_name") or iata,
                        "municipality": row.get("city") or "",
                        "country": country,
                        "lat": lat,
                        "lng": lng,
                        "timezone": row.get("timezone", "Asia/Kolkata")
                    }
        except Exception as exc:
            print(f"[AirportLocatorService] Failed to load International Airports CSV: {exc}")

    for apt in airports_map.values():
        total_loaded += 1
        c = apt["country"]
        countries.add(c)
        country_coverage[c] = country_coverage.get(c, 0) + 1
        if c == "IN" or c.lower() == "india":
            domestic_count += 1
        else:
            intl_count += 1

    print("=" * 50)
    print("AIRPORT DATA QUALITY AUDIT")
    print("=" * 50)
    print(f"Total airports loaded: {total_loaded}")
    print(f"Domestic airports count: {domestic_count}")
    print(f"International airports count: {intl_count}")
    print(f"Countries represented: {len(countries)}")
    print(f"Duplicate airports removed: {duplicates}")
    print(f"Airports missing coordinates: {missing_coords}")
    print(f"Airports missing IATA codes: {missing_iata}")
    print(f"Invalid airport records: {invalid_records}")
    print(f"Coverage by country: {country_coverage}")
    print("=" * 50)

    return list(airports_map.values())


@lru_cache(maxsize=1)
def _load_ourairports_by_iata() -> dict:
    by_code = {}
    for airport in _load_ourairports():
        code = airport.get("iata_code")
        if code:
            by_code[code.upper()] = {
                "code": code.upper(),
                "name": airport["name"],
                "city_name": airport.get("municipality") or "",
                "country": airport.get("country") or "",
                "lat": airport.get("lat"),
                "lng": airport.get("lng"),
                "timezone": airport.get("timezone", "Asia/Kolkata"),
            }
    return by_code


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c
