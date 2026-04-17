from __future__ import annotations

from datetime import datetime

from app.pipelines.water.config import PORTS


def predict_eta_adjustment(
    sea_distance_nm: float,
    transshipments: int,
    coast: str | None = None,
    departure_dt: datetime | None = None,
) -> tuple[float, float]:
    """
    Heuristic-first hook for future ML.

    Returns:
      (eta_multiplier, expected_delay_hours)
    """
    dt = departure_dt or datetime.now()
    month = dt.month

    # Monsoon-ish season heuristic (India): Jun-Sep higher sea variability.
    monsoon = month in {6, 7, 8, 9}

    base_delay = 0.0
    if sea_distance_nm > 1200:
        base_delay += 2.0
    elif sea_distance_nm > 600:
        base_delay += 1.0
    else:
        base_delay += 0.4

    if monsoon:
        base_delay *= 1.6

    # Transshipment increases schedule variance
    base_delay += 1.2 * max(transshipments, 0)

    # Keep multipliers bounded
    eta_mult = 1.0 + min(base_delay / max(sea_distance_nm / 16.0, 1.0), 0.35)

    return eta_mult, base_delay


def predict_port_congestion(port_id: str, date: str | None = None) -> float:
    """
    Heuristic-first hook for future congestion model.
    Returns congestion in [0,1].
    """
    for p in PORTS:
        if p.get("id") == port_id:
            v = float(p.get("base_congestion", 0.4))
            return max(0.0, min(1.0, v))
    return 0.4

