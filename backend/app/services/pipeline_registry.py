from app.pipelines.road import RoadPipeline
from app.pipelines.rail import RailPipeline
from app.pipelines.water import WaterPipeline
from app.pipelines.air import AirPipeline

# NOTE: Do NOT import HybridPipeline at top to avoid circular import

PIPELINES = {
    "road": RoadPipeline(),
    "rail": RailPipeline(),
    "water": WaterPipeline(),
    "air": AirPipeline(),
}


def get_pipeline(mode: str):
    """
    Returns pipeline instance based on mode.
    Hybrid is handled lazily to avoid circular imports.
    """
    if not mode:
        raise ValueError("Mode is required")

    mode = mode.lower()

    if mode == "hybrid":
        from app.pipelines.hybrid.pipeline import HybridPipeline
        return HybridPipeline()

    if mode in PIPELINES:
        return PIPELINES[mode]

    raise ValueError(f"Unsupported mode: {mode}")
