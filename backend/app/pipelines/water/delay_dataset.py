"""
Water pipeline — Phase 4: ML training dataset builder.

Builds a DataFrame joining:
  1. Daily_Ports_Data.csv    — portcall variance as congestion/delay proxy
  2. Daily_Chokepoints_Data.csv  — chokepoint stress per date
  3. portwatch_disruptions_database.csv  — binary disruption flag per port/date
  4. Spillover port-level CSV  — observed transit days (target label anchor)

ERA5 historical weather is NOT fetched here to keep the builder fast.
Instead, wave_height_m and wind_speed_kn columns are filled with 0.0
(train_model.py can patch them later once ERA5 data is available).

Target variable:
  delay_hours = (portcall_variance_ratio - 1) * base_voyage_hours * 0.12
  where portcall_variance_ratio = rolling_7d_portcalls / annual_baseline_portcalls
  (ratio > 1 → busier than normal → predicted delay)
  Clamped to [0, 72] hours.

Output: backend/app/pipelines/water/models/water_training_data.csv
        (or returned as a pandas DataFrame if called programmatically)

Usage:
  python -m app.pipelines.water.delay_dataset
  from app.pipelines.water.delay_dataset import build_dataset; df = build_dataset()
"""

from __future__ import annotations

import csv
import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta
from itertools import product
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


# ── Path resolution ───────────────────────────────────────────────────────────

def _data_dir() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "data" / "water"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError("Cannot locate backend/data/water/")


def _models_dir() -> Path:
    d = Path(__file__).resolve().parent / "models"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_float(v: str, default: float = 0.0) -> float:
    try:
        x = float(v)
        return x if x == x else default
    except (ValueError, TypeError):
        return default


def _safe_int(v: str, default: int = 0) -> int:
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return default


def _parse_date(s: str) -> Optional[datetime]:
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            continue
    return None


# ── Step 1: Load per-port per-date portcall series ────────────────────────────

def _load_daily_ports(data_dir: Path) -> dict[str, list[tuple[datetime, int]]]:
    """portid → sorted list of (date, portcalls)"""
    path = data_dir / "Daily_Ports_Data.csv"
    if not path.exists():
        log.warning("[dataset] Daily_Ports_Data.csv not found")
        return {}

    log.info("[dataset] Loading Daily_Ports_Data.csv (this may take ~30s for 606MB)...")
    result: dict[str, list[tuple[datetime, int]]] = defaultdict(list)
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fnames = reader.fieldnames or []
        date_col = fnames[0] if fnames else "date"
        for row in reader:
            raw = row.get(date_col, "").strip()
            pid = row.get("portid", "").strip()
            if not raw or not pid:
                continue
            dt = _parse_date(raw)
            if dt is None:
                continue
            calls = _safe_int(row.get("portcalls", "0"))
            result[pid].append((dt, calls))

    for pid in result:
        result[pid].sort(key=lambda x: x[0])

    log.info("[dataset] Loaded portcall series for %d ports", len(result))
    return dict(result)


# ── Step 2: Load per-chokepoint per-date transit series ───────────────────────

def _load_daily_chokepoints(data_dir: Path) -> dict[str, list[tuple[datetime, int]]]:
    """cpid → sorted list of (date, n_total)"""
    path = data_dir / "Daily_Chokepoints_Data.csv"
    if not path.exists():
        log.warning("[dataset] Daily_Chokepoints_Data.csv not found")
        return {}

    result: dict[str, list[tuple[datetime, int]]] = defaultdict(list)
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fnames = reader.fieldnames or []
        date_col = fnames[0] if fnames else "date"
        for row in reader:
            raw = row.get(date_col, "").strip()
            cpid = row.get("portid", "").strip()
            if not raw or not cpid:
                continue
            dt = _parse_date(raw)
            if dt is None:
                continue
            n = _safe_int(row.get("n_total", "0"))
            result[cpid].append((dt, n))

    for cpid in result:
        result[cpid].sort(key=lambda x: x[0])

    log.info("[dataset] Loaded chokepoint series for %d chokepoints", len(result))
    return dict(result)


# ── Step 3: Build disruption flags per port per year ─────────────────────────

