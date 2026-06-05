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

    print("\n--- Test Case 4: International Route (Mumbai -> Rotterdam) ---")
    res4 = pipeline.generate(
        "Mumbai",
        "Rotterdam",
        {
            "cargo_weight_kg": 250,
            "cargo_type": "General",
            "priority": "cost",
            "constraints": {
                "max_transshipments": 5,
                "risk_threshold": 0.95,
            },
        },
    )
    print(f"Result routes count: {len(res4) if isinstance(res4, list) else res4}")
    if isinstance(res4, list) and res4:
        best = res4[0]
        print(f"Best Route Segments: {best.get('segments')}")
        print(f"Time (hrs): {best.get('time')}, Cost (INR): {best.get('cost')}, Risk: {best.get('risk')}")

    print("\n--- Test Case 5: International Route (Singapore -> Shanghai) ---")
    res5 = pipeline.generate(
        "Singapore",
        "Shanghai",
        {
            "cargo_weight_kg": 250,
            "cargo_type": "General",
            "priority": "cost",
            "constraints": {
                "max_transshipments": 3,
                "risk_threshold": 0.95,
            },
        },
    )
    print(f"Result routes count: {len(res5) if isinstance(res5, list) else res5}")
    if isinstance(res5, list) and res5:
        best = res5[0]
        print(f"Best Route Segments: {best.get('segments')}")
        print(f"Time (hrs): {best.get('time')}, Cost (INR): {best.get('cost')}, Risk: {best.get('risk')}")


if __name__ == "__main__":
    test()
