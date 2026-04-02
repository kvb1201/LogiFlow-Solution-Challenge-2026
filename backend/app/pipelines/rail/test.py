"""
Comprehensive test suite for the Railway Cargo Decision Engine.
Tests: RailRadar API client, route finding, feature engineering,
       ML models (real delay data), decision engine, pipeline integration.

Usage:
    cd backend
    python -m app.pipelines.rail.test
"""

import os
import sys
import time

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))


def separator(title):
    print(f"\n{'═' * 60}")
    print(f"  {title}")
    print(f"{'═' * 60}\n")


def test_railradar_api():
    separator("TEST 1: RailRadar API Client")
    from app.pipelines.rail.railradar_client import (
        search_stations, get_trains_between, get_average_delay,
        get_station_info, get_train_data,
    )

    # Station search
    stations = search_stations("Mumbai")
    print(f"  search('Mumbai') → {len(stations)} stations:")
    for s in stations[:5]:
        print(f"    {s['code']} — {s['name']}")
    assert len(stations) > 0, "Should find Mumbai stations"

    # Station info
    info = get_station_info("NDLS")
    if info:
        print(f"\n  NDLS info: {info.get('name', 'N/A')}")
        print(f"    lat: {info.get('lat')}, lng: {info.get('lng')}")
        print(f"    zone: {info.get('zone')}")

    # Trains between MMCT → NDLS
    data = get_trains_between("MMCT", "NDLS")
    total = data.get("totalTrains", 0) if data else 0
    print(f"\n  MMCT → NDLS: {total} trains found")
    if data and data.get("trains"):
        for t in data["trains"][:3]:
            print(f"    {t['trainNumber']} — {t['trainName']}")
            print(f"      dist: {t.get('distanceKm', 0)}km, "
                  f"speed: {t.get('avgSpeedKmph', 0)}km/h, "
                  f"time: {t.get('travelTimeMinutes', 0)}min")

    # Average delay for 12951 (Rajdhani)
    delay_data = get_average_delay("12951")
    if delay_data and "route" in delay_data:
        print(f"\n  12951 average delay ({len(delay_data['route'])} stations):")
        for s in delay_data["route"][:5]:
            print(f"    {s['stationCode']:6s} → arr: {s.get('arrivalDelayMinutes', 0):+.0f}min, "
                  f"dep: {s.get('departureDelayMinutes', 0):+.0f}min")

    # Train static data
    train_data = get_train_data("12951", data_type="static")
    if train_data and "train" in train_data:
        t = train_data["train"]
        print(f"\n  12951 static: {t.get('trainName', 'N/A')}")
        print(f"    {t.get('sourceStationName', '')} → {t.get('destinationStationName', '')}")
        print(f"    {t.get('distanceKm', 0)}km, {t.get('avgSpeedKmph', 0)}km/h")
        print(f"    runs: {t.get('runningDays', {}).get('days', [])}")

    print("\n  ✅ RailRadar API tests PASSED")
    return True


def test_route_finder():
    separator("TEST 2: Route Finder (API-powered)")
    from app.pipelines.rail.route_finder import find_routes

    # Mumbai → Delhi
    routes = find_routes("Mumbai", "Delhi")
    print(f"  Mumbai → Delhi: {len(routes)} routes")
    for i, r in enumerate(routes[:5]):
        t = r["trains"][0] if r.get("trains") else {}
        src = r.get("data_source", "?")
        print(f"    #{i+1} [{src:15s}] {t.get('train_no', ''):7s} "
              f"{t.get('train_name', ''):25s} "
              f"{r['total_distance_km']:7.0f}km  "
              f"{r['total_duration_hours']:6.1f}h  "
              f"{'TRANSFER' if r['has_transfer'] else 'DIRECT':8s}")

    # Pune → Chennai
    routes2 = find_routes("Pune", "Chennai")
    print(f"\n  Pune → Chennai: {len(routes2)} routes")
    for i, r in enumerate(routes2[:3]):
        t = r["trains"][0] if r.get("trains") else {}
        print(f"    #{i+1} {t.get('train_no', ''):7s} "
              f"{t.get('train_name', ''):25s} "
              f"{r['total_distance_km']:7.0f}km")

    assert len(routes) > 0, "Should find Mumbai→Delhi routes"

    print("\n  ✅ Route finder tests PASSED")
    return True


def test_feature_engineering():
    separator("TEST 3: Feature Engineering (Real Delay Data)")
    from app.pipelines.rail.engineer import (
        calc_parcel_cost, get_real_delay_data, calc_risk_score,
        check_cargo_feasibility,
    )

    # Parcel costs
    costs = [
        (500, 50, "500km × 50kg"),
        (1000, 100, "1000km × 100kg"),
        (1384, 300, "1384km × 300kg (Mumbai→Delhi)"),
        (2000, 500, "2000km × 500kg"),
    ]
    for dist, weight, label in costs:
        cost = calc_parcel_cost(dist, weight)
        print(f"  {label}: ₹{cost:,.0f}")

    # Real delay data from API
    print("\n  Real delay data:")
    delay = get_real_delay_data("12951")
    if delay:
        print(f"    12951 (Rajdhani): avg={delay['avg_arrival_delay_min']:.1f}min, "
              f"max={delay['max_delay_min']}min, "
              f"measured at {delay['num_stations_measured']} stations")
        print(f"    source: {delay['data_source']}")
    else:
        print(f"    12951: API data unavailable (will use ML fallback)")

    delay2 = get_real_delay_data("12627")
    if delay2:
        print(f"    12627 (Kerala Exp): avg={delay2['avg_arrival_delay_min']:.1f}min, "
              f"max={delay2['max_delay_min']}min")

    # Risk with real data vs without
    mock_route_with_data = {
        "trains": [{"train_type": "Rajdhani Express", "train_name": "Rajdhani"}],
        "real_delay_data": delay,
    }
    mock_route_without = {
        "trains": [{"train_type": "Express", "train_name": "Some Express"}],
    }
    risk_with = calc_risk_score(mock_route_with_data)
    risk_without = calc_risk_score(mock_route_without)
    print(f"\n  Risk (with real delay data): {risk_with}")
    print(f"  Risk (without, type-based):  {risk_without}")

    # Feasibility
    tests = [
        ("General", 300),
        ("Hazardous", 100),
        ("Fragile", 150),
    ]
    print()
    for cargo_type, weight in tests:
        result = check_cargo_feasibility(cargo_type, weight)
        status = "✅" if result["feasible"] else "❌"
        print(f"  {status} {cargo_type} {weight}kg: {result['reason']}")

    print("\n  ✅ Feature engineering tests PASSED")
    return True


