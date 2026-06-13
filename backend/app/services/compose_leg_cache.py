"""TTL cache for composed pipeline legs — L1 memory, L2 Redis, L3 Supabase (gzip)."""
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

from app.services import supabase_client

_SUCCESS_TTL_S = int(os.getenv("COMPOSE_LEG_CACHE_TTL_S", str(6 * 3600)))
_FAIL_TTL_S = 120
_PREFIX = "compose:leg:"

_mem: dict[str, dict[str, Any]] = {}
_redis = None
_redis_ok = False


def _supabase_enabled() -> bool:
    if os.getenv("COMPOSE_LEG_SUPABASE", "1").strip().lower() in ("0", "false", "no"):
        return False
    return supabase_client.is_configured()


def _init_redis() -> None:
    global _redis, _redis_ok
    if _redis is not None:
        return
    try:
        import redis

        url = os.getenv("REDIS_URL")
        _redis = redis.from_url(url, decode_responses=True) if url else redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            db=int(os.getenv("REDIS_DB", "0")),
            decode_responses=True,
        )
        _redis.ping()
        _redis_ok = True
    except Exception:
        _redis_ok = False


def _normalize_place(place: str) -> str:
    return (place or "").strip().lower()


def _leg_key(mode: str, frm: str, to: str, priority: str) -> str:
    return f"{mode.lower()}|{_normalize_place(frm)}|{_normalize_place(to)}|{priority.lower()}"


def _cache_key(mode: str, frm: str, to: str, priority: str) -> str:
    return _PREFIX + hashlib.md5(_leg_key(mode, frm, to, priority).encode()).hexdigest()


def slim_leg_for_cache(leg_dict: dict[str, Any] | None) -> dict[str, Any] | None:
    """Strip segments/explanations before persistence — keeps storage small."""
    if not leg_dict:
        return None
    return {
        k: leg_dict[k]
        for k in ("mode", "source", "destination", "time_hr", "cost_inr", "risk", "status")
        if k in leg_dict
    }


def _compress_payload(obj: dict[str, Any] | None) -> str | None:
    if obj is None:
        return None
    raw = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(gzip.compress(raw, compresslevel=6)).decode("ascii")


def _decompress_payload(b64: str) -> dict[str, Any]:
    raw = gzip.decompress(base64.b64decode(b64.encode("ascii")))
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("leg payload must be a JSON object")
    return data


def _corridor_tags(frm: str, to: str) -> list[str]:
    tags = {_normalize_place(frm), _normalize_place(to)}
    return sorted(t for t in tags if t)


def _entry_from_leg(leg_dict: dict[str, Any] | None, ttl: int) -> dict[str, Any]:
    return {
        "data": slim_leg_for_cache(leg_dict),
        "expires_at": time.time() + ttl,
    }


def _warm_local(key: str, entry: dict[str, Any], ttl: int) -> None:
    _mem[key] = entry
    _init_redis()
    if _redis_ok and _redis:
        try:
            _redis.setex(key, ttl, json.dumps(entry))
        except Exception:
            pass


def _read_supabase(leg_key: str) -> tuple[str, dict[str, Any] | None, int] | None:
    iso_now = datetime.now(timezone.utc).isoformat()
    rows = supabase_client.rest_get(
        "compose_leg_cache",
        {
            "leg_key": f"eq.{leg_key}",
            "expires_at": f"gt.{iso_now}",
            "select": "status,payload_gz_b64,hit_count",
            "limit": "1",
        },
        timeout_s=4,
    )
    if not rows:
        return None

    row = rows[0]
    status = str(row.get("status") or "")
    hit_count = int(row.get("hit_count") or 0)
    if status == "fail":
        return ("fail", None, hit_count)
    if status != "hit":
        return None

    b64 = row.get("payload_gz_b64")
    if not b64:
        return None
    try:
        return ("hit", _decompress_payload(str(b64)), hit_count)
    except Exception:
        return None


def get_cached_leg(mode: str, frm: str, to: str, priority: str) -> tuple[str, dict[str, Any] | None] | None:
    """Return ('hit', leg_dict) or ('fail', None) if cached; None on miss."""
    key = _cache_key(mode, frm, to, priority)
    leg_key = _leg_key(mode, frm, to, priority)
    now = time.time()

    entry = _mem.get(key)
    if entry and entry["expires_at"] > now:
        return ("hit" if entry["data"] else "fail", entry["data"])

    _init_redis()
    if _redis_ok and _redis:
        try:
            raw = _redis.get(key)
            if raw:
                entry = json.loads(raw)
                _mem[key] = entry
                if entry.get("expires_at", 0) > now:
                    return ("hit" if entry.get("data") else "fail", entry.get("data"))
        except Exception:
            pass

    if not _supabase_enabled():
        return None

    remote = _read_supabase(leg_key)
    if not remote:
        return None

    status, data, hit_count = remote
    ttl = _SUCCESS_TTL_S if status == "hit" else _FAIL_TTL_S
    entry = _entry_from_leg(data if status == "hit" else None, ttl)
    _warm_local(key, entry, ttl)

    threading.Thread(
        target=_bump_supabase_hit,
        args=(leg_key, hit_count),
        daemon=True,
        name="compose-leg-hit",
    ).start()
    return (status, data)


def set_cached_leg(
    mode: str,
    frm: str,
    to: str,
    priority: str,
    leg_dict: dict[str, Any] | None,
) -> None:
    key = _cache_key(mode, frm, to, priority)
    leg_key = _leg_key(mode, frm, to, priority)
    ttl = _SUCCESS_TTL_S if leg_dict else _FAIL_TTL_S
    slim = slim_leg_for_cache(leg_dict)
    entry = _entry_from_leg(leg_dict, ttl)
    _warm_local(key, entry, ttl)

    if not _supabase_enabled():
        return

    expires_at = datetime.fromtimestamp(time.time() + ttl, tz=timezone.utc).isoformat()
    threading.Thread(
        target=_persist_supabase,
        args=(leg_key, slim, frm, to, expires_at),
        daemon=True,
        name="compose-leg-persist",
    ).start()


def _persist_supabase(
    leg_key: str,
    slim: dict[str, Any] | None,
    frm: str,
    to: str,
    expires_at: str,
) -> None:
    status = "hit" if slim else "fail"
    supabase_client.rest_upsert(
        "compose_leg_cache",
        {
            "leg_key": leg_key,
            "status": status,
            "payload_gz_b64": _compress_payload(slim),
            "corridor_tags": _corridor_tags(frm, to),
            "expires_at": expires_at,
            "hit_count": 0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="leg_key",
    )


def _bump_supabase_hit(leg_key: str, current: int) -> None:
    supabase_client.rest_patch(
        "compose_leg_cache",
        {"leg_key": f"eq.{leg_key}"},
        {"hit_count": current + 1, "updated_at": datetime.now(timezone.utc).isoformat()},
    )


def clear_compose_leg_cache_for_tests() -> None:
    _mem.clear()
