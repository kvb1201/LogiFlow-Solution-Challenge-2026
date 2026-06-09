"""
PortWatch Data Loader — Phase 1 of water pipeline expansion.

Loads all PortWatch CSVs once at import time into fast in-memory dicts.
All downstream pipeline code just does dict lookups — no file I/O at request time.

Data files expected in: backend/data/water/
  - Ports.csv
  - PortWatch_chokepoints_database.csv
  - Daily_Ports_Data.csv
  - Daily_Chokepoints_Data.csv
  - portwatch_disruptions_database_*.csv
  - Spillover_simulator%3A_port-level_impact.csv
"""

from __future__ import annotations

import csv
import glob
import logging
import os
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

# ── Path resolution ───────────────────────────────────────────────────────────

def _data_dir() -> Path:
    """Resolve backend/data/water/ regardless of where the process is started."""
    here = Path(__file__).resolve()
    # Walk up to backend/
    for parent in here.parents:
        candidate = parent / "data" / "water"
        if candidate.is_dir():
            return candidate
    # Fallback: try cwd
    cwd_candidate = Path.cwd() / "data" / "water"
    if cwd_candidate.is_dir():
        return cwd_candidate
    raise FileNotFoundError(
        "Cannot locate backend/data/water/ — ensure PortWatch CSV files are present."
    )


DATA_DIR: Path = _data_dir()

# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class PortMeta:
    portid: str
    portname: str
    country: str
    iso3: str
    continent: str
    lat: float
    lon: float
    vessel_count_total: int
    vessel_count_container: int
    vessel_count_dry_bulk: int
    vessel_count_general_cargo: int
    vessel_count_roro: int
    vessel_count_tanker: int
    import_share: float          # share of country maritime imports (%)
    export_share: float
    locode: str
    industry_top1: str
    industry_top2: str
    industry_top3: str
    # Derived
    infrastructure_quality: float   # 0.65–0.98 derived from container ratio
    systemic_class: str             # "major" | "regional" | "local"


@dataclass
class ChokepointMeta:
    portid: str
    portname: str
    lat: float
    lon: float
    vessel_count_total: int
    vessel_count_container: int
    vessel_count_tanker: int
    industry_top1: str


@dataclass
class DisruptionEvent:
    eventid: str
    eventtype: str          # TC, FL, EQ, DR, VO, WF, OT
    eventname: str
    alertlevel: str         # RED, ORANGE, GREEN
    country: str
    fromdate: datetime
    todate: Optional[datetime]
    year: int
    affected_port_ids: list[str]


@dataclass
class SpilloverTransitPair:
    from_portid: str
    to_portid: str
    average_transit_days: float
    daily_capacity_at_risk: float
    relative_capacity_at_risk: float


# ── Exported dicts (these are what the rest of the pipeline imports) ──────────

# portid → PortMeta  (filtered: vessel_count > 1000 globally, all India forced)
PORTWATCH_PORTS: dict[str, PortMeta] = {}

# portid → ChokepointMeta  (all 28)
PORTWATCH_CHOKEPOINTS: dict[str, ChokepointMeta] = {}

# portid → list[DisruptionEvent]
DISRUPTIONS_BY_PORT: dict[str, list[DisruptionEvent]] = defaultdict(list)

# (from_portid, to_portid) → average_transit_days (float)
SPILLOVER_TRANSIT_DAYS: dict[tuple[str, str], float] = {}

# portid → congestion index 0.0–1.0
# 1.0 = at or above historical baseline (busy)
# < 1.0 = below baseline (quieter than normal)
PORT_CONGESTION_INDEX: dict[str, float] = {}

# chokepointid → stress index 0.0–1.0
# 0.0 = normal traffic   1.0 = severely disrupted (near zero transits)
CHOKEPOINT_STRESS: dict[str, float] = {}

