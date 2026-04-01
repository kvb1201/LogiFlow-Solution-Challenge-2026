from app.pipelines.base import BasePipeline
from app.utils.coordinates import get_dynamic_midpoint


class HybridPipeline(BasePipeline):
    mode = "hybrid"
    name = "Hybrid Transport"

    def generate(self, source: str, destination: str):
        dynamic_midpoint = get_dynamic_midpoint(source, destination)
        
        return [
            {
                "type": "Hybrid",
                "mode": "hybrid",
                "time": 6,
                "cost": 2500,
                "risk": 0.4,
                "segments": [
                    {"mode": "Road", "from": source, "to": dynamic_midpoint},
                    {"mode": "Rail", "from": dynamic_midpoint, "to": destination},
                ],
            }
        ]
