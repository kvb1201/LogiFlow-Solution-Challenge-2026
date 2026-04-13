import re
import time
import json
from dataclasses import dataclass
from html import unescape

import requests

from app.pipelines.rail.config import STATION_TO_CITY
from app.pipelines.rail.fallback_stations import search_offline_stations
from app.pipelines.rail.station_resolver import resolve_station


_CACHE: dict[str, tuple[float, dict]] = {}


def _cache_get(key: str, ttl_s: int) -> dict | None:
    hit = _CACHE.get(key)
    if not hit:
        return None
    ts, val = hit
    if (time.time() - ts) > ttl_s:
        return None
    return val


def _cache_set(key: str, val: dict) -> dict:
    _CACHE[key] = (time.time(), val)
    return val


def _time_to_minutes(value: str | None) -> int | None:
    s = (value or "").strip()
    if not re.fullmatch(r"\d{1,2}:\d{2}", s):
        return None
    hh, mm = s.split(":")
    return int(hh) * 60 + int(mm)


def _safe_int(value, default=0) -> int:
    try:
        return int(float(str(value)))
    except Exception:
        return default


def _parse_run_days(raw) -> list[str]:
    day_abbr = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    if isinstance(raw, list):
        out = [str(x).strip()[:3].title() for x in raw if str(x).strip()]
        return [d for d in out if d in day_abbr]
    s = str(raw or "").strip()
    if not s:
        return []
    if len(s) >= 7 and set(s[:7]).issubset({"0", "1"}):
        return [day_abbr[i] for i, ch in enumerate(s[:7]) if ch == "1"]
    parts = [p.strip() for p in re.split(r"[,/\\s-]+", s) if p.strip()]
    out = [p[:3].title() for p in parts]
    return [d for d in out if d in day_abbr]


def _iter_dicts(node):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _iter_dicts(v)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_dicts(item)


def _station_name_for_code(code: str) -> str:
    rows = search_offline_stations(code or "")
    if rows and isinstance(rows[0], dict):
        return str(rows[0].get("name") or code).strip()
    return str(code or "").strip().upper()


def _resolve_station_identity(raw: str) -> tuple[str, str]:
    token = (raw or "").strip()
    if not token:
        return "", ""
    resolved = (resolve_station(token) or token).strip().upper()
    return resolved, _station_name_for_code(resolved)


@dataclass(frozen=True)
class RailYatriStatusRow:
    station: str
    arrival: str
    status: str
    platform: str


def _severity_from_status(status: str) -> float | None:
    s = (status or "").strip().lower()
    if not s:
        return None
    if "not available" in s:
        return None
    if "ontime" in s or "on time" in s:
        return 0.0
    if "irregular" in s:
        return 0.2
    if "slight" in s:
        return 0.35
    if "delayed" in s:
        # RailYatri uses buckets like "Mostly Delayed"
        if "mostly" in s:
            return 0.75
        return 0.55
    return 0.4