# portid → set of chokepointids that transit calls pass through
# (used by route_generator to annotate paths)
PORT_REGION: dict[str, str] = {}   # portid → continent string


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_float(val: str, default: float = 0.0) -> float:
    try:
        v = float(val)
        return v if v == v else default   # NaN check
    except (ValueError, TypeError):
        return default


def _safe_int(val: str, default: int = 0) -> int:
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def _derive_infrastructure_quality(
    vessel_count_total: int,
    vessel_count_container: int,
    vessel_count_tanker: int,
) -> float:
    """
    Derive a 0.65–0.98 infrastructure quality score.

    Container ratio is the primary signal — modern, high-quality ports
    handle more containerised cargo.  Tanker-heavy ports get a slight
    penalty (older infrastructure, bulk focus).
    """
    if vessel_count_total == 0:
        return 0.70

    container_ratio = vessel_count_container / vessel_count_total
    tanker_ratio = vessel_count_tanker / vessel_count_total

    # Base: container ratio maps [0, 1] → [0.65, 0.95]
    base = 0.65 + 0.30 * container_ratio

    # Tanker penalty: up to -0.05 for fully tanker-dominated port
    penalty = 0.05 * tanker_ratio

    # Volume bonus: very large ports (>5000 vessels) get +0.03
    volume_bonus = 0.03 if vessel_count_total > 5000 else 0.0

    return round(min(0.98, max(0.65, base - penalty + volume_bonus)), 3)


def _derive_systemic_class(
    vessel_count_total: int,
    import_share: float,
) -> str:
    """Classify port importance: major / regional / local."""
    if vessel_count_total > 3000 or import_share > 5.0:
        return "major"
    if vessel_count_total > 800 or import_share > 1.0:
        return "regional"
    return "local"


