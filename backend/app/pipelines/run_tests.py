import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.pipelines.road.pipeline import RoadPipeline
from app.pipelines.rail.pipeline import RailPipeline
from app.pipelines.water.pipeline import WaterPipeline
from app.pipelines.hybrid.pipeline import HybridPipeline

pipelines = [
    RoadPipeline(),
    RailPipeline(),
    WaterPipeline(),
    HybridPipeline(),
]


def run():
    for p in pipelines:
        print(f"\nTesting: {p.mode}")
        routes = p.generate("Surat", "Mumbai")
        for r in routes:
            print(r)


if __name__ == "__main__":
    run()
