"""
Dynamic sea routing graph — Phase 2.

Builds PORTS and SEA_LANES from PortWatch CSV data plus curated legacy corridors.
Graph is constructed once at import time (in-memory, no per-request I/O).
"""

from __future__ import annotations

import logging
from collections import defaultdict

from app.pipelines.water.chokepoints import CHOKEPOINTS
from app.pipelines.water.data_loader import PORTWATCH_PORTS, PortMeta, SPILLOVER_TRANSIT_DAYS
from app.pipelines.water.legacy_sea_graph import (
    LEGACY_PORT_SUPPLEMENTS,
    LEGACY_SEA_LANES,
    legacy_route_chokepoints,
)
from app.pipelines.water.geo import haversine_km

log = logging.getLogger(__name__)

# Graph tuning — balance coverage vs BFS performance
SPILLOVER_MAX_DAYS = 7.0
SPILLOVER_MAX_NEIGHBORS = 5
SPILLOVER_MAX_DISTANCE_KM = 2400.0
PROXIMITY_MAX_KM = 750.0
PROXIMITY_NEIGHBORS = 3
MAX_DEGREE_PER_PORT = 12
CHOKEPOINT_CORRIDOR_KM = 350.0

_REGION_BY_CONTINENT = {
    "Asia & Pacific": "asia_pacific",
    "Europe": "europe",
    "Americas": "americas",
    "Africa": "africa",
    "Middle East": "middle_east",
}

_PIRACY_BY_REGION = {
    "india": 0.02,
    "south_asia": 0.04,
    "middle_east": 0.05,
    "southeast_asia": 0.03,
    "east_asia": 0.01,
    "europe": 0.00,
    "africa": 0.03,
    "north_america": 0.01,
    "south_america": 0.02,
    "asia_pacific": 0.02,
    "americas": 0.02,
}

_SECURITY_BY_REGION = {
    "india": 0.17,
    "south_asia": 0.14,
    "middle_east": 0.18,
    "southeast_asia": 0.14,
    "east_asia": 0.11,
    "europe": 0.08,
    "africa": 0.16,
    "north_america": 0.10,
    "south_america": 0.14,
    "asia_pacific": 0.13,
    "americas": 0.12,
}


def _display_name(portname: str, country: str) -> str:
    portname = (portname or "").strip()
    country = (country or "").strip()
    if portname and country and country.lower() not in portname.lower():
        return f"{portname}, {country}"
    return portname or country


def _coast_for_meta(meta: PortMeta) -> str:
    if meta.iso3 == "IND":
        return "west" if meta.lon < 77.0 else "east"
    return "international"


def _region_for_meta(meta: PortMeta) -> str:
    if meta.iso3 == "IND":
        return "india"
    continent = (meta.continent or "").strip()
    if continent in _REGION_BY_CONTINENT:
        return _REGION_BY_CONTINENT[continent]
    lowered = continent.lower()
    if "europe" in lowered:
        return "europe"
    if "africa" in lowered:
        return "africa"
    if "america" in lowered:
        return "americas"
    if "middle" in lowered:
        return "middle_east"
    return "asia_pacific"


def _customs_hours(meta: PortMeta) -> float:
    if meta.systemic_class == "major":
        return 6.0
    if meta.systemic_class == "regional":
        return 8.0
    return 10.0


def _base_congestion(meta: PortMeta) -> float:
    # Normalise vessel throughput to 0.25–0.65
    return round(min(0.65, max(0.25, 0.25 + (meta.vessel_count_total / 12000.0))), 3)


