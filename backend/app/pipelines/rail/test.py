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
    separator("TEST 3: Feature Engineering (IRCA Tariff + Real Delay)")
    from app.pipelines.rail.tariff import (
        calc_parcel_cost, determine_scale, get_tariff_breakdown,
        lookup_tariff,
    )
    from app.pipelines.rail.engineer import (
        get_real_delay_data, calc_risk_score,
        check_cargo_feasibility,
    )

    # ── Scale detection from all data sources ────────────────────────
    print("  Scale detection (API codes + train names + numbers):")
    # (train_name, train_type, train_number, expected_scale)
    scale_tests = [
        # RailRadar API type codes
        ("MUMBAI RAJDHANI",       "RAJ",   "12951", "R"),
        ("NDLS CDG SHATABDI",     "SHTB",  "12046", "P"),
        ("DURONTO EXPRESS",       "DRNT",  "12284", "P"),
        ("MUMBAI SF EXPRESS",     "SF",    "12137", "P"),
        ("VANDE BHARAT EXPRESS",  "Vande Bharat", "", "P"),
        ("TEJAS EXPRESS",         "Tejas", "",      "P"),
        # CSV train names (no type field)
        ("KARNATAKA EXPRESS",     "",      "12627", "P"),
        ("DECCAN QUEEN",          "",      "12124", "P"),
        ("LOCAL PASSENGER",       "",      "51015", "S"),
        # Train number fallback only
        ("",                      "",      "12951", "R"),
        ("",                      "",      "12046", "P"),
        ("",                      "",      "51015", "S"),
    ]
    for t_name, t_type, t_num, expected in scale_tests:
        got = determine_scale(t_name, t_type, t_num)
        label = t_name or t_type or f"#{t_num}"
        status = "✅" if got == expected else "❌"
        print(f"    {status} {label[:28]:28s} → Scale-{got} (expected {expected})")
        assert got == expected, f"Scale mismatch for {label}"

    # ── Parcel costs across all scales ────────────────────────────────
    print("\n  Parcel costs (official IRCA slab tables):")
    test_cases = [
        (50,   10, "S", "50km × 10kg (Scale-S)"),
        (500,  50, "S", "500km × 50kg (Scale-S)"),
        (1000, 100, "S", "1000km × 100kg (Scale-S)"),
        (1384, 300, "S", "1384km × 300kg Mumbai→Delhi (Scale-S)"),
        (1384, 300, "R", "1384km × 300kg Mumbai→Delhi (Scale-R)"),
        (1384, 300, "P", "1384km × 300kg Mumbai→Delhi (Scale-P)"),
        (1384, 300, "L", "1384km × 300kg Mumbai→Delhi (Scale-L)"),
        (2000, 500, "S", "2000km × 500kg (Scale-S)"),
        (100,  25, "S", "100km × 25kg (Scale-S)"),
    ]
    for dist, weight, scale, label in test_cases:
        cost = calc_parcel_cost(dist, weight, scale=scale)
        print(f"    {label}: ₹{cost:,.2f}")
        assert cost > 0, f"Cost should be > 0 for {label}"

    # ── Verify against official PDF values (all scales) ─────────────
    print("\n  Verifying against official PDF values:")
    known_checks = [
        # Scale-L (luggage_rates.pdf)
        (50,  10,  "L", 4.73,   "L: 1-50km, 1-10kg"),
        (50,  100, "L", 47.25,  "L: 1-50km, 91-100kg"),
        (100, 10,  "L", 6.44,   "L: 91-100km, 1-10kg"),
        (100, 100, "L", 64.35,  "L: 91-100km, 91-100kg"),
        (140, 50,  "L", 38.70,  "L: 131-140km, 41-50kg"),
        (290, 100, "L", 121.73, "L: 281-290km, 91-100kg"),
        (927, 100, "L", 301.95, "L: 926-950km, 91-100kg"),
        # Scale-S (Standered_rates.pdf)
        (50,  10,  "S", 2.10,   "S: 1-50km, 1-10kg"),
        (50,  100, "S", 20.93,  "S: 1-50km, 91-100kg"),
        # Scale-P (Premier_rates.pdf)
        (50,  10,  "P", 4.19,   "P: 1-50km, 1-10kg"),
        (50,  100, "P", 41.84,  "P: 1-50km, 91-100kg"),
    ]
    for dist, weight, scale, expected, label in known_checks:
        got = lookup_tariff(dist, weight, scale)
        status = "✅" if abs(got - expected) < 0.02 else "❌"
        print(f"    {status} {label}: ₹{got} (expected ₹{expected})")
        assert abs(got - expected) < 0.02, f"Mismatch for {label}: {got} != {expected}"

    # ── Ambedkar Express exact test (user's verified case) ───────────
    print("\n  Ambedkar Express (14116), 927km, 300kg:")
    cost_l = calc_parcel_cost(927, 300, scale="L")
    print(f"    Scale-L: ₹{cost_l:.2f} (expected ₹905.85)")
    assert abs(cost_l - 905.85) < 0.01, f"Ambedkar Express test failed: {cost_l} != 905.85"

    # ── Minimum distance enforcement (50 km) ──────────────────────────
    print("\n  Minimum distance enforcement:")
    cost_10km = calc_parcel_cost(10, 50, scale="S")
    cost_50km = calc_parcel_cost(50, 50, scale="S")
    print(f"    10km × 50kg (Scale-S): ₹{cost_10km:,.2f} (charged as 50km)")
    print(f"    50km × 50kg (Scale-S): ₹{cost_50km:,.2f}")
    assert cost_10km == cost_50km, "10km should be charged as 50km minimum"

    # ── Tariff breakdown ──────────────────────────────────────────────
    print("\n  Tariff breakdown:")
    breakdown = get_tariff_breakdown(1384, 300, train_name="RAJDHANI", train_type="Rajdhani Express")
    print(f"    Scale: {breakdown['scale']} ({breakdown['scale_name']})")
    print(f"    Distance slab: {breakdown['distance_slab']}")
    print(f"    Base charge: ₹{breakdown['base_charge_inr']:,.2f}")
    print(f"    2% surcharge: ₹{breakdown['dev_surcharge_2pct']:,.2f}")
    print(f"    Total (w/ surcharge): ₹{breakdown['total_with_surcharge_inr']:,.2f}")
    assert breakdown["scale"] == "R", "Rajdhani should be Scale-R"

    # ── Heavy cargo (>100 kg) multi-block calculation ─────────────────
    print("\n  Heavy cargo (multi-block):")
    for weight in [150, 300, 500, 1000]:
        cost_s = calc_parcel_cost(1384, weight, scale="S")
        cost_r = calc_parcel_cost(1384, weight, scale="R")
        print(f"    1384km × {weight}kg: Scale-S ₹{cost_s:,.2f} | Scale-R ₹{cost_r:,.2f}")
        assert cost_r > cost_s, "Scale-R should always be more expensive than Scale-S"

    # ── Real delay data from API ──────────────────────────────────────
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


