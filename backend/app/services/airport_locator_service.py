import csv
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

from app.services.geocoding_service import geocode_city

load_dotenv()

DEFAULT_OURAIRPORTS_CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "airports.csv"
OURAIRPORTS_CSV_PATH = os.getenv("OURAIRPORTS_CSV_PATH", str(DEFAULT_OURAIRPORTS_CSV_PATH))

CITY_TO_AIRPORT = {
    "Delhi": {"code": "DEL", "name": "Indira Gandhi International Airport"},
    "Mumbai": {"code": "BOM", "name": "Chhatrapati Shivaji Maharaj International Airport"},
    "Bengaluru": {"code": "BLR", "name": "Kempegowda International Airport"},
    "Bangalore": {"code": "BLR", "name": "Kempegowda International Airport"},
    "Chennai": {"code": "MAA", "name": "Chennai International Airport"},
    "Hyderabad": {"code": "HYD", "name": "Rajiv Gandhi International Airport"},
    "Kolkata": {"code": "CCU", "name": "Netaji Subhas Chandra Bose International Airport"},
    "Tirupati": {"code": "TIR", "name": "Tirupati Airport"},
}

CITY_ALIASES = {
    "bangalore": "Bengaluru",
    "bengaluru": "Bengaluru",
    "bombay": "Mumbai",
    "calcutta": "Kolkata",
    "madras": "Chennai",
    "tirupati": "Tirupati",
    "delhi": "Delhi",
    "mumbai": "Mumbai",
    "hyderabad": "Hyderabad",
    "kolkata": "Kolkata",
}


def normalize_city(city: str) -> str:
    raw = city.strip()
    canonical = CITY_ALIASES.get(raw.lower(), raw)
    return canonical


def resolve_city_to_airport(city: str) -> dict:
    canonical = normalize_city(city)
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

    return _load_ourairports_by_iata().get(iata_code.strip().upper())


def find_nearest_airport_for_city(city: str) -> Optional[dict]:
    coords = geocode_city(city)
    if not coords:
        return None

    airports = _load_ourairports()
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

    if not best:
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
    if not OURAIRPORTS_CSV_PATH or not os.path.exists(OURAIRPORTS_CSV_PATH):
        return []

    airports: List[dict] = []
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
                    continue
                try:
                    lat = float(row["latitude_deg"])
                    lng = float(row["longitude_deg"])
                except Exception:
                    continue

                airports.append(
                    {
                        "iata_code": iata,
                        "name": row.get("name") or iata,
                        "municipality": row.get("municipality") or "",
                        "lat": lat,
                        "lng": lng,
                    }
                )
    except Exception as exc:
        print(f"[AirportLocatorService] Failed to load OurAirports CSV: {exc}")
        return []

    return airports


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
                "lat": airport.get("lat"),
                "lng": airport.get("lng"),
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
