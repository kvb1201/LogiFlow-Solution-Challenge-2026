from __future__ import annotations

from app.pipelines.base import BasePipeline
from app.pipelines.water.engineer import engineer_routes
from app.pipelines.water.ports import map_city_to_ports
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


class WaterPipeline(BasePipeline):
    mode = "water"
    name = "Water Transport (Maritime)"

    def generate(self, source: str, destination: str, payload: dict | None = None, context=None):
        payload = payload or {}
        constraints = payload.get("constraints") or {}

        if source.strip().lower() == destination.strip().lower():
            return _no_routes("Source and destination are the same city.")

        # Default: allow at most 3 transshipments (Indian coastal routes chain
        # through multiple ports along the coastline).
        if constraints.get("max_transshipments") is None:
            constraints = {**constraints, "max_transshipments": 3}
            payload = {**payload, "constraints": constraints}

        origin_ports = map_city_to_ports(source, n=2, context=context)
        dest_ports = map_city_to_ports(destination, n=2, context=context)

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
                port_paths = generate_port_paths(
                    op.port_id,
                    dp.port_id,
                    k=5,
                    max_legs=max(int(constraints.get("max_transshipments", 1)) + 1, 1),
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

        # Lower is better for central scorer, so provide a consistent ordering hint:
        filtered.sort(key=lambda x: (x.get("risk", 1), x.get("time", 1e9), x.get("cost", 1e18)))
        return filtered
