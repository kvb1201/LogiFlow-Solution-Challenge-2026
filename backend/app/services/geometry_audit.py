"""
Audit: scheduled train path vs map geometry (Supabase).

For each train leg A→B, ground truth is that train's schedule halts (CSV /
delay_scrape / schedule sources). Map data is read from Supabase geometry.
Pass only when every scheduled stop appears on the map in order with coords
(train A with 5 halts → 5 map points; train B same corridor with 10 → 10).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.pipelines.rail.station_coordinates import equivalent_station_codes
from app.services import supabase_client as sb
from app.services.route_geometry_store import list_geometry_rows


@dataclass
class SupabaseLegAudit:
    train_no: str
    from_code: str
    to_code: str
    source: str
    scheduled_stops: list[str] = field(default_factory=list)
    route_stops: list[str] = field(default_factory=list)
    map_stops: list[str] = field(default_factory=list)
    geometry_points: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def scheduled_leg_stops(train_no: str, from_code: str, to_code: str) -> list[str]:
    """Independent schedule ground truth for this train leg (not from Supabase)."""
    from app.pipelines.rail.data_loader import get_train_route, load_data
    from app.pipelines.rail.geometry_builder import _leg_indices
    from app.pipelines.rail.schedule_resolver import iter_schedule_sources

    load_data()
    best: list[str] = []
    for _, route in iter_schedule_sources(train_no):
        start, end = _leg_indices(route, from_code, to_code)
        if start < 0 or end < start:
            continue
        leg = [
            (s.get("stationCode") or s.get("station_code") or "").strip().upper()
            for s in route[start : end + 1]
        ]
        leg = [c for c in leg if c]
        if len(leg) > len(best):
            best = leg

    if best:
        return best

    raw = get_train_route(train_no)
    if not raw:
        return []
    pseudo = [
        {"stationCode": s.get("station_code"), "station_code": s.get("station_code")}
        for s in raw
    ]
    start, end = _leg_indices(pseudo, from_code, to_code)
    if start >= 0 and end >= start:
        return [str(raw[i]["station_code"]).upper() for i in range(start, end + 1)]
    return []


def validate_scheduled_vs_map(scheduled: list[str], mapped: list[str]) -> list[str]:
    """
    Strict check: map must reflect this train's scheduled halts exactly.
    Same count, same order (station-code equivalents allowed, e.g. PRYJ/ALD).
    """
    errors: list[str] = []
    if len(scheduled) < 2:
        errors.append("schedule_too_short")
        return errors
    if len(mapped) < 2:
        errors.append("map_too_short")
        return errors

    if len(scheduled) != len(mapped):
        errors.append(
            f"stop_count_mismatch:scheduled={len(scheduled)} map={len(mapped)}"
        )

    for i, sched in enumerate(scheduled):
        if i >= len(mapped):
            errors.append(f"map_missing_index:{i}:{sched}")
            continue
        if not (_equiv(sched) & _equiv(mapped[i])):
            errors.append(
                f"stop_order_mismatch@{i}:scheduled={sched} map={mapped[i]}"
            )

    mapped_equiv = [_equiv(c) for c in mapped]
    last_idx = -1
    for sched in scheduled:
        target = _equiv(sched)
        found = None
        for j in range(last_idx + 1, len(mapped)):
            if mapped_equiv[j] & target:
                found = j
                break
        if found is None:
            errors.append(f"scheduled_halt_not_on_map:{sched}")
        else:
            last_idx = found

    return errors


def _equiv(code: str) -> set[str]:
    return set(equivalent_station_codes((code or "").upper()))


def _city_cluster(code: str) -> set[str]:
    """All station codes in the same CITY_TO_STATION cluster."""
    code_u = (code or "").upper()
    cluster = set(_equiv(code_u))
    try:
        from app.pipelines.rail.config import CITY_TO_STATION

        for _city, codes in CITY_TO_STATION.items():
            norm = {str(c).upper() for c in codes}
            if code_u in norm:
                cluster |= norm
                for c in norm:
                    cluster |= _equiv(c)
    except Exception:
        pass
    return cluster


def _pdf_district_cluster(code: str) -> set[str]:
    try:
        from app.services.station_pdf_index import get_pdf_index

        rec = get_pdf_index().lookup_code((code or "").upper())
        if rec and rec.district:
            return {c.upper() for c in get_pdf_index().codes_in_district(rec.district)}
    except Exception:
        pass
    return set()


def _same_place(code_a: str, code_b: str) -> bool:
    a, b = (code_a or "").upper(), (code_b or "").upper()
    if not a or not b:
        return False
    if a == b or bool(_city_cluster(a) & _city_cluster(b)):
        return True
    da, db = _pdf_district_cluster(a), _pdf_district_cluster(b)
    if da & db:
        return True
    try:
        from app.services.station_pdf_index import get_pdf_index

        ra = get_pdf_index().lookup_code(a)
        rb = get_pdf_index().lookup_code(b)
        if ra and rb and ra.state and ra.state == rb.state:
            # NCR / Delhi metro: NZM, NDLS, DLI are different PDF districts, same city.
            if ra.state in ("DELHI",):
                return True
            if ra.zone == rb.zone and ra.division == rb.division:
                if "MUMBAI" in ra.district or "MUMBAI" in rb.district:
                    return True
    except Exception:
        pass
    return False


def _stops_from_row(row: dict) -> list[dict]:
    stops = row.get("stops") or []
    return stops if isinstance(stops, list) else []


def _geometry_from_row(row: dict) -> list[list[float]]:
    geom = row.get("geometry") or []
    return geom if isinstance(geom, list) else []


def validate_supabase_row(row: dict) -> list[str]:
    """Validate one train_route_geometry Supabase row."""
    errors: list[str] = []
    if not sb.is_configured():
        return ["supabase_not_configured"]

    train_no = str(row.get("train_number") or "")
    from_code = str(row.get("from_code") or "").upper()
    to_code = str(row.get("to_code") or "").upper()
    stops = _stops_from_row(row)
    geometry = _geometry_from_row(row)

    if not train_no:
        errors.append("missing_train_number")
    if not from_code or not to_code:
        errors.append("missing_endpoint_codes")
    if len(stops) < 2:
        errors.append("stops_lt_2")
    if len(geometry) < 2:
        errors.append("geometry_lt_2")

    renderable: list[dict] = []
    route_codes: list[str] = []
    for s in stops:
        if not isinstance(s, dict):
            errors.append("invalid_stop_entry")
            continue
        code = str(s.get("code") or "").upper()
        lat, lng = s.get("lat"), s.get("lng")
        route_codes.append(code)
        if lat is None or lng is None:
            errors.append(f"missing_coords:{code}")
            continue
        renderable.append(s)

    if len(renderable) < 2:
        errors.append("renderable_stops_lt_2")

    if len(renderable) != len(geometry):
        errors.append(f"stop_geometry_count_mismatch:{len(renderable)}_stops_{len(geometry)}_pts")

    if route_codes and from_code and not _same_place(route_codes[0], from_code):
        errors.append(f"from_mismatch:stop={route_codes[0]} row={from_code}")

    if route_codes and to_code and not _same_place(route_codes[-1], to_code):
        errors.append(f"dest_mismatch:stop={route_codes[-1]} row={to_code}")

    for i, stop in enumerate(renderable):
        if i >= len(geometry):
            errors.append(f"geometry_index_missing:{stop.get('code')}@{i}")
            break
        pt = geometry[i]
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            errors.append(f"invalid_geometry_point@{i}")
            continue
        lng, lat = float(pt[0]), float(pt[1])
        slat, slng = float(stop["lat"]), float(stop["lng"])
        if abs(slat - lat) > 0.02 or abs(slng - lng) > 0.02:
            errors.append(f"coord_mismatch:{stop.get('code')}@{i}")

    declared = row.get("point_count")
    if declared is not None and int(declared) != len(geometry):
        errors.append(f"point_count_mismatch:declared={declared} actual={len(geometry)}")

    return errors


def audit_supabase_row(row: dict) -> SupabaseLegAudit:
    train_no = str(row.get("train_number") or "")
    from_code = str(row.get("from_code") or "").upper()
    to_code = str(row.get("to_code") or "").upper()

    scheduled = scheduled_leg_stops(train_no, from_code, to_code)
    stops = _stops_from_row(row)
    geometry = _geometry_from_row(row)
    renderable_codes = [
        str(s.get("code") or "").upper()
        for s in stops
        if isinstance(s, dict) and s.get("lat") is not None and s.get("lng") is not None
    ]

    errors: list[str] = []
    if not scheduled:
        errors.append("no_independent_schedule_for_leg")
    else:
        errors.extend(validate_scheduled_vs_map(scheduled, renderable_codes))
    errors.extend(validate_supabase_row(row))

    return SupabaseLegAudit(
        train_no=train_no,
        from_code=from_code,
        to_code=to_code,
        source=str(row.get("source") or "supabase"),
        scheduled_stops=scheduled,
        route_stops=[str(s.get("code") or "").upper() for s in stops if isinstance(s, dict)],
        map_stops=renderable_codes,
        geometry_points=len(geometry),
        errors=errors,
    )


def run_supabase_geometry_audit(*, limit: int = 100) -> dict:
    """
    Audit `limit` Supabase rows: independent schedule halts vs map geometry.
    Pass = scheduled stops match map points in count and order for that train.
    """
    if not sb.is_configured():
        return {
            "requested": limit,
            "audited": 0,
            "passed": 0,
            "failed": 0,
            "failures": [],
            "error": "SUPABASE_URL / SUPABASE_KEY not configured",
        }

    rows = list_geometry_rows(limit=limit)
    if len(rows) < limit:
        return {
            "requested": limit,
            "audited": len(rows),
            "passed": 0,
            "failed": len(rows),
            "failures": [],
            "error": f"Only {len(rows)} rows in Supabase train_route_geometry (need {limit}). "
            "Run: make sync-rail-geometry-trains TRAINS=100",
        }

    results = [audit_supabase_row(r) for r in rows]
    failed = [r for r in results if not r.ok]
    return {
        "requested": limit,
        "audited": len(results),
        "passed": len(results) - len(failed),
        "failed": len(failed),
        "failures": [
            {
                "train": f.train_no,
                "leg": f"{f.from_code}→{f.to_code}",
                "source": f.source,
                "scheduled_n": len(f.scheduled_stops),
                "map_n": len(f.map_stops),
                "geometry_pts": f.geometry_points,
                "errors": f.errors,
                "scheduled_stops": f.scheduled_stops,
                "map_stops": f.map_stops,
            }
            for f in failed
        ],
    }
