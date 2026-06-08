"""
Water pipeline ML models — Phase 2.

Replaces the heuristic stubs with real data-backed functions:

  predict_port_congestion()   ← PORT_CONGESTION_INDEX from Daily_Ports_Data.csv
  predict_chokepoint_stress() ← CHOKEPOINT_STRESS from Daily_Chokepoints_Data.csv
  predict_eta_adjustment()    ← SPILLOVER_TRANSIT_DAYS + chokepoint stress + weather

Phase 4 will replace predict_eta_adjustment() with a trained GradientBoosting model.
Until then, it uses the observed spillover transit days as a strong base and applies
real multipliers on top.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

log = logging.getLogger(__name__)


# ── Lazy import guard — data_loader may not have congestion data in dev ───────

def _get_congestion_index() -> dict[str, float]:
    try:
        from app.pipelines.water.data_loader import PORT_CONGESTION_INDEX
        return PORT_CONGESTION_INDEX
    except Exception:
        return {}


def _get_chokepoint_stress_map() -> dict[str, float]:
    try:
        from app.pipelines.water.data_loader import CHOKEPOINT_STRESS
        return CHOKEPOINT_STRESS
    except Exception:
        return {}


def _get_transit_days_map() -> dict[tuple[str, str], float]:
    try:
        from app.pipelines.water.data_loader import SPILLOVER_TRANSIT_DAYS
        return SPILLOVER_TRANSIT_DAYS
    except Exception:
        return {}


def _get_port_meta_from_config(port_id: str) -> dict:
    """Fall back to static config for ports not yet in data_loader."""
    try:
        from app.pipelines.water.config import PORTS
        for p in PORTS:
            if str(p.get("id")) == str(port_id):
                return p
    except Exception:
        pass
    return {}


# ── 1. Port congestion ────────────────────────────────────────────────────────

def predict_port_congestion(port_id: str, date: str | None = None) -> float:
    """
    Return congestion index for a port in [0.0, 1.0].

    Source priority:
      1. PORT_CONGESTION_INDEX from Daily_Ports_Data.csv rolling average
         (loaded by data_loader when WATER_SKIP_CONGESTION_SCAN != 1)
      2. base_congestion from static config (Phase 1 fallback)
      3. Global default 0.4

    1.0 = at or above historical baseline (busy / congested)
    0.1 = well below baseline (quiet)
    """
    # Try live congestion index first
    ci = _get_congestion_index()
    if ci and port_id in ci:
        val = ci[port_id]
        # Normalise: index > 1.0 means busier than baseline — cap at 1.0 for risk
        return round(max(0.0, min(1.0, val)), 3)

    # Fall back to static config base_congestion
    meta = _get_port_meta_from_config(port_id)
    if meta:
        return round(float(meta.get("base_congestion", 0.4)), 3)

    return 0.4


# ── 2. Chokepoint stress ──────────────────────────────────────────────────────

def predict_chokepoint_stress(chokepoint_ids: list[str]) -> float:
    """
    Return worst-case stress across all chokepoints on a route.

    stress = 0.0  → normal traffic (no disruption)
    stress = 1.0  → near-zero transits (severe disruption / rerouting)

    Source: CHOKEPOINT_STRESS from Daily_Chokepoints_Data.csv
    = 1 - (recent_14d_avg / full_dataset_baseline_avg)
    """
    if not chokepoint_ids:
        return 0.0

    stress_map = _get_chokepoint_stress_map()
    if not stress_map:
        return 0.0

    stresses = [stress_map.get(cid, 0.0) for cid in chokepoint_ids]
    return round(max(stresses), 3)


def get_chokepoint_names(chokepoint_ids: list[str]) -> list[str]:
    """Return display names for chokepoints on a route."""
    try:
        from app.pipelines.water.data_loader import PORTWATCH_CHOKEPOINTS
        names = []
        for cid in chokepoint_ids:
            cp = PORTWATCH_CHOKEPOINTS.get(cid)
            names.append(cp.portname if cp else cid)
        return names
    except Exception:
        return chokepoint_ids


# ── 3. ETA adjustment ─────────────────────────────────────────────────────────

def predict_eta_adjustment(
    sea_distance_nm: float,
    transshipments: int,
    coast: str | None = None,
    departure_dt: datetime | None = None,
    # Phase 2 additions:
    from_portid: str | None = None,
    to_portid: str | None = None,
    chokepoint_ids: list[str] | None = None,
    wave_height_m: float | None = None,
    wind_speed_kn: float | None = None,
    storm_flag: bool = False,
) -> tuple[float, float, str]:
    """
    Estimate ETA multiplier and expected delay hours for a sea voyage.

    Returns: (eta_multiplier, expected_delay_hours, source_label)
      eta_multiplier   : multiply nominal sea_hr by this (>= 1.0)
      expected_delay_hours : absolute delay in hours on top of nominal
      source_label     : "observed" | "heuristic" for transparency

    Priority:
      1. Observed transit days from Spillover simulator (if portid pair known)
      2. Heuristic based on distance + season + chokepoint stress + weather
    """
    dt = departure_dt or datetime.now()
    chokepoints = chokepoint_ids or []

    # ── Base: nominal sea hours ────────────────────────────────────────────
    nominal_sea_hr = sea_distance_nm / max(16.0, 1e-6)   # 16 knots default

    # ── Step 1: Try observed transit days from Spillover data ─────────────
    if from_portid and to_portid:
        td_map = _get_transit_days_map()
        observed_days = td_map.get((from_portid, to_portid))
        if observed_days and observed_days > 0:
            observed_sea_hr = observed_days * 24.0

            # Apply real-time adjustments on top of the observed baseline
            cp_stress    = predict_chokepoint_stress(chokepoints)
            weather_mult = _weather_delay_mult(wave_height_m, wind_speed_kn, storm_flag)

            # Chokepoint disruption: up to 20% extra on observed transit
            cp_delay_hr = observed_sea_hr * cp_stress * 0.20

            # Weather: capped at 15% of observed transit
            weather_delay_hr = min(
                observed_sea_hr * (weather_mult - 1.0),
                observed_sea_hr * 0.15,
            )

            # Transshipment variance
            trans_delay_hr = 1.2 * max(transshipments, 0)

            # Total extra hours beyond the observed baseline
            extra_hr = cp_delay_hr + weather_delay_hr + trans_delay_hr

            # eta_mult relative to observed sea hours so engineer.py can do:
            #   actual_sea_hr = observed_sea_hr * eta_mult
            eta_mult = 1.0 + min(extra_hr / max(observed_sea_hr, 1.0), 0.40)

            log.debug(
                "[eta] %s→%s observed=%.1fd cp=%.1fh wx=%.1fh trans=%.1fh "
                "eta_mult=%.3f",
                from_portid, to_portid, observed_days,
                cp_delay_hr, weather_delay_hr, trans_delay_hr, eta_mult,
            )
            return round(eta_mult, 3), round(max(0.0, extra_hr), 2), "observed"

    # ── Step 2: Heuristic (no spillover pair available) ───────────────────
    base_delay = _heuristic_base_delay(sea_distance_nm, dt.month)
    cp_stress    = predict_chokepoint_stress(chokepoints)
    weather_mult = _weather_delay_mult(wave_height_m, wind_speed_kn, storm_flag)

    # Chokepoint stress adds proportional delay
    cp_delay_hr = nominal_sea_hr * cp_stress * 0.25

    # Weather multiplier
    weather_delay_hr = nominal_sea_hr * (weather_mult - 1.0)

    # Transshipment variance
    trans_delay_hr = 1.2 * max(transshipments, 0)

    total_delay = base_delay + cp_delay_hr + weather_delay_hr + trans_delay_hr

    eta_mult = 1.0 + min(total_delay / max(nominal_sea_hr, 1.0), 0.50)
    eta_mult = min(eta_mult, 2.0)

    return round(eta_mult, 3), round(max(0.0, total_delay), 2), "heuristic"


# ── Internal helpers ──────────────────────────────────────────────────────────

def _heuristic_base_delay(sea_distance_nm: float, month: int) -> float:
    """Distance + season → base delay hours (original heuristic, kept as fallback)."""
    if sea_distance_nm > 1200:
        base = 2.0
    elif sea_distance_nm > 600:
        base = 1.0
    else:
        base = 0.4

    monsoon = month in {6, 7, 8, 9}
    if monsoon:
        base *= 1.5

    return base


def _weather_delay_mult(
    wave_height_m: float | None,
    wind_speed_kn: float | None,
    storm_flag: bool,
) -> float:
    """
    Convert weather conditions to a voyage speed multiplier.
    1.0 = no weather impact
    1.5 = 50% longer due to bad weather
    """
    mult = 1.0

    if wave_height_m is not None:
        if wave_height_m > 6.0:
            mult += 0.45
        elif wave_height_m > 4.0:
            mult += 0.28
        elif wave_height_m > 2.5:
            mult += 0.14
        elif wave_height_m > 1.5:
            mult += 0.06

    if wind_speed_kn is not None:
        if wind_speed_kn > 40:    # Beaufort 9+
            mult += 0.20
        elif wind_speed_kn > 28:  # Beaufort 7+
            mult += 0.10
        elif wind_speed_kn > 17:  # Beaufort 5+
            mult += 0.04

    if storm_flag:
        mult += 0.15

    return round(min(mult, 2.0), 3)


def _season_mult(month: int, coast: str) -> float:
    """Seasonal multiplier — legacy, kept for heuristic path."""
    if month in {6, 7, 8, 9}:   # monsoon
        return 1.15
    if coast and "atlantic" in coast.lower() and month in {11, 12, 1, 2}:
        return 1.12
    return 1.0


# ── Route chokepoints lookup ──────────────────────────────────────────────────

def get_route_chokepoints(path: list[str]) -> list[str]:
    """
    Return all chokepoint IDs transited by a port path.
    Uses ROUTE_CHOKEPOINTS map from config.
    """
    try:
        from app.pipelines.water.config import ROUTE_CHOKEPOINTS
        cps: list[str] = []
        for a, b in zip(path, path[1:]):
            cps.extend(ROUTE_CHOKEPOINTS.get((a, b), []))
            # Also check reverse (for symmetric routes)
            cps.extend(ROUTE_CHOKEPOINTS.get((b, a), []))
        # Deduplicate preserving order
        seen: set[str] = set()
        out: list[str] = []
        for c in cps:
            if c not in seen:
                seen.add(c)
                out.append(c)
        return out
    except Exception:
        return []