def fetch_live_status(train_no: str, start_day: int | None = None, start_date: int | None = None, ttl_s: int = 3600) -> dict | None:
    """
    Scrape RailYatri live-train-status page and return a compact record useful for ML signals.

    Args:
        train_no: e.g. "12959"
        start_day/start_date: optional query params RailYatri supports (as seen on the UI).
        ttl_s: in-process cache TTL

    Returns:
        {
          "train_no": "12959",
          "title": "...",
          "start_date_text": "13-04-2026",
          "rows": [{station, arrival, status, platform}, ...],
          "severity_avg": 0.21,
          "delayed_ratio": 0.12,
          "source": "railyatri",
        }
    """
    tn = str(train_no or "").strip()
    if not re.fullmatch(r"\d{4,5}", tn):
        return None

    key = f"railyatri:{tn}:{start_day}:{start_date}"
    cached = _cache_get(key, ttl_s=ttl_s)
    if cached is not None:
        return cached

    base = f"https://www.railyatri.in/live-train-status/{tn}"
    params = {}
    if start_day is not None:
        params["start_day"] = str(int(start_day))
    if start_date is not None:
        params["start_date"] = str(int(start_date))

    try:
        resp = requests.get(
            base,
            params=params,
            timeout=(3, 5),
            headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"},
        )
        if not resp.ok:
            return None
    except Exception:
        return None

    html = resp.text or ""
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    title = unescape(re.sub(r"\s+", " ", (title_match.group(1) if title_match else "")).strip())
    text = unescape(re.sub(r"<[^>]+>", " ", html))
    text = re.sub(r"\s+", " ", text).strip()

    # Try to grab the "Start Date" shown on the page (e.g., "Start Date 13-04-2026")
    start_date_text = ""
    m = re.search(r"Start Date\s+(\d{2}-\d{2}-\d{4})", text, flags=re.IGNORECASE)
    if m:
        start_date_text = m.group(1)

    # Primary: parse the first table that looks like station status.
    rows: list[RailYatriStatusRow] = []
    # Find table blocks and parse header cells to identify target table.
    for table_html in re.findall(r"<table[\s\S]*?</table>", html, flags=re.IGNORECASE):
        header_cells = re.findall(r"<th[^>]*>([\s\S]*?)</th>", table_html, flags=re.IGNORECASE)
        headers = [
            re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", h))).strip().lower()
            for h in header_cells
        ]
        header_blob = " ".join(headers)
        if not headers:
            continue
        if ("station" not in header_blob) or (("status" not in header_blob) and ("train status" not in header_blob)):
            continue

        for tr_html in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", table_html, flags=re.IGNORECASE):
            td_cells = re.findall(r"<td[^>]*>([\s\S]*?)</td>", tr_html, flags=re.IGNORECASE)
            tds = [
                re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", td))).strip()
                for td in td_cells
            ]
            if len(tds) < 3:
                continue
            station = tds[0]
            arrival = tds[1] if len(tds) >= 2 else ""
            status = tds[2] if len(tds) >= 3 else ""
            platform = tds[4] if len(tds) >= 5 else (tds[3] if len(tds) >= 4 else "")
            if station and status:
                rows.append(RailYatriStatusRow(station=station, arrival=arrival, status=status, platform=platform))

        if rows:
            break

    # Fallback: if no table parsed, give up (page changed / bot blocked)
    if not rows:
        return None

    severities = [s for s in (_severity_from_status(r.status) for r in rows) if s is not None]
    severity_avg = round(sum(severities) / len(severities), 3) if severities else None
    delayed_ratio = None
    if severities:
        delayed_ratio = round(sum(1 for s in severities if s >= 0.5) / len(severities), 3)

    out = {
        "train_no": tn,
        "title": title,
        "start_date_text": start_date_text,
        "rows": [r.__dict__ for r in rows],
        "severity_avg": severity_avg,
        "delayed_ratio": delayed_ratio,
        "source": "railyatri",
        "query": {"start_day": start_day, "start_date": start_date},
    }
    return _cache_set(key, out)


