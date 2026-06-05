"""
Standalone trains-between fetch for bulk discovery (no app.pipelines.rail import chain).

Primary: RailYatri JSON API. Does not require station_resolver.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional

import requests

RY_API = "https://trainticketapi.railyatri.in/api/trains-between-station-with-sa.json"


def _ry_date(doj: str) -> str:
    yyyy, mm, dd = doj.split("-")
    return f"{dd}-{mm}-{yyyy}"


def fetch_trains_between_corridor(
    from_code: str,
    to_code: str,
    date_of_journey: str,
    *,
    session: Optional[requests.Session] = None,
) -> Optional[Dict[str, Any]]:
    """
    Returns {totalTrains, trains: [{trainNumber, trainName, ...}], provider}.
    """
    fc = (from_code or "").strip().upper()
    tc = (to_code or "").strip().upper()
    doj = (date_of_journey or "").strip()
    if not fc or not tc or not doj:
        return None

    ry_date = _ry_date(doj)
    try:
        dd, mm, yyyy = ry_date.split("-")
        compact_date = f"{int(dd)}-{int(mm)}-{int(yyyy)}"
    except Exception:
        compact_date = ry_date

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
    temp_uid = -int(time.time())
    params = {
        "from": fc,
        "to": tc,
        "dateOfJourney": f"{compact_date} ",
        "action": "train_between_station",
        "controller": "train_ticket_tbs",
        "device_type_id": "6",
        "from_code": fc,
        "from_name": fc,
        "journey_date": compact_date,
        "journey_quota": "GN",
        "to_code": tc,
        "to_name": tc,
        "authentication_token": "",
        "v_code": "null",
        "user_id": str(temp_uid),
        "temp_user_id": str(temp_uid),
    }

    http = session or requests
    try:
        resp = http.get(RY_API, params=params, headers=headers, timeout=(6, 14))
        if not resp.ok:
            return None
        body = resp.json() if resp.content else {}
        rows: List[dict] = []
        if isinstance(body, dict):
            rows.extend(body.get("train_between_stations") or [])
            rows.extend(body.get("reserved_trains") or [])
        trains: List[Dict[str, Any]] = []
        seen: set = set()
        for d in rows:
            if not isinstance(d, dict):
                continue
            num = str(d.get("train_number") or d.get("trainNumber") or "").strip()
            if not num or not re.fullmatch(r"\d{4,5}", num):
                continue
            if num in seen:
                continue
            seen.add(num)
            trains.append(
                {
                    "trainNumber": num,
                    "trainName": str(d.get("train_name") or d.get("trainName") or num).strip(),
                    "provider": "railyatri_api",
                }
            )
        if trains:
            return {
                "totalTrains": len(trains),
                "trains": trains,
                "provider": "railyatri_api",
            }
    except Exception:
        pass

    # Light HTML fallback: __NEXT_DATA__ train numbers
    try:
        html_resp = http.get(
            display_url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "text/html",
            },
            timeout=(6, 12),
        )
        if not html_resp.ok:
            return None
        html = html_resp.text or ""
        m = re.search(
            r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
            html,
            flags=re.DOTALL | re.IGNORECASE,
        )
        if not m:
            return None
        payload = json.loads(m.group(1))
        trains = _extract_trains_from_json_blob(payload)
        if trains:
            return {
                "totalTrains": len(trains),
                "trains": trains,
                "provider": "railyatri_html",
            }
    except Exception:
        pass
    return None


def _extract_trains_from_json_blob(node: Any) -> List[Dict[str, str]]:
    found: List[Dict[str, str]] = []
    seen: set = set()

    def walk(obj: Any) -> None:
        if isinstance(obj, dict):
            num = str(
                obj.get("trainNumber")
                or obj.get("train_number")
                or obj.get("trainNo")
                or ""
            ).strip()
            if num and re.fullmatch(r"\d{4,5}", num) and num not in seen:
                seen.add(num)
                name = str(obj.get("trainName") or obj.get("train_name") or num).strip()
                found.append({"trainNumber": num, "trainName": name, "provider": "railyatri_html"})
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for item in obj:
                walk(item)

    walk(node)
    return found
