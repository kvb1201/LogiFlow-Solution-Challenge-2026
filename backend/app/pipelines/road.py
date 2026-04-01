from app.pipelines.base import BasePipeline

class RoadPipeline(BasePipeline):
    mode = "road"

    def generate(self, source: str, destination: str):
        return [
            {
                "type": "Road",
                "mode": "road",
                "time": 7,
                "cost": 3000,
                "risk": 0.6,
                "segments": [
                    {"mode": "Road", "from": source, "to": destination}
                ],
            }
        ]