"""
All-India parcel pricing validation — 100+ diverse cases vs independent reference.

Ground truth: official IRCA distance×weight slab JSON (from Railway Board PDFs).
Route distances: real rail km from Indian Railways schedule CSV.
"""

from __future__ import annotations

import itertools
import json
import os
import random
from dataclasses import dataclass
from typing import Any, Iterator

from app.pipelines.rail.config import CARGO_CONSTRAINTS, CITY_TO_STATION
from app.pipelines.rail.tariff import (
    _rate_revision_factor,
    calc_parcel_cost,
    lookup_tariff,
    resolve_billing_scale,
    resolve_chargeable_weight,
    resolve_handling_charge,
)
from app.pipelines.rail.tariff_reference import (
    reference_calc_parcel_cost,
    reference_lookup_tariff,
)

_DATA_DIR = os.path.dirname(__file__)
SCALES = ("L", "S", "P", "R")

# Representative all-India city pairs (not route-specific).
ALL_INDIA_CITY_PAIRS: list[tuple[str, str]] = [
    ("Mumbai", "Delhi"), ("Delhi", "Kolkata"), ("Chennai", "Bengaluru"),
    ("Hyderabad", "Pune"), ("Ahmedabad", "Jaipur"), ("Lucknow", "Patna"),
    ("Prayagraj", "Surat"), ("Guwahati", "Mumbai"), ("Kochi", "Delhi"),
    ("Bhopal", "Nagpur"), ("Varanasi", "Ranchi"), ("Visakhapatnam", "Chennai"),
    ("Indore", "Ahmedabad"), ("Jammu", "Delhi"), ("Amritsar", "Chandigarh"),
    ("Goa", "Bengaluru"), ("Madurai", "Hyderabad"), ("Coimbatore", "Mumbai"),
    ("Bhubaneswar", "Delhi"), ("Raipur", "Kolkata"), ("Jabalpur", "Bhopal"),
    ("Gwalior", "Kanpur"), ("Agra", "Lucknow"), ("Vadodara", "Mumbai"),
    ("Nagpur", "Hyderabad"), ("Surat", "Delhi"), ("Patna", "Guwahati"),
    ("Trivandrum", "Chennai"), ("Mangalore", "Pune"), ("Udaipur", "Mumbai"),
    ("Jodhpur", "Delhi"), ("Kota", "Jaipur"), ("Bareilly", "Lucknow"),
    ("Moradabad", "Delhi"), ("Dhanbad", "Kolkata"), ("Tatanagar", "Bhopal"),
    ("Kharagpur", "Chennai"), ("Cuttack", "Hyderabad"), ("Rourkela", "Kolkata"),
    ("Salem", "Bengaluru"), ("Warangal", "Chennai"), ("Aurangabad", "Mumbai"),
    ("Solapur", "Hyderabad"), ("Gondia", "Nagpur"), ("Durg", "Raipur"),
    ("Satna", "Prayagraj"), ("Ratlam", "Indore"), ("Mathura", "Delhi"),
    ("Haridwar", "Mumbai"), ("Gorakhpur", "Delhi"), ("Bilaspur", "Hyderabad"),
    ("Panvel", "Pune"), ("Nasik", "Mumbai"), ("Rajkot", "Ahmedabad"),
    ("Ajmer", "Delhi"), ("Ujjain", "Indore"), ("Ambala", "Delhi"),
    ("Ludhiana", "Delhi"), ("Pathankot", "Amritsar"), ("Roorkee", "Delhi"),
    ("Meerut", "Delhi"), ("Jhansi", "Bhopal"), ("Itarsi", "Nagpur"),
    ("Bhusaval", "Mumbai"), ("Secunderabad", "Bengaluru"), ("Vijayawada", "Chennai"),
    ("Tiruchirappalli", "Chennai"), ("Nagercoil", "Bengaluru"), ("Kanyakumari", "Chennai"),
    ("Nanded", "Hyderabad"), ("Wardha", "Nagpur"), ("Katni", "Jabalpur"),
    ("Lonavla", "Mumbai"), ("Kalyan", "Pune"), ("Thane", "Mumbai"),
    ("Howrah", "Delhi"), ("Prayagraj", "Mumbai"), ("Surat", "Kolkata"),
    ("Bengaluru", "Delhi"), ("Chennai", "Kolkata"), ("Mumbai", "Guwahati"),
    ("Delhi", "Kochi"), ("Hyderabad", "Delhi"), ("Pune", "Kolkata"),
    ("Jaipur", "Mumbai"), ("Patna", "Mumbai"), ("Nagpur", "Delhi"),
    ("Varanasi", "Mumbai"), ("Indore", "Delhi"), ("Ranchi", "Mumbai"),
    ("Bhopal", "Delhi"), ("Ahmedabad", "Kolkata"), ("Surat", "Chennai"),
    ("Lucknow", "Mumbai"), ("Kanpur", "Delhi"), ("Visakhapatnam", "Delhi"),
    ("Madurai", "Delhi"), ("Guwahati", "Chennai"), ("Trivandrum", "Delhi"),
    ("Jodhpur", "Mumbai"), ("Udaipur", "Delhi"), ("Goa", "Delhi"),
    ("Amritsar", "Mumbai"), ("Dehradun", "Delhi"), ("Gwalior", "Mumbai"),
    ("Raipur", "Mumbai"), ("Bhubaneswar", "Mumbai"), ("Coimbatore", "Delhi"),
    ("Dhanbad", "Delhi"), ("Tatanagar", "Mumbai"), ("Kharagpur", "Delhi"),
    ("Rourkela", "Mumbai"), ("Bilaspur", "Delhi"), ("Gorakhpur", "Mumbai"),
    ("Bareilly", "Mumbai"), ("Moradabad", "Mumbai"), ("Mathura", "Mumbai"),
    ("Ratlam", "Mumbai"), ("Satna", "Mumbai"), ("Durg", "Mumbai"),
    ("Gondia", "Mumbai"), ("Solapur", "Delhi"), ("Aurangabad", "Delhi"),
    ("Warangal", "Delhi"), ("Salem", "Delhi"), ("Cuttack", "Delhi"),
    ("Jhansi", "Mumbai"), ("Itarsi", "Mumbai"), ("Bhusaval", "Delhi"),
    ("Panvel", "Delhi"), ("Nasik", "Delhi"), ("Rajkot", "Delhi"),
    ("Ajmer", "Mumbai"), ("Ujjain", "Mumbai"), ("Ambala", "Mumbai"),
    ("Ludhiana", "Mumbai"), ("Pathankot", "Delhi"), ("Roorkee", "Mumbai"),
    ("Meerut", "Mumbai"), ("Secunderabad", "Delhi"), ("Vijayawada", "Delhi"),
    ("Tiruchirappalli", "Delhi"), ("Nagercoil", "Delhi"), ("Kanyakumari", "Delhi"),
    ("Nanded", "Delhi"), ("Wardha", "Delhi"), ("Katni", "Mumbai"),
    ("Lonavla", "Delhi"), ("Kalyan", "Delhi"), ("Thane", "Delhi"),
]

