"""
Build multi-stop train corridor geometry with city labels.
Falls back to reference trains on the same O-D when a train is missing from CSV.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from app.pipelines.rail.data_loader import get_station_name, get_train_route, get_trains_for_route
from app.pipelines.rail.station_coordinates import equivalent_station_codes, get_station_latlng
from app.services.route_geometry_store import get_cached_geometry, get_station_coord, save_geometry, save_station_coord


def station_display_city(name: str, code: str = "") -> str:
    n = (name or code or "").strip()
    if not n:
        return code
    n = re.sub(r"\s+JN\.?$", "", n, flags=re.I)
    n = re.sub(r"\s+(CANTT|CENTRAL|TERMINUS|TOWN|CITY|ROAD)(\s.*)?$", "", n, flags=re.I)
    return n.title().strip() or code


def _stop_code(stop: dict) -> str:
    return (stop.get("stationCode") or stop.get("station_code") or "").strip().upper()


def _stop_name(stop: dict) -> str:
    return str(stop.get("station_name") or stop.get("stationName") or get_station_name(_stop_code(stop)) or "")


def _equiv_set(code: str) -> set[str]:
    return set(equivalent_station_codes((code or "").upper()))


def _coord_pair(lng: float, lat: float) -> list[float] | None:
    from app.utils.coordinates import is_placeholder_coord

    if is_placeholder_coord(lat, lng):
        return None
    return [float(lng), float(lat)]


def _resolve_coord(code: str, name: str) -> list[float] | None:
    latlng = get_station_latlng(code)
    if latlng:
        lat, lng = latlng
        coord = _coord_pair(lng, lat)
        if coord:
            save_station_coord(
                code,
                station_name=name or code,
                city=station_display_city(name, code),
                lat=lat,
                lng=lng,
                source="offline",
            )
            return coord

    cached = get_station_coord(code)
    if cached and cached.get("lat") is not None and cached.get("lng") is not None:
        return _coord_pair(float(cached["lng"]), float(cached["lat"]))

    if name:
        from app.pipelines.rail.railradar_client import get_station_info

        info = get_station_info(code)
        if info and info.get("lat") is not None and info.get("lng") is not None:
            coord = _coord_pair(float(info["lng"]), float(info["lat"]))
            if coord:
                save_station_coord(
                    code,
                    station_name=name,
                    city=station_display_city(name, code),
                    lat=coord[1],
                    lng=coord[0],
                    source="geocoded",
                )
                return coord
    return None


def _find_route_indices(route: list[dict], from_station: str, to_station: str) -> tuple[int, int]:
    from_set = _equiv_set(from_station)
    to_set = _equiv_set(to_station)
    start_idx, end_idx = -1, -1
    for i, stop in enumerate(route):
        code = _stop_code(stop)
        if not code:
            continue
        if code in from_set:
            start_idx = i
        if code in to_set:
            end_idx = i
    return start_idx, end_idx


def _find_fuzzy_route_slice(route: list[dict], from_station: str, to_station: str) -> tuple[int, int]:
    _, end_idx = _find_route_indices(route, from_station, to_station)
    if end_idx < 0:
        to_set = _equiv_set(to_station)
        for i, stop in enumerate(route):
            if _stop_code(stop) in to_set:
                end_idx = i
                break
    if end_idx < 0:
        return -1, -1

    start_idx, _ = _find_route_indices(route, from_station, to_station)
    if start_idx >= 0 and start_idx <= end_idx:
        return start_idx, end_idx

    from_coord = _resolve_coord(from_station, get_station_name(from_station))
    if not from_coord:
        return 0, end_idx

    from_lng, from_lat = from_coord
    best_i = 0
    best_d = float("inf")
    for i in range(end_idx + 1):
        code = _stop_code(route[i])
        coord = _resolve_coord(code, _stop_name(route[i])) if code else None
        if not coord:
            continue
        lng, lat = coord
        d = (lng - from_lng) ** 2 + (lat - from_lat) ** 2
        if d < best_d:
            best_d = d
            best_i = i
    return best_i, end_idx


def _normalize_route_leg(route_leg: list[dict]) -> list[dict]:
    out = []
    for stop in route_leg:
        code = _stop_code(stop)
        if not code:
            continue
        dist = stop.get("distance_from_source", stop.get("distance", 0))
        try:
            dist_f = float(dist or 0)
        except (TypeError, ValueError):
            dist_f = 0.0
        out.append({
            "station_code": code,
            "stationCode": code,
            "station_name": _stop_name(stop),
            "distance": dist_f,
        })
    return out


def _build_geometry_detail(route_leg: list[dict], max_points: int | None = None) -> dict[str, Any]:
    """
    Build polyline + labelled stops for a schedule leg.

    max_points=None keeps every intermediate station on the map (A→B corridor).
    Downsampling only applies when max_points is set and the leg exceeds it.
    """
    leg = _normalize_route_leg(route_leg)
    if len(leg) < 2:
        return {"geometry": [], "stops": [], "point_count": 0, "source": "empty"}

    cap = 200 if max_points is None else max_points
    if cap and len(leg) > cap:
        idx = [0]
        step = (len(leg) - 1) / float(cap - 1)
        for i in range(1, cap - 1):
            idx.append(int(round(i * step)))
        idx.append(len(leg) - 1)
        leg = [leg[i] for i in sorted(set(idx))]

    rows = []
    for stop in leg:
        code = _stop_code(stop)
        name = _stop_name(stop)
        rows.append({
            "code": code,
            "name": name,
            "city": station_display_city(name, code),
            "coord": None,
            "distance": float(stop.get("distance") or 0),
        })

    workers = min(8, max(1, len(rows)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(_resolve_coord, row["code"], row["name"]): i
            for i, row in enumerate(rows)
            if row["code"]
        }
        for future in as_completed(futures):
            idx = futures[future]
            try:
                rows[idx]["coord"] = future.result()
            except Exception:
                rows[idx]["coord"] = None

    anchors = [(i, r["coord"]) for i, r in enumerate(rows) if r["coord"]]
    if len(anchors) >= 2:
        for k in range(len(anchors) - 1):
            i0, c0 = anchors[k]
            i1, c1 = anchors[k + 1]
            d0, d1 = rows[i0]["distance"], rows[i1]["distance"]
            span = (d1 - d0) if d1 > d0 else float(i1 - i0) or 1.0
            for j in range(i0 + 1, i1):
                if rows[j]["coord"]:
                    continue
                frac = ((rows[j]["distance"] - d0) / span) if d1 > d0 else ((j - i0) / span)
                rows[j]["coord"] = [c0[0] + frac * (c1[0] - c0[0]), c0[1] + frac * (c1[1] - c0[1])]
                rows[j]["city"] = rows[j]["city"] or station_display_city(rows[j]["name"], rows[j]["code"])

    stops = []
    geometry = []
    for row in rows:
        if not row["coord"]:
            continue
        lng, lat = row["coord"]
        stops.append({
            "code": row["code"],
            "name": row["name"],
            "city": row["city"] or station_display_city(row["name"], row["code"]),
            "lng": lng,
            "lat": lat,
        })
        geometry.append([lng, lat])

    source = "schedule" if len(stops) > 2 else "direct"
    return {"geometry": geometry, "stops": stops, "point_count": len(stops), "source": source}


def _ensure_origin_anchor(detail: dict[str, Any], from_station: str) -> dict[str, Any]:
    if not detail.get("geometry"):
        return detail
    origin = _resolve_coord(from_station, get_station_name(from_station))
    if not origin:
        return detail

    geom = list(detail["geometry"])
    stops = list(detail.get("stops") or [])
    olng, olat = origin
    flng, flat = geom[0]
    if (olng - flng) ** 2 + (olat - flat) ** 2 <= 0.02:
        return detail

    from app.pipelines.rail.station_coordinates import get_station_meta

    meta = get_station_meta(from_station) or {}
    name = get_station_name(from_station) or meta.get("name") or from_station
    city = station_display_city(name, from_station)
    geom.insert(0, origin)
    stops.insert(0, {
        "code": from_station.upper(),
        "name": name,
        "city": city,
        "lng": olng,
        "lat": olat,
    })
    detail["geometry"] = geom
    detail["stops"] = stops
    detail["point_count"] = len(geom)
    return detail


def _reference_corridor_geometry(from_u: str, to_u: str) -> dict[str, Any] | None:
    """Borrow the richest CSV route on the same corridor (e.g. Vande Bharat not in CSV)."""
    candidates = get_trains_for_route(list(_equiv_set(from_u)), list(_equiv_set(to_u)), max_results=50)
    best: dict[str, Any] | None = None
    best_n = 0
    for t in candidates:
        raw = get_train_route(t["train_no"])
        if len(raw) < 2:
            continue
        route = [
            {"station_code": s["station_code"], "station_name": s.get("station_name", ""), "distance": s.get("distance", 0)}
            for s in raw
        ]
        start, end = _find_route_indices(route, from_u, to_u)
        if start < 0 or end < 0 or start > end:
            start, end = _find_fuzzy_route_slice(route, from_u, to_u)
        if start < 0 or end < start:
            continue
        detail = _build_geometry_detail(route[start : end + 1])
        if detail["point_count"] > best_n:
            best = detail
            best_n = detail["point_count"]
    if best:
        best["source"] = "corridor_reference"
        return _ensure_origin_anchor(best, from_u)
    return None


def _compute_geometry(train_no: str, from_u: str, to_u: str) -> dict[str, Any]:
    from app.pipelines.rail.railradar_client import get_train_data

    data = get_train_data(train_no, data_type="static")
    if data and "train" in data and data["train"].get("route"):
        route = data["train"]["route"]
        start, end = _find_route_indices(route, from_u, to_u)
        if start < 0 or end < 0 or start > end:
            start, end = _find_fuzzy_route_slice(route, from_u, to_u)
        if start >= 0 and end >= start:
            detail = _build_geometry_detail(route[start : end + 1])
            if detail["point_count"] >= 2:
                sched_src = data["train"].get("_schedule_source") or "csv_2017"
                detail["source"] = sched_src if sched_src != "csv_2017" else "schedule"
                return _ensure_origin_anchor(detail, from_u)

    ref = _reference_corridor_geometry(from_u, to_u)
    if ref and ref.get("point_count", 0) >= 2:
        return ref

    from_c = _resolve_coord(from_u, get_station_name(from_u))
    to_c = _resolve_coord(to_u, get_station_name(to_u))
    if from_c and to_c:
        return {
            "geometry": [from_c, to_c],
            "stops": [
                {"code": from_u, "name": get_station_name(from_u) or from_u, "city": station_display_city(get_station_name(from_u), from_u), "lng": from_c[0], "lat": from_c[1]},
                {"code": to_u, "name": get_station_name(to_u) or to_u, "city": station_display_city(get_station_name(to_u), to_u), "lng": to_c[0], "lat": to_c[1]},
            ],
            "point_count": 2,
            "source": "direct",
        }
    return {"geometry": [], "stops": [], "point_count": 0, "source": "empty"}


def _expected_leg_stop_count(train_no: str, from_u: str, to_u: str) -> int:
    """Stops on the schedule slice between from_u and to_u (for cache freshness)."""
    from app.pipelines.rail.railradar_client import get_train_data

    data = get_train_data(train_no, data_type="static")
    if not data or "train" not in data or not data["train"].get("route"):
        raw = get_train_route(train_no)
        route = [
            {
                "station_code": s["station_code"],
                "station_name": s.get("station_name", ""),
                "distance": s.get("distance", 0),
            }
            for s in raw
        ]
    else:
        route = data["train"]["route"]

    if len(route) < 2:
        return 0
    start, end = _find_route_indices(route, from_u, to_u)
    if start < 0 or end < 0 or start > end:
        start, end = _find_fuzzy_route_slice(route, from_u, to_u)
    if start < 0 or end < start:
        return 0
    return end - start + 1


def get_train_geometry_detail(train_no: str, from_station: str, to_station: str) -> dict[str, Any]:
    """Load from Supabase cache or compute, persist, and return enriched geometry."""
    from_u = (from_station or "").strip().upper()
    to_u = (to_station or "").strip().upper()
    tn = str(train_no).strip()

    cached = get_cached_geometry(tn, from_u, to_u)
    if cached and cached.get("geometry") and len(cached["geometry"]) >= 2:
        expected = _expected_leg_stop_count(tn, from_u, to_u)
        cached_n = int(cached.get("point_count") or len(cached["geometry"]))
        stale = expected >= 4 and cached_n < max(4, int(expected * 0.6))
        if not stale:
            return {
                "geometry": cached["geometry"],
                "stops": cached.get("stops") or [],
                "point_count": cached_n,
                "source": cached.get("source") or "cache",
            }

    detail = _compute_geometry(tn, from_u, to_u)
    if detail.get("point_count", 0) >= 2:
        save_geometry(
            tn,
            from_u,
            to_u,
            stops=detail.get("stops") or [],
            geometry=detail.get("geometry") or [],
            source=detail.get("source") or "computed",
        )
    return detail
