from app.pipelines.base import BasePipeline

class HybridPipeline(BasePipeline):
    mode = "hybrid"

    def generate(self, source: str, destination: str):
        return [
            {
                "type": "Hybrid",
                "mode": "hybrid",
                "time": 6,
                "cost": 2500,
                "risk": 0.4,
                "segments": [
                    {"mode": "Road", "from": source, "to": "Midpoint"},
                    {"mode": "Rail", "from": "Midpoint", "to": destination},
                ],
            }
        ]