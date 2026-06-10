"""
Water pipeline ML models — Phase 4.

Loads trained GradientBoosting models from models/ when available.
Falls back to the Phase 2 heuristic if pkl files are absent
(e.g., before training is run).

predict_port_congestion()   ← PORT_CONGESTION_INDEX from Daily_Ports_Data.csv
predict_chokepoint_stress() ← CHOKEPOINT_STRESS from Daily_Chokepoints_Data.csv
predict_eta_adjustment()    ← trained pkl (Phase 4) or heuristic fallback (Phase 2)

To train the models:
  cd backend
  python -m app.pipelines.water.train_model
"""

from __future__ import annotations

import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


# ── Trained model loader (Phase 4) ───────────────────────────────────────────

def _models_dir() -> Path:
    return Path(__file__).resolve().parent / "models"


_delay_model = None   # loaded lazily
_eta_model   = None


def _load_models() -> tuple[object | None, object | None]:
    """Load trained pkl files if they exist. Returns (delay_model, eta_model)."""
    global _delay_model, _eta_model
    if _delay_model is not None:
        return _delay_model, _eta_model

    md = _models_dir()
    delay_path = md / "water_delay_model.pkl"
    eta_path   = md / "water_eta_model.pkl"

    if delay_path.exists():
        try:
            with open(delay_path, "rb") as f:
                _delay_model = pickle.load(f)
            log.info("[ml_models] Loaded water_delay_model.pkl")
        except Exception as e:
            log.warning("[ml_models] Failed to load water_delay_model.pkl: %s", e)
            _delay_model = None

    if eta_path.exists():
        try:
            with open(eta_path, "rb") as f:
                _eta_model = pickle.load(f)
            log.info("[ml_models] Loaded water_eta_model.pkl")
        except Exception as e:
            log.warning("[ml_models] Failed to load water_eta_model.pkl: %s", e)
            _eta_model = None

    return _delay_model, _eta_model


def reload_models() -> tuple[object | None, object | None]:
    """Clear cached pkls and reload from disk (after training)."""
    global _delay_model, _eta_model
    _delay_model = None
    _eta_model = None
    return _load_models()


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


# ── Transit days interpolation ────────────────────────────────────────────────

def _port_sea_distance_nm(portid_a: str, portid_b: str) -> float:
    """Estimate nautical miles between two ports using their PortWatch coordinates."""
    try:
        from app.pipelines.water.data_loader import PORTWATCH_PORTS
        import math
        pa = PORTWATCH_PORTS.get(portid_a)
        pb = PORTWATCH_PORTS.get(portid_b)
        if pa is None or pb is None:
            return 0.0
        R = 3440.065
        lat1, lon1 = math.radians(pa.lat), math.radians(pa.lon)
        lat2, lon2 = math.radians(pb.lat), math.radians(pb.lon)
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    except Exception:
        return 0.0


