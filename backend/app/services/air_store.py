"""Supabase-backed air data store with checked-in CSV fallbacks."""

from __future__ import annotations

import csv
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from app.services import supabase_client as sb

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DEFAULT_INTERNATIONAL_AIRPORTS_CSV = _DATA_DIR / "international_airports.csv"
DEFAULT_INTERNATIONAL_ROUTES_CSV = _DATA_DIR / "international_routes.csv"
DEFAULT_OTP_REGIONS_JSON = _DATA_DIR / "otp-regions.json"

INTERNATIONAL_AIRPORTS_CSV = os.getenv(
    "INTERNATIONAL_AIRPORTS_CSV_PATH", str(DEFAULT_INTERNATIONAL_AIRPORTS_CSV)
)
INTERNATIONAL_ROUTES_CSV = os.getenv(
    "INTERNATIONAL_ROUTES_CSV_PATH", str(DEFAULT_INTERNATIONAL_ROUTES_CSV)
)


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _normalize_airport_row(row: dict[str, Any]) -> dict[str, Any]:
    iata = (row.get("iata") or row.get("iata_code") or "").strip().upper()
    return {
        "code": iata,
        "iata": iata,
        "icao": (row.get("icao") or row.get("ident") or "").strip().upper() or None,
        "name": row.get("airport_name") or row.get("name") or iata,
        "city_name": row.get("city") or row.get("municipality") or "",
        "country": row.get("country") or row.get("iso_country") or "",
        "lat": float(row["latitude"] if "latitude" in row else row["latitude_deg"]),
        "lng": float(row["longitude"] if "longitude" in row else row["longitude_deg"]),
        "timezone": row.get("timezone") or None,
    }


def get_airport_from_supabase(iata_code: str) -> Optional[dict[str, Any]]:
    code = (iata_code or "").strip().upper()
    if len(code) != 3 or not sb.is_configured():
        return None

    rows = sb.rest_get(
        "airports",
        {
            "select": "iata,icao,airport_name,city,country,latitude,longitude,timezone",
            "iata": f"eq.{code}",
            "limit": "1",
        },
    )
    if not rows:
        return None

    row = rows[0]
    return {
        "code": row["iata"],
        "iata": row["iata"],
        "icao": row.get("icao"),
        "name": row.get("airport_name") or code,
        "city_name": row.get("city") or "",
        "country": row.get("country") or "",
        "lat": float(row["latitude"]),
        "lng": float(row["longitude"]),
        "timezone": row.get("timezone"),
    }


