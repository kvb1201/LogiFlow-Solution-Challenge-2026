"""
Official Indian Railways Parcel & Luggage Tariff Calculator.

Source: Official PDFs downloaded from:
  - Scale-L: indianrailways.gov.in/railwayboard/uploads/parcel/downloads/luggage_rates.pdf
  - Scale-S: parcel.indianrail.gov.in/Rates/Standered_rates.pdf
  - Scale-P: parcel.indianrail.gov.in/Rates/Premier_rates.pdf

All rate tables are loaded from JSON files extracted directly from these PDFs.
No interpolation or estimation — these are the exact official values.

Four scales:
  - Scale-L: Luggage Parcel Service (all trains, for passenger luggage)
  - Scale-S: Standard Parcel Service (<60% brake-van utilization)
  - Scale-P: Premier Parcel Service (>60% BV util, special parcel trains)
  - Scale-R: Rajdhani Parcel Service (Rajdhani/Shatabdi/Duronto)

Key rules:
  - Minimum chargeable distance: 50 km
  - Minimum charge: Rs 30
  - Bulky articles (>100 kg): double the 91-100 kg rate
  - Optimal method: book as multiple 100 kg consignments
  - 2% development surcharge may apply
  - Animals/birds: Scale-L + 25%
"""

import os
import json
from typing import Optional, List, Tuple


# ═══════════════════════════════════════════════════════════════════════
# Load official rate tables from JSON (extracted from Railway Board PDFs)
# ═══════════════════════════════════════════════════════════════════════

_DATA_DIR = os.path.dirname(__file__)


def _load_scale_table(filename: str) -> List[Tuple[int, int, List[float]]]:
    """Load a scale's rate table from its JSON file."""
    path = os.path.join(_DATA_DIR, filename)
    try:
        with open(path, "r") as f:
            data = json.load(f)
        return [(r["lo"], r["hi"], r["rates"]) for r in data["rows"]]
    except FileNotFoundError:
        print(f"  [Tariff] WARNING: {filename} not found, scale unavailable")
        return []


# Load all four official tables (extracted from Railway Board PDFs)
_TABLE_L = _load_scale_table("scale_l_official.json")
_TABLE_S = _load_scale_table("scale_s_official.json")
_TABLE_P = _load_scale_table("scale_p_official.json")
_TABLE_R = _load_scale_table("scale_r_official.json")


# ═══════════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════════

MIN_CHARGEABLE_DISTANCE_KM = 50
MIN_CHARGE_RS = 30.0
DEV_SURCHARGE_RATE = 0.02
ANIMALS_SURCHARGE_RATE = 0.25


# ═══════════════════════════════════════════════════════════════════════
# Core lookup functions
# ═══════════════════════════════════════════════════════════════════════

def _find_slab(table: List[Tuple[int, int, List[float]]],
               distance_km: float) -> List[float]:
    """
    Find the rate row for a given distance from a scale table.

    Args:
        table: List of (lo, hi, [10 rates]) tuples.
        distance_km: Effective distance in km.

    Returns:
        List of 10 rate values for the matching slab,
        or the last slab if distance exceeds table range.
    """
    effective = max(distance_km, MIN_CHARGEABLE_DISTANCE_KM)

    for lo, hi, rates in table:
        if lo <= effective <= hi:
            return rates

    # Beyond table: return last row
    if table:
        return table[-1][2]
    return [0.0] * 10


def _get_slab_info(table: List[Tuple[int, int, List[float]]],
                   distance_km: float) -> Tuple[int, int]:
    """Get the (lo, hi) boundaries for the applicable distance slab."""
    effective = max(distance_km, MIN_CHARGEABLE_DISTANCE_KM)
    for lo, hi, _ in table:
        if lo <= effective <= hi:
            return (lo, hi)
    if table:
        return (table[-1][0], table[-1][1])
    return (0, 0)


def _get_scale_table(scale: str):
    """Get the rate table for a given scale code."""
    scale = scale.upper()
    if scale == "L":
        return _TABLE_L
    elif scale == "S":
        return _TABLE_S
    elif scale == "P":
        return _TABLE_P
    elif scale == "R":
        return _TABLE_R
    return _TABLE_S  # Default to standard