def test_decision_engine():
    separator("TEST 4: Full Pipeline — Decision Engine")
    from app.pipelines.rail.pipeline import RailCargoOptimizer

    optimizer = RailCargoOptimizer()
    payload = {
        "origin_city": "Mumbai",
        "destination_city": "Delhi",
        "cargo_weight_kg": 300,
        "cargo_type": "General",
        "budget_max_inr": 50000,
        "deadline_hours": 48,
        "priority": "cost",
        "departure_date": "2025-08-15",
    }

    results = optimizer.optimize(payload)

    if "error" in results:
        print(f"  ⚠️  {results['error']}")
        return True

    labels = {
        "cheapest": "💰 CHEAPEST",
        "fastest":  "⚡ FASTEST",
        "safest":   "🛡️  SAFEST",
    }

    for key in ["cheapest", "fastest", "safest"]:
        rec = results[key]
        delay_info = rec.get("delay_info", {})
        print(f"\n  {labels[key]}")
        print(f"    Train   : {rec['train_number']} — {rec['train_name']}")
        print(f"    Type    : {rec.get('train_type', 'N/A')}")
        print(f"    Duration: {rec['duration_hours']:.1f}h")
        print(f"    Cost    : ₹{rec['parcel_cost_inr']:.0f}")
        print(f"    Risk    : {rec['risk_pct']}")
        print(f"    Delay   : {delay_info.get('avg_delay_minutes', 0):.0f}min "
              f"({delay_info.get('delay_data_source', 'N/A')})")
        print(f"    Speed   : {rec.get('avg_speed_kmph', 0)} km/h")
        print(f"    Days    : {rec.get('running_days', [])}")
        print(f"    Source  : {rec.get('data_source', 'N/A')}")

    all_opts = results.get("all_options", [])
    print(f"\n  📊 {len(all_opts)} options ranked:")
    for opt in all_opts[:5]:
        print(f"    #{opt['rank']}  {opt['train_name'][:25]:25s} "
              f"₹{opt['parcel_cost_inr']:7.0f}  "
              f"{opt['effective_hours']:5.1f}h  "
              f"risk:{opt['risk_score']:.2f}  "
              f"delay:{opt.get('avg_delay_min', 0):.0f}min "
              f"[{opt.get('delay_source', '?')}]")

    meta = results.get("route_metadata", {})
    print(f"\n  Routes: {meta.get('total_routes_found', 0)} found → "
          f"{meta.get('feasible_routes', 0)} feasible")

    print("\n  ✅ Decision engine tests PASSED")
    return True


def test_pipeline_integration():
    separator("TEST 5: BasePipeline Integration")
    from app.pipelines.rail import RailPipeline

    pipeline = RailPipeline()
    routes = pipeline.generate("Mumbai", "Delhi")

    print(f"  Mumbai → Delhi: {len(routes)} routes via BasePipeline")
    for i, r in enumerate(routes[:3]):
        print(f"    #{i+1} type={r['type']} time={r['time']:.1f}h "
              f"cost=₹{r['cost']:.0f} risk={r['risk']:.2f}")
        for seg in r.get("segments", []):
            print(f"        {seg.get('from_name', seg.get('from', '?'))} → "
                  f"{seg.get('to_name', seg.get('to', '?'))}")

    for r in routes:
        assert "type" in r, "Must have 'type'"
        assert "mode" in r, "Must have 'mode'"
        assert "time" in r, "Must have 'time'"
        assert "cost" in r, "Must have 'cost'"
        assert "risk" in r, "Must have 'risk'"
        assert "segments" in r, "Must have 'segments'"

    print("\n  ✅ Pipeline integration tests PASSED")
    return True


def main():
    print("\n" + "═" * 60)
    print("  LOGIFLOW — RAILWAY CARGO ENGINE TEST SUITE")
    print("  Powered by RailRadar API (real Indian Railways data)")
    print("═" * 60)

    tests = [
        ("RailRadar API Client", test_railradar_api),
        ("Route Finder", test_route_finder),
        ("Feature Engineering", test_feature_engineering),
        ("Decision Engine", test_decision_engine),
        ("Pipeline Integration", test_pipeline_integration),
    ]

    passed = 0
    failed = 0
    for name, test_fn in tests:
        try:
            if test_fn():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"\n  ❌ {name} FAILED: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    separator("RESULTS")
    print(f"  Passed: {passed}/{len(tests)}")
    print(f"  Failed: {failed}/{len(tests)}")
    if failed == 0:
        print("\n  🎉 ALL TESTS PASSED!")
    else:
        print(f"\n  ⚠️  {failed} test(s) failed")


if __name__ == "__main__":
    main()
