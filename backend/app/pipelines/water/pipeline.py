from app.pipelines.base import BasePipeline


class WaterPipeline(BasePipeline):
    mode = "water"
    name = "Water Transport"

    def generate(self, source: str, destination: str):
        dynamic_port = "Jawaharlal Nehru Port"
        
        return [
            {
                "type": "Water",
                "mode": "water",
                "time": 10,
                "cost": 1500,
                "risk": 0.5,
                "segments": [
                    {"mode": "Water", "from": source, "to": dynamic_port},
                    {"mode": "Water", "from": dynamic_port, "to": destination},
                ],
            }
        ]
