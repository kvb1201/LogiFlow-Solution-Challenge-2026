"""
Today-only live delay rows via IRCTC RapidAPI (irctc1.p.rapidapi.com).

Requires IRCTC_RAPIDAPI_KEY(S) in backend/.env and ENABLE_IRCTC_RAPIDAPI=true.
Free tiers are tiny (~500 req/month) — use --max-trains and only for live-today strategy.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from scripts.scrapers.runningstatus import StationDelayRow


def _delay_from_station_obj(st: Dict[str, Any]) -> tuple[Optional[int], Optional[int], Optional[str]]:
    arr = st.get("arrivalDelay") or st.get("arrival_delay") or st.get("delayArr")
    dep = st.get("departureDelay") or st.get("departure_delay") or st.get("delayDep")
    if arr is None and dep is None:
        d = st.get("delay") or st.get("delayMinutes")
        if d is not None:
            try:
                v = int(float(d))
                return v, v, f"Delay: {v} mins"
            except (TypeError, ValueError):
                pass
    try:
        arr_i = int(float(arr)) if arr is not None else None
    except (TypeError, ValueError):
        arr_i = None
    try:
        dep_i = int(float(dep)) if dep is not None else None
    except (TypeError, ValueError):
        dep_i = None
    text = ""
    if arr_i is not None:
        text = f"Arr: {arr_i} mins"
    if dep_i is not None:
        text = (text + " " if text else "") + f"Dep: {dep_i} mins"
    return arr_i, dep_i, text or None


def fetch_live_today(train_number: str, *, run_day: Optional[date] = None) -> tuple[str, List[StationDelayRow]]:
    """
    Returns (page_status, rows). Uses railradar_client.get_live_status when RapidAPI enabled.
    """
    run_day = run_day or date.today()
    iso = run_day.isoformat()
    train = str(train_number).strip().zfill(5)

    try:
        from app.pipelines import rail  # noqa: F401
        from app.pipelines.rail import railradar_client as rc
    except ImportError as exc:
        return f"import_error:{exc}", []

    if not getattr(rc, "ENABLE_IRCTC_RAPIDAPI", False):
        return "rapidapi_disabled", []

    if not getattr(rc, "IRCTC_API_KEYS", None):
        return "no_rapidapi_keys", []

    # Journey date format varies by API — try YYYYMMDD
    data = rc.get_live_status(train, journey_date=run_day.strftime("%Y%m%d"))
    if not data:
        return "empty_response", []

    stations = (
        data.get("stations")
        or data.get("stationList")
        or (data.get("train_status") or {}).get("stations")
        or []
    )
    if not isinstance(stations, list) or not stations:
        return "no_stations_in_payload", []

    rows: List[StationDelayRow] = []
    for st in stations:
        if not isinstance(st, dict):
            continue
        code = (
            st.get("stationCode")
            or st.get("station_code")
            or st.get("code")
            or ""
        )
        code = str(code).strip().upper()
        if not code:
            continue
        name = str(st.get("stationName") or st.get("station_name") or code)
        arr_i, dep_i, delay_text = _delay_from_station_obj(st)
        rows.append(
            StationDelayRow(
                run_date=iso,
                train_number=train,
                station_code=code,
                station_name=name[:80],
                distance_km=None,
                scheduled_arrival=str(st.get("scheduledArrival") or st.get("schArr") or "") or None,
                scheduled_departure=str(st.get("scheduledDeparture") or st.get("schDep") or "") or None,
                actual_arrival=str(st.get("actualArrival") or st.get("actArr") or "") or None,
                actual_departure=str(st.get("actualDeparture") or st.get("actDep") or "") or None,
                arrival_delay_min=arr_i,
                departure_delay_min=dep_i,
                delay_text=delay_text,
                scrape_status="rapidapi_live",
            )
        )
    if not rows:
        return "parse_failed", []
    return "ok", rows