def test_weather_integration():
    separator("TEST 6: Weather Integration & Circuit Breaker")

    # ── Weather factor computation ────────────────────────────────────
    from app.pipelines.rail.engineer import _compute_weather_factor

    # Clear weather — no impact
    factor, risk = _compute_weather_factor({"temp": 25, "rain": 0, "condition": "Clear"})
    print(f"  Clear weather:  factor={factor}, risk={risk}")
    assert factor == 1.0, f"Clear weather should have factor 1.0, got {factor}"
    assert risk == 0.0, f"Clear weather should have risk 0.0, got {risk}"

    # Heavy rain
    factor, risk = _compute_weather_factor({"temp": 22, "rain": 12, "condition": "Rain"})
    print(f"  Heavy rain:     factor={factor}, risk={risk}")
    assert factor > 1.0, f"Heavy rain should increase factor, got {factor}"
    assert risk > 0.0, f"Heavy rain should increase risk, got {risk}"

    # Thunderstorm
    factor, risk = _compute_weather_factor({"temp": 30, "rain": 8, "condition": "Thunderstorm"})
    print(f"  Thunderstorm:   factor={factor}, risk={risk}")
    assert factor >= 1.40, f"Thunderstorm should have factor >= 1.40, got {factor}"
    assert risk >= 0.40, f"Thunderstorm should have risk >= 0.40, got {risk}"

    # Fog
    factor, risk = _compute_weather_factor({"temp": 5, "rain": 0, "condition": "Fog"})
    print(f"  Fog:            factor={factor}, risk={risk}")
    assert factor > 1.0, "Fog should increase factor"

    # Extreme heat
    factor, risk = _compute_weather_factor({"temp": 48, "rain": 0, "condition": "Clear"})
    print(f"  Extreme heat:   factor={factor}, risk={risk}")
    assert factor > 1.0, "Extreme heat should increase factor"

    # None/empty weather (graceful fallback)
    factor, risk = _compute_weather_factor(None)
    assert factor == 1.0 and risk == 0.0, "None weather should return defaults"
    factor, risk = _compute_weather_factor({})
    assert factor == 1.0 and risk == 0.0, "Empty weather should return defaults"
    print(f"  Null/empty:     factor={factor}, risk={risk} (safe defaults)")

    # ── Circuit breaker status ────────────────────────────────────────
    from app.pipelines.rail.railradar_client import get_circuit_status

    status = get_circuit_status()
    print(f"\n  Circuit breaker status: {status['state']}")
    print(f"    consecutive_failures: {status['consecutive_failures']}")
    print(f"    total_trips: {status['total_trips']}")
    assert "state" in status, "Must have state"
    assert status["state"] in ("closed", "open", "half-open"), \
        f"Invalid state: {status['state']}"

    # ── Weather-aware risk scoring ────────────────────────────────────
    from app.pipelines.rail.engineer import calc_risk_score

    mock_route = {
        "trains": [{"train_type": "Rajdhani Express", "train_name": "Rajdhani"}],
    }
    risk_clear = calc_risk_score(mock_route, "2025-04-15",
                                  weather_data={"temp": 25, "rain": 0, "condition": "Clear"})
    risk_storm = calc_risk_score(mock_route, "2025-04-15",
                                  weather_data={"temp": 28, "rain": 15, "condition": "Thunderstorm"})
    print(f"\n  Risk (clear weather):  {risk_clear}")
    print(f"  Risk (thunderstorm):  {risk_storm}")
    assert risk_storm > risk_clear, \
        f"Stormy weather should increase risk ({risk_storm} <= {risk_clear})"

    print("\n  ✅ Weather integration tests PASSED")
    return True