@lru_cache(maxsize=1)
def _load_international_airports_csv() -> dict[str, dict[str, Any]]:
    path = INTERNATIONAL_AIRPORTS_CSV
    if not path or not os.path.exists(path):
        return {}

    by_iata: dict[str, dict[str, Any]] = {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                iata = (row.get("iata") or "").strip().upper()
                if len(iata) != 3:
                    continue
                try:
                    by_iata[iata] = _normalize_airport_row(row)
                except (KeyError, TypeError, ValueError):
                    continue
    except Exception as exc:
        print(f"[AirStore] Failed to load international airports CSV: {exc}")
    return by_iata


def get_airport_from_fallback(iata_code: str) -> Optional[dict[str, Any]]:
    code = (iata_code or "").strip().upper()
    if len(code) != 3:
        return None
    return _load_international_airports_csv().get(code)


def get_airport(iata_code: str) -> Optional[dict[str, Any]]:
    """Lookup airport by IATA — Supabase first, then checked-in international CSV."""
    code = (iata_code or "").strip().upper()
    if len(code) != 3:
        return None

    from_supabase = get_airport_from_supabase(code)
    if from_supabase:
        return from_supabase
    return get_airport_from_fallback(code)


@lru_cache(maxsize=1)
def _load_international_routes_csv() -> list[dict[str, Any]]:
    path = INTERNATIONAL_ROUTES_CSV
    if not path or not os.path.exists(path):
        return []

    routes: list[dict[str, Any]] = []
    try:
        with open(path, "r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                source = (row.get("source_iata") or "").strip().upper()
                dest = (row.get("destination_iata") or "").strip().upper()
                if len(source) != 3 or len(dest) != 3 or source == dest:
                    continue
                try:
                    distance = float(row.get("distance_km") or 0)
                    duration = float(row.get("duration_hours") or 0)
                except ValueError:
                    continue
                if distance <= 0 or duration <= 0:
                    continue
                routes.append(
                    {
                        "source_iata": source,
                        "destination_iata": dest,
                        "distance_km": distance,
                        "duration_hours": duration,
                    }
                )
    except Exception as exc:
        print(f"[AirStore] Failed to load international routes CSV: {exc}")
    return routes


def get_routes_from_supabase() -> list[dict[str, Any]]:
    if not sb.is_configured():
        return []

    rows = sb.rest_get(
        "air_routes",
        {
            "select": "source_iata,destination_iata,distance_km,duration_hours",
            "limit": "10000",
        },
    )
    routes: list[dict[str, Any]] = []
    for row in rows:
        source = (row.get("source_iata") or "").strip().upper()
        dest = (row.get("destination_iata") or "").strip().upper()
        if len(source) != 3 or len(dest) != 3:
            continue
        try:
            routes.append(
                {
                    "source_iata": source,
                    "destination_iata": dest,
                    "distance_km": float(row["distance_km"]),
                    "duration_hours": float(row["duration_hours"]),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return routes


def get_international_routes() -> list[dict[str, Any]]:
    """Merged international hub routes — Supabase when configured, else CSV fallback."""
    supabase_routes = get_routes_from_supabase()
    if supabase_routes:
        return supabase_routes
    return _load_international_routes_csv()


def get_otp_from_supabase(airport_iata: str | None = None, region: str | None = None) -> Optional[float]:
    if not sb.is_configured():
        return None

    code = (airport_iata or "").strip().upper()
    if code:
        rows = sb.rest_get(
            "otp_baselines",
            {
                "select": "otp_score",
                "airport_iata": f"eq.{code}",
                "limit": "1",
            },
        )
        if rows:
            return float(rows[0]["otp_score"])

    region_code = (region or "").strip().upper()
    if region_code:
        rows = sb.rest_get(
            "otp_baselines",
            {
                "select": "otp_score",
                "region": f"eq.{region_code}",
                "airport_iata": "is.null",
                "limit": "1",
            },
        )
        if rows:
            return float(rows[0]["otp_score"])

    return None


@lru_cache(maxsize=1)
def _load_otp_regions_json() -> dict[str, Any]:
    path = os.getenv("OTP_REGIONS_PATH", str(DEFAULT_OTP_REGIONS_JSON))
    if not path or not os.path.exists(path):
        return {"globalDefaultOTP": 0.76, "regions": {}, "airportRegions": {}}

    try:
        import json

        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:
        print(f"[AirStore] Failed to load OTP regions JSON: {exc}")
        return {"globalDefaultOTP": 0.76, "regions": {}, "airportRegions": {}}


def lookup_region_for_airport(iata_code: str) -> Optional[str]:
    code = (iata_code or "").strip().upper()
    if not code:
        return None

    supabase_rows = []
    if sb.is_configured():
        supabase_rows = sb.rest_get(
            "otp_baselines",
            {"select": "region", "airport_iata": f"eq.{code}", "limit": "1"},
        )
    if supabase_rows and supabase_rows[0].get("region"):
        return str(supabase_rows[0]["region"]).upper()

    regions_data = _load_otp_regions_json()
    airport_regions = regions_data.get("airportRegions") or {}
    region = airport_regions.get(code)
    return str(region).upper() if region else None


def lookup_otp_baseline_fallback(airport_iata: str) -> tuple[Optional[float], str]:
    """
    Fallback OTP lookup when JSON month/default is unavailable.
    Priority: airport (Supabase/JSON) → region → global default.
    """
    code = (airport_iata or "").strip().upper()
    regions_data = _load_otp_regions_json()
    global_default = float(regions_data.get("globalDefaultOTP", 0.76))

    if code:
        airport_scores = regions_data.get("airports") or {}
        if code in airport_scores:
            return float(airport_scores[code]), "airport_baseline"

        supabase_score = get_otp_from_supabase(airport_iata=code)
        if supabase_score is not None:
            return supabase_score, "airport_baseline"

    region = lookup_region_for_airport(code) if code else None
    if region:
        supabase_region = get_otp_from_supabase(region=region)
        if supabase_region is not None:
            return supabase_region, "region_baseline"

        region_scores = regions_data.get("regions") or {}
        if region in region_scores:
            return float(region_scores[region]), "region_baseline"

    supabase_global = get_otp_from_supabase(region="GLOBAL")
    if supabase_global is not None:
        return supabase_global, "global_default"

    return global_default, "global_default"


def find_nearest_airport(lat: float, lng: float, max_km: float = 150.0) -> Optional[dict[str, Any]]:
    """Find nearest airport from international fallback CSV (used when geocoding succeeds globally)."""
    best: Optional[dict[str, Any]] = None
    best_distance = float("inf")

    for airport in _load_international_airports_csv().values():
        alat, alng = airport.get("lat"), airport.get("lng")
        if alat is None or alng is None:
            continue
        distance = _distance_km(lat, lng, float(alat), float(alng))
        if distance < best_distance:
            best_distance = distance
            best = airport

    if not best or best_distance > max_km:
        return None

    return {**best, "distance_km": round(best_distance, 1)}
