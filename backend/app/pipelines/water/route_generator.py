from __future__ import annotations

from dataclasses import dataclass
import heapq

from app.pipelines.water.config import PORTS, SEA_LANES
from app.pipelines.water.geo import haversine_km


@dataclass(frozen=True)
class PortNode:
    port_id: str
    name: str
    lat: float
    lng: float
    infrastructure_quality: float = 0.8


def _port_index() -> dict[str, PortNode]:
    idx: dict[str, PortNode] = {}
    for p in PORTS:
        idx[str(p["id"])] = PortNode(
            port_id=str(p["id"]),
            name=str(p["name"]),
            lat=float(p["lat"]),
            lng=float(p["lng"]),
            infrastructure_quality=float(p.get("infrastructure_quality", 0.8)),
        )
    return idx


_PORT_IDX: dict[str, PortNode] | None = None
_MAX_BFS_EXPANSIONS = 8000


def _get_port_index() -> dict[str, PortNode]:
    global _PORT_IDX
    if _PORT_IDX is None:
        _PORT_IDX = _port_index()
    return _PORT_IDX


def _edge_distance_km(a: str, b: str) -> float:
    port_idx = _get_port_index()
    pa = port_idx[a]
    pb = port_idx[b]
    return haversine_km(pa.lat, pa.lng, pb.lat, pb.lng)


def generate_port_paths(
    origin_port_id: str,
    dest_port_id: str,
    k: int = 5,
    max_legs: int = 3,
    port_call_penalty_km: float = 60.0,
) -> list[list[str]]:
    """
    Generate up to k plausible port sequences from origin to destination.

    Uses a best-first search over SEA_LANES with a small port-call penalty to
    discourage unnecessary transshipments.

    max_legs is the maximum number of sea legs (edges). So a direct route has 1 leg.
    """
    # Debug BFS input per Step 5
    print(f"[WATER BFS] Trying origin='{origin_port_id}', dest='{dest_port_id}' (max_legs={max_legs})")

    if origin_port_id == dest_port_id:
        # A "water route" with no sea leg is not meaningful; caller can try other port pairs.
        return []

    port_idx = _get_port_index()
    if origin_port_id not in port_idx or dest_port_id not in port_idx:
        print(f"[WATER BFS] Input ports not found in index")
        return []

    if origin_port_id not in SEA_LANES and not any(origin_port_id in lanes for lanes in SEA_LANES.values()):
        print(f"[WATER BFS] origin_port_id '{origin_port_id}' not in SEA_LANES network")
        return []

    dest_node = port_idx[dest_port_id]

    def _heuristic(port_id: str) -> float:
        node = port_idx[port_id]
        return haversine_km(node.lat, node.lng, dest_node.lat, dest_node.lng)

    # A*: (f_score, g_score, path)
    start_h = _heuristic(origin_port_id)
    heap: list[tuple[float, float, list[str]]] = [(start_h, 0.0, [origin_port_id])]
    seen_best: dict[tuple[str, ...], float] = {}
    out: list[list[str]] = []
    expansions = 0

    while heap and len(out) < k and expansions < _MAX_BFS_EXPANSIONS:
        _f_score, score, path = heapq.heappop(heap)
        key = tuple(path)
        if key in seen_best and score > seen_best[key]:
            continue
        seen_best[key] = score
        expansions += 1

        last = path[-1]
        if last == dest_port_id:
            out.append(path)
            continue

        # Sea legs count = len(path)-1
        if len(path) - 1 >= max_legs:
            continue

        for nxt in SEA_LANES.get(last, []):
            if nxt in path:
                continue  # avoid cycles
            if nxt not in port_idx:
                continue
            try:
                d_km = _edge_distance_km(last, nxt)
            except KeyError:
                continue

            # Quality-based adjustment factor (prefers high-quality ports)
            target_infra = port_idx[nxt].infrastructure_quality
            quality_factor = 1.0 - 0.15 * (target_infra - 0.8)

            # Convert penalty to "distance-like" score component
            penalty = port_call_penalty_km if len(path) > 1 else 0.0
            new_score = score + (d_km * quality_factor) + penalty
            heapq.heappush(heap, (new_score + _heuristic(nxt), new_score, path + [nxt]))

    return out


def port_name(port_id: str) -> str:
    return _get_port_index()[port_id].name


def port_coords(port_id: str) -> tuple[float, float]:
    p = _get_port_index()[port_id]
    return p.lat, p.lng


def sea_distance_km(path: list[str]) -> float:
    if len(path) <= 1:
        return 0.0
    d = 0.0
    for a, b in zip(path, path[1:]):
        d += _edge_distance_km(a, b)
    return d


def annotate_chokepoints(path: list[str]) -> list[str]:
    """
    Return the list of chokepoint IDs transited by a port path.
    Wrapper so callers don't need to import ml_models directly.
    """
    try:
        from app.pipelines.water.config import ROUTE_CHOKEPOINTS
    except Exception:
        return []

    cps: list[str] = []
    seen: set[str] = set()
    for a, b in zip(path, path[1:]):
        for cp in ROUTE_CHOKEPOINTS.get((a, b), []) + ROUTE_CHOKEPOINTS.get((b, a), []):
            if cp not in seen:
                seen.add(cp)
                cps.append(cp)
    return cps


def annotated_port_paths(
    origin_port_id: str,
    dest_port_id: str,
    k: int = 5,
    max_legs: int = 3,
) -> list[dict]:
    """
    Like generate_port_paths but returns enriched dicts with chokepoints annotated.

    Each item: {
      "path":         list[str] — port IDs
      "chokepoints":  list[str] — chokepoint IDs transited
      "sea_distance_km": float
    }
    """
    paths = generate_port_paths(origin_port_id, dest_port_id, k=k, max_legs=max_legs)
    return [
        {
            "path":            p,
            "chokepoints":     annotate_chokepoints(p),
            "sea_distance_km": sea_distance_km(p),
        }
        for p in paths
    ]