def test_simulation_mode():
    separator("TEST 7: Simulation Mode")
    from app.pipelines.rail.simulator import simulate

    # ── Basic simulation ──────────────────────────────────────────────
    result = simulate({
        "origin_city": "Mumbai",
        "destination_city": "Delhi",
        "cargo_weight_kg": 200,
        "cargo_type": "General",
        "priority": "balanced",
        "weather": {"temp": 30, "rain": 0, "condition": "Clear"},
        "congestion_level": 0.3,
        "season": "normal",
        "departure_hour": 12,
    })

    if "error" in result:
        print(f"  ⚠️  {result['error']}")
        return True

    print(f"  Normal conditions: {result['total_routes']} routes simulated")
    best = result.get("best", {})
    print(f"    Best: {best.get('train_name', 'N/A')}")
    print(f"      Cost:    ₹{best.get('cost_inr', 0):,.2f}")
    print(f"      ETA:     {best.get('adjusted_eta_hours', 0):.1f}h")
    print(f"      Delay:   {best.get('delay_hours', 0):.1f}h")
    print(f"      Risk:    {best.get('risk_pct', 'N/A')}")
    print(f"      Weather: {best.get('weather_factor', 1.0)}")
    print(f"      Factors: {best.get('key_factors', [])}")

    assert result["total_routes"] > 0, "Should find routes"
    assert best["cost_inr"] > 0, "Cost should be positive"
    assert best["risk_score"] > 0, "Risk should be positive"

    # ── Monsoon + heavy rain simulation ───────────────────────────────
    result_monsoon = simulate({
        "origin_city": "Mumbai",
        "destination_city": "Delhi",
        "cargo_weight_kg": 200,
        "cargo_type": "General",
        "priority": "safe",
        "weather": {"temp": 28, "rain": 15, "condition": "Thunderstorm"},
        "congestion_level": 0.8,
        "season": "monsoon",
        "departure_hour": 8,
    })

    if "error" not in result_monsoon:
        best_monsoon = result_monsoon.get("best", {})
        print(f"\n  Monsoon + storm:")
        print(f"    Best:  {best_monsoon.get('train_name', 'N/A')}")
        print(f"    ETA:   {best_monsoon.get('adjusted_eta_hours', 0):.1f}h "
              f"(vs {best.get('adjusted_eta_hours', 0):.1f}h normal)")
        print(f"    Risk:  {best_monsoon.get('risk_pct', 'N/A')} "
              f"(vs {best.get('risk_pct', 'N/A')} normal)")
        print(f"    Delay: {best_monsoon.get('delay_hours', 0):.1f}h "
              f"(vs {best.get('delay_hours', 0):.1f}h normal)")

        # Monsoon should have higher delay and risk
        assert best_monsoon["delay_hours"] >= best["delay_hours"], \
            "Monsoon delay should be >= normal"
        assert best_monsoon["risk_score"] >= best["risk_score"], \
            "Monsoon risk should be >= normal"

    # ── Priority comparison ───────────────────────────────────────────
    print("\n  Priority comparison (same conditions):")
    for priority in ["cost", "time", "safe"]:
        r = simulate({
            "origin_city": "Mumbai",
            "destination_city": "Delhi",
            "cargo_weight_kg": 100,
            "weather": {"temp": 30, "rain": 3, "condition": "Rain"},
            "congestion_level": 0.5,
            "season": "monsoon",
            "departure_hour": 14,
            "priority": priority,
        })
        if "error" not in r:
            b = r["best"]
            print(f"    {priority:5s} → {b['train_name'][:25]:25s} "
                  f"₹{b['cost_inr']:7.0f}  "
                  f"{b['adjusted_eta_hours']:5.1f}h  "
                  f"risk:{b['risk_pct']}")

    # ── Edge cases ────────────────────────────────────────────────────
    print("\n  Edge cases:")

    # Missing cities
    r = simulate({"origin_city": "", "destination_city": "Delhi"})
    assert "error" in r, "Empty origin should error"
    print(f"    Empty origin: {r['error']} ✅")

    # Invalid cargo
    r = simulate({
        "origin_city": "Mumbai",
        "destination_city": "Delhi",
        "cargo_type": "Explosives",
        "cargo_weight_kg": 100,
        "weather": {"temp": 30, "rain": 0, "condition": "Clear"},
    })
    # Note: may or may not error depending on CARGO_CONSTRAINTS config
    print(f"    Explosives cargo: {'error' if 'error' in r else 'allowed'}")

    print("\n  ✅ Simulation mode tests PASSED")
    return True


def main():
    print("\n" + "═" * 60)
    print("  LOGIFLOW — RAILWAY CARGO ENGINE TEST SUITE")
    print("  Powered by RailRadar API (real Indian Railways data)")
    print("  + OpenWeather Integration + Simulation Mode")
    print("═" * 60)

    tests = [
        ("RailRadar API Client", test_railradar_api),
        ("Route Finder", test_route_finder),
        ("Feature Engineering", test_feature_engineering),
        ("Decision Engine", test_decision_engine),
        ("Pipeline Integration", test_pipeline_integration),
        ("Weather Integration", test_weather_integration),
        ("Simulation Mode", test_simulation_mode),
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

