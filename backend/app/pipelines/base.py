class BasePipeline:
    mode = None  # must be overridden

    def generate(self, source: str, destination: str):
        """
        Generate routes between source and destination.

        Must return:
        [
            {
                "type": str,
                "mode": str,
                "time": float,
                "cost": float,
                "risk": float,
                "segments": list
            }
        ]
        """
        raise NotImplementedError("Pipeline must implement generate()")