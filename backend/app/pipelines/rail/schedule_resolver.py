"""
Resolve per-train stop schedules when the 2017 CSV is missing or stale.

Lookup order:
  1. Train_details_22122017.csv (with train-number variant matching)
  2. Local JSON cache (prior scrape fetches)
  3. runningstatus.in HTML scrape (on-demand, no API keys)
  4. Delay-scrape rows in ir_train_delays.csv (latest run per station)
"""

from __future__ import annotations

import csv
import json
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

_BACKEND_ROOT = Path(__file__).resolve().parents[3]
_DELAY_DIR = _BACKEND_ROOT / "data" / "ir_delay_scrape"
_SCHEDULE_CACHE_PATH = _BACKEND_ROOT / "data" / "railways_online" / "train_schedule_cache.json"
_DELAY_CSV_PATH = _DELAY_DIR / "ir_train_delays.csv"

_FLEET_FILES = (
    "active_discovered_trains.json",
    "active_trains.json",
    "discovered_trains.json",
)
_DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def normalize_train_number(train_number: str) -> str:
    return str(train_number or "").strip()


def train_number_variants(train_number: str) -> list[str]:
    """All common IR train-number spellings (leading zeros, 5-digit padding)."""
    raw = normalize_train_number(train_number)
    if not raw:
        return []
    stripped = raw.lstrip("0") or "0"
    variants = [raw, stripped]
    if raw.isdigit():
        variants.append(raw.zfill(5))
        variants.append(stripped.zfill(5))
    return list(dict.fromkeys(v for v in variants if v))


@lru_cache(maxsize=1)
def _fleet_registry() -> frozenset[str]:
    fleet: set[str] = set()
    for name in _FLEET_FILES:
        path = _DELAY_DIR / name
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for key in ("active_trains", "trains", "trains_sample"):
            rows = data.get(key)
            if not rows:
                continue
            for item in rows:
                if isinstance(item, str):
                    fleet.update(train_number_variants(item))
                elif isinstance(item, dict):
                    tn = item.get("train_number") or item.get("trainNumber") or item.get("train_no")
                    if tn:
                        fleet.update(train_number_variants(str(tn)))
    return frozenset(fleet)


def is_known_train(train_number: str) -> bool:
    """Train validated by discovery/active lists or already present in offline data."""
    variants = train_number_variants(train_number)
    if any(v in _fleet_registry() for v in variants):
        return True

    from app.pipelines.rail.data_loader import get_train_route

    if any(get_train_route(v) for v in variants):
        return True

    return _has_delay_scrape_rows(train_number)