def fetch_past_track_record(train_no: str, days_back: int = 5, ttl_s: int = 6 * 3600) -> dict | None:
    """
    Fetch multiple past-day snapshots for a train and aggregate reliability signals.

    RailYatri supports `start_date` / `start_day` query params (as seen on the UI).
    In practice, `start_date` behaves like "N days ago" for many trains.

    Returns:
      {
        "train_no": "...",
        "samples": <int>,
        "start_dates": ["13-04-2026", ...],
        "severity_avg_mean": 0.12,
        "delayed_ratio_mean": 0.08,
        "source": "railyatri_aggregate",
      }
    """
    tn = str(train_no or "").strip()
    if not re.fullmatch(r"\d{4,5}", tn):
        return None
    days_back = int(days_back or 0)
    days_back = max(0, min(days_back, 14))  # guardrail

    cache_key = f"railyatri_agg:{tn}:{days_back}"
    cached = _cache_get(cache_key, ttl_s=ttl_s)
    if cached is not None:
        return cached

    snapshots: list[dict] = []
    start_dates: list[str] = []
    queries_seen: set[tuple[int | None, int | None]] = set()
    sev_vals: list[float] = []
    dr_vals: list[float] = []

    # Always include "today" (no params) as baseline.
    base = fetch_live_status(tn, ttl_s=ttl_s)
    if base:
        q0 = base.get("query") or {}
        queries_seen.add((q0.get("start_day"), q0.get("start_date")))
        snapshots.append(base)

    for d in range(1, days_back + 1):
        # Try common patterns (some pages need both params).
        cand = (
            fetch_live_status(tn, start_date=d, ttl_s=ttl_s)
            or fetch_live_status(tn, start_day=2, start_date=d, ttl_s=ttl_s)
        )
        if not cand:
            continue

        q = cand.get("query") or {}
        qt = (q.get("start_day"), q.get("start_date"))
        if qt in queries_seen:
            continue
        queries_seen.add(qt)

        snapshots.append(cand)

    for s in snapshots:
        sd = (s.get("start_date_text") or "").strip()
        if sd:
            start_dates.append(sd)
        sev = s.get("severity_avg")
        dr = s.get("delayed_ratio")
        if isinstance(sev, (int, float)):
            sev_vals.append(float(sev))
        if isinstance(dr, (int, float)):
            dr_vals.append(float(dr))

    if not snapshots:
        return None

    out = {
        "train_no": tn,
        "samples": len(snapshots),
        "start_dates": start_dates,
        "unique_start_dates": len(set([d for d in start_dates if d])),
        "severity_avg_mean": round(sum(sev_vals) / len(sev_vals), 3) if sev_vals else None,
        "delayed_ratio_mean": round(sum(dr_vals) / len(dr_vals), 3) if dr_vals else None,
        "source": "railyatri_aggregate",
    }
    return _cache_set(cache_key, out)