def _load_disruption_flags(data_dir: Path) -> dict[tuple[str, int], str]:
    """(portid, year) → worst alertlevel (RED > ORANGE > GREEN)"""
    matches = list(data_dir.glob("portwatch_disruptions_database*.csv"))
    if not matches:
        log.warning("[dataset] No disruptions CSV found")
        return {}

    rank = {"RED": 3, "ORANGE": 2, "GREEN": 1, "": 0}
    result: dict[tuple[str, int], str] = {}

    with open(matches[0], encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            affected_raw = row.get("affectedports", "").strip()
            if not affected_raw:
                continue
            year = _safe_int(row.get("year", "0"))
            if year == 0:
                continue
            alert = row.get("alertlevel", "GREEN").strip()
            for pid in [p.strip() for p in affected_raw.split(";") if p.strip()]:
                key = (pid, year)
                existing = result.get(key, "")
                if rank.get(alert, 0) > rank.get(existing, 0):
                    result[key] = alert

    log.info("[dataset] Loaded disruption flags for %d (port, year) pairs", len(result))
    return result


# ── Step 4: Load spillover transit pairs ─────────────────────────────────────

def _load_spillover_pairs(data_dir: Path) -> list[dict]:
    """Return list of {from_portid, to_portid, average_transit_days, sea_distance_nm}."""
    path = data_dir / "Spillover_simulator%3A_port-level_impact.csv"
    if not path.exists():
        log.warning("[dataset] Spillover port-level CSV not found")
        return []

    rows = []
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            fp = row.get("from_portid", "").strip()
            tp = row.get("to_portid", "").strip()
            days = _safe_float(row.get("average_transit_days", "0"))
            if not fp or not tp or days <= 0:
                continue
            rows.append({
                "from_portid": fp,
                "to_portid":   tp,
                "average_transit_days": days,
                "daily_capacity_at_risk": _safe_float(row.get("daily_capacity_at_risk", "0")),
            })

    log.info("[dataset] Loaded %d spillover transit pairs", len(rows))
    return rows


# ── Step 5: Build per-port rolling statistics ─────────────────────────────────

def _compute_port_stats(
    port_series: dict[str, list[tuple[datetime, int]]],
    sample_dates: list[datetime],
    window_days: int = 30,
) -> dict[tuple[str, datetime], dict]:
    """
    For each (portid, date) combo, compute:
      - baseline_avg: mean portcalls over 2019–2023
      - recent_avg: mean portcalls over rolling window ending on date
      - congestion_index: recent_avg / baseline_avg (clamped 0.1–2.0)
      - portcall_variance_ratio: congestion_index (same as above)
    """
    baseline_years = {2019, 2020, 2021, 2022, 2023}
    result: dict[tuple[str, datetime], dict] = {}

    for portid, series in port_series.items():
        # Build baseline
        baseline_vals = [v for dt, v in series if dt.year in baseline_years]
        baseline_avg = sum(baseline_vals) / len(baseline_vals) if baseline_vals else 5.0

        # Index by date
        by_date: dict[datetime, int] = {dt.replace(hour=0, minute=0, second=0, microsecond=0): v
                                         for dt, v in series}

        for sample_dt in sample_dates:
            d0 = sample_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            window_vals = [
                by_date[d0 - timedelta(days=i)]
                for i in range(window_days)
                if (d0 - timedelta(days=i)) in by_date
            ]
            recent_avg = sum(window_vals) / len(window_vals) if window_vals else baseline_avg
            congestion = round(min(2.0, max(0.1, recent_avg / max(baseline_avg, 0.1))), 3)

            result[(portid, d0)] = {
                "baseline_avg": round(baseline_avg, 2),
                "recent_avg":   round(recent_avg, 2),
                "congestion_index": congestion,
            }

    return result


def _compute_chokepoint_stats(
    cp_series: dict[str, list[tuple[datetime, int]]],
    sample_dates: list[datetime],
    window_days: int = 14,
) -> dict[tuple[str, datetime], float]:
    """(cpid, date) → stress index 0.0–1.0"""
    result: dict[tuple[str, datetime], float] = {}

    for cpid, series in cp_series.items():
        all_vals = [v for _, v in series]
        baseline_avg = sum(all_vals) / len(all_vals) if all_vals else 1.0
        by_date: dict[datetime, int] = {dt.replace(hour=0, minute=0, second=0, microsecond=0): v
                                         for dt, v in series}

        for sample_dt in sample_dates:
            d0 = sample_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            window_vals = [
                by_date[d0 - timedelta(days=i)]
                for i in range(window_days)
                if (d0 - timedelta(days=i)) in by_date
            ]
            recent_avg = sum(window_vals) / len(window_vals) if window_vals else baseline_avg
            stress = round(min(1.0, max(0.0, 1.0 - (recent_avg / max(baseline_avg, 0.1)))), 3)
            result[(cpid, d0)] = stress

    return result


# ── Step 6: Derive sea distance between port pairs ────────────────────────────

def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    R = 3440.065  # nautical miles
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Main builder ──────────────────────────────────────────────────────────────

def build_dataset(
    max_pairs: int = 5000,
    sample_per_year: int = 12,    # monthly samples per pair
    years: tuple = (2020, 2021, 2022, 2023),
    output_csv: bool = True,
) -> "pd.DataFrame":  # type: ignore[name-defined]
    """
    Build the ML training dataset.

    Returns a pandas DataFrame. Optionally writes to models/water_training_data.csv.

    Parameters
    ----------
    max_pairs : int
        Cap on number of port pairs to include (to keep dataset manageable).
    sample_per_year : int
        Number of date samples per year (evenly spaced months).
    years : tuple
        Calendar years to sample.
    output_csv : bool
        Whether to write the CSV to models/.
    """
    try:
        import pandas as pd
    except ImportError:
        raise ImportError("pandas is required: pip install pandas")

    data_dir = _data_dir()

    # -- Load sources -----------------------------------------------------------
    port_series  = _load_daily_ports(data_dir)
    cp_series    = _load_daily_chokepoints(data_dir)
    disruptions  = _load_disruption_flags(data_dir)
    spill_pairs  = _load_spillover_pairs(data_dir)

    # -- Port metadata (lat/lon, vessel counts) ---------------------------------
    try:
        from app.pipelines.water.data_loader import PORTWATCH_PORTS
        port_meta = {pid: (pm.lat, pm.lon, pm.vessel_count_total,
                           pm.vessel_count_container, pm.infrastructure_quality,
                           pm.continent)
                     for pid, pm in PORTWATCH_PORTS.items()}
    except Exception:
        port_meta = {}

    # -- Sample dates -----------------------------------------------------------
    sample_dates: list[datetime] = []
    for yr in years:
        for mo in range(1, 13, max(1, 12 // sample_per_year)):
            sample_dates.append(datetime(yr, mo, 15))

    log.info("[dataset] Sample dates: %d total", len(sample_dates))

    # -- Compute rolling stats for relevant ports ---------------------------------
    pair_port_ids = set()
    for p in spill_pairs[:max_pairs]:
        pair_port_ids.add(p["from_portid"])
        pair_port_ids.add(p["to_portid"])

    subset_port_series = {pid: port_series[pid] for pid in pair_port_ids if pid in port_series}
    port_stats = _compute_port_stats(subset_port_series, sample_dates)

    # All chokepoints
    cp_stats = _compute_chokepoint_stats(cp_series, sample_dates)

    # -- Build rows ---------------------------------------------------------------
    # ROUTE_CHOKEPOINTS from config for chokepoint_stress_max
    try:
        from app.pipelines.water.config import ROUTE_CHOKEPOINTS
        route_cp_map = ROUTE_CHOKEPOINTS
    except Exception:
        route_cp_map = {}

    try:
        from app.pipelines.water.ml_models import predict_chokepoint_stress
    except Exception:
        def predict_chokepoint_stress(ids):  # type: ignore[misc]
            return 0.0

    rows = []
    severity_num = {"RED": 3, "ORANGE": 2, "GREEN": 1, "": 0}
    alert_weights = {"RED": 0.15, "ORANGE": 0.08, "GREEN": 0.03, "": 0.0}

    for pair in spill_pairs[:max_pairs]:
        fp = pair["from_portid"]
        tp = pair["to_portid"]
        transit_days = pair["average_transit_days"]

        fp_meta = port_meta.get(fp)
        tp_meta = port_meta.get(tp)
        if fp_meta is None or tp_meta is None:
            continue

        fp_lat, fp_lon, fp_vc, fp_vcc, fp_iq, fp_cont = fp_meta
        tp_lat, tp_lon, tp_vc, tp_vcc, tp_iq, tp_cont = tp_meta

        sea_nm = _haversine_nm(fp_lat, fp_lon, tp_lat, tp_lon)
        infra_avg = (fp_iq + tp_iq) / 2.0
        cross_region_flag = int(fp_cont != tp_cont)

        # Chokepoints on this pair (forward and reverse)
        cp_ids = list(set(
            route_cp_map.get((fp, tp), []) + route_cp_map.get((tp, fp), [])
        ))

        base_voyage_hr = transit_days * 24.0

        for sample_dt in sample_dates:
            d0 = sample_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            month = d0.month
            year  = d0.year

            fp_stat = port_stats.get((fp, d0), {})
            tp_stat = port_stats.get((tp, d0), {})
            fp_cong = fp_stat.get("congestion_index", 0.4)
            tp_cong = tp_stat.get("congestion_index", 0.4)

            # Chokepoint stress max across transited chokepoints on this date
            cp_stress_vals = [cp_stats.get((cpid, d0), 0.0) for cpid in cp_ids]
            cp_stress_max  = max(cp_stress_vals) if cp_stress_vals else 0.0

            # Disruption flags
            fp_alert = disruptions.get((fp, year), "")
            tp_alert = disruptions.get((tp, year), "")
            has_disruption = int(bool(fp_alert or tp_alert))
            disrupt_sev_num = max(severity_num.get(fp_alert, 0),
                                  severity_num.get(tp_alert, 0))

            # Target: delay hours
            # High congestion at either end → delays
            cong_factor = max(fp_cong, tp_cong)
            delay_hr = max(0.0, min(72.0, (cong_factor - 1.0) * base_voyage_hr * 0.12))

            # Add disruption contribution
            disrupt_w = max(alert_weights.get(fp_alert, 0.0),
                            alert_weights.get(tp_alert, 0.0))
            delay_hr += disrupt_w * base_voyage_hr * 0.08
            delay_hr  = round(min(72.0, delay_hr), 2)

            rows.append({
                # Identifiers (dropped before training)
                "from_portid":    fp,
                "to_portid":      tp,
                "sample_date":    d0.strftime("%Y-%m-%d"),
                # Features
                "sea_distance_nm":           round(sea_nm, 1),
                "transit_days_observed":     transit_days,
                "month":                     month,
                "origin_vessel_count":       fp_vc,
                "dest_vessel_count":         tp_vc,
                "origin_congestion_index":   fp_cong,
                "dest_congestion_index":     tp_cong,
                "chokepoint_stress_max":     cp_stress_max,
                "wave_height_m":             0.0,   # ERA5 placeholder
                "wind_speed_kn":             0.0,   # ERA5 placeholder
                "storm_flag":                0,     # ERA5 placeholder
                "precipitation_mm":          0.0,   # ERA5 placeholder
                "has_disruption":            has_disruption,
                "disruption_severity":       disrupt_sev_num,
                "infrastructure_quality_avg": round(infra_avg, 3),
                "cross_region_flag":         cross_region_flag,
                # Target
                "delay_hours":               delay_hr,
            })

    df = pd.DataFrame(rows)
    log.info("[dataset] Built %d training rows from %d port pairs × %d dates",
             len(df), min(len(spill_pairs), max_pairs), len(sample_dates))

    if output_csv and not df.empty:
        out_path = _models_dir() / "water_training_data.csv"
        df.to_csv(out_path, index=False)
        log.info("[dataset] Saved training data to %s", out_path)

    return df


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    df = build_dataset(max_pairs=int(sys.argv[1]) if len(sys.argv) > 1 else 5000)
    print(f"\nDataset shape: {df.shape}")
    print(df.describe())
    print(df.head(3).to_string())
