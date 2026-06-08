"""
Central location normalizer — one funnel for every pipeline.

Primary source: backend/data/station_name.pdf (7k+ stations with district/state).
Secondary: rail CITY_TO_STATION clusters, airports.csv IATA, station coords.
"""
from __future__ import annotations

import importlib.util
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from app.services.station_pdf_index import fuzzy_pdf_code, get_pdf_index, pdf_station_codes_for_place

_STATION_CODE_RE = re.compile(r"^[A-Z0-9]{2,5}$")

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


def _city_key_for_station(code: str) -> str | None:
    cfg = _load_rail_config()
    code_u = (code or "").strip().upper()
    best_key: str | None = None
    best_rank = (9, 9, 999)
    for city, codes in cfg.CITY_TO_STATION.items():
        norm = [str(c).upper() for c in codes]
        if code_u not in norm:
            continue
        idx = norm.index(code_u)
        rank = (
            0 if not city.isupper() and " JN" not in city.upper() else 1,
            idx,
            len(city),
        )
        if rank < best_rank:
            best_rank = rank
            best_key = city
    return best_key


def _curated_cluster(city_key: str) -> list[str]:
    cfg = _load_rail_config()
    return [str(c).upper() for c in cfg.CITY_TO_STATION.get(city_key, []) if c]


def _expand_equivalents(codes: list[str]) -> list[str]:
    from app.pipelines.rail.station_coordinates import equivalent_station_codes

    out: list[str] = []
    for code in codes:
        for c in equivalent_station_codes(code):
            cu = str(c).upper()
            if cu and cu not in out:
                out.append(cu)
    return out


def _merge_station_lists(*groups: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for code in group:
            cu = str(code).upper()
            if cu and cu not in seen:
                seen.add(cu)
                out.append(cu)
    return out


def _city_key_from_iata(token: str) -> tuple[str | None, list[str]]:
    if not re.fullmatch(r"[A-Z]{3}", (token or "").strip().upper()):
        return None, []
    try:
        from app.services.airport_locator_service import get_airport_by_iata

        ap = get_airport_by_iata(token.upper())
        if not ap:
            return None, []
        muni = str(ap.get("municipality") or ap.get("city_name") or ap.get("name") or "").strip()
        if not muni:
            return None, []
        muni = muni.split(",")[0].strip()
        district, _primary, pdf_codes, _ = pdf_station_codes_for_place(muni)
        city_key = _city_key_for_station(pdf_codes[0]) if pdf_codes else None
        if not city_key:
            cfg = _load_rail_config()
            for city in cfg.CITY_TO_STATION:
                if city.lower() == muni.lower():
                    city_key = city
                    break
        curated = _curated_cluster(city_key) if city_key else []
        return city_key or muni, _merge_station_lists(curated, pdf_codes)
    except Exception:
        return None, []


def _iata_overrides_pdf(token: str, pdf_primary: str | None) -> bool:
    try:
        from app.services.airport_locator_service import get_airport_by_iata

        ap = get_airport_by_iata(token.upper())
        if not ap:
            return False
        muni = str(ap.get("municipality") or "").lower()
        if not muni or not pdf_primary:
            return True
        rec = get_pdf_index().lookup_code(pdf_primary)
        if not rec:
            return True
        dist = rec.district.lower()
        return muni not in dist and dist not in muni
    except Exception:
        return False


def _coords_for_codes(codes: list[str], label: str, *, context=None) -> tuple[float | None, float | None]:
    try:
        from app.pipelines.rail.station_coordinates import get_station_latlng

        for code in codes:
            hit = get_station_latlng(code)
            if hit:
                return float(hit[0]), float(hit[1])
    except Exception:
        pass
    try:
        from app.services.geocoder import geocode_latlng

        hit = geocode_latlng(label, context=context)
        if hit:
            return float(hit[0]), float(hit[1])
    except Exception:
        pass
    return None, None


def resolve_location(raw: str, *, context=None) -> ResolvedLocation:
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

    token = original.upper()
    district: str | None = None
    primary_code: str | None = None
    station_codes: list[str] = []
    resolution = "unknown"
    city_key: str | None = None

    # ── 1) IATA airport code (3 letters) checked before PDF rail BLR≠Bengaluru
    if re.fullmatch(r"[A-Z]{3}", token):
        iata_key, iata_codes = _city_key_from_iata(token)
        if iata_codes:
            city_key = iata_key
            station_codes = list(iata_codes)
            primary_code = iata_codes[0]
            resolution = "iata_airport"

    # ── 2) PDF index (station_name.pdf) ─────────────────────────────
    if not station_codes:
        pdf_district, pdf_primary, pdf_codes, pdf_res = pdf_station_codes_for_place(original)
        if pdf_codes:
            district = pdf_district
            primary_code = pdf_primary
            station_codes = list(pdf_codes)
            resolution = pdf_res
            city_key = _city_key_for_station(primary_code) if primary_code else None

    # ── 4) Merge curated CITY_TO_STATION cluster ────────────────────
    if not city_key and primary_code:
        city_key = _city_key_for_station(primary_code)
    curated = _curated_cluster(city_key) if city_key else []
    station_codes = _expand_equivalents(_merge_station_lists(curated, station_codes))

    if not station_codes and primary_code:
        station_codes = _expand_equivalents([primary_code])

    canonical_city = (
        city_key
        if city_key and city_key in _load_rail_config().CITY_TO_STATION
        else (district or original)
    )
    if canonical_city and canonical_city.isupper():
        canonical_city = canonical_city.title()

    lat, lng = _coords_for_codes(
        station_codes or ([primary_code] if primary_code else []),
        canonical_city,
        context=context,
    )

    display = canonical_city
    if primary_code and primary_code.upper() != (canonical_city or "").upper():
        display = f"{canonical_city} ({primary_code})"

    return ResolvedLocation(
        raw=original,
        display_name=display,
        canonical_city=canonical_city,
        station_code=primary_code or (station_codes[0] if station_codes else None),
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
    src, dst = normalize_corridor(source, destination, context=context)
    return src.canonical_city, dst.canonical_city


def api_station_codes_for_place(raw: str, *, max_codes: int = 6) -> list[str]:
    """
    Hub stations for live scrape/API queries — not the full PDF district cluster.
    Full clusters stay on resolve_location().station_codes for CSV fallback.
    """
    loc = resolve_location(raw)
    cfg = _load_rail_config()
    canonical = (loc.canonical_city or "").strip()
    raw_clean = _clean(raw)

    for key, codes in cfg.CITY_TO_STATION.items():
        if key.lower() in {canonical.lower(), raw_clean.lower()}:
            from app.pipelines.rail.station_coordinates import dedupe_station_codes

            # One API query per physical hub — skip alias doubles (PRYJ+ALD, BCT+MMCT).
            return dedupe_station_codes([str(c).upper() for c in codes])[:max_codes]

    out: list[str] = []
    if loc.station_code:
        out.append(str(loc.station_code).upper())
    for code in loc.station_codes or []:
        cu = str(code).upper()
        if cu and cu not in out:
            out.append(cu)
        if len(out) >= max_codes:
            break
    return out
