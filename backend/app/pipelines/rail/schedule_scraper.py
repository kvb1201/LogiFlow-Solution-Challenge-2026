from __future__ import annotations

# On-demand train schedule fetch via runningstatus.in (HTML scrape).
# Used when a train is missing from the 2017 CSV and not yet in the delay-scrape corpus.
# No IRCTC Connect / RapidAPI keys required.

from __future__ import annotations

import sys
import time
from datetime import date
from pathlib import Path
from typing import Any

_BACKEND_ROOT = Path(__file__).resolve().parents[3]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from scripts.scrapers.runningstatus import (  # noqa: E402
    StationDelayRow,
    fetch_train_day,
    iter_dates_last_n_days,
)

_DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_SCRAPE_SLEEP_S = 1.1


def _rows_to_schedule(train_number: str, rows: list[StationDelayRow]) -> dict[str, Any] | None:
    route_out = []
    seen: set[str] = set()
    for row in rows:
        code = (row.station_code or "").strip().upper()
        if not code or code in seen:
            continue
        seen.add(code)
        route_out.append({
            "station_code": code,
            "stationCode": code,
            "station_name": (row.station_name or code).strip(),
            "distance_from_source": int(row.distance_km or 0),
            "arrival_time": (row.scheduled_arrival or "").strip(),
            "departure_time": (row.scheduled_departure or "").strip(),
            "stop": True,
        })

    if len(route_out) < 2:
        return None

    tn = str(train_number).strip()
    return {
        "trainNumber": tn,
        "trainName": "",
        "trainType": "",
        "runDays": {d: False for d in _DAY_ABBR},
        "route": route_out,
        "_schedule_source": "runningstatus_scrape",
    }


def scrape_train_schedule(
    train_number: str,
    *,
    lookback_days: int = 3,
    end: date | None = None,
) -> dict[str, Any] | None:
    """
    Scrape full stop list from runningstatus.in for the most recent day with data.
    Tries train-number variants (leading-zero padding).
    """
    raw = str(train_number or "").strip()
    if not raw:
        return None

    variants = list(dict.fromkeys([
        raw,
        raw.zfill(5) if raw.isdigit() else raw,
        raw.lstrip("0") or "0",
    ]))

    for variant in variants:
        for i, day in enumerate(iter_dates_last_n_days(lookback_days, end=end)):
            if i > 0:
                time.sleep(_SCRAPE_SLEEP_S)
            status, rows = fetch_train_day(variant, day)
            if status == "ok" and len(rows) >= 2:
                schedule = _rows_to_schedule(variant, rows)
                if schedule:
                    print(
                        f"  [Schedule] ✅ runningstatus.in scrape for {variant} "
                        f"({len(schedule['route'])} stops, {day.isoformat()})"
                    )
                    return schedule
    return None
