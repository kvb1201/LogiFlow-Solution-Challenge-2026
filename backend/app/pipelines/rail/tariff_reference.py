"""
Independent reference implementation for IRCA parcel pricing.

Reads official slab JSON directly (not via tariff.py) so validation can
cross-check production code without circular imports.
"""

from __future__ import annotations

import json
import os
from typing import Any

_DATA_DIR = os.path.dirname(__file__)

MIN_CHARGEABLE_DISTANCE_KM = 50
MIN_CHARGE_RS = 30.0
DEV_SURCHARGE_RATE = 0.02
STATIONARY_CHARGE_RS = 5.0
GST_RATE = 0.05


def _load_rows(scale: str) -> list[dict[str, Any]]:
    path = os.path.join(_DATA_DIR, f"scale_{scale.lower()}_official.json")
    with open(path) as f:
        rows = json.load(f)["rows"]
    return [r for r in rows if int(r.get("hi", 0)) > int(r.get("lo", 0))]


def _effective_distance(distance_km: float) -> float:
    return max(float(distance_km), MIN_CHARGEABLE_DISTANCE_KM)


def _slab_rates(rows: list[dict], distance_km: float) -> list[float]:
    effective = _effective_distance(distance_km)
    for row in rows:
        if row["lo"] <= effective <= row["hi"]:
            return list(row["rates"])
    return list(rows[-1]["rates"]) if rows else [0.0] * 10


def reference_lookup_tariff(
    distance_km: float,
    weight_kg: float,
    scale: str = "S",
    *,
    include_surcharge: bool = False,
    is_animal: bool = False,
    revision_factor: float = 1.0,
) -> float:
    """Slab freight only — mirrors IRCA PDF tables."""
    scale = (scale or "S").upper()
    if scale not in {"L", "S", "P", "R"}:
        scale = "S"

    rates = _slab_rates(_load_rows(scale), distance_km)
    weight_kg = max(float(weight_kg), 1.0)

    full_hundreds = int(weight_kg) // 100
    remainder_kg = weight_kg - full_hundreds * 100
    total = 0.0

    if full_hundreds > 0:
        total += rates[9] * full_hundreds

    if remainder_kg > 0 or full_hundreds == 0:
        effective_wt = remainder_kg if remainder_kg > 0 else weight_kg
        slab_idx = min(int((effective_wt - 1) // 10), 9)
        total += rates[slab_idx]

    if is_animal:
        total *= 1.25

    total *= revision_factor

    if include_surcharge:
        total *= 1 + DEV_SURCHARGE_RATE

    return round(total, 2)


def reference_finalize_total(freight_inr: float, handling_inr: float = 0.0) -> float:
    total = float(freight_inr) + float(handling_inr) + STATIONARY_CHARGE_RS
    total += float(freight_inr) * GST_RATE
    total = max(total, MIN_CHARGE_RS)
    return float(round(total / 10) * 10)


def reference_calc_parcel_cost(
    distance_km: float,
    weight_kg: float,
    *,
    scale: str = "S",
    chargeable_weight_kg: float | None = None,
    handling_inr: float = 0.0,
    include_surcharge: bool = True,
    is_animal: bool = False,
    revision_factor: float = 1.0,
) -> float:
    chargeable = float(chargeable_weight_kg if chargeable_weight_kg is not None else weight_kg)
    freight = reference_lookup_tariff(
        distance_km,
        chargeable,
        scale,
        include_surcharge=include_surcharge,
        is_animal=is_animal,
        revision_factor=revision_factor,
    )
    return reference_finalize_total(freight, handling_inr)
