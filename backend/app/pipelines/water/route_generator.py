from __future__ import annotations

from dataclasses import dataclass
import heapq

from app.pipelines.water.config import PORTS, SEA_LANES
from app.pipelines.water.ports import haversine_km


@dataclass(frozen=True)
class PortNode:
    port_id: str
    name: str
    lat: float
    lng: float


def _port_index() -> dict[str, PortNode]:
    idx: dict[str, PortNode] = {}
    for p in PORTS:
        idx[str(p["id"])] = PortNode(
            port_id=str(p["id"]),
            name=str(p["name"]),
            lat=float(p["lat"]),
            lng=float(p["lng"]),
        )
    return idx


_PORT_IDX = _port_index()


def _edge_distance_km(a: str, b: str) -> float:
    pa = _PORT_IDX[a]
    pb = _PORT_IDX[b]
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

    if origin_port_id not in _PORT_IDX or dest_port_id not in _PORT_IDX:
        print(f"[WATER BFS] Input ports not found in index")
        return []
    
    if origin_port_id not in SEA_LANES and not any(origin_port_id in lanes for lanes in SEA_LANES.values()):
        print(f"[WATER BFS] origin_port_id '{origin_port_id}' not in SEA_LANES network")
        return []

    # (score, path)
    heap: list[tuple[float, list[str]]] = [(0.0, [origin_port_id])]
    seen_best: dict[tuple[str, ...], float] = {}
    out: list[list[str]] = []

    while heap and len(out) < k:
        score, path = heapq.heappop(heap)
        key = tuple(path)
        if key in seen_best and score > seen_best[key]:
            continue
        seen_best[key] = score

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
            try:
                d_km = _edge_distance_km(last, nxt)
            except KeyError:
                continue

            # Convert penalty to "distance-like" score component
            penalty = port_call_penalty_km if len(path) > 1 else 0.0
            new_score = score + d_km + penalty
            heapq.heappush(heap, (new_score, path + [nxt]))

    return out


def port_name(port_id: str) -> str:
    return _PORT_IDX[port_id].name


def port_coords(port_id: str) -> tuple[float, float]:
    p = _PORT_IDX[port_id]
    return p.lat, p.lng


def sea_distance_km(path: list[str]) -> float:
    if len(path) <= 1:
        return 0.0
    d = 0.0
    for a, b in zip(path, path[1:]):
        d += _edge_distance_km(a, b)
    return d