def _meta_to_port_dict(meta: PortMeta) -> dict:
    region = _region_for_meta(meta)
    return {
        "id": meta.portid,
        "name": _display_name(meta.portname, meta.country),
        "lat": meta.lat,
        "lng": meta.lon,
        "coast": _coast_for_meta(meta),
        "region": region,
        "infrastructure_quality": meta.infrastructure_quality,
        "customs_hours": _customs_hours(meta),
        "piracy_risk": _PIRACY_BY_REGION.get(region, 0.02),
        "base_congestion": _base_congestion(meta),
        "base_security_risk": _SECURITY_BY_REGION.get(region, 0.14),
        "import_share": meta.import_share,
        "vessel_count_total": meta.vessel_count_total,
        "locode": meta.locode,
        "continent": meta.continent,
        "iso3": meta.iso3,
        "systemic_class": meta.systemic_class,
    }


def _add_edge(graph: dict[str, set[str]], a: str, b: str) -> None:
    if a == b:
        return
    graph.setdefault(a, set()).add(b)
    graph.setdefault(b, set()).add(a)


def _trim_degree(
    graph: dict[str, set[str]],
    port_id: str,
    coords: dict[str, tuple[float, float]],
    protected_neighbors: dict[str, set[str]],
) -> None:
    neighbors = graph.get(port_id)
    if not neighbors or len(neighbors) <= MAX_DEGREE_PER_PORT:
        return

    locked = protected_neighbors.get(port_id, set()) & neighbors
    if len(neighbors) <= MAX_DEGREE_PER_PORT and len(locked) <= MAX_DEGREE_PER_PORT:
        return

    lat, lon = coords[port_id]
    ranked = sorted(
        neighbors - locked,
        key=lambda n: haversine_km(lat, lon, coords[n][0], coords[n][1]),
    )
    slots = max(MAX_DEGREE_PER_PORT - len(locked), len(locked))
    keep = locked | set(ranked[: max(0, MAX_DEGREE_PER_PORT - len(locked))])
    if len(keep) < len(locked):
        keep = locked

    graph[port_id] = keep
    for n in neighbors - keep:
        if n in graph and port_id in graph[n]:
            # Keep reverse edge if it is protected on the other side.
            if port_id not in protected_neighbors.get(n, set()):
                graph[n].discard(port_id)


