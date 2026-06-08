"""
On-demand train corridor geometry backfill into Supabase.

When a (train_number, from_code, to_code) leg is missing or only a stub, compute via
geometry_builder and upsert — duplicate-safe on PK (train_number, from_code, to_code).
"""

from __future__ import annotations

from typing import Any

from app.services.route_geometry_store import get_cached_geometry


def _is_usable_cached_row(row: dict[str, Any] | None) -> bool:
    if not row:
        return False
    geometry = row.get("geometry") or []
    if len(geometry) < 2:
        return False
    source = str(row.get("source") or "").lower()
    # Recompute 2-point direct chords — schedule slices are richer for maps.
    if source == "direct" and len(geometry) <= 2:
        return False
    return True


def ensure_geometry_for_leg(
    train_number: str,
    from_code: str,
    to_code: str,
) -> dict[str, Any]:
    """
    Return geometry for one leg; upsert to Supabase when missing or stale.

    Idempotent: repeated calls update the same row (no duplicate trains).
    """
    from app.pipelines.rail.geometry_builder import get_train_geometry_detail

    tn = str(train_number or "").strip()
    from_u = str(from_code or "").strip().upper()
    to_u = str(to_code or "").strip().upper()

    if not tn or not from_u or not to_u:
        return {
            "ok": False,
            "train_number": tn,
            "from_code": from_u,
            "to_code": to_u,
            "error": "train_number, from_code, and to_code are required",
        }

    cached_before = get_cached_geometry(tn, from_u, to_u)
    was_cached = _is_usable_cached_row(cached_before)

    detail = get_train_geometry_detail(tn, from_u, to_u)
    geometry = detail.get("geometry") or []
    stops = detail.get("stops") or []
    point_count = int(detail.get("point_count") or len(geometry))
    source = str(detail.get("source") or "computed")

    if point_count < 2 or len(geometry) < 2:
        return {
            "ok": False,
            "train_number": tn,
            "from_code": from_u,
            "to_code": to_u,
            "geometry": [],
            "stops": [],
            "point_count": 0,
            "source": source,
            "cached": was_cached,
            "upserted": False,
            "error": "Could not build corridor geometry for this train leg",
        }

    cached_after = get_cached_geometry(tn, from_u, to_u)
    upserted = cached_after is not None and not was_cached

    return {
        "ok": True,
        "train_number": tn,
        "from_code": from_u,
        "to_code": to_u,
        "geometry": geometry,
        "stops": stops,
        "point_count": point_count,
        "source": source,
        "cached": was_cached,
        "upserted": upserted,
    }


def ensure_geometry_legs(legs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Backfill multiple legs; skips invalid entries."""
    results: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    for leg in legs:
        tn = str(leg.get("train_number") or leg.get("train_no") or "").strip()
        from_u = str(leg.get("from_code") or leg.get("from") or "").strip().upper()
        to_u = str(leg.get("to_code") or leg.get("to") or "").strip().upper()
        key = (tn, from_u, to_u)
        if not tn or not from_u or not to_u:
            continue
        if key in seen:
            continue
        seen.add(key)
        results.append(ensure_geometry_for_leg(tn, from_u, to_u))

    return results
