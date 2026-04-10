from pprint import pprint

from app.pipelines.air import AirPipeline
from app.routes.optimize import Cargo, Constraints, OptimizeRequest
from app.services.air_data_service import get_live_air_routes
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


def run_openflights_dataset_checks():
    print("\n" + "=" * 60)
    print("OPENFLIGHTS ROUTE SUPPORT CHECKS")
    print("=" * 60)

    direct_routes = get_live_air_routes("Delhi", "Mumbai", "2026-04-10")
    assert any(route.get("route_support_type") == "direct" for route in direct_routes), "Expected DEL -> BOM direct support"

    one_stop_routes = get_live_air_routes("Delhi", "Tirupati", "2026-04-10")
    assert any(route.get("route_support_type") == "one_stop" for route in one_stop_routes), "Expected DEL -> TIR one-stop support"

    print(f"Direct DEL -> BOM candidates : {len(direct_routes)}")
    print(f"One-stop DEL -> TIR candidates: {len(one_stop_routes)}")


if __name__ == "__main__":
    run_openflights_dataset_checks()
    run_pipeline_only()
    run_full_optimizer()
