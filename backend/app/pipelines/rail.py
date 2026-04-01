from app.pipelines.base import BasePipeline

class RailPipeline(BasePipeline):
    mode = "rail"

    def generate(self, source: str, destination: str):
        return [
            {
                "type": "Rail",
                "mode": "rail",
                "time": 8,
                "cost": 2000,
                "risk": 0.3,
                "segments": [
                    {"mode": "Rail", "from": source, "to": destination}
                ],
            }
        ]