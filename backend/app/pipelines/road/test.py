import os
import sys
import json

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from app.pipelines.road import RoadPipeline


def print_result(label, result):
    print(f"\n================ {label} ================\n")

    best = result.get("best", {})
    print("BEST ROUTE:")
    print(f"Time (hrs): {best.get('time')}")
    print(f"Cost (INR): {best.get('cost')}")
    print(f"Risk: {best.get('risk')}")
    print(f"Delay (hrs): {best.get('predicted_delay')}")
    print(f"Reason: {best.get('reason')}")
    print()

    print("KEY FACTORS:")
    for k in best.get("key_factors", []):
        print(f" - {k}")

    print("\n----------------------------------------\n")


def test():
    pipeline = RoadPipeline()

    source = "Bangalore"
    destination = "Chennai"

    # =========================
    # ✅ REAL-TIME MODE
    # =========================
    realtime_result = pipeline.generate(
        source,
        destination,
        {
            "cargo_weight_kg": 100,
            "priority": "fastest",
            "budget": 6000,
            "deadline_hours": 10,
            "mode": "realtime"   # IMPORTANT FLAG
        }
    )

    print_result("REAL-TIME OUTPUT", realtime_result)

    # =========================
    # ✅ SIMULATION MODE
    # =========================
    simulation_result = pipeline.generate(
        source,
        destination,
        {
            "cargo_weight_kg": 100,
            "priority": "fastest",
            "budget": 6000,
            "deadline_hours": 10,

            # 🔥 Manual overrides
            "mode": "simulation",
            "simulation": {
                "traffic_level": 0.8,      # High traffic
                "weather": "bad",          # Bad weather
                "demand": 80,
                "utilization": 85
            }
        }
    )

    print_result("SIMULATION OUTPUT", simulation_result)

    # =========================
    # 🔍 Compare difference
    # =========================
    rt_delay = realtime_result["best"].get("predicted_delay", 0)
    sim_delay = simulation_result["best"].get("predicted_delay", 0)

    print("\n=========== COMPARISON ===========\n")
    print(f"Realtime Delay:   {rt_delay:.2f} hrs")
    print(f"Simulation Delay: {sim_delay:.2f} hrs")

    diff = sim_delay - rt_delay
    print(f"Difference:       {diff:.2f} hrs")

    if diff > 0:
        print("Simulation shows WORSE conditions")
    else:
        print("Simulation shows BETTER conditions")


if __name__ == "__main__":
    test()