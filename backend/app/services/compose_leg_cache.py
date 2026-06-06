"""TTL cache for composed pipeline legs — speeds repeat & similar corridor requests."""
from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any

_SUCCESS_TTL_S = int(os.getenv("COMPOSE_LEG_CACHE_TTL_S", str(6 * 3600)))
_FAIL_TTL_S = 120
_PREFIX = "compose:leg:"

_mem: dict[str, dict[str, Any]] = {}
_redis = None
_redis_ok = False


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


def _cache_key(mode: str, frm: str, to: str, priority: str) -> str:
    raw = f"{mode.lower()}|{frm}|{to}|{priority.lower()}"
    return _PREFIX + hashlib.md5(raw.encode()).hexdigest()


def get_cached_leg(mode: str, frm: str, to: str, priority: str) -> tuple[str, dict[str, Any] | None] | None:
    """Return ('hit', leg_dict) or ('miss', None) or ('fail', None) if cached failure."""
    key = _cache_key(mode, frm, to, priority)
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

    return None


def set_cached_leg(
    mode: str,
    frm: str,
    to: str,
    priority: str,
    leg_dict: dict[str, Any] | None,
) -> None:
    key = _cache_key(mode, frm, to, priority)
    ttl = _SUCCESS_TTL_S if leg_dict else _FAIL_TTL_S
    entry = {"data": leg_dict, "expires_at": time.time() + ttl}
    _mem[key] = entry

    _init_redis()
    if _redis_ok and _redis:
        try:
            _redis.setex(key, ttl, json.dumps(entry))
        except Exception:
            pass
