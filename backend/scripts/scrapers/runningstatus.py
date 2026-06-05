"""
Scrape per-station delay rows from runningstatus.in (Indian Railways running history).

Respectful defaults: single-threaded requests, delay between calls, identifiable User-Agent.
Only use for research / your own LogiFlow training corpus — check site terms before large runs.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

import requests

USER_AGENT = "LogiFlow-DelayCollector/1.0 (+research; contact: local)"
BASE_URL = "https://runningstatus.in/status/{train}-on-{yyyymmdd}"

_STATION_RE = re.compile(
    r"^(?P<name>.+?)\s*\((?P<code>[A-Z0-9]{2,6})\)\s*(?P<tag>.*)$",
    re.I,
)
_DELAY_RE = re.compile(r"delay:\s*(\d+)\s*min", re.I)
_TIME_PAIR_RE = re.compile(
    r"(\d{1,2}:\d{2}\s*(?:AM|PM))\s+(\d{1,2}:\d{2}\s*(?:AM|PM))",
    re.I,
)
_DIST_RE = re.compile(r"(\d+)\s*km", re.I)


@dataclass
class StationDelayRow:
    run_date: str
    train_number: str
    station_code: str
    station_name: str
    distance_km: Optional[int]
    scheduled_arrival: Optional[str]
    scheduled_departure: Optional[str]
    actual_arrival: Optional[str]
    actual_departure: Optional[str]
    arrival_delay_min: Optional[int]
    departure_delay_min: Optional[int]
    delay_text: Optional[str]
    scrape_status: str

    def to_csv_row(self) -> Dict[str, Any]:
        return {
            "run_date": self.run_date,
            "train_number": self.train_number,
            "station_code": self.station_code,
            "station_name": self.station_name,
            "distance_km": self.distance_km if self.distance_km is not None else "",
            "scheduled_arrival": self.scheduled_arrival or "",
            "scheduled_departure": self.scheduled_departure or "",
            "actual_arrival": self.actual_arrival or "",
            "actual_departure": self.actual_departure or "",
            "arrival_delay_min": self.arrival_delay_min if self.arrival_delay_min is not None else "",
            "departure_delay_min": self.departure_delay_min if self.departure_delay_min is not None else "",
            "delay_text": self.delay_text or "",
            "scrape_status": self.scrape_status,
        }


def _clean_html(text: str) -> str:
    t = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", t).strip()


def _parse_delay_min(delay_cell: str) -> Optional[int]:
    if not delay_cell:
        return None
    low = delay_cell.lower()
    if "on time" in low or "right time" in low:
        return 0
    m = _DELAY_RE.search(delay_cell)
    if m:
        return int(m.group(1))
    return None


def _parse_time_pair(cell: str) -> tuple[Optional[str], Optional[str]]:
    if not cell or "--" in cell:
        return None, None
    m = _TIME_PAIR_RE.search(cell)
    if not m:
        return None, None
    return m.group(1).strip(), m.group(2).strip()


def _parse_station_cell(cell: str) -> tuple[str, str]:
    text = _clean_html(cell)
    m = _STATION_RE.match(text)
    if m:
        return m.group("name").strip(), m.group("code").upper()
    return text[:80], ""


def parse_runningstatus_html(
    html: str,
    *,
    run_date: str,
    train_number: str,
) -> List[StationDelayRow]:
    tbody = re.search(r"<tbody[^>]*>(.*?)</tbody>", html, re.S | re.I)
    if not tbody:
        return []

    rows: List[StationDelayRow] = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbody.group(1), re.S | re.I):
        tds = [_clean_html(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)]
        if len(tds) < 5:
            continue
        # Layout: [icon, station, sched arr/dep, actual arr/dep, delay, distance]
        station_name, station_code = _parse_station_cell(tds[1])
        if not station_code:
            continue
        sched_arr, sched_dep = _parse_time_pair(tds[2])
        act_arr, act_dep = _parse_time_pair(tds[3])
        delay_text = tds[4]
        delay_min = _parse_delay_min(delay_text)
        dist_m = _DIST_RE.search(tds[5] if len(tds) > 5 else "")
        distance_km = int(dist_m.group(1)) if dist_m else None

        rows.append(
            StationDelayRow(
                run_date=run_date,
                train_number=train_number,
                station_code=station_code,
                station_name=station_name,
                distance_km=distance_km,
                scheduled_arrival=sched_arr,
                scheduled_departure=sched_dep,
                actual_arrival=act_arr,
                actual_departure=act_dep,
                arrival_delay_min=delay_min,
                departure_delay_min=delay_min,
                delay_text=delay_text,
                scrape_status="ok",
            )
        )
    return rows


def fetch_train_day(
    train_number: str,
    run_day: date,
    *,
    session: Optional[requests.Session] = None,
    timeout: int = 25,
) -> tuple[str, List[StationDelayRow]]:
    """Returns (status, rows). status: ok | no_table | http_error | error"""
    train = str(train_number).strip().zfill(5)
    yyyymmdd = run_day.strftime("%Y%m%d")
    iso_date = run_day.isoformat()
    url = BASE_URL.format(train=train, yyyymmdd=yyyymmdd)

    sess = session or requests.Session()
    try:
        resp = sess.get(
            url,
            timeout=timeout,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
        )
    except requests.RequestException as exc:
        return f"error:{exc.__class__.__name__}", []

    if resp.status_code != 200:
        return f"http_{resp.status_code}", []

    if "<table" not in resp.text.lower():
        return "no_table", []

    rows = parse_runningstatus_html(resp.text, run_date=iso_date, train_number=train)
    if not rows:
        return "empty_table", []
    return "ok", rows


def iter_dates_last_n_days(n_days: int, *, end: Optional[date] = None) -> List[date]:
    end = end or date.today()
    return [end - timedelta(days=i) for i in range(n_days)]


def train_has_runningstatus_history(
    train_number: str,
    *,
    lookback_days: int = 3,
    session: Optional[requests.Session] = None,
) -> bool:
    """
    True if runningstatus.in returns a station table on any of the last N calendar days.
    Used to filter discontinued / invalid trains from the 2017 schedule CSV.
    """
    train = str(train_number).strip()
    if not train.replace(".", "").isdigit() or len(train) < 3:
        return False
    train = train.zfill(5)
    for day in iter_dates_last_n_days(lookback_days):
        status, rows = fetch_train_day(train, day, session=session)
        if status == "ok" and rows:
            return True
    return False
