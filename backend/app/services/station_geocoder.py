"""
Multi-provider geocoding for Indian Railway stations.
Order: OpenRouteService → TomTom → Nominatim (last resort).
Results are validated against station name tokens and India bounds.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY", "").strip()
ORS_API_KEY = os.getenv("ORS_API_KEY", "").strip()

_QUERY_CACHE: dict[str, tuple[float, float] | None] = {}
_LAST_NOMINATIM_AT = 0.0
NOMINATIM_MIN_INTERVAL_S = 2.5

INDIA_LAT = (6.5, 37.6)
INDIA_LNG = (68.0, 98.0)
_NOISE_TOKENS = frozenset(
    {"RAILWAY", "STATION", "STN", "JN", "CANTT", "ROAD", "HALT", "NAGAR", "CITY", "TOWN", "INDIA"}
)


def _normalize_name(name: str) -> str:
    n = (name or "").strip()
    n = re.sub(r"\s+", " ", n.replace(" JN.", " JN"))
    return n


def _name_tokens(name: str) -> list[str]:
    tokens = []
    for raw in re.split(r"[^A-Za-z0-9]+", _normalize_name(name).upper()):
        if len(raw) >= 4 and raw not in _NOISE_TOKENS:
            tokens.append(raw)
    return tokens


def _in_india(lat: float, lng: float) -> bool:
    return INDIA_LAT[0] <= lat <= INDIA_LAT[1] and INDIA_LNG[0] <= lng <= INDIA_LNG[1]


def _label_matches_station(station_name: str, label: str) -> bool:
    tokens = _name_tokens(station_name)
    if not tokens:
        return True
    text = (label or "").upper()
    return any(tok in text for tok in tokens)


def _accept_coords(station_name: str, lat: float, lng: float, label: str = "") -> bool:
    if not _in_india(lat, lng):
        return False
    if label and not _label_matches_station(station_name, label):
        return False
    return True


def _queries_for_station(name: str, code: str = "", state: str = "") -> list[str]:
    base = _normalize_name(name)
    if not base:
        return []
    code_part = f" {code.strip().upper()}" if code.strip() else ""
    state_part = f", {state.strip()}" if state and state.strip() else ""
    return [
        f"{base}{code_part} railway station{state_part}, India",
        f"{base} railway station{state_part}, India",
        f"{base}{code_part} station{state_part}, India",
    ]


def _ors(query: str, station_name: str) -> tuple[float, float] | None:
    if not ORS_API_KEY:
        return None
    try:
        res = requests.get(
            "https://api.openrouteservice.org/geocode/search",
            params={"api_key": ORS_API_KEY, "text": query, "size": 1, "boundary.country": "IN"},
            headers={"Accept": "application/json"},
            timeout=12,
        )
        if res.status_code == 429:
            raise urllib.error.HTTPError("ors", 429, "Too many requests", None, None)
        res.raise_for_status()
        feats = res.json().get("features") or []
        if not feats:
            return None
        props = feats[0].get("properties") or {}
        coords = feats[0].get("geometry", {}).get("coordinates") or []
        if len(coords) < 2:
            return None
        lng, lat = float(coords[0]), float(coords[1])
        label = str(props.get("label") or props.get("name") or "")
        confidence = float(props.get("confidence") or 0)
        if confidence < 0.35 and not _label_matches_station(station_name, label):
            return None
        if not _accept_coords(station_name, lat, lng, label):
            return None
        return lat, lng
    except requests.RequestException:
        return None


def _tomtom(query: str, station_name: str) -> tuple[float, float] | None:
    if not TOMTOM_API_KEY:
        return None
    encoded = urllib.parse.quote(query)
    url = f"https://api.tomtom.com/search/2/geocode/{encoded}.json"
    try:
        res = requests.get(
            url,
            params={"key": TOMTOM_API_KEY, "limit": 1, "countrySet": "IN"},
            timeout=12,
        )
        if res.status_code == 429:
            raise urllib.error.HTTPError(url, 429, "Too many requests", None, None)
        res.raise_for_status()
        rows = res.json().get("results") or []
        if not rows:
            return None
        row = rows[0]
        score = float(row.get("score") or 0)
        pos = row.get("position") or {}
        lat, lng = pos.get("lat"), pos.get("lon")
        if lat is None or lng is None:
            return None
        label = str((row.get("address") or {}).get("freeformAddress") or "")
        if score < 7.5 and not _label_matches_station(station_name, label):
            return None
        if not _accept_coords(station_name, float(lat), float(lng), label):
            return None
        return float(lat), float(lng)
    except requests.RequestException:
        return None


def _nominatim(query: str, station_name: str) -> tuple[float, float] | None:
    global _LAST_NOMINATIM_AT
    elapsed = time.monotonic() - _LAST_NOMINATIM_AT
    if elapsed < NOMINATIM_MIN_INTERVAL_S:
        time.sleep(NOMINATIM_MIN_INTERVAL_S - elapsed)

    url = (
        "https://nominatim.openstreetmap.org/search?"
        + urllib.parse.urlencode({"format": "json", "q": query, "limit": 1, "countrycodes": "in"})
    )
    req = urllib.request.Request(url, headers={"User-Agent": "LogiFlow-Station-Geocoder/3.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
        _LAST_NOMINATIM_AT = time.monotonic()
        if not rows:
            return None
        lat = float(rows[0]["lat"])
        lng = float(rows[0]["lon"])
        label = str(rows[0].get("display_name") or "")
        if not _accept_coords(station_name, lat, lng, label):
            return None
        return lat, lng
    except urllib.error.HTTPError as exc:
        _LAST_NOMINATIM_AT = time.monotonic()
        if exc.code == 429:
            raise
        return None


def geocode_station_name(
    name: str,
    *,
    code: str = "",
    state: str = "",
    strict_rate_limit: bool = False,
) -> tuple[tuple[float, float] | None, str | None]:
    """
    Returns ((lat, lng) or None, provider_name or None).
    """
    queries = _queries_for_station(name, code=code, state=state)
    if not queries:
        return None, None

    cache_key = f"{code.upper()}|{queries[0].lower()}"
    if cache_key in _QUERY_CACHE:
        hit = _QUERY_CACHE[cache_key]
        return hit, ("cache" if hit else None)

    providers: list[tuple[str, object]] = []
    if ORS_API_KEY:
        providers.append(("ors", _ors))
    if TOMTOM_API_KEY:
        providers.append(("tomtom", _tomtom))
    providers.append(("nominatim", _nominatim))

    rate_limited = False
    for query in queries:
        for provider_name, fn in providers:
            try:
                hit = fn(query, name)
                if hit:
                    _QUERY_CACHE[cache_key] = hit
                    return hit, provider_name
            except urllib.error.HTTPError as exc:
                if exc.code == 429:
                    rate_limited = True
                    if strict_rate_limit:
                        raise
                    continue
            except Exception:
                continue

    if rate_limited and strict_rate_limit:
        raise urllib.error.HTTPError("geocoder", 429, "Too many requests", None, None)

    _QUERY_CACHE[cache_key] = None
    return None, None
