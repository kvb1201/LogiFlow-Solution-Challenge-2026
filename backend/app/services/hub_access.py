"""
Detect when a user's place is a satellite/feeder station under a metro hub.

Example: Dabhoi (DABHOI JN) → interchange at Vadodara (BRC) before long-haul legs.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.location_funnel import ResolvedLocation

_FEEDER_MIN_KM = 8.0
_STATION_SUFFIX_RE = re.compile(r"\s+(JN\.?|CANT\.?|TOWN|ROAD|CITY|H\.?S\.?)$", re.I)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _strip_station_suffix(name: str) -> str:
    return _STATION_SUFFIX_RE.sub("", (name or "").strip()).strip()


def _primary_hub_code(city_key: str) -> str | None:
    try:
        from app.services.location_funnel import _load_rail_config

        codes = _load_rail_config().CITY_TO_STATION.get(city_key) or []
        return str(codes[0]).upper() if codes else None
    except Exception:
        return None


def _hub_coords(city: str) -> tuple[float, float] | None:
    from app.services.geocoder import geocode_latlng

    hit = geocode_latlng(f"{city}, India")
    return (float(hit[0]), float(hit[1])) if hit else None


def _distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


@dataclass
class FeederAccess:
    local_place: str
    hub_city: str
    local_station: str | None = None
    hub_station: str | None = None
    local_station_code: str | None = None
    hub_station_code: str | None = None
    reason: str = "feeder_station"

    def to_dict(self) -> dict:
        return {
            "local_place": self.local_place,
            "hub_city": self.hub_city,
            "local_station": self.local_station,
            "hub_station": self.hub_station,
            "local_station_code": self.local_station_code,
            "hub_station_code": self.hub_station_code,
            "reason": self.reason,
        }


def get_feeder_access(loc: "ResolvedLocation") -> FeederAccess | None:
    """
    True when the user named a local stop that maps to a parent metro hub.
    """
    raw = (loc.raw or "").strip()
    canonical = (loc.canonical_city or "").strip()
    if not raw or not canonical:
        return None

    raw_n = _norm(raw)
    canon_n = _norm(canonical)
    if raw_n == canon_n or raw_n.startswith(f"{canon_n} "):
        return None

    from app.services.hub_catalog import _match_city_key

    # Geocoded villages near a metro: treat as feeder when within practical road/rail access.
    if loc.resolution == "village_geocoded" and loc.lat is not None and loc.lng is not None:
        try:
            from app.services.geo_hub_finder import nearest_metropolitan_hubs

            near = nearest_metropolitan_hubs(float(loc.lat), float(loc.lng), max_hubs=1)
            if near:
                hub = near[0]
                hub_pt = _hub_coords(hub.city)
                if hub_pt:
                    dist = _distance_km((float(loc.lat), float(loc.lng)), hub_pt)
                    if _FEEDER_MIN_KM <= dist <= 120:
                        primary_hub = _primary_hub_code(hub.city)
                        hub_station = None
                        if primary_hub:
                            try:
                                from app.services.station_pdf_index import get_pdf_index

                                rec = get_pdf_index().lookup_code(primary_hub)
                                hub_station = rec.name if rec else primary_hub
                            except Exception:
                                hub_station = primary_hub
                        local_label = raw.title() if raw.islower() else raw
                        return FeederAccess(
                            local_place=local_label,
                            hub_city=hub.city,
                            hub_station=hub_station,
                            hub_station_code=primary_hub,
                            reason="feeder_village",
                        )
        except Exception:
            pass
        return None

    metro_key = _match_city_key(canonical)
    if not metro_key:
        return None

    primary_hub = _primary_hub_code(metro_key)
    local_code = (loc.station_code or "").upper()
    station_label: str | None = None

    if local_code:
        try:
            from app.services.station_pdf_index import get_pdf_index

            rec = get_pdf_index().lookup_code(local_code)
            if rec and rec.name:
                station_label = rec.name
        except Exception:
            pass

    station_core = _norm(_strip_station_suffix(station_label or ""))
    local_label = raw.title() if raw.islower() else raw

    hub_station = None
    if primary_hub:
        try:
            from app.services.station_pdf_index import get_pdf_index

            rec = get_pdf_index().lookup_code(primary_hub)
            hub_station = rec.name if rec else primary_hub
        except Exception:
            hub_station = primary_hub

    # User typed a distinct station under the metro cluster (Dabhoi → Vadodara).
    name_matches_user = bool(
        station_core
        and (raw_n in station_core or station_core.startswith(raw_n) or station_core == raw_n)
    )
    non_primary_station = bool(primary_hub and local_code and local_code != primary_hub)

    if name_matches_user and non_primary_station:
        return FeederAccess(
            local_place=local_label,
            hub_city=canonical,
            local_station=station_label,
            hub_station=hub_station,
            local_station_code=local_code or None,
            hub_station_code=primary_hub,
            reason="feeder_station",
        )

    # Same district but coords far from metro centre (small town near hub).
    if loc.lat is not None and loc.lng is not None:
        hub_pt = _hub_coords(canonical)
        if hub_pt:
            dist = _distance_km((float(loc.lat), float(loc.lng)), hub_pt)
            if dist >= _FEEDER_MIN_KM and raw_n != canon_n:
                return FeederAccess(
                    local_place=local_label,
                    hub_city=canonical,
                    local_station=station_label,
                    hub_station=hub_station,
                    local_station_code=local_code or None,
                    hub_station_code=primary_hub,
                    reason="feeder_distance",
                )

    return None
