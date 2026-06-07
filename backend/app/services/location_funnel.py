"""
Central location normalizer — one funnel for every pipeline.

Accepts city names, station codes (PRYJ, BSB), aliases (Banaras, Allahabad),
and resolves per-mode equivalents:

  - canonical_city  → road / air / water / hybrid compose
  - station_code    → rail primary code
  - lat/lng         → distance checks & maps
"""
from __future__ import annotations

import importlib.util
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

_STATION_CODE_RE = re.compile(r"^[A-Z0-9]{2,5}$")

_CITY_ALIAS: dict[str, str] = {
    "banaras": "Varanasi",
    "benares": "Varanasi",
    "kashi": "Varanasi",
    "allahabad": "Prayagraj",
    "prayagraj jn": "Prayagraj",
    "new delhi": "Delhi",
    "bombay": "Mumbai",
    "bangalore": "Bengaluru",
    "calcutta": "Kolkata",
    "madras": "Chennai",
}

# Alternate spellings, legacy codes, and IATA airport codes → primary rail station.
_STATION_ALIASES: dict[str, str] = {
    "CSTM": "CSMT",
    "BCT": "CSMT",
    "MMCT": "CSMT",
    "BOM": "CSMT",
    "BLR": "SBC",
    "MAA": "MAS",
    "DEL": "NDLS",
    "CCU": "HWH",
    "HYD": "HYB",
    "PNQ": "PUNE",
    "GOI": "MAO",
    "AMD": "ADI",
    "JAI": "JP",
    "LKO": "LJN",
    "VNS": "BSB",
    "IXB": "NJP",
    "GAU": "GHY",
    "BBI": "BBS",
    "TRV": "TVC",
    "COK": "ERS",
    "IXC": "CDG",
    "ATQ": "ASR",
}

_rail_cfg = None


