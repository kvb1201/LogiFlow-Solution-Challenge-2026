from __future__ import annotations

from typing import Any

from app.pipelines.base import BasePipeline


class RoadBaseAdapter(BasePipeline):
    """
    Adapter for the central /optimize decision engine.

    RoadPipeline.generate() returns a rich dict (best/alternatives/all), while the
    BasePipeline contract requires list[route]. This adapter converts the output
    into a route list compatible with validator/scorer.
    """

    mode = "road"
    name = "Road Transport (Adapter)"

    def generate(self, source: str, destination: str, payload: dict | None = None, context=None):
        from app.pipelines.road.pipeline import RoadPipeline

        payload = payload or {}

        raw: Any = RoadPipeline().generate(source, destination, payload, context=context)
        if not isinstance(raw, dict):
            return []

        # Preferred: road pipeline provides a fully-explained ranked list under "all"
        routes = raw.get("all")
        if isinstance(routes, list):
            return routes

        # Fallback: stitch best + alternatives (dedupe by (time,cost,risk,type))
        out = []
        best = raw.get("best")
        if isinstance(best, dict):
            out.append(best)
        alts = raw.get("alternatives")
        if isinstance(alts, list):
            for a in alts:
                if isinstance(a, dict):
                    out.append(a)

        seen = set()
        deduped = []
        for r in out:
            key = (r.get("type"), r.get("time"), r.get("cost"), r.get("risk"))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(r)

        return deduped