def _interpolate_transit_days(
    from_portid: str,
    to_portid: str,
    sea_distance_nm: float,
    td_map: dict,
    max_candidates: int = 30,
) -> float | None:
    """
    Estimate transit days for an unknown port pair by finding the most similar
    known pair (by sea distance) and scaling linearly.

    Returns None if insufficient data is available.
    """
    if not td_map or sea_distance_nm <= 0:
        return None

    # Build (distance, days) samples from known pairs
    # Use pairs that share at least one port endpoint for better locality
    same_origin = [(k, v) for k, v in td_map.items() if k[0] == from_portid]
    same_dest   = [(k, v) for k, v in td_map.items() if k[1] == to_portid]
    local_pairs = same_origin + same_dest

    if len(local_pairs) < 3:
        # Fallback: use any pairs with similar distance
        all_pairs = list(td_map.items())
        # Sample up to max_candidates for speed
        step = max(1, len(all_pairs) // max_candidates)
        local_pairs = all_pairs[::step]

    # Find pair whose distance is closest to ours
    best_dist_diff = float("inf")
    best_speed_kn: float | None = None

    for (fp, tp), days in local_pairs:
        if days <= 0:
            continue
        d_nm = _port_sea_distance_nm(fp, tp)
        if d_nm <= 0:
            continue
        speed = d_nm / (days * 24.0)   # knots implied
        if speed < 6 or speed > 30:    # sanity: 6–30 kn reasonable for cargo
            continue
        diff = abs(d_nm - sea_distance_nm)
        if diff < best_dist_diff:
            best_dist_diff = diff
            best_speed_kn = speed

    if best_speed_kn is None:
        return None

    estimated_days = sea_distance_nm / (best_speed_kn * 24.0)
    log.debug(
        "[transit_interp] %s→%s %.0fnm → %.1fd (inferred speed=%.1fkn, closest_pair_diff=%.0fnm)",
        from_portid, to_portid, sea_distance_nm, estimated_days,
        best_speed_kn, best_dist_diff,
    )
    return round(estimated_days, 2)


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
      source_label     : "ml_model" | "observed" | "heuristic"

    Priority:
      1. Trained ML model (Phase 4) — if pkl exists
      2. Observed transit days from Spillover simulator (if portid pair known)
      3. Heuristic based on distance + season + chokepoint stress + weather
    """
    dt = departure_dt or datetime.now()
    chokepoints = chokepoint_ids or []

    # ── Base: nominal sea hours ────────────────────────────────────────────
    nominal_sea_hr = sea_distance_nm / max(16.0, 1e-6)   # 16 knots default

    # ── Step 0: Try trained ML model ──────────────────────────────────────
    delay_model, eta_model = _load_models()
    if delay_model is not None or eta_model is not None:
        try:
            from app.pipelines.water.train_model import FEATURE_COLS
            from app.pipelines.water.data_loader import PORTWATCH_PORTS

            fp_meta = PORTWATCH_PORTS.get(from_portid or "")
            tp_meta = PORTWATCH_PORTS.get(to_portid or "")

            fp_vc  = fp_meta.vessel_count_total if fp_meta else 1000
            tp_vc  = tp_meta.vessel_count_total if tp_meta else 1000
            fp_iq  = fp_meta.infrastructure_quality if fp_meta else 0.80
            tp_iq  = tp_meta.infrastructure_quality if tp_meta else 0.80
            infra_avg = (fp_iq + tp_iq) / 2.0

            fp_cong = predict_port_congestion(from_portid or "")
            tp_cong = predict_port_congestion(to_portid or "")
            cp_stress = predict_chokepoint_stress(chokepoints)

            fp_cont = fp_meta.continent if fp_meta else ""
            tp_cont = tp_meta.continent if tp_meta else ""
            cross_region = int(fp_cont != tp_cont and bool(fp_cont) and bool(tp_cont))

            # Build feature vector matching FEATURE_COLS order
            features = [[
                sea_distance_nm,
                dt.month,
                fp_vc,
                tp_vc,
                fp_cong,
                tp_cong,
                cp_stress,
                wave_height_m if wave_height_m is not None else 0.0,
                wind_speed_kn if wind_speed_kn is not None else 0.0,
                int(storm_flag),
                0.0,          # precipitation_mm — not available at request time
                0,            # has_disruption — handled by engineer.py separately
                0,            # disruption_severity
                infra_avg,
                cross_region,
            ]]

            if eta_model is not None:
                eta_mult = float(eta_model.predict(features)[0])
                eta_mult = max(1.0, min(2.0, eta_mult))
                # Reconstruct delay hours from ETA multiplier and nominal time
                delay_hr = (eta_mult - 1.0) * nominal_sea_hr
                delay_hr += 1.2 * max(transshipments, 0)
                delay_hr  = max(0.0, min(72.0, delay_hr))
                return round(eta_mult, 3), round(delay_hr, 2), "ml_model"

            elif delay_model is not None:
                delay_hr = float(delay_model.predict(features)[0])
                delay_hr += 1.2 * max(transshipments, 0)
                delay_hr  = max(0.0, min(72.0, delay_hr))
                eta_mult  = 1.0 + min(delay_hr / max(nominal_sea_hr, 1.0), 0.50)
                return round(eta_mult, 3), round(delay_hr, 2), "ml_model"

        except Exception as ml_err:
            log.warning("[ml_models] ML inference failed, falling back: %s", ml_err)

    # ── Step 1: Try observed transit days from Spillover data ─────────────
    if from_portid and to_portid:
        td_map = _get_transit_days_map()
        observed_days = td_map.get((from_portid, to_portid))

        # If no direct pair, try distance-based interpolation from nearby known pairs
        if not observed_days and sea_distance_nm > 0:
            observed_days = _interpolate_transit_days(
                from_portid, to_portid, sea_distance_nm, td_map
            )

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
