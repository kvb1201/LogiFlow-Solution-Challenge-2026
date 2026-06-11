import sys
import os
from pathlib import Path
import json

# Add backend to path
sys.path.append(str(Path(__file__).resolve().parents[1] / "backend"))

from app.pipelines.air.pipeline import AirPipeline
from app.services.airport_locator_service import _load_ourairports

def run_validations():
    print("=" * 50)
    print("RUNNING AIR FREIGHT VALIDATION SUITE")
    print("=" * 50)

    # Force initialization to trigger the startup audit log
    _load_ourairports()

    pipeline = AirPipeline()

    payload = {
        "cargo": {
            "weight": 50,
            "length_cm": 120,
            "width_cm": 80,
            "height_cm": 60
        },
        "priority": "fast",
        "mode": "realtime"
    }

    domestic_routes = ["DEL", "BOM", "HYD", "CCU"]
    intl_routes = ["DXB", "SIN", "FRA", "LHR", "JFK"]

    results = []

    print("\n[TESTING DOMESTIC ROUTES]")
    for dest in domestic_routes:
        print(f"\nTesting BLR -> {dest}")
        res = pipeline.generate("BLR", dest, payload=payload)
        if not res or res.get("status") == "no_routes":
            print(f"FAILED: No routes found for BLR -> {dest}")
            continue
        
        best = res["best"]
        cost_breakdown = best.get("air_details", {}).get("cost_breakdown", {})
        
        print(f"Airport Lookup: Success (Source: {best['air_details']['source_airport'].get('code', 'Unknown')}, Dest: {best['air_details']['destination_airport'].get('code', 'Unknown')})")
        print(f"Distance: {cost_breakdown.get('distanceKm')} km")
        print(f"Cost: {cost_breakdown.get('finalCost')} INR")
        print(f"Route Type: {cost_breakdown.get('routeType')}")
        
        results.append({
            "route": f"BLR -> {dest}",
            "distance": cost_breakdown.get('distanceKm'),
            "cost": cost_breakdown.get('finalCost'),
            "type": cost_breakdown.get('routeType'),
            "fuelSurcharge": cost_breakdown.get('fuelSurcharge'),
            "volumetricWeight": cost_breakdown.get('volumetricWeight'),
            "actualWeight": cost_breakdown.get('actualWeight'),
            "chargeableWeight": cost_breakdown.get('chargeableWeight')
        })

    print("\n[TESTING INTERNATIONAL ROUTES]")
    for dest in intl_routes:
        print(f"\nTesting BLR -> {dest}")
        res = pipeline.generate("BLR", dest, payload=payload)
        if not res or res.get("status") == "no_routes":
            print(f"FAILED: No routes found for BLR -> {dest}")
            continue
        
        best = res["best"]
        cost_breakdown = best.get("air_details", {}).get("cost_breakdown", {})
        
        print(f"Airport Lookup: Success (Source: {best['air_details']['source_airport'].get('code', 'Unknown')}, Dest: {best['air_details']['destination_airport'].get('code', 'Unknown')})")
        print(f"Distance: {cost_breakdown.get('distanceKm')} km")
        print(f"Cost: {cost_breakdown.get('finalCost')} INR")
        print(f"Route Type: {cost_breakdown.get('routeType')}")
        print(f"Resolved Dest Name: {best['air_details']['destination_airport']['name']}")
        
        results.append({
            "route": f"BLR -> {dest}",
            "distance": cost_breakdown.get('distanceKm'),
            "cost": cost_breakdown.get('finalCost'),
            "type": cost_breakdown.get('routeType'),
            "fuelSurcharge": cost_breakdown.get('fuelSurcharge'),
            "volumetricWeight": cost_breakdown.get('volumetricWeight'),
            "actualWeight": cost_breakdown.get('actualWeight'),
            "chargeableWeight": cost_breakdown.get('chargeableWeight')
        })

    # Assertions
    print("\n" + "=" * 50)
    print("VALIDATION CHECKS")
    print("=" * 50)
    
    # 1. Airport lookup succeeds
    all_success = len(results) == (len(domestic_routes) + len(intl_routes))
    print(f"1. All lookups succeeded: {'PASS' if all_success else 'FAIL'}")
    
    # 2. Distance is valid and > 0
    valid_distance = all(r['distance'] > 0 for r in results)
    print(f"2. Valid distances: {'PASS' if valid_distance else 'FAIL'}")
    
    # 3. Distance changes per route
    distances = set(r['distance'] for r in results)
    unique_dist = len(distances) == len(results)
    print(f"3. Unique distances per route: {'PASS' if unique_dist else 'FAIL'}")
    
    # 4. Cost changes per route
    costs = set(r['cost'] for r in results)
    unique_costs = len(costs) == len(results)
    print(f"4. Unique costs per route: {'PASS' if unique_costs else 'FAIL'}")
    
    # 5. International routes cost more than domestic routes (on average/mostly)
    dom_costs = [r['cost'] for r in results if r['type'] == 'Domestic']
    intl_costs = [r['cost'] for r in results if r['type'] == 'International']
    if dom_costs and intl_costs:
        avg_dom = sum(dom_costs)/len(dom_costs)
        avg_intl = sum(intl_costs)/len(intl_costs)
        higher_intl = avg_intl > avg_dom
        print(f"5. International costs > Domestic costs: {'PASS' if higher_intl else 'FAIL'}")
    
    # 6. Fuel surcharge increases with distance (within same route type)
    dom_results = [r for r in results if r['type'] == 'Domestic']
    dom_results.sort(key=lambda x: x['distance'])
    fuel_increases = True
    for i in range(1, len(dom_results)):
        if dom_results[i]['fuelSurcharge'] <= dom_results[i-1]['fuelSurcharge']:
            fuel_increases = False
    print(f"6. Fuel surcharge scales with distance: {'PASS' if fuel_increases else 'FAIL'}")
    
    # 7. Volumetric pricing works
    vol_works = all(r['volumetricWeight'] == 96.0 for r in results) and all(r['chargeableWeight'] == 96.0 for r in results)
    print(f"7. Volumetric pricing (120x80x60 = 96kg): {'PASS' if vol_works else 'FAIL'}")
    
    # 8. No international city resolves to Indian airport
    intl_correct = all(r['type'] == 'International' for r in results[len(domestic_routes):])
    print(f"8. No international city mapped to India: {'PASS' if intl_correct else 'FAIL'}")
    
    # 9. Route classification is correct
    class_correct = all(r['type'] == 'Domestic' for r in results[:len(domestic_routes)]) and intl_correct
    print(f"9. Route classification correct: {'PASS' if class_correct else 'FAIL'}")
    
if __name__ == "__main__":
    run_validations()
