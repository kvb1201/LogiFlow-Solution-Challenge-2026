from __future__ import annotations

from app.pipelines.base import BasePipeline
from app.pipelines.water.engineer import engineer_routes
from app.pipelines.water.ports import map_city_to_ports
from app.pipelines.water.route_generator import generate_port_paths


class WaterPipeline(BasePipeline):
    mode = "water"
    name = "Water Transport (Maritime)"

    def generate(self, source: str, destination: str, payload: dict | None = None, context=None):
        payload = payload or {}
        constraints = payload.get("constraints") or {}

        # Default: allow at most 1 transshipment unless user overrides.
        if constraints.get("max_transshipments") is None:
            constraints = {**constraints, "max_transshipments": 1}
            payload = {**payload, "constraints": constraints}

        origin_ports = map_city_to_ports(source, n=2, context=context)
        dest_ports = map_city_to_ports(destination, n=2, context=context)

        if not origin_ports or not dest_ports:
            return [
                {
                    "type": "Water",
                    "mode": "water",
                    "time": 30.0,
                    "cost": 9000,
                    "risk": 0.55,
                    "segments": [{"mode": "Water", "from": source, "to": destination}],
                    "notes": "Port mapping failed; returning a fallback route.",
                }
            ]

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

        if not all_routes:
            return [
                {
                    "type": "Water",
                    "mode": "water",
                    "time": 30.0,
                    "cost": 9000,
                    "risk": 0.55,
                    "segments": [{"mode": "Water", "from": source, "to": destination}],
                    "notes": "No maritime paths found in the current port network.",
                }
            ]

        # Apply constraint filtering; if everything is filtered out, fall back to unfiltered.
        filtered = [r for r in all_routes if not r.get("_filtered_out")]
        if filtered:
            for r in filtered:
                r.pop("_filtered_out", None)
            # Lower is better for central scorer, so provide a consistent ordering hint:
            filtered.sort(key=lambda x: (x.get("risk", 1), x.get("time", 1e9), x.get("cost", 1e18)))
            return filtered

        note = "No routes satisfy constraints; returning closest available alternatives."
        for r in all_routes:
            r.pop("_filtered_out", None)
            r["notes"] = note

        all_routes.sort(key=lambda x: (x.get("risk", 1), x.get("time", 1e9), x.get("cost", 1e18)))
        return all_routes
