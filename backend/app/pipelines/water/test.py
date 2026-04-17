import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from app.pipelines.water import WaterPipeline


def test():
    pipeline = WaterPipeline()
    routes = pipeline.generate(
        "Surat",
        "Mumbai",
        {
            "cargo_weight_kg": 250,
            "cargo_type": "General",
            "priority": "cost",
            "constraints": {
                "max_transshipments": 1,
                "risk_threshold": 0.75,
            },
        },
    )

    print("Generated Routes:")
    for r in routes:
        print(r)


if __name__ == "__main__":
    test()
