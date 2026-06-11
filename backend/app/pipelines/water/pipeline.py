from __future__ import annotations

from app.pipelines.base import BasePipeline
from app.pipelines.water.engineer import engineer_routes
from app.pipelines.water.ports import map_city_to_ports, map_port_id_to_candidates
from app.pipelines.water.route_generator import generate_port_paths


def _no_routes(message: str) -> dict:
    """Standard no-routes response consistent with rail/air pipelines."""
    return {
        "mode": "water",
        "status": "no_routes",
        "message": message,
        "best": None,
        "alternatives": [],
        "all": [],
    }


def _coerce_nonnegative_int(value, default: int) -> int:
    if value is None:
        return default
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return default


def _sort_key_for_priority(priority: str):
    normalized = (priority or "balanced").strip().lower()
    if normalized in {"cost", "cheap", "cheapest"}:
        return lambda x: (x.get("cost", 1e18), x.get("risk", 1), x.get("time", 1e9))
    if normalized in {"time", "fast", "fastest"}:
        return lambda x: (x.get("time", 1e9), x.get("risk", 1), x.get("cost", 1e18))
    if normalized in {"safe", "safety", "safest"}:
        return lambda x: (x.get("risk", 1), x.get("time", 1e9), x.get("cost", 1e18))
    return lambda x: (x.get("risk", 1), x.get("time", 1e9), x.get("cost", 1e18))


class WaterPipeline(BasePipeline):
    mode = "water"
    name = "Water Transport (Maritime)"

    def generate(self, source: str, destination: str, payload: dict | None = None, context=None):
        payload = payload or {}
        constraints = payload.get("constraints") or {}

        if source.strip().lower() == destination.strip().lower():
            return _no_routes("Source and destination cannot be the same city.")

        from app.utils.coordinates import get_coords_or_none
        from app.pipelines.water.geo import haversine_km
        s_coords = get_coords_or_none(source)
        d_coords = get_coords_or_none(destination)
        if s_coords and d_coords:
            direct_km = haversine_km(s_coords[0], s_coords[1], d_coords[0], d_coords[1])
            if direct_km < 300.0:
                return _no_routes(f"Distance between {source} and {destination} is too short ({direct_km:.0f} km) for viable water transport.")

        # Default: allow at most 3 transshipments (Indian coastal routes chain
        # through multiple ports along the coastline).
        max_transshipments = _coerce_nonnegative_int(constraints.get("max_transshipments"), 3)
        constraints = {**constraints, "max_transshipments": max_transshipments}
        payload = {**payload, "constraints": constraints}

        source_port_id = str(payload.get("source_port_id") or "").strip()
        destination_port_id = str(payload.get("destination_port_id") or "").strip()

        if source_port_id:
            origin_ports = map_port_id_to_candidates(source_port_id, n=1)
        else:
            try:
                origin_ports = map_city_to_ports(source, n=2, context=context)
            except ValueError as e:
                return _no_routes(str(e))

        if destination_port_id:
            dest_ports = map_port_id_to_candidates(destination_port_id, n=1)
        else:
            try:
                dest_ports = map_city_to_ports(destination, n=2, context=context)
            except ValueError as e:
                return _no_routes(str(e))

        # --- Fix #5: Handle empty port mapping ---
        if not origin_ports and not dest_ports:
            return _no_routes(
                f"Neither {source} nor {destination} is close enough to the coastline for water transport"
            )
        if not origin_ports:
            return _no_routes(
                f"{source} is too far from the coastline for water transport"
            )
        if not dest_ports:
            return _no_routes(
                f"{destination} is too far from the coastline for water transport"
            )


        all_routes: list[dict] = []

        # Generate plausible port-to-port paths across port candidates.
        for op in origin_ports:
            for dp in dest_ports:
                if op.port_id == dp.port_id:
                    continue
                # max_legs is the number of sea segments, not transshipments.
                # transshipments = legs - 1 (intermediate ports).
                # We need enough legs for hub routing (e.g. India → Jebel Ali → Port Said → Rotterdam
                # = 3 legs, 2 transshipments). Add +2 headroom for hub-to-hub routing.
                # But honour max_transshipments=0 strictly (direct routes only = max_legs=1).
                if max_transshipments == 0:
                    max_legs = 1   # strictly direct, 1 sea leg
                else:
                    max_legs = max(max_transshipments + 2, 4)
                port_paths = generate_port_paths(
                    op.port_id,
                    dp.port_id,
                    k=5,
                    max_legs=max_legs,
                )
                if not port_paths:
                    continue
                routes = engineer_routes(port_paths, source, destination, payload)
                all_routes.extend(routes)

        # --- Fix #3: No fake route injection ---
        if not all_routes:
            return _no_routes(
                f"No maritime routes found between {source} and {destination} in the current port network"
            )

        # --- Fix #4: Respect constraint filters ---
        filtered = [r for r in all_routes if not r.get("_filtered_out")]
        if not filtered:
            return _no_routes(
                f"No water routes between {source} and {destination} satisfy the given constraints"
            )

        for r in filtered:
            r.pop("_filtered_out", None)

        filtered.sort(key=_sort_key_for_priority(str(payload.get("priority") or "balanced")))
        return filtered
