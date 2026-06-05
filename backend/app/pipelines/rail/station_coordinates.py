"""
Offline lat/lng for Indian Railway station codes.
PRYJ (Prayagraj Jn) was renamed from ALD (Allahabad Jn) — both share the same location.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache

from app.pipelines.rail.fallback_stations import STATIONS as FALLBACK_STATIONS

# Same physical station — 2017 CSV uses ALD; live APIs use PRYJ.
STATION_CODE_ALIASES: dict[str, list[str]] = {
    "PRYJ": ["ALD"],
    "ALD": ["PRYJ"],
    "NDLS": ["DLI"],
    "DLI": ["NDLS"],
    "DDU": ["MGS"],
    "MGS": ["DDU"],
    "JHS": ["VGLB"],
    "VGLB": ["JHS"],
    "BCT": ["MMCT"],
    "MMCT": ["BCT"],
    "MAS": ["MS"],
    "MS": ["MAS"],
}

# Verified coordinates for major junctions (WGS84 lat, lng).
HARDCODED_STATION_COORDS: dict[str, tuple[float, float]] = {
    "PRYJ": (25.4358, 81.8463),
    "ALD": (25.4358, 81.8463),
    "NDLS": (28.6428, 77.2204),
    "DLI": (28.6600, 77.2190),
    "ANVT": (28.6469, 77.3164),
    "NZM": (28.5889, 77.2506),
    "CNB": (26.4499, 80.3319),
    "LKO": (26.8467, 80.9462),
    "LJN": (26.8312, 80.9198),
    "BSB": (25.3086, 82.9867),
    "JHS": (25.4551, 78.5829),
    "VGLB": (25.4551, 78.5829),
    "BPL": (23.2599, 77.4126),
    "NGP": (21.1498, 79.0882),
    "BZA": (16.5189, 80.6211),
    "SC": (17.4336, 78.5019),
    "HYB": (17.3924, 78.4732),
    "SBC": (12.9774, 77.5667),
    "YPR": (13.0284, 77.5513),
    "MAS": (13.0827, 80.2727),
    "MS": (13.0827, 80.2727),
    "HWH": (22.5867, 88.3428),
    "SDAH": (22.5678, 88.3710),
    "KOAA": (22.6022, 88.3840),
    "CSMT": (18.9402, 72.8356),
    "MMCT": (18.9690, 72.8205),
    "BCT": (18.9690, 72.8205),
    "LTT": (19.0696, 72.8912),
    "PUNE": (18.5286, 73.8742),
    "ADI": (23.0717, 72.6035),
    "JP": (26.9196, 75.7878),
    "AGC": (27.1767, 77.9890),
    "GWL": (26.2183, 78.1828),
    "KOTA": (25.2138, 75.8648),
    "BRC": (22.3072, 73.1812),
    "ST": (21.1702, 72.8311),
    "VSKP": (17.7215, 83.2870),
    "GHY": (26.1820, 91.7507),
    "PNBE": (25.6008, 85.1310),
    "MB": (28.8386, 78.7733),
    "ASR": (31.6340, 74.8723),
    "JAT": (32.7044, 74.8690),
    "DDN": (30.3165, 78.0322),
    "GKP": (26.7606, 83.3732),
    "DDU": (25.4408, 83.1191),
    "MGS": (25.4408, 83.1191),
    "GZB": (28.6692, 77.4538),
    "ALJN": (27.8974, 78.0880),
    "ETW": (26.7850, 79.0150),
    "TDL": (27.0000, 78.6500),
    "FTP": (25.3500, 81.4000),
    "BE": (28.3670, 79.4304),
    "SPN": (27.8820, 79.9108),
    "HRI": (27.3943, 80.1430),
    "SRE": (29.9680, 77.5510),
    "UMB": (30.3782, 76.7767),
    "CDG": (30.7333, 76.7794),
    "ASN": (23.6889, 86.9661),
    "GKP": (26.7606, 83.3732),
    "CSMT": (18.9402, 72.8356),
    "BVC": (21.7647, 72.1519),
    "DEE": (28.6624, 77.2197),
    "NZM": (28.5889, 77.2506),
    "DEC": (28.5925, 77.1235),
    "FDB": (28.4089, 77.3178),
    "MTC": (28.9845, 77.7064),
    "AY": (26.7922, 82.1998),
    "AF": (27.1583, 78.0056),
    "RKMP": (23.2213, 77.4410),
    "INDB": (22.7196, 75.8577),
    "JBP": (23.1815, 79.9864),
    "ET": (22.6199, 78.0020),
    "RTM": (23.3342, 75.0370),
    "KTE": (23.8343, 80.3894),
    "STA": (24.5800, 80.8320),
    "RJT": (22.3039, 70.8022),
    "JAM": (22.4707, 70.0577),
    "GIMB": (23.0833, 70.1333),
    "JU": (26.2389, 73.0243),
    "AII": (26.4499, 74.6399),
    "UDZ": (24.5854, 73.7125),
    "BKN": (28.0229, 73.3119),
    "LDH": (30.9000, 75.8573),
    "JUC": (31.3260, 75.5762),
    "PTK": (32.2743, 75.6520),
    "BTI": (30.2110, 74.9455),
    "BBS": (20.2961, 85.8245),
    "PURI": (19.8135, 85.8312),
    "CTC": (20.4625, 85.8828),
    "ROU": (22.2604, 84.8536),
    "TATA": (22.7868, 86.1850),
    "RNC": (23.3441, 85.3096),
    "DHN": (23.7957, 86.4304),
    "KYQ": (26.1415, 91.7362),
    "DBRG": (27.4728, 94.9120),
    "TVC": (8.4875, 76.9525),
    "ERS": (9.9816, 76.2999),
    "CLT": (11.2588, 75.7804),
    "CAN": (11.8745, 75.3704),
    "HW": (29.9457, 78.1642),
    "SVDK": (32.9915, 74.9318),
}

_CACHE_PATH = os.path.join(os.path.dirname(__file__), "station_coords_cache.json")


def equivalent_station_codes(code: str) -> list[str]:
    c = (code or "").strip().upper()
    if not c:
        return []
    out = [c]
    for alt in STATION_CODE_ALIASES.get(c, []):
        if alt not in out:
            out.append(alt)
    return out


@lru_cache(maxsize=1)
def _load_generated_cache() -> dict[str, dict]:
    if not os.path.exists(_CACHE_PATH):
        return {}
    try:
        with open(_CACHE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _valid_latlng(lat: float, lng: float) -> bool:
    from app.utils.coordinates import is_placeholder_coord

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return False
    return not is_placeholder_coord(lat, lng)


def _cache_row(code: str) -> dict | None:
    row = _load_generated_cache().get((code or "").strip().upper())
    return row if isinstance(row, dict) else None


def _lookup_generated(code: str) -> tuple[float, float] | None:
    row = _cache_row(code)
    if not row:
        return None
    try:
        lat = float(row["lat"])
        lng = float(row["lng"])
        if _valid_latlng(lat, lng):
            return lat, lng
    except (KeyError, TypeError, ValueError):
        pass
    return None


def get_cached_station_name(station_code: str) -> str | None:
    """Station name from the offline CSV-backed cache."""
    for code in equivalent_station_codes(station_code):
        row = _cache_row(code)
        if row and row.get("name"):
            return str(row["name"])
    return None


def get_station_latlng(station_code: str) -> tuple[float, float] | None:
    """Return (lat, lng) for a station code, trying aliases and offline sources."""
    for code in equivalent_station_codes(station_code):
        if code in HARDCODED_STATION_COORDS:
            return HARDCODED_STATION_COORDS[code]
        generated = _lookup_generated(code)
        if generated:
            return generated

    try:
        from app.services.route_geometry_store import get_station_coord

        cached = get_station_coord(station_code)
        if cached and cached.get("lat") is not None and cached.get("lng") is not None:
            lat = float(cached["lat"])
            lng = float(cached["lng"])
            if _valid_latlng(lat, lng):
                return lat, lng
    except Exception:
        pass
    return None


def get_station_meta(station_code: str) -> dict | None:
    code_u = (station_code or "").strip().upper()
    if not code_u:
        return None

    for alt in equivalent_station_codes(code_u):
        row = _cache_row(alt)
        if row and row.get("name"):
            return {
                "code": code_u,
                "name": str(row["name"]),
                "state_name": str(row.get("state_name") or ""),
            }

    for row in FALLBACK_STATIONS:
        if row.get("code", "").upper() == code_u:
            return row
    for alt in STATION_CODE_ALIASES.get(code_u, []):
        for row in FALLBACK_STATIONS:
            if row.get("code", "").upper() == alt:
                return {**row, "code": code_u}
    return None
