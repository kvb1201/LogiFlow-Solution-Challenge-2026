PIPELINES = []


def _safe_add(pipeline_cls, label: str):
    try:
        PIPELINES.append(pipeline_cls())
    except Exception as e:
        print(f"[pipeline_registry] skipping {label}: {e}")


# Keep imports isolated so missing optional deps (e.g., requests) don't break app import.
try:
    from app.pipelines.road.adapter import RoadBaseAdapter
    _safe_add(RoadBaseAdapter, "road")
except Exception as e:
    print(f"[pipeline_registry] skipping road: {e}")

try:
    from app.pipelines.rail import RailPipeline
    _safe_add(RailPipeline, "rail")
except Exception as e:
    print(f"[pipeline_registry] skipping rail: {e}")

try:
    from app.pipelines.water import WaterPipeline
    _safe_add(WaterPipeline, "water")
except Exception as e:
    print(f"[pipeline_registry] skipping water: {e}")

try:
    from app.pipelines.hybrid import HybridPipeline
    _safe_add(HybridPipeline, "hybrid")
except Exception as e:
    print(f"[pipeline_registry] skipping hybrid: {e}")