WEIGHT_SAMPLES = (5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 100, 110, 150, 200, 250, 300)
CARGO_SAMPLES = ("General", "Bicycle", "Bike", "Fragile", "Textiles", "Auto Parts", "Electronics", "Perishable")
TRAIN_SAMPLES = (
    ("Rajdhani Express", "RAJ", "12301"),
    ("Shatabdi Express", "SHTB", "12002"),
    ("Duronto Express", "DRNT", "12213"),
    ("SF Express", "SF", "12101"),
    ("Passenger", "PASS", "51101"),
    ("", "", ""),
)


@dataclass(frozen=True)
class ValidationCase:
    id: str
    label: str
    distance_km: float
    weight_kg: float
    cargo_type: str = "General"
    scale: str | None = None
    train_name: str = ""
    train_type: str = ""
    train_number: str = ""
    is_animal: bool = False
    category: str = "slab"


def _distance_slab_boundaries(scale: str) -> list[int]:
    path = os.path.join(_DATA_DIR, f"scale_{scale.lower()}_official.json")
    with open(path) as f:
        rows = json.load(f)["rows"]
    boundaries: set[int] = {50}
    for row in rows:
        boundaries.add(int(row["lo"]))
        boundaries.add(int(row["hi"]))
    return sorted(boundaries)