def _infer_chokepoints(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> list[str]:
    edge_km = haversine_km(lat1, lon1, lat2, lon2)
    if edge_km <= 0:
        return []
    mid_lat = (lat1 + lat2) / 2.0
    mid_lon = (lon1 + lon2) / 2.0
    corridor = min(CHOKEPOINT_CORRIDOR_KM, max(180.0, edge_km * 0.25))
    hits: list[str] = []
    for cp_id, cp in CHOKEPOINTS.items():
        cp_lat = float(cp["lat"])
        cp_lon = float(cp["lng"])
        nearest = min(
            haversine_km(lat1, lon1, cp_lat, cp_lon),
            haversine_km(lat2, lon2, cp_lat, cp_lon),
            haversine_km(mid_lat, mid_lon, cp_lat, cp_lon),
        )
        if nearest <= corridor:
            hits.append(cp_id)
    return hits


def _build_graph() -> tuple[list[dict], dict[str, list[str]], dict[tuple[str, str], list[str]], frozenset[str]]:
    ports_by_id: dict[str, dict] = {}

    for meta in PORTWATCH_PORTS.values():
        ports_by_id[meta.portid] = _meta_to_port_dict(meta)

    for legacy in LEGACY_PORT_SUPPLEMENTS:
        ports_by_id[str(legacy["id"])] = dict(legacy)

    coords: dict[str, tuple[float, float]] = {
        pid: (float(p["lat"]), float(p["lng"])) for pid, p in ports_by_id.items()
    }
    graph: dict[str, set[str]] = defaultdict(set)
    protected_neighbors: dict[str, set[str]] = defaultdict(set)

    # 1) Curated corridor seeds (never trimmed)
    for src, targets in LEGACY_SEA_LANES.items():
        if src not in ports_by_id:
            continue
        for dst in targets:
            if dst in ports_by_id:
                _add_edge(graph, src, dst)
                protected_neighbors[src].add(dst)
                protected_neighbors[dst].add(src)

    # 2) Observed spillover lanes — top-N short transit neighbors per port
    spillover_candidates: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for (fp, tp), days in SPILLOVER_TRANSIT_DAYS.items():
        if fp not in ports_by_id or tp not in ports_by_id:
            continue
        if days <= 0 or days > SPILLOVER_MAX_DAYS:
            continue
        lat1, lon1 = coords[fp]
        lat2, lon2 = coords[tp]
        if haversine_km(lat1, lon1, lat2, lon2) > SPILLOVER_MAX_DISTANCE_KM:
            continue
        spillover_candidates[fp].append((tp, days))

    for fp, candidates in spillover_candidates.items():
        candidates.sort(key=lambda item: item[1])
        for tp, _days in candidates[:SPILLOVER_MAX_NEIGHBORS]:
            _add_edge(graph, fp, tp)

    # 3) Proximity edges within continent for local connectivity
    by_continent: dict[str, list[str]] = defaultdict(list)
    for pid, port in ports_by_id.items():
        continent = str(port.get("continent") or port.get("region") or "unknown")
        by_continent[continent].append(pid)

    for _continent, members in by_continent.items():
        for pid in members:
            lat, lon = coords[pid]
            ranked = sorted(
                (other for other in members if other != pid),
                key=lambda other: haversine_km(lat, lon, coords[other][0], coords[other][1]),
            )
            for other in ranked[:PROXIMITY_NEIGHBORS]:
                if haversine_km(lat, lon, coords[other][0], coords[other][1]) <= PROXIMITY_MAX_KM:
                    _add_edge(graph, pid, other)

    # 4) Ensure every port has at least one hub link to a major port
    majors = [pid for pid, p in ports_by_id.items() if p.get("systemic_class") == "major"]
    if not majors:
        majors = sorted(
            ports_by_id.keys(),
            key=lambda pid: int(ports_by_id[pid].get("vessel_count_total", 0)),
            reverse=True,
        )[:25]

    for pid, port in ports_by_id.items():
        if graph.get(pid):
            continue
        lat, lon = coords[pid]
        continent = str(port.get("continent") or "")
        pool = [m for m in majors if str(ports_by_id[m].get("continent") or "") == continent] or majors
        nearest = min(pool, key=lambda m: haversine_km(lat, lon, coords[m][0], coords[m][1]))
        _add_edge(graph, pid, nearest)

    # 5) Degree cap for BFS performance
    for pid in list(graph.keys()):
        _trim_degree(graph, pid, coords, protected_neighbors)

    sea_lanes: dict[str, list[str]] = {
        pid: sorted(neighbors) for pid, neighbors in graph.items() if neighbors
    }

    routable_ids: set[str] = set(sea_lanes.keys())
    for neighbors in sea_lanes.values():
        routable_ids.update(neighbors)

    # Chokepoints: legacy map + inferred for new edges
    route_chokepoints: dict[tuple[str, str], list[str]] = legacy_route_chokepoints()
    for pid, neighbors in sea_lanes.items():
        lat1, lon1 = coords[pid]
        for nxt in neighbors:
            key = (pid, nxt)
            if key in route_chokepoints or (nxt, pid) in route_chokepoints:
                continue
            lat2, lon2 = coords[nxt]
            inferred = _infer_chokepoints(lat1, lon1, lat2, lon2)
            if inferred:
                route_chokepoints[key] = inferred

    ports = sorted(ports_by_id.values(), key=lambda p: (str(p.get("continent", "")), str(p.get("name", ""))))

    log.info(
        "[sea_graph] Built network: %d ports, %d routable, %d lane nodes, %d edges, %d chokepoint pairs",
        len(ports),
        len(routable_ids),
        len(sea_lanes),
        sum(len(v) for v in sea_lanes.values()) // 2,
        len(route_chokepoints),
    )

    return ports, sea_lanes, route_chokepoints, frozenset(routable_ids)


PORTS, SEA_LANES, ROUTE_CHOKEPOINTS, ROUTABLE_PORT_IDS = _build_graph()
