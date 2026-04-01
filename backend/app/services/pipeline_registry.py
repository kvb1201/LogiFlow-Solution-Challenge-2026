from app.pipelines.road.pipeline import RoadPipeline
from app.pipelines.rail.pipeline import RailPipeline
from app.pipelines.water.pipeline import WaterPipeline
from app.pipelines.hybrid.pipeline import HybridPipeline

PIPELINES = [
    RoadPipeline(),
    RailPipeline(),
    WaterPipeline(),
    HybridPipeline(),
]