def lookup_tariff(
    distance_km: float,
    weight_kg: float,
    scale: str = "S",
    include_surcharge: bool = False,
    is_animal: bool = False,
) -> float:
    """
    Look up the official Indian Railways parcel/luggage charge.

    Uses exact values from official Railway Board PDFs.

    Args:
        distance_km: Route distance in kilometers.
        weight_kg: Cargo weight in kilograms.
        scale: Tariff scale — "L", "S", "P", or "R".
        include_surcharge: If True, add 2% development surcharge.
        is_animal: If True, apply +25% surcharge (animals/birds).

    Returns:
        Charge in INR (rupees), rounded to 2 decimal places.
    """
    scale = scale.upper()
    if scale not in ("L", "S", "P", "R"):
        scale = "S"

    table = _get_scale_table(scale)
    rates = _find_slab(table, distance_km)

    if weight_kg <= 0:
        weight_kg = 1

    # For weight > 100 kg: book as multiple 100 kg consignments
    # (cheaper than bulky article double-rate rule)
    full_hundreds = int(weight_kg) // 100
    remainder_kg = weight_kg - (full_hundreds * 100)

    total = 0.0

    if full_hundreds > 0:
        # Each 100 kg block → 91-100 kg slab rate (index 9)
        rate_per_100 = rates[9]
        total += rate_per_100 * full_hundreds

    if remainder_kg > 0 or full_hundreds == 0:
        # Partial block: find weight slab index (0-9)
        effective_wt = remainder_kg if remainder_kg > 0 else weight_kg
        slab_idx = min(int((effective_wt - 1) // 10), 9)
        total += rates[slab_idx]

    # No multiplier needed — all scales use exact PDF values

    # Animals/birds surcharge
    if is_animal:
        total *= (1 + ANIMALS_SURCHARGE_RATE)

    # Development surcharge
    if include_surcharge:
        total *= (1 + DEV_SURCHARGE_RATE)

    return round(total, 2)


# ═══════════════════════════════════════════════════════════════════════
# Train type → scale classification
# ═══════════════════════════════════════════════════════════════════════

SCALE_R_KEYWORDS = {
    "rajdhani", "shatabdi", "duronto",
    "raj", "shtb", "drnt",
}

SCALE_P_KEYWORDS = {
    "superfast", "humsafar", "tejas", "gatimaan",
    "vande bharat", "jan shatabdi",
    "sf", "sup", "hms",
    "sf exp", "s/f exp", "sf express", "s.f.exp",
    "s f exp", "sup exp", "sup express",
}

RAJDHANI_NUMBER_RANGES = [
    (12301, 12312), (12313, 12320), (12951, 12958), (22691, 22696),
]
SHATABDI_NUMBER_RANGES = [
    (12001, 12095),
]


def _classify_by_train_number(train_no: str) -> str:
    """Classify train by number using IR numbering conventions."""
    try:
        num = int(train_no.strip())
    except (ValueError, TypeError):
        return ""

    for lo, hi in RAJDHANI_NUMBER_RANGES:
        if lo <= num <= hi:
            return "R"
    for lo, hi in SHATABDI_NUMBER_RANGES:
        if lo <= num <= hi:
            return "R"
    if 20000 <= num <= 20999:
        return "R"
    if 22000 <= num <= 22999:
        return "P"
    if 12000 <= num <= 12999:
        return "P"
    return ""


def determine_scale(
    train_name: str = "",
    train_type: str = "",
    train_number: str = "",
) -> str:
    """
    Determine the applicable tariff scale from train name/type/number.

    Args:
        train_name: Full train name
        train_type: Train type string (e.g. "RAJ", "SF")
        train_number: 5-digit train number

    Returns:
        Scale code: "R", "P", or "S"
    """
    combined = (train_name + " " + train_type).lower()

    for kw in SCALE_R_KEYWORDS:
        if kw in combined:
            return "R"
    for kw in SCALE_P_KEYWORDS:
        if kw in combined:
            return "P"

    type_code = train_type.strip().upper()
    if type_code in {"RAJ", "RAJDHANI", "SHTB", "SHATABDI", "DRNT", "DURONTO"}:
        return "R"
    if type_code in {"SF", "SUP", "SUPERFAST", "TEJAS", "GATIMAAN",
                      "VANDE BHARAT", "HMS", "HUMSAFAR", "JAN SHATABDI"}:
        return "P"

    if train_number:
        num_scale = _classify_by_train_number(train_number)
        if num_scale:
            return num_scale

    return "S"


# ═══════════════════════════════════════════════════════════════════════
# High-level API
# ═══════════════════════════════════════════════════════════════════════

def calc_parcel_cost(
    distance_km: float,
    weight_kg: float,
    train_name: str = "",
    train_type: str = "",
    scale: Optional[str] = None,
    is_luggage: bool = False,
    include_surcharge: bool = False,
    is_animal: bool = False,
) -> float:
    """
    Calculate Indian Railways parcel cost using official tariff tables.

    Args:
        distance_km: Route distance in kilometers.
        weight_kg: Cargo weight in kilograms.
        train_name: Full train name (auto-detect scale).
        train_type: Train type string (auto-detect scale).
        scale: Override tariff scale ("L", "S", "P", "R").
        is_luggage: If True, force Scale-L.
        include_surcharge: If True, add 2% dev surcharge.
        is_animal: If True, apply +25% animals/birds surcharge.

    Returns:
        Total parcel cost in INR (rupees).
    """
    if is_luggage:
        effective_scale = "L"
    elif scale:
        effective_scale = scale.upper()
    else:
        effective_scale = determine_scale(train_name, train_type)

    raw_cost = lookup_tariff(
        distance_km=distance_km,
        weight_kg=weight_kg,
        scale=effective_scale,
        include_surcharge=include_surcharge,
        is_animal=is_animal,
    )
    return round(max(raw_cost, MIN_CHARGE_RS), 2)


def get_tariff_breakdown(
    distance_km: float,
    weight_kg: float,
    train_name: str = "",
    train_type: str = "",
    scale: Optional[str] = None,
) -> dict:
    """
    Return a detailed breakdown of the tariff calculation.

    Returns:
        dict with scale, slab info, charges, and notes.
    """
    if scale:
        effective_scale = scale.upper()
    else:
        effective_scale = determine_scale(train_name, train_type)

    table = _get_scale_table(effective_scale)
    slab_lo, slab_hi = _get_slab_info(table, distance_km)

    base_charge = lookup_tariff(distance_km, weight_kg, effective_scale)
    with_surcharge = lookup_tariff(distance_km, weight_kg, effective_scale,
                                    include_surcharge=True)

    scale_names = {
        "L": "Luggage Parcel Service",
        "S": "Standard Parcel Service",
        "P": "Premier Parcel Service",
        "R": "Rajdhani Parcel Service",
    }

    full_hundreds = int(weight_kg) // 100
    remainder_kg = weight_kg - (full_hundreds * 100)
    num_consignments = full_hundreds + (1 if remainder_kg > 0 else 0)

    return {
        "scale": effective_scale,
        "scale_name": scale_names.get(effective_scale, "Unknown"),
        "distance_km": distance_km,
        "effective_distance_km": max(distance_km, MIN_CHARGEABLE_DISTANCE_KM),
        "distance_slab": f"{slab_lo}-{slab_hi} km",
        "weight_kg": weight_kg,
        "num_consignments": num_consignments,
        "base_charge_inr": base_charge,
        "dev_surcharge_2pct": round(with_surcharge - base_charge, 2),
        "total_with_surcharge_inr": with_surcharge,
        "minimum_charge_inr": MIN_CHARGE_RS,
        "notes": [
            f"Tariff scale: {scale_names.get(effective_scale, effective_scale)}",
            f"Distance slab: {slab_lo}-{slab_hi} km",
            f"Min chargeable distance: {MIN_CHARGEABLE_DISTANCE_KM} km",
            f"Min charge: Rs{MIN_CHARGE_RS}",
            f"Booked as {num_consignments} consignment(s)",
            "Source: Official Railway Board PDF (parcel.indianrail.gov.in)",
            "Excludes GST/statutory levies",
        ],
    }
