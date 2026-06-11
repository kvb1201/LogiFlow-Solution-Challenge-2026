"""
Unified water port catalog — merges PortWatch CSV ports with routable config ports.

Built once at import time for O(1) lookups and fast in-memory search (no I/O per request).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.pipelines.water.data_loader import PORTWATCH_PORTS, PortMeta
from app.pipelines.water.sea_graph import ROUTABLE_PORT_IDS


@dataclass(frozen=True)
class CatalogPort:
    id: str
    name: str
    country: str
    region: str
    routable: bool
    lat: float
    lng: float
    locode: str = ""


def city_matches_port(city: str, port_name: str, port_id: str = "") -> bool:
    """True when a city/query label refers to a port (exact or common alias)."""
    city_norm = (city or "").strip().lower()
    if not city_norm:
        return False

    port_id_norm = (port_id or "").strip().lower()
    name_norm = (port_name or "").strip().lower()
    root = name_norm.split(",")[0].strip()
    base = root.split("(")[0].strip()

    if city_norm in {port_id_norm, name_norm, root, base}:
        return True
    if root.startswith(f"{city_norm}-") or root.startswith(f"{city_norm} "):
        return True
    if base.startswith(f"{city_norm} ") or base.startswith(f"{city_norm}("):
        return True
    return False


def _display_name(portname: str, country: str) -> str:
    portname = (portname or "").strip()
    country = (country or "").strip()
    if portname and country and country.lower() not in portname.lower():
        return f"{portname}, {country}"
    return portname or country


def _region_from_config(port: dict) -> str:
    raw = str(port.get("region", "") or "").strip().lower()
    mapping = {
        "india": "Asia",
        "middle_east": "Middle East",
        "southeast_asia": "Asia",
        "east_asia": "Asia",
        "europe": "Europe",
        "africa": "Africa",
        "north_america": "Americas",
        "south_america": "Americas",
        "south_asia": "Asia",
    }
    return mapping.get(raw, raw.replace("_", " ").title() or "Unknown")


def _meta_to_catalog(meta: PortMeta, routable: bool) -> CatalogPort:
    return CatalogPort(
        id=meta.portid,
        name=_display_name(meta.portname, meta.country),
        country=meta.country,
        region=meta.continent or "Unknown",
        routable=routable,
        lat=meta.lat,
        lng=meta.lon,
        locode=meta.locode,
    )


def _config_to_catalog(port: dict, routable: bool = True) -> CatalogPort:
    name = str(port.get("name", "")).strip()
    country = ""
    if ", " in name:
        country = name.rsplit(", ", 1)[-1].strip()
    return CatalogPort(
        id=str(port["id"]),
        name=name,
        country=country,
        region=_region_from_config(port),
        routable=routable,
        lat=float(port.get("lat", 0) or 0),
        lng=float(port.get("lng", port.get("lon", 0)) or 0),
        locode=str(port.get("locode", "") or ""),
    )


ROUTABLE_IDS: frozenset[str] = ROUTABLE_PORT_IDS

_CATALOG_BY_ID: dict[str, CatalogPort] = {}
_CATALOG_BY_NAME: dict[str, CatalogPort] = {}
_SEARCH_INDEX: list[tuple[str, CatalogPort]] = []


def _build_catalog() -> None:
    if _CATALOG_BY_ID:
        return

    for port_id, meta in PORTWATCH_PORTS.items():
        entry = _meta_to_catalog(meta, port_id in ROUTABLE_IDS)
        _CATALOG_BY_ID[entry.id] = entry
        _CATALOG_BY_NAME[entry.name.lower()] = entry

    # Refresh routable flags from expanded sea graph.
    for port_id in list(_CATALOG_BY_ID.keys()):
        existing = _CATALOG_BY_ID[port_id]
        routable = port_id in ROUTABLE_IDS
        if existing.routable == routable:
            continue
        updated = CatalogPort(
            id=existing.id,
            name=existing.name,
            country=existing.country,
            region=existing.region,
            routable=routable,
            lat=existing.lat,
            lng=existing.lng,
            locode=existing.locode,
        )
        _CATALOG_BY_ID[port_id] = updated
        _CATALOG_BY_NAME[updated.name.lower()] = updated

    from app.pipelines.water.legacy_sea_graph import LEGACY_PORT_SUPPLEMENTS

    for port in LEGACY_PORT_SUPPLEMENTS:
        port_id = str(port["id"])
        if port_id in _CATALOG_BY_ID:
            continue
        entry = _config_to_catalog(port, routable=port_id in ROUTABLE_IDS)
        _CATALOG_BY_ID[entry.id] = entry
        _CATALOG_BY_NAME[entry.name.lower()] = entry

    _SEARCH_INDEX.clear()
    for entry in _CATALOG_BY_ID.values():
        haystack = " ".join(
            [
                entry.id,
                entry.name,
                entry.country,
                entry.region,
                entry.locode,
            ]
        ).lower()
        _SEARCH_INDEX.append((haystack, entry))


_build_catalog()


def list_ports() -> list[dict]:
    ports = sorted(_CATALOG_BY_ID.values(), key=lambda p: (p.region, p.name))
    return [
        {
            "id": p.id,
            "name": p.name,
            "country": p.country,
            "region": p.region,
            "routable": p.routable,
            "lat": p.lat,
            "lng": p.lng,
        }
        for p in ports
    ]


def port_stats() -> dict:
    ports = _CATALOG_BY_ID.values()
    regions = {p.region for p in ports if p.region}
    routable = sum(1 for p in ports if p.routable)
    return {
        "total": len(_CATALOG_BY_ID),
        "routable": routable,
        "regions": len(regions),
    }


def search_ports(query: str, *, limit: int = 25) -> list[dict]:
    q = (query or "").strip().lower()
    if not q:
        return list_ports()[:limit]

    matches: list[CatalogPort] = []
    for haystack, entry in _SEARCH_INDEX:
        if q in haystack:
            matches.append(entry)
            if len(matches) >= limit:
                break

    return [
        {
            "id": p.id,
            "name": p.name,
            "country": p.country,
            "region": p.region,
            "routable": p.routable,
            "lat": p.lat,
            "lng": p.lng,
        }
        for p in matches
    ]


def get_port(port_id: str) -> Optional[CatalogPort]:
    return _CATALOG_BY_ID.get(str(port_id).strip())


def resolve_port(*, name: str | None = None, port_id: str | None = None) -> Optional[CatalogPort]:
    name_hit: CatalogPort | None = None
    if name:
        normalized = name.strip().lower()
        if normalized in _CATALOG_BY_NAME:
            name_hit = _CATALOG_BY_NAME[normalized]
        else:
            alias_matches: list[CatalogPort] = []
            for entry in _CATALOG_BY_ID.values():
                if entry.name.lower() == normalized or entry.id.lower() == normalized:
                    name_hit = entry
                    break
                if city_matches_port(normalized, entry.name, entry.id):
                    alias_matches.append(entry)
            if name_hit is None and alias_matches:
                alias_matches.sort(key=lambda e: (not e.routable, len(e.name)))
                name_hit = alias_matches[0]

    if port_id:
        hit = _CATALOG_BY_ID.get(str(port_id).strip())
        if hit and not name:
            return hit
        if hit and name_hit is not None and name_hit.id == hit.id:
            return hit
        return None

    if name_hit:
        return name_hit
    return None


def validate_port_selection(
    *,
    label: str,
    name: str | None = None,
    port_id: str | None = None,
) -> CatalogPort:
    port = resolve_port(name=name, port_id=port_id)
    if port is None:
        raise ValueError(f"{label} must be selected from the port list.")
    if not port.routable:
        raise ValueError(
            f"{port.name} is in our database but not yet connected in the routing network."
        )
    return port
