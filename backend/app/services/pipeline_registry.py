from app.pipelines.road import RoadPipeline
from app.pipelines.rail import RailPipeline
from app.pipelines.water import WaterPipeline
from app.pipelines.hybrid import HybridPipeline
from app.pipelines.air import AirPipeline

PIPELINES = [
    RoadPipeline(),
    RailPipeline(),
    WaterPipeline(),
    HybridPipeline(),
    AirPipeline(),
]