def _load_rail_config():
    global _rail_cfg
    if _rail_cfg is not None:
        return _rail_cfg
    path = Path(__file__).resolve().parents[1] / "pipelines" / "rail" / "config.py"
    spec = importlib.util.spec_from_file_location("rail_config_funnel", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    _rail_cfg = mod
    return mod


@dataclass
class ResolvedLocation:
    raw: str
    display_name: str
    canonical_city: str
    station_code: str | None
    station_codes: list[str]
    lat: float | None = None
    lng: float | None = None
    resolution: str = "unknown"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _clean(raw: str) -> str:
    return re.sub(r",\s*india\s*$", "", (raw or "").strip(), flags=re.I)


def _normalize_station_token(token: str) -> str:
    t = (token or "").strip().upper()
    return _STATION_ALIASES.get(t, t)


def _is_station_code(token: str) -> bool:
    t = (token or "").strip().upper()
    if not _STATION_CODE_RE.fullmatch(t):
        return False
    cfg = _load_rail_config()
    if t in cfg.STATION_TO_CITY:
        return True
    try:
        from app.pipelines.rail.station_resolver import resolve_station

        return resolve_station(t) == t
    except Exception:
        return len(t) <= 4


def _canonicalize_city_label(city: str) -> str:
    """Map station labels (PRAYAGRAJ JN, Allahabad) to pipeline city names."""
    key = city.lower().strip()
    if key in _CITY_ALIAS:
        return _CITY_ALIAS[key]
    matched = _match_city_name(city)
    if matched:
        return _CITY_ALIAS.get(matched.lower(), matched)
    return city


def _city_from_station(code: str) -> str | None:
    cfg = _load_rail_config()
    code_u = code.upper()
    candidates = [
        city for city, codes in cfg.CITY_TO_STATION.items() if code_u in codes
    ]
    if candidates:
        for city in candidates:
            canon = _canonicalize_city_label(city)
            if canon != city or city.lower() in _CITY_ALIAS:
                return canon
        for city in sorted(
            candidates,
            key=lambda c: (c.isupper(), " JN" in c.upper(), len(c)),
        ):
            if not city.isupper() and " JN" not in city.upper():
                return _canonicalize_city_label(city)
        return _canonicalize_city_label(candidates[0])

    city = cfg.STATION_TO_CITY.get(code_u)
    if city:
        return _canonicalize_city_label(city)
    try:
        from app.pipelines.rail.station_coordinates import get_station_meta

        meta = get_station_meta(code_u)
        if meta and meta.get("city"):
            return _canonicalize_city_label(str(meta["city"]))
    except Exception:
        pass
    return None


def _stations_for_city(city: str) -> list[str]:
    cfg = _load_rail_config()
    return list(cfg.CITY_TO_STATION.get(city, []))


def _match_city_name(text: str) -> str | None:
    key = _clean(text).lower()
    if not key:
        return None
    if key in _CITY_ALIAS:
        return _CITY_ALIAS[key]

    cfg = _load_rail_config()
    for city in cfg.CITY_TO_STATION:
        cl = city.lower()
        if cl == key:
            return city
    best: str | None = None
    best_len = 0
    for city in cfg.CITY_TO_STATION:
        cl = city.lower()
        if key in cl or cl in key:
            if len(cl) > best_len:
                best = city
                best_len = len(cl)
    return best


def resolve_location(raw: str, *, context=None) -> ResolvedLocation:
    """Resolve any location string to canonical pipeline inputs."""
    original = _clean(raw)
    if not original:
        return ResolvedLocation(
            raw=raw or "",
            display_name="",
            canonical_city="",
            station_code=None,
            station_codes=[],
            resolution="empty",
        )

    token = _normalize_station_token(original.upper())
    station_code: str | None = None
    canonical_city: str | None = None
    resolution = "unknown"
    alias_applied = token != original.upper()

    # ── 1) Explicit station code (PRYJ, BSB, NDLS…) ─────────────────
    if _is_station_code(token):
        station_code = token
        canonical_city = _city_from_station(station_code)
        resolution = "station_alias" if alias_applied else "station_code"

    # ── 2) Rail station resolver (city fragments, names) ───────────
    if not canonical_city:
        try:
            from app.pipelines.rail.station_resolver import resolve_station

            code = resolve_station(original)
            if code:
                station_code = code.upper()
                canonical_city = _city_from_station(station_code) or _match_city_name(original)
                resolution = "station_resolver"
        except Exception:
            pass

    # ── 3) City name / alias ────────────────────────────────────────
    if not canonical_city:
        canonical_city = _match_city_name(original)
        if canonical_city:
            resolution = "city_name"
            codes = _stations_for_city(canonical_city)
            station_code = station_code or (codes[0] if codes else None)

    # ── 4) Fallback — keep cleaned text ─────────────────────────────
    if not canonical_city:
        canonical_city = original
        resolution = "passthrough"

    station_codes = _stations_for_city(canonical_city)
    if station_code and station_code not in station_codes:
        station_codes = [station_code, *station_codes]
    elif not station_codes and station_code:
        station_codes = [station_code]

    lat: float | None = None
    lng: float | None = None
    try:
        from app.services.geocoder import geocode_latlng

        hit = geocode_latlng(canonical_city, context=context)
        if not hit and station_code:
            hit = geocode_latlng(station_code, context=context)
        if hit:
            lat, lng = float(hit[0]), float(hit[1])
    except Exception:
        pass

    display = canonical_city
    if station_code and station_code.upper() != canonical_city.upper():
        display = f"{canonical_city} ({station_code})"

    return ResolvedLocation(
        raw=original,
        display_name=display,
        canonical_city=canonical_city,
        station_code=station_code,
        station_codes=station_codes,
        lat=lat,
        lng=lng,
        resolution=resolution,
    )


def normalize_corridor(
    source: str,
    destination: str,
    *,
    context=None,
) -> tuple[ResolvedLocation, ResolvedLocation]:
    """Normalize both ends of a corridor for all pipelines."""
    src = resolve_location(source, context=context)
    dst = resolve_location(destination, context=context)
    if context is not None:
        context.set("resolved_source", src.to_dict())
        context.set("resolved_dest", dst.to_dict())
    return src, dst


def corridor_endpoints(
    source: str,
    destination: str,
    *,
    context=None,
) -> tuple[str, str]:
    """Return (canonical_city, canonical_city) for pipeline calls."""
    src, dst = normalize_corridor(source, destination, context=context)
    return src.canonical_city, dst.canonical_city
