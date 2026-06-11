"""Supabase-backed cache for rural hub-pair discovery (geohash grid cells)."""
from __future__ import annotations

import base64
import gzip
import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

from app.services.geo_hub_finder import HubPair
from app.services import supabase_client

_HUB_TTL_S = int(os.getenv("RURAL_HUB_CACHE_TTL_S", str(7 * 24 * 3600)))
_GEO_PRECISION = int(os.getenv("RURAL_HUB_GEO_PRECISION", "4"))
_mem: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _enabled() -> bool:
    if os.getenv("RURAL_HUB_SUPABASE", "1").strip().lower() in ("0", "false", "no"):
        return False
    return supabase_client.is_configured()


def _geo_cell(lat: float | None, lng: float | None) -> str:
    if lat is None or lng is None:
        return "none"
    factor = 10**_GEO_PRECISION
    return f"{int(round(lat * factor))}:{int(round(lng * factor))}"


def rural_hub_cache_key(
    src_lat: float | None,
    src_lng: float | None,
    dst_lat: float | None,
    dst_lng: float | None,
    *,
    max_pairs: int,
    hubs_per_end: int,
) -> str:
    return (
        f"{_geo_cell(src_lat, src_lng)}|{_geo_cell(dst_lat, dst_lng)}"
        f"|{max_pairs}|{hubs_per_end}"
    )


def _compress(rows: list[dict[str, Any]]) -> str:
    raw = json.dumps(rows, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(gzip.compress(raw, compresslevel=6)).decode("ascii")


def _decompress(b64: str) -> list[dict[str, Any]]:
    raw = gzip.decompress(base64.b64decode(b64.encode("ascii")))
    data = json.loads(raw.decode("utf-8"))
    return data if isinstance(data, list) else []


def _pairs_from_rows(rows: list[dict[str, Any]]) -> list[HubPair]:
    from app.services.hub_catalog import Hub

    out: list[HubPair] = []
    for row in rows:
        oh = row.get("origin_hub") or {}
        dh = row.get("dest_hub") or {}
        if not oh.get("city") or not dh.get("city"):
            continue
        out.append(
            HubPair(
                origin_hub=Hub(
                    city=oh["city"],
                    display_name=str(oh.get("display_name") or oh["city"]),
                    rail_stations=list(oh.get("rail_stations") or []),
                    airport_code=oh.get("airport_code"),
                    tier=int(oh.get("tier") or 2),
                    on_route=bool(oh.get("on_route", True)),
                ),
                dest_hub=Hub(
                    city=dh["city"],
                    display_name=str(dh.get("display_name") or dh["city"]),
                    rail_stations=list(dh.get("rail_stations") or []),
                    airport_code=dh.get("airport_code"),
                    tier=int(dh.get("tier") or 2),
                    on_route=bool(dh.get("on_route", True)),
                ),
                strategy=str(row.get("strategy") or "geo_rural"),
            )
        )
    return out


def get_cached_rural_hub_pairs(cache_key: str) -> list[HubPair] | None:
    now = time.time()
    mem = _mem.get(cache_key)
    if mem and mem[0] > now:
        return _pairs_from_rows(mem[1])

    if not _enabled():
        return None

    iso_now = datetime.now(timezone.utc).isoformat()
    rows = supabase_client.rest_get(
        "rural_hub_cache",
        {
            "cache_key": f"eq.{cache_key}",
            "expires_at": f"gt.{iso_now}",
            "select": "payload_gz_b64,hit_count",
            "limit": "1",
        },
        timeout_s=4,
    )
    if not rows:
        return None

    row = rows[0]
    b64 = row.get("payload_gz_b64")
    if not b64:
        return None

    try:
        payload = _decompress(str(b64))
    except Exception:
        return None

    _mem[cache_key] = (now + _HUB_TTL_S, payload)
    hit_count = int(row.get("hit_count") or 0)
    threading.Thread(
        target=_bump_hit,
        args=(cache_key, hit_count),
        daemon=True,
        name="rural-hub-hit",
    ).start()
    return _pairs_from_rows(payload)


def set_cached_rural_hub_pairs(cache_key: str, pairs: list[HubPair]) -> None:
    rows = [p.to_dict() for p in pairs]
    _mem[cache_key] = (time.time() + _HUB_TTL_S, rows)

    if not _enabled() or not rows:
        return

    expires_at = datetime.fromtimestamp(time.time() + _HUB_TTL_S, tz=timezone.utc).isoformat()
    threading.Thread(
        target=_persist,
        args=(cache_key, rows, expires_at),
        daemon=True,
        name="rural-hub-persist",
    ).start()


def _persist(cache_key: str, rows: list[dict[str, Any]], expires_at: str) -> None:
    supabase_client.rest_upsert(
        "rural_hub_cache",
        {
            "cache_key": cache_key,
            "payload_gz_b64": _compress(rows),
            "expires_at": expires_at,
            "hit_count": 0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="cache_key",
    )


def _bump_hit(cache_key: str, current: int) -> None:
    supabase_client.rest_patch(
        "rural_hub_cache",
        {"cache_key": f"eq.{cache_key}"},
        {"hit_count": current + 1, "updated_at": datetime.now(timezone.utc).isoformat()},
    )


def clear_rural_hub_cache_for_tests() -> None:
    _mem.clear()
