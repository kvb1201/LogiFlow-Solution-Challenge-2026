from pprint import pprint

from app.pipelines.air import AirPipeline
from app.routes.optimize import Cargo, Constraints, OptimizeRequest
from app.services.optimizer import optimize_routes


def run_pipeline_only():
    print("=" * 60)
    print("AIR PIPELINE ONLY TEST")
    print("=" * 60)

    pipeline = AirPipeline()
    routes = pipeline.generate(
        "Delhi",
        "Mumbai",
        {
            "priority": "fast",
            "cargo": {"weight": 500, "type": "fragile"},
            "constraints": {"max_stops": 1, "budget_limit": 10000},
        },
    )

    print(f"Routes returned: {len(routes)}")
    for idx, route in enumerate(routes, start=1):
        print(f"\nRoute {idx}")
        print(f"  Airline      : {route['airline']}")
        print(f"  Stops        : {route['stops']}")
        print(f"  Time         : {route['time']} hrs")
        print(f"  Cost         : Rs. {route['cost']}")
        print(f"  Risk         : {route['risk']}")
        print(f"  Delay Prob   : {route['delay_prob']}")
        print(f"  Score        : {round(route.get('score', 0), 4)}")
        print(f"  Reason       : {route['reason']}")


def run_full_optimizer():
    print("\n" + "=" * 60)
    print("FULL /optimize FLOW TEST")
    print("=" * 60)

    request = OptimizeRequest(
        source="Delhi",
        destination="Mumbai",
        priority="Fast",
        cargo=Cargo(weight=500, type="fragile"),
        constraints=Constraints(
            excluded_modes=["road", "rail", "water", "hybrid"],
            max_stops=1,
            budget_limit=10000,
        ),
    )

    result = optimize_routes(request)
    pprint(result)


if __name__ == "__main__":
    run_pipeline_only()
    run_full_optimizer()
