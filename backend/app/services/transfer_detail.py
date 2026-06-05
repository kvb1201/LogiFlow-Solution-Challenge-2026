"""Enrich composed legs and hub transfers with station/train/wait warnings."""
from __future__ import annotations

import re
from typing import Any


def _first_seg(segments: list) -> dict[str, Any]:
    return segments[0] if segments else {}


def _last_seg(segments: list) -> dict[str, Any]:
    return segments[-1] if segments else {}


def _parse_time_minutes(raw: Any) -> int | None:
    if not raw:
        return None
    text = str(raw).strip()
    m = re.match(r"(\d{1,2}):(\d{2})", text)
    if not m:
        return None
    return int(m.group(1)) * 60 + int(m.group(2))


def _schedule_gap_hr(arrival: Any, departure: Any) -> float | None:
    arr_m = _parse_time_minutes(arrival)
    dep_m = _parse_time_minutes(departure)
    if arr_m is None or dep_m is None:
        return None
    gap = dep_m - arr_m
    if gap < 0:
        gap += 24 * 60
    if gap <= 0 or gap > 36 * 60:
        return None
    return round(gap / 60.0, 2)


def _train_label(leg: dict[str, Any]) -> str:
    no = str(leg.get("train_no") or "").strip()
    name = str(leg.get("train_name") or "").strip()
    if no and name:
        return f"{no} · {name}"
    return no or name or ""


def enrich_leg(leg: dict[str, Any]) -> dict[str, Any]:
    """Add board/alight station and train fields from segment data."""
    segs = leg.get("segments") or []
    first = _first_seg(segs)
    last = _last_seg(segs)

    leg["board_station"] = str(first.get("from") or leg.get("source") or "")
    leg["alight_station"] = str(last.get("to") or leg.get("destination") or "")
    leg["train_no"] = str(first.get("train_no") or "")
    leg["train_name"] = str(first.get("train_name") or "")
    leg["departure"] = str(first.get("departure") or "")
    leg["arrival"] = str(last.get("arrival") or "")

    if leg["mode"] == "air" and not leg["train_no"]:
        leg["flight_label"] = str(first.get("flight") or first.get("flight_no") or "Flight segment")
    if leg["mode"] == "road":
        leg["vehicle_label"] = "Truck / road freight"

    return leg


def build_transfer_detail(
    leg1: dict[str, Any],
    leg2: dict[str, Any],
    hub_city: str,
    hub_display: str,
    buffer_hr: float,
    handling_fee_inr: int,
) -> dict[str, Any]:
    """Build transfer block with wait/halt warnings and station-level connection info."""
    mode1 = leg1.get("mode", "")
    mode2 = leg2.get("mode", "")
    warnings: list[str] = []

    alight = leg1.get("alight_station") or hub_city
    board = leg2.get("board_station") or hub_city
    leg1_train = _train_label(leg1)
    leg2_train = _train_label(leg2)

    arr1 = leg1.get("arrival") or ""
    dep2 = leg2.get("departure") or ""

    if leg1_train:
        warnings.append(
            f"Get off at {alight}"
            + (f" when train arrives around {arr1}" if arr1 else "")
            + f" ({leg1_train})"
        )
    else:
        warnings.append(f"Arrive at {alight}, {hub_city} by {mode1}")

    if leg2_train:
        warnings.append(
            f"Then take train from {board}"
            + (f" around {dep2}" if dep2 else "")
            + f" ({leg2_train})"
        )
    elif mode2 == "air":
        warnings.append(f"Then fly from {board}, {hub_city}")
    elif mode2 == "road":
        warnings.append(f"Then truck from {board}, {hub_city} to destination")
    else:
        warnings.append(f"Then continue by {mode2} from {board}, {hub_city}")

    scheduled_gap = _schedule_gap_hr(leg1.get("arrival"), leg2.get("departure"))
    severity = "ok"

    if mode1 != mode2:
        warnings.append(
            f"Unload and reload cargo at {hub_city} "
            f"(switch from {mode1} to {mode2}, about ₹{handling_fee_inr} handling)"
        )

    if buffer_hr >= 8:
        severity = "caution"
        warnings.append(
            f"Long wait at {hub_city}: about {buffer_hr:.1f} hours — keep cargo in parcel van or shed"
        )
    elif buffer_hr >= 5:
        severity = "caution"
        warnings.append(f"Wait about {buffer_hr:.1f} hours at {hub_city} before the next trip")

    min_buffer = 2.0 if mode1 == "rail" and mode2 == "rail" else 1.5
    if buffer_hr < min_buffer:
        severity = "warning"
        warnings.append(
            f"Short connection: only {buffer_hr:.1f}h at {hub_city} — risky if the first train is late"
        )

    if scheduled_gap is not None:
        if scheduled_gap < 1.5:
            severity = "warning"
            warnings.append(
                f"Timetable leaves only {scheduled_gap:.1f}h between arrival and next departure "
                f"— check live train status before booking"
            )
        elif scheduled_gap > buffer_hr * 1.5:
            warnings.append(
                f"About {scheduled_gap:.1f}h between trains at {hub_city} — use the extra time to transfer cargo"
            )

    if alight and board and alight.upper() != board.upper():
        warnings.append(
            f"Different stations at {hub_city}: get off at {alight}, next trip from {board}"
        )

    return {
        "at": hub_city,
        "at_display": hub_display,
        "buffer_hr": round(buffer_hr, 2),
        "handling_fee_inr": handling_fee_inr,
        "from_mode": mode1,
        "to_mode": mode2,
        "notes": f"Cargo transfer at {hub_city}",
        "severity": severity,
        "warnings": warnings,
        "leg1_alight_station": alight,
        "leg2_board_station": board,
        "leg1_train": leg1_train,
        "leg2_train": leg2_train,
        "leg1_arrival": leg1.get("arrival") or "",
        "leg2_departure": leg2.get("departure") or "",
        "scheduled_gap_hr": scheduled_gap,
    }