def fetch_trains_between(from_code: str, to_code: str, date_of_journey: str, ttl_s: int = 3600) -> dict | None:
    """
    Scrape RailYatri "trains between stations" page and normalize train list.
    Returns:
      { totalTrains, trains: [{trainNumber, trainName, ...}], provider: "railyatri_html" }
    """
    fc_raw = (from_code or "").strip().upper()
    tc_raw = (to_code or "").strip().upper()
    fc, fc_name = _resolve_station_identity(fc_raw)
    tc, tc_name = _resolve_station_identity(tc_raw)
    doj = (date_of_journey or "").strip()
    if not fc or not tc or not doj:
        return None

    try:
        yyyy, mm, dd = doj.split("-")
        ry_date = f"{dd}-{mm}-{yyyy}"
    except Exception:
        ry_date = doj

    key = f"railyatri_tbs:{fc}:{tc}:{ry_date}"
    cached = _cache_get(key, ttl_s=ttl_s)
    if cached is not None:
        return cached

    api_url = "https://trainticketapi.railyatri.in/api/trains-between-station-with-sa.json"
    display_url = (
        "https://www.railyatri.in/booking/trains-between-stations"
        f"?device_type_id=6&from_code={fc.lower()}&to_code={tc.lower()}"
        f"&journey_date={ry_date}&homequota=GN"
    )
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/plain, */*",
        "Referer": display_url,
    }
    try:
        dd, mm, yyyy = ry_date.split("-")
        compact_date = f"{int(dd)}-{int(mm)}-{int(yyyy)}"
    except Exception:
        compact_date = ry_date
    temp_uid = -int(time.time())
    params = {
        "from": fc,
        "to": tc,
        "dateOfJourney": f"{compact_date} ",
        "action": "train_between_station",
        "controller": "train_ticket_tbs",
        "device_type_id": "6",
        "from_code": fc,
        "from_name": fc_name,
        "journey_date": compact_date,
        "journey_quota": "GN",
        "to_code": tc,
        "to_name": tc_name,
        "authentication_token": "",
        "v_code": "null",
        "user_id": str(temp_uid),
        "temp_user_id": str(temp_uid),
    }
    try:
        resp = requests.get(api_url, params=params, headers=headers, timeout=(4, 10))
        if resp.ok:
            body = resp.json() if resp.content else {}
            rows = []
            if isinstance(body, dict):
                rows.extend(body.get("train_between_stations") or [])
                rows.extend(body.get("reserved_trains") or [])
            if isinstance(rows, list) and rows:
                trains = []
                seen = set()
                for d in rows:
                    if not isinstance(d, dict):
                        continue
                    num = str(d.get("train_number") or d.get("trainNumber") or "").strip()
                    if not num or not re.fullmatch(r"\d{4,5}", num):
                        continue
                    if num in seen:
                        continue
                    seen.add(num)
                    actual_fs = str(d.get("from_stn_code") or d.get("source_stn_code") or fc).strip().upper()
                    actual_ts = str(d.get("to_stn_code") or d.get("dstn_stn_code") or tc).strip().upper()
                    fc_city = STATION_TO_CITY.get(fc)
                    if fc_city and actual_fs != fc and STATION_TO_CITY.get(actual_fs) != fc_city:
                        continue
                    tc_city = STATION_TO_CITY.get(tc)
                    if tc_city and actual_ts != tc and STATION_TO_CITY.get(actual_ts) != tc_city:
                        continue

                    dep_s = str(d.get("from_std") or d.get("departureTime") or "").strip()
                    arr_s = str(d.get("to_sta") or d.get("arrivalTime") or "").strip()
                    dep_m = _time_to_minutes(dep_s)
                    arr_m = _time_to_minutes(arr_s)
                    dur_s = str(d.get("duration") or "").strip()
                    dur = 0
                    if re.fullmatch(r"\d{1,2}:\d{1,2}", dur_s):
                        hh, mmv = dur_s.split(":")
                        dur = int(hh) * 60 + int(mmv)
                    else:
                        dur = _safe_int(d.get("durationMinutes") or d.get("travelTimeMinutes"), 0)
                    if dur <= 0 and dep_m is not None and arr_m is not None:
                        dur = arr_m - dep_m
                        if dur <= 0:
                            dur += 1440
                    dist = _safe_int(d.get("distance"), 0)
                    speed = round(dist / (dur / 60), 1) if dist > 0 and dur > 0 else 0
                    run_days_list = _parse_run_days(d.get("run_days") or d.get("train_run_days"))
                    trains.append({
                        "trainNumber": num,
                        "trainName": str(d.get("train_name") or num).strip(),
                        "type": str(d.get("train_type") or "").strip(),
                        "provider": "railyatri_api",
                        "distanceKm": dist,
                        "travelTimeMinutes": dur,
                        "avgSpeedKmph": speed,
                        "totalHalts": _safe_int(d.get("halt_stn"), 0),
                        "sourceStationName": str(d.get("from_station_name") or fc_name).strip(),
                        "destinationStationName": str(d.get("to_station_name") or tc_name).strip(),
                        "fromStationCode": actual_fs,
                        "toStationCode": actual_ts,
                        "runningDays": {"days": run_days_list, "allDays": len(run_days_list) == 7},
                        "fromStationSchedule": {"departureMinutes": dep_m, "day": _safe_int(d.get("from_day"), 1), "stationCode": actual_fs},
                        "toStationSchedule": {"arrivalMinutes": arr_m, "day": _safe_int(d.get("to_day"), 1), "distanceFromSourceKm": dist, "stationCode": actual_ts},
                        "hasPantry": bool(d.get("has_pantry", False)),
                        "classTypes": d.get("class_type") if isinstance(d.get("class_type"), list) else [],
                        "specialTrain": bool(d.get("special_train", False)),
                        "railyatri_raw": d,
                    })
                if trains:
                    out = {
                        "totalTrains": len(trains),
                        "trains": trains,
                        "provider": "railyatri_api",
                    }
                    return _cache_set(key, out)
    except Exception:
        pass

    # Fallback parser for HTML payloads if API shape changes.
    url = display_url
    try:
        html_resp = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"},
            timeout=(4, 8),
        )
        if not html_resp.ok:
            return None
        html = html_resp.text or ""
    except Exception:
        return None
    blobs = []
    next_data_match = re.search(
        r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if next_data_match:
        blobs.append(next_data_match.group(1))

    state_match = re.search(
        r"__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;",
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if state_match:
        blobs.append(state_match.group(1))

    if not blobs:
        return None

    trains = []
    seen = set()
    for raw in blobs:
        try:
            payload = json.loads(raw)
        except Exception:
            continue
        for d in _iter_dicts(payload):
            num = str(
                d.get("trainNumber")
                or d.get("trainNo")
                or d.get("train_number")
                or ""
            ).strip()
            name = str(
                d.get("trainName")
                or d.get("train_name")
                or d.get("name")
                or ""
            ).strip()
            if not num or not re.fullmatch(r"\d{4,5}", num):
                continue
            key_t = (num, name)
            if key_t in seen:
                continue
            seen.add(key_t)

            actual_fs = str(d.get("fromStnCode") or d.get("from_stn_code") or fc).strip().upper()
            actual_ts = str(d.get("toStnCode") or d.get("to_stn_code") or tc).strip().upper()
            fc_city = STATION_TO_CITY.get(fc)
            if fc_city and actual_fs != fc and STATION_TO_CITY.get(actual_fs) != fc_city:
                continue
            tc_city = STATION_TO_CITY.get(tc)
            if tc_city and actual_ts != tc and STATION_TO_CITY.get(actual_ts) != tc_city:
                continue

            dep_s = str(d.get("departureTime") or d.get("depTime") or d.get("departure") or "").strip()
            arr_s = str(d.get("arrivalTime") or d.get("arrTime") or d.get("arrival") or "").strip()
            dep_m = _time_to_minutes(dep_s)
            arr_m = _time_to_minutes(arr_s)
            dur = _safe_int(d.get("duration") or d.get("durationMinutes") or d.get("travelTimeMinutes"), 0)
            if dur <= 0 and dep_m is not None and arr_m is not None:
                dur = arr_m - dep_m
                if dur <= 0:
                    dur += 1440
            dist = _safe_int(d.get("distance") or d.get("distanceKm"), 0)
            speed = round(dist / (dur / 60), 1) if dist > 0 and dur > 0 else 0

            trains.append({
                "trainNumber": num,
                "trainName": name or num,
                "type": str(d.get("trainType") or d.get("type") or "").strip(),
                "provider": "railyatri_html",
                "distanceKm": dist,
                "travelTimeMinutes": dur,
                "avgSpeedKmph": speed,
                "totalHalts": _safe_int(d.get("totalHalts"), 0),
                "sourceStationName": str(d.get("fromStnName") or fc_name).strip(),
                "destinationStationName": str(d.get("toStnName") or tc_name).strip(),
                "fromStationCode": actual_fs,
                "toStationCode": actual_ts,
                "runningDays": {"days": [], "allDays": False},
                "fromStationSchedule": {"departureMinutes": dep_m, "day": 1, "stationCode": actual_fs},
                "toStationSchedule": {"arrivalMinutes": arr_m, "day": 1, "distanceFromSourceKm": dist, "stationCode": actual_ts},
                "hasPantry": False,
                "classTypes": [],
                "specialTrain": False,
                "railyatri_raw": d,
            })

    if not trains:
        return None

    out = {
        "totalTrains": len(trains),
        "trains": trains,
        "provider": "railyatri_html",
    }
    return _cache_set(key, out)

