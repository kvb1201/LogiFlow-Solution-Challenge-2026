import os
import sys
import json

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from app.pipelines.road import RoadPipeline


def test():
    pipeline = RoadPipeline()
    city_pairs = [
        ("Bangalore", "Chennai"),
    ]

    for source, destination in city_pairs:
        print(f"\n===== TEST: {source} → {destination} =====\n")

        result = pipeline.generate(
            source,
            destination,
            {
                "cargo_weight_kg": 100,
                "priority": "balanced",
                "budget": 5000,
                "deadline_hours": 9
            }
        )

        routes = result["all"]

        print("\n🚗 ROAD PIPELINE TEST\n")

        print(f"Total Routes Generated: {len(routes)}\n")
        print("BEST ROUTE:\n")
        best = result["best"]
        print(f"Time (hrs): {best['time']}")
        print(f"Cost (INR): {best['cost']}")
        print(f"Risk Score: {best['risk']}")
        print("Reason:")
        print(best.get("reason", ""))
        print("Key Factors:")
        for k in best.get("key_factors", []):
            print(f" - {k}")
        print()

        print("CONSTRAINTS APPLIED:\n")
        constraints = result.get("constraints_applied", {})
        print(constraints)
        print()
        print(f"Has Alternatives: {result.get('has_alternatives')}")
        print()

        for i, r in enumerate(routes, 1):
            print(f"--- Route {i} ---")
            print(f"Time (hrs): {r['time']}")
            print(f"Cost (INR): {r['cost']}")
            print(f"Risk Score: {r['risk']}")
            if r.get("reason"):
                print(f"Reason: {r['reason']}")
            seg = r.get('segments', [{}])[0]
            frm = seg.get('from') or seg.get('from_name') or seg.get('from_city') or 'N/A'
            to = seg.get('to') or seg.get('to_name') or seg.get('to_city') or 'N/A'
            print(f"From: {frm} → To: {to}")
            print(f"Distance (km): {seg.get('distance_km')}")
            print(f"Duration (min): {seg.get('duration_minutes')}")
            print()

        print("Full JSON Output:\n")
        print(json.dumps(result, indent=2))
        print(result["all"][0]["segments"])
        print(len(result["all"][0]["geometry"]))


if __name__ == "__main__":
    test()