def _has_delay_scrape_rows(train_number: str) -> bool:
    if not _DELAY_CSV_PATH.exists():
        return False
    targets = set(train_number_variants(train_number))
    try:
        with _DELAY_CSV_PATH.open(encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                tn = normalize_train_number(row.get("train_number", ""))
                if tn in targets or (tn.lstrip("0") or "0") in targets:
                    return True
    except Exception:
        return False
    return False


def _load_schedule_cache() -> dict[str, Any]:
    if not _SCHEDULE_CACHE_PATH.exists():
        return {}
    try:
        data = json.loads(_SCHEDULE_CACHE_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _persist_schedule_cache(train_number: str, schedule: dict[str, Any], source: str) -> None:
    if not schedule or not schedule.get("route"):
        return
    cache = _load_schedule_cache()
    key = normalize_train_number(train_number)
    cache[key] = {
        "source": source,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "schedule": schedule,
    }
    _SCHEDULE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        _SCHEDULE_CACHE_PATH.write_text(json.dumps(cache, indent=2), encoding="utf-8")
    except Exception as exc:
        print(f"  [Schedule] ⚠️ Could not persist cache for {key}: {exc}")


def _schedule_from_cached_entry(train_number: str) -> dict[str, Any] | None:
    cache = _load_schedule_cache()
    for variant in train_number_variants(train_number):
        entry = cache.get(variant)
        if not entry:
            continue
        schedule = entry.get("schedule")
        if isinstance(schedule, dict) and schedule.get("route"):
            schedule = dict(schedule)
            schedule.setdefault("_schedule_source", entry.get("source") or "cache")
            return schedule
    return None


def _schedule_from_csv(train_number: str) -> dict[str, Any] | None:
    from app.pipelines.rail.data_loader import get_train_metadata, get_train_route

    stops = []
    matched = normalize_train_number(train_number)
    meta: dict[str, Any] = {}
    for variant in train_number_variants(train_number):
        candidate = get_train_route(variant)
        if candidate:
            stops = candidate
            matched = variant
            meta = get_train_metadata(variant) or {}
            break

    if not stops:
        return None

    route_out = []
    for stop in stops:
        code = (stop.get("station_code") or "").strip().upper()
        if not code:
            continue
        route_out.append({
            "station_code": code,
            "stationCode": code,
            "station_name": stop.get("station_name", code),
            "distance_from_source": stop.get("distance", 0),
            "arrival_time": stop.get("arrival_time", ""),
            "departure_time": stop.get("departure_time", ""),
            "stop": True,
        })

    if not route_out:
        return None

    return {
        "trainNumber": matched,
        "trainName": meta.get("train_name", ""),
        "trainType": meta.get("train_type", ""),
        "runDays": {d: False for d in _DAY_ABBR},
        "route": route_out,
        "_schedule_source": "csv_2017",
    }


@lru_cache(maxsize=512)
def _schedule_from_delay_scrape(train_number: str) -> dict[str, Any] | None:
    if not _DELAY_CSV_PATH.exists():
        return None

    targets = set(train_number_variants(train_number))
    rows_by_key: dict[tuple[str, str], dict[str, str]] = {}
    latest_date = ""

    try:
        with _DELAY_CSV_PATH.open(encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                tn = normalize_train_number(row.get("train_number", ""))
                if tn not in targets and (tn.lstrip("0") or "0") not in targets:
                    continue
                run_date = (row.get("run_date") or "").strip()
                code = (row.get("station_code") or "").strip().upper()
                if not code:
                    continue
                if run_date >= latest_date:
                    if run_date > latest_date:
                        latest_date = run_date
                        rows_by_key = {}
                    key = (run_date, code)
                    rows_by_key[key] = row
    except Exception as exc:
        print(f"  [Schedule] ⚠️ Delay scrape read failed: {exc}")
        return None

    if not rows_by_key:
        return None

    ordered = sorted(
        rows_by_key.values(),
        key=lambda r: (
            _safe_int(r.get("distance_km")),
            (r.get("station_code") or "").upper(),
        ),
    )

    route_out = []
    seen: set[str] = set()
    for row in ordered:
        code = (row.get("station_code") or "").strip().upper()
        if not code or code in seen:
            continue
        seen.add(code)
        route_out.append({
            "station_code": code,
            "stationCode": code,
            "station_name": (row.get("station_name") or code).strip(),
            "distance_from_source": _safe_int(row.get("distance_km")),
            "arrival_time": (row.get("scheduled_arrival") or "").strip(),
            "departure_time": (row.get("scheduled_departure") or "").strip(),
            "stop": True,
        })

    if len(route_out) < 2:
        return None

    matched = normalize_train_number(train_number)
    return {
        "trainNumber": matched,
        "trainName": "",
        "trainType": "",
        "runDays": {d: False for d in _DAY_ABBR},
        "route": route_out,
        "_schedule_source": "delay_scrape",
    }


def _safe_int(value: Any) -> int:
    try:
        if value in (None, ""):
            return 0
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return 0


def _fetch_scraped_schedule(train_number: str) -> dict[str, Any] | None:
    from app.pipelines.rail.schedule_scraper import scrape_train_schedule

    return scrape_train_schedule(train_number)


def refresh_schedule_from_delay_scrape(train_number: str) -> dict[str, Any] | None:
    """Rebuild and persist schedule from latest delay-scrape rows (collector hook)."""
    schedule = _schedule_from_delay_scrape(train_number)
    if schedule and schedule.get("route"):
        _persist_schedule_cache(train_number, schedule, "delay_scrape")
    return schedule


def resolve_train_schedule(train_number: str) -> dict[str, Any] | None:
    """
    Resolve a full per-station schedule for map geometry and APIs.
    Returns None only when every source fails.
    """
    tn = normalize_train_number(train_number)
    if not tn:
        return None

    csv_schedule = _schedule_from_csv(tn)
    if csv_schedule:
        return csv_schedule

    cached = _schedule_from_cached_entry(tn)
    if cached:
        print(f"  [Schedule] ✅ Cache hit for train {tn}")
        return cached

    scraped = _fetch_scraped_schedule(tn)
    if scraped and scraped.get("route"):
        source = scraped.get("_schedule_source") or "runningstatus_scrape"
        _persist_schedule_cache(tn, scraped, source)
        return scraped

    scrape_schedule = _schedule_from_delay_scrape(tn)
    if scrape_schedule and scrape_schedule.get("route"):
        print(
            f"  [Schedule] ✅ Delay-scrape schedule for {tn} "
            f"({len(scrape_schedule['route'])} stops)"
        )
        _persist_schedule_cache(tn, scrape_schedule, "delay_scrape")
        return scrape_schedule

    return None


def _route_identity(route: list[dict[str, Any]]) -> tuple[str, ...]:
    codes: list[str] = []
    for stop in route:
        code = (stop.get("stationCode") or stop.get("station_code") or "").strip().upper()
        if code:
            codes.append(code)
    return tuple(codes)


def iter_schedule_sources(train_number: str) -> list[tuple[str, list[dict[str, Any]]]]:
    """
    All known schedules for a train, ordered for map geometry (most complete first).

    Unlike resolve_train_schedule(), returns every distinct route so geometry can pick
    the best O-D slice (e.g. delay_scrape with extra halts vs sparse CSV).
    """
    tn = normalize_train_number(train_number)
    if not tn:
        return []

    seen: set[tuple[str, ...]] = set()
    out: list[tuple[str, list[dict[str, Any]]]] = []

    def _add(source: str, schedule: dict[str, Any] | None) -> None:
        if not schedule or not schedule.get("route"):
            return
        route = schedule["route"]
        if len(route) < 2:
            return
        key = _route_identity(route)
        if len(key) < 2 or key in seen:
            return
        seen.add(key)
        tag = str(schedule.get("_schedule_source") or source)
        out.append((tag, route))

    _add("delay_scrape", _schedule_from_delay_scrape(tn))
    _add("cache", _schedule_from_cached_entry(tn))
    _add("csv_2017", _schedule_from_csv(tn))

    return out