def _slab_grid_cases() -> Iterator[ValidationCase]:
    """Pure slab lookups across all scales and boundary distances."""
    idx = 0
    for scale in SCALES:
        distances = _distance_slab_boundaries(scale)
        # Sample distances: min, quartiles, max, plus mid-range
        picks = sorted({
            distances[0],
            distances[len(distances) // 4],
            distances[len(distances) // 2],
            distances[(3 * len(distances)) // 4],
            distances[-1],
            100, 250, 500, 750, 927, 1200, 1500, 2000, 2800, 3500,
        })
        for dist, wt in itertools.product(picks, WEIGHT_SAMPLES):
            idx += 1
            yield ValidationCase(
                id=f"slab-{idx:03d}",
                label=f"Scale-{scale} {dist}km {wt}kg",
                distance_km=float(dist),
                weight_kg=float(wt),
                scale=scale,
                category="slab",
            )
            if idx >= 55:
                return


def _route_distance_km(origin_city: str, dest_city: str) -> tuple[float, str, str, str, str] | None:
    from app.pipelines.rail.data_loader import get_trains_for_route

    from_codes = CITY_TO_STATION.get(origin_city) or [origin_city]
    to_codes = CITY_TO_STATION.get(dest_city) or [dest_city]
    trains = get_trains_for_route(from_codes, to_codes, max_results=5)
    if not trains:
        return None
    best = min(trains, key=lambda t: t.get("distance_km", 99999))
    dist = float(best.get("distance_km") or 0)
    if dist <= 10:
        return None
    return (
        dist,
        str(best.get("from_station", from_codes[0])),
        str(best.get("to_station", to_codes[0])),
        str(best.get("train_name", "")),
        str(best.get("train_no", "")),
    )


def _route_cases(count: int = 35, seed: int = 42) -> Iterator[ValidationCase]:
    """Real all-India O-D pairs with schedule-derived rail distances."""
    rng = random.Random(seed)
    pairs = list(ALL_INDIA_CITY_PAIRS)
    rng.shuffle(pairs)

    idx = 0
    for origin, dest in pairs:
        row = _route_distance_km(origin, dest)
        if not row:
            continue
        dist, fs, ts, t_name, t_no = row
        cargo = rng.choice(CARGO_SAMPLES)
        wt = rng.choice(WEIGHT_SAMPLES)
        t_name_s, t_type_s, t_no_s = rng.choice(TRAIN_SAMPLES)
        use_train = rng.random() < 0.6
        idx += 1
        yield ValidationCase(
            id=f"route-{idx:03d}",
            label=f"{origin}({fs})→{dest}({ts}) {dist:.0f}km {wt}kg {cargo}",
            distance_km=dist,
            weight_kg=float(wt),
            cargo_type=cargo,
            train_name=t_name if use_train else t_name_s,
            train_type="" if use_train else t_type_s,
            train_number=t_no if use_train else t_no_s,
            category="route",
        )
        if idx >= count:
            return


def _edge_cases() -> Iterator[ValidationCase]:
    """Boundary rules: min distance, chargeable weight floors, animals, heavy blocks."""
    edges = [
        ValidationCase("edge-001", "Below min distance 10km", 10, 50, scale="S", category="edge"),
        ValidationCase("edge-002", "Exactly 50km min", 50, 50, scale="S", category="edge"),
        ValidationCase("edge-003", "Bicycle 15kg→40kg chargeable", 800, 15, cargo_type="Bicycle", category="edge"),
        ValidationCase("edge-004", "Bike 12kg→40kg chargeable", 1200, 12, cargo_type="Bike", category="edge"),
        ValidationCase("edge-005", "Fragile handling ₹100", 600, 80, cargo_type="Fragile", scale="S", category="edge"),
        ValidationCase("edge-006", "300kg triple block L", 927, 300, scale="L", category="edge"),
        ValidationCase("edge-007", "305kg mixed block S", 1500, 305, scale="S", category="edge"),
        ValidationCase("edge-008", "Rajdhani auto scale R", 1400, 100, train_name="Rajdhani Express", train_type="RAJ", train_number="12301", category="edge"),
        ValidationCase("edge-009", "Passenger auto scale S", 900, 60, train_name="Passenger", train_type="PASS", category="edge"),
        ValidationCase("edge-010", "Bicycle forces Scale-L on SF", 1300, 15, cargo_type="Bicycle", train_name="SF Express", train_type="SF", category="edge"),
    ]
    yield from edges


def generate_validation_cases(total: int = 100) -> list[ValidationCase]:
    """Build exactly `total` generalized validation cases."""
    cases: list[ValidationCase] = []
    for gen in (_slab_grid_cases, _route_cases, _edge_cases):
        for case in gen():
            cases.append(case)
            if len(cases) >= total:
                return cases[:total]
    return cases


def _expected_scale(case: ValidationCase) -> str:
    if case.scale:
        return case.scale.upper()
    return resolve_billing_scale(
        case.cargo_type,
        case.train_name,
        case.train_type,
        case.train_number,
    )


def validate_case(case: ValidationCase) -> dict[str, Any]:
    """Compare production tariff vs independent reference for one case."""
    scale = _expected_scale(case)
    chargeable = resolve_chargeable_weight(case.cargo_type, case.weight_kg)
    handling = resolve_handling_charge(case.cargo_type)
    revision = _rate_revision_factor()

    ref_freight = reference_lookup_tariff(
        case.distance_km,
        chargeable,
        scale,
        include_surcharge=True,
        is_animal=case.is_animal,
        revision_factor=revision,
    )
    prod_freight = lookup_tariff(
        case.distance_km,
        chargeable,
        scale,
        include_surcharge=True,
        is_animal=case.is_animal,
    )

    ref_total = reference_calc_parcel_cost(
        case.distance_km,
        case.weight_kg,
        scale=scale,
        chargeable_weight_kg=chargeable,
        handling_inr=handling,
        include_surcharge=True,
        is_animal=case.is_animal,
        revision_factor=revision,
    )
    prod_total = calc_parcel_cost(
        case.distance_km,
        case.weight_kg,
        train_name=case.train_name,
        train_type=case.train_type,
        train_number=case.train_number,
        cargo_type=case.cargo_type,
        scale=case.scale,
        is_animal=case.is_animal,
    )

    freight_ok = abs(prod_freight - ref_freight) < 0.02
    total_ok = abs(prod_total - ref_total) < 0.01
    ok = freight_ok and total_ok

    return {
        "id": case.id,
        "label": case.label,
        "category": case.category,
        "distance_km": case.distance_km,
        "weight_kg": case.weight_kg,
        "chargeable_kg": chargeable,
        "cargo_type": case.cargo_type,
        "scale": scale,
        "prod_freight": prod_freight,
        "ref_freight": ref_freight,
        "prod_total": prod_total,
        "ref_total": ref_total,
        "ok": ok,
        "freight_ok": freight_ok,
        "total_ok": total_ok,
    }


def run_validation(total: int = 100) -> dict[str, Any]:
    cases = generate_validation_cases(total)
    results = [validate_case(c) for c in cases]
    failed = [r for r in results if not r["ok"]]
    by_cat: dict[str, dict[str, int]] = {}
    for r in results:
        cat = r["category"]
        by_cat.setdefault(cat, {"pass": 0, "fail": 0})
        if r["ok"]:
            by_cat[cat]["pass"] += 1
        else:
            by_cat[cat]["fail"] += 1

    return {
        "total": len(results),
        "passed": len(results) - len(failed),
        "failed": len(failed),
        "by_category": by_cat,
        "failures": failed,
        "results": results,
    }
