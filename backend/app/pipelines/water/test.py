import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from app.pipelines.water import WaterPipeline


def test():
    pipeline = WaterPipeline()
    print("--- Test Case 1: Valid Coastal Route (Surat -> Mumbai) ---")
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
    print(f"Routes: {len(routes) if isinstance(routes, list) else routes}")

    print("\n--- Test Case 2: Nonexistent Port/City (InvalidCity123 -> Mumbai) ---")
    res2 = pipeline.generate(
        "InvalidCity123",
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
    print(f"Result: {res2}")

    print("\n--- Test Case 3: Far Inland City (Delhi -> Mumbai) ---")
    res3 = pipeline.generate(
        "Delhi",
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
    print(f"Result: {res3}")


if __name__ == "__main__":
    test()

