from app.pipelines.road import RoadPipeline
from app.pipelines.rail import RailPipeline
from app.pipelines.water import WaterPipeline
from app.pipelines.hybrid import HybridPipeline

PIPELINES = [
    RoadPipeline(),
    RailPipeline(),
    WaterPipeline(),
    HybridPipeline(),
]