def _parse_date(s: str) -> Optional[datetime]:
    if not s or not s.strip():
        return None
    for fmt in ("%m/%d/%Y %I:%M:%S %p", "%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            continue
    return None


# ── Loaders ───────────────────────────────────────────────────────────────────

def _load_ports(vessel_threshold: int = 1000) -> None:
    """
    Load Ports.csv into PORTWATCH_PORTS.
    Includes all ports with vessel_count_total > threshold
    plus ALL ports from India (ISO3=IND) regardless of count.
    """
    path = DATA_DIR / "Ports.csv"
    if not path.exists():
        log.warning("[data_loader] Ports.csv not found at %s", path)
        return

    loaded = 0
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            total = _safe_int(row.get("vessel_count_total", "0"))
            iso3 = row.get("ISO3", "").strip()

            # Filter: include if above threshold OR if Indian port
            if total <= vessel_threshold and iso3 != "IND":
                continue

            portid = row["portid"].strip()
            vessel_container = _safe_int(row.get("vessel_count_container", "0"))
            vessel_tanker    = _safe_int(row.get("vessel_count_tanker", "0"))
            vessel_bulk      = _safe_int(row.get("vessel_count_dry_bulk", "0"))
            vessel_gc        = _safe_int(row.get("vessel_count_general_cargo", "0"))
            vessel_roro      = _safe_int(row.get("vessel_count_RoRo", "0"))
            imp_share = _safe_float(row.get("share_country_maritime_import", "0"))
            exp_share = _safe_float(row.get("share_country_maritime_export", "0"))

            PORTWATCH_PORTS[portid] = PortMeta(
                portid=portid,
                portname=row.get("portname", "").strip(),
                country=row.get("country", "").strip(),
                iso3=iso3,
                continent=row.get("continent", "").strip(),
                lat=_safe_float(row.get("lat", "0")),
                lon=_safe_float(row.get("lon", "0")),
                vessel_count_total=total,
                vessel_count_container=vessel_container,
                vessel_count_dry_bulk=vessel_bulk,
                vessel_count_general_cargo=vessel_gc,
                vessel_count_roro=vessel_roro,
                vessel_count_tanker=vessel_tanker,
                import_share=imp_share,
                export_share=exp_share,
                locode=row.get("LOCODE", "").strip(),
                industry_top1=row.get("industry_top1", "").strip(),
                industry_top2=row.get("industry_top2", "").strip(),
                industry_top3=row.get("industry_top3", "").strip(),
                infrastructure_quality=_derive_infrastructure_quality(
                    total, vessel_container, vessel_tanker
                ),
                systemic_class=_derive_systemic_class(total, imp_share),
            )
            PORT_REGION[portid] = row.get("continent", "").strip()
            loaded += 1

    log.info("[data_loader] Loaded %d ports (threshold=%d)", loaded, vessel_threshold)


def _load_chokepoints() -> None:
    """Load PortWatch_chokepoints_database.csv into PORTWATCH_CHOKEPOINTS."""
    path = DATA_DIR / "PortWatch_chokepoints_database.csv"
    if not path.exists():
        log.warning("[data_loader] PortWatch_chokepoints_database.csv not found at %s", path)
        return

    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            cid = row["portid"].strip()
            PORTWATCH_CHOKEPOINTS[cid] = ChokepointMeta(
                portid=cid,
                portname=row.get("portname", "").strip(),
                lat=_safe_float(row.get("lat", "0")),
                lon=_safe_float(row.get("lon", "0")),
                vessel_count_total=_safe_int(row.get("vessel_count_total", "0")),
                vessel_count_container=_safe_int(row.get("vessel_count_container", "0")),
                vessel_count_tanker=_safe_int(row.get("vessel_count_tanker", "0")),
                industry_top1=row.get("industry_top1", "").strip(),
            )

    log.info("[data_loader] Loaded %d chokepoints", len(PORTWATCH_CHOKEPOINTS))


def _load_disruptions() -> None:
    """
    Load portwatch_disruptions_database_*.csv into DISRUPTIONS_BY_PORT.
    Maps each portid to the list of disruption events that affected it.
    """
    # Filename has a long hash suffix — use glob
    matches = list(DATA_DIR.glob("portwatch_disruptions_database*.csv"))
    if not matches:
        log.warning("[data_loader] No disruptions CSV found in %s", DATA_DIR)
        return

    path = matches[0]
    loaded = 0
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            affected_raw = row.get("affectedports", "").strip()
            if not affected_raw:
                continue

            port_ids = [p.strip() for p in affected_raw.split(";") if p.strip()]
            if not port_ids:
                continue

            event = DisruptionEvent(
                eventid=row.get("eventid", "").strip(),
                eventtype=row.get("eventtype", "").strip(),
                eventname=row.get("eventname", "").strip(),
                alertlevel=row.get("alertlevel", "GREEN").strip(),
                country=row.get("country", "").strip(),
                fromdate=_parse_date(row.get("fromdate", "")) or datetime(2000, 1, 1),
                todate=_parse_date(row.get("todate", "")),
                year=_safe_int(row.get("year", "0")),
                affected_port_ids=port_ids,
            )

            for pid in port_ids:
                DISRUPTIONS_BY_PORT[pid].append(event)
            loaded += 1

    log.info(
        "[data_loader] Loaded %d disruption events across %d ports",
        loaded, len(DISRUPTIONS_BY_PORT)
    )


def _load_spillover_transit_days() -> None:
    """
    Load Spillover_simulator_port-level_impact.csv into SPILLOVER_TRANSIT_DAYS.
    Key: (from_portid, to_portid) → average_transit_days.
    Only loads pairs where both ports are in PORTWATCH_PORTS (avoids bloat).
    """
    path = DATA_DIR / "Spillover_simulator%3A_port-level_impact.csv"
    if not path.exists():
        log.warning("[data_loader] Spillover port-level CSV not found at %s", path)
        return

    loaded = 0
    known_ports = set(PORTWATCH_PORTS.keys())

    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            fp = row.get("from_portid", "").strip()
            tp = row.get("to_portid", "").strip()

            # Only keep pairs where at least one side is a known port
            # (keeps the dict from growing to 226k entries unnecessarily)
            if fp not in known_ports and tp not in known_ports:
                continue

            days = _safe_float(row.get("average_transit_days", "0"))
            if days <= 0:
                continue

            SPILLOVER_TRANSIT_DAYS[(fp, tp)] = days
            loaded += 1

    log.info("[data_loader] Loaded %d spillover transit pairs", loaded)


def _load_port_congestion_index() -> None:
    """
    Pre-aggregate Daily_Ports_Data.csv into PORT_CONGESTION_INDEX.

    congestion_index = rolling_90d_avg_portcalls / baseline_2019_2023_avg
    Clamped to [0.1, 2.0].

    Strategy: scan the full file once, build per-port daily series,
    then compute baseline (2019-2023) and recent (last 90 days of data).
    """
    path = DATA_DIR / "Daily_Ports_Data.csv"
    if not path.exists():
        log.warning("[data_loader] Daily_Ports_Data.csv not found at %s", path)
        return

    # Two-pass approach would require loading everything into memory (606MB).
    # Instead: stream once, collect (year, portcalls) per port.
    # We only need per-port annual sums + the most recent 90-day window.

    port_annual: dict[str, dict[int, list[int]]] = defaultdict(lambda: defaultdict(list))
    port_recent: dict[str, list[int]] = defaultdict(list)

    # We'll define "recent" as the last date in the file minus 90 days.
    # First pass: find the max date.
    max_date: Optional[datetime] = None
    date_col = "date"

    log.info("[data_loader] Scanning Daily_Ports_Data.csv for congestion index (this takes ~30s)...")

    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        # Normalise BOM on first column name
        fieldnames = reader.fieldnames or []
        date_col = fieldnames[0] if fieldnames else "date"

        for row in reader:
            raw_date = row.get(date_col, "").strip()
            if not raw_date:
                continue
            try:
                dt = datetime.strptime(raw_date, "%Y/%m/%d")
            except ValueError:
                continue
            if max_date is None or dt > max_date:
                max_date = dt

    if max_date is None:
        log.warning("[data_loader] Could not determine max date from Daily_Ports_Data.csv")
        return

    cutoff_recent = max_date - timedelta(days=90)
    baseline_years = {2019, 2020, 2021, 2022, 2023}

    # Second pass: collect the values we need.
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        date_col = fieldnames[0] if fieldnames else "date"

        for row in reader:
            raw_date = row.get(date_col, "").strip()
            portid = row.get("portid", "").strip()
            if not raw_date or not portid:
                continue

            calls_raw = row.get("portcalls", "").strip()
            calls = _safe_int(calls_raw)

            try:
                dt = datetime.strptime(raw_date, "%Y/%m/%d")
            except ValueError:
                continue

            year = dt.year
            if year in baseline_years:
                port_annual[portid][year].append(calls)

            if dt >= cutoff_recent:
                port_recent[portid].append(calls)

    # Compute index per port
    built = 0
    for portid in set(list(port_annual.keys()) + list(port_recent.keys())):
        # Baseline: mean daily calls across 2019–2023
        baseline_vals: list[int] = []
        for yr_vals in port_annual[portid].values():
            baseline_vals.extend(yr_vals)
        baseline_avg = sum(baseline_vals) / len(baseline_vals) if baseline_vals else None

        # Recent: mean daily calls over last 90 days
        recent_vals = port_recent[portid]
        recent_avg = sum(recent_vals) / len(recent_vals) if recent_vals else None

        if baseline_avg and baseline_avg > 0 and recent_avg is not None:
            index = recent_avg / baseline_avg
        elif recent_avg is not None and recent_avg > 0:
            # No baseline data → use absolute normalisation (rough)
            index = min(recent_avg / 5.0, 1.0)
        else:
            index = 0.4   # unknown → assume moderate

        PORT_CONGESTION_INDEX[portid] = round(min(2.0, max(0.1, index)), 3)
        built += 1

    log.info("[data_loader] Built congestion index for %d ports", built)


def _load_chokepoint_stress() -> None:
    """
    Pre-aggregate Daily_Chokepoints_Data.csv into CHOKEPOINT_STRESS.

    stress = 1 - (recent_14d_avg / baseline_avg)
    Clamped to [0.0, 1.0].
    0.0 = normal traffic, 1.0 = near-zero transits (severe disruption).
    """
    path = DATA_DIR / "Daily_Chokepoints_Data.csv"
    if not path.exists():
        log.warning("[data_loader] Daily_Chokepoints_Data.csv not found at %s", path)
        return

    # Collect all rows per chokepoint
    cp_rows: dict[str, list[tuple[datetime, int]]] = defaultdict(list)
    date_col = "date"

    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        date_col = fieldnames[0] if fieldnames else "date"

        for row in reader:
            raw_date = row.get(date_col, "").strip()
            cpid = row.get("portid", "").strip()
            if not raw_date or not cpid:
                continue
            try:
                dt = datetime.strptime(raw_date, "%Y/%m/%d")
            except ValueError:
                continue
            n_total = _safe_int(row.get("n_total", "0"))
            cp_rows[cpid].append((dt, n_total))

    if not cp_rows:
        log.warning("[data_loader] No chokepoint rows parsed")
        return

    # Find global max date
    all_dates = [dt for rows in cp_rows.values() for dt, _ in rows]
    max_date = max(all_dates)
    cutoff = max_date - timedelta(days=14)

    for cpid, rows in cp_rows.items():
        rows_sorted = sorted(rows, key=lambda x: x[0])
        all_vals = [v for _, v in rows_sorted]
        recent_vals = [v for dt, v in rows_sorted if dt >= cutoff]

        baseline_avg = sum(all_vals) / len(all_vals) if all_vals else 0.0
        recent_avg   = sum(recent_vals) / len(recent_vals) if recent_vals else 0.0

        if baseline_avg > 0:
            stress = 1.0 - (recent_avg / baseline_avg)
        else:
            stress = 0.0

        CHOKEPOINT_STRESS[cpid] = round(min(1.0, max(0.0, stress)), 3)

    log.info("[data_loader] Built stress index for %d chokepoints", len(CHOKEPOINT_STRESS))


# ── Congestion cache (avoids 606MB scan on every startup) ────────────────────

import json as _json

def _congestion_cache_path() -> Path:
    return Path(__file__).resolve().parent / "models" / "port_congestion_cache.json"


def _save_congestion_cache() -> None:
    """Write PORT_CONGESTION_INDEX to a small JSON file so future starts skip the CSV scan."""
    if not PORT_CONGESTION_INDEX:
        return
    path = _congestion_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(path, "w") as f:
            _json.dump(PORT_CONGESTION_INDEX, f, indent=None, separators=(",", ":"))
        log.info("[data_loader] Congestion cache saved → %s (%d ports)", path, len(PORT_CONGESTION_INDEX))
    except Exception as e:
        log.warning("[data_loader] Could not save congestion cache: %s", e)


def _load_congestion_from_cache() -> None:
    """Load PORT_CONGESTION_INDEX from pre-computed JSON cache (fast path)."""
    path = _congestion_cache_path()
    if not path.exists():
        log.info("[data_loader] No congestion cache found at %s — index will be empty", path)
        return
    try:
        with open(path) as f:
            data = _json.load(f)
        PORT_CONGESTION_INDEX.update({k: float(v) for k, v in data.items()})
        log.info("[data_loader] Loaded congestion index from cache: %d ports", len(PORT_CONGESTION_INDEX))
    except Exception as e:
        log.warning("[data_loader] Could not load congestion cache: %s", e)


# ── Public API ────────────────────────────────────────────────────────────────

def get_port(portid: str) -> Optional[PortMeta]:
    return PORTWATCH_PORTS.get(portid)


def get_chokepoint(cpid: str) -> Optional[ChokepointMeta]:
    return PORTWATCH_CHOKEPOINTS.get(cpid)


def get_disruptions(portid: str) -> list[DisruptionEvent]:
    return DISRUPTIONS_BY_PORT.get(portid, [])


def get_transit_days(from_portid: str, to_portid: str) -> Optional[float]:
    """Return observed average transit days between two ports, or None."""
    return SPILLOVER_TRANSIT_DAYS.get((from_portid, to_portid))


def get_congestion(portid: str, default: float = 0.4) -> float:
    return PORT_CONGESTION_INDEX.get(portid, default)


def get_chokepoint_stress(cpid: str, default: float = 0.0) -> float:
    return CHOKEPOINT_STRESS.get(cpid, default)


def get_port_region(portid: str) -> str:
    return PORT_REGION.get(portid, "Unknown")


def ports_by_country(iso3: str) -> list[PortMeta]:
    return [p for p in PORTWATCH_PORTS.values() if p.iso3 == iso3]


def ports_by_continent(continent: str) -> list[PortMeta]:
    return [p for p in PORTWATCH_PORTS.values() if p.continent == continent]


def major_ports() -> list[PortMeta]:
    return [p for p in PORTWATCH_PORTS.values() if p.systemic_class == "major"]


# ── Initialise on import ──────────────────────────────────────────────────────

_LOADED = False

def load_all(vessel_threshold: int = 1000, force: bool = False,
             load_congestion: bool = True) -> None:
    """
    Load all PortWatch data into memory.
    Called automatically on first import.

    Parameters
    ----------
    vessel_threshold : int
        Minimum vessel_count_total for global ports (India always included).
    force : bool
        Reload even if already loaded.
    load_congestion : bool
        Whether to scan Daily_Ports_Data.csv for the congestion index.
        Set False to skip the 606MB scan during development/testing.
        Controlled by env var WATER_SKIP_CONGESTION_SCAN=1.
    """
    global _LOADED
    if _LOADED and not force:
        return

    import os
    skip_congestion = (
        not load_congestion
        or os.environ.get("WATER_SKIP_CONGESTION_SCAN", "0") == "1"
    )

    log.info("[data_loader] Starting PortWatch data load from %s", DATA_DIR)

    _load_ports(vessel_threshold)
    _load_chokepoints()
    _load_disruptions()
    _load_spillover_transit_days()
    _load_chokepoint_stress()

    if skip_congestion:
        log.info("[data_loader] Skipping congestion index scan (WATER_SKIP_CONGESTION_SCAN=1)")
        # Try loading from cache first
        _load_congestion_from_cache()
    else:
        _load_port_congestion_index()
        _save_congestion_cache()

    _LOADED = True
    log.info(
        "[data_loader] Load complete. ports=%d chokepoints=%d disruption_ports=%d "
        "transit_pairs=%d congestion_ports=%d chokepoint_stress=%d",
        len(PORTWATCH_PORTS),
        len(PORTWATCH_CHOKEPOINTS),
        len(DISRUPTIONS_BY_PORT),
        len(SPILLOVER_TRANSIT_DAYS),
        len(PORT_CONGESTION_INDEX),
        len(CHOKEPOINT_STRESS),
    )


# Auto-load on import.
# During development, set WATER_SKIP_CONGESTION_SCAN=1 to skip the 606MB scan.
import os as _os
try:
    load_all(load_congestion=_os.environ.get("WATER_SKIP_CONGESTION_SCAN", "0") != "1")
except FileNotFoundError as _e:
    log.warning("[data_loader] Skipping auto-load: %s", _e)
