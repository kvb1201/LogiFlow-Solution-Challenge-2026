
"""
Concurrency cap and response cache for POST /optimize (abuse / DoS mitigation).
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from collections import OrderedDict
from typing import Any

from fastapi import HTTPException


def _env_bool(name: str, default: str = "true") -> bool:
    return os.getenv(name, default).lower() in ("1", "true", "yes")


_MAX_CONCURRENT = max(1, int(os.getenv("OPTIMIZE_MAX_CONCURRENT", "5")))
_CACHE_TTL_S = max(60, int(os.getenv("OPTIMIZE_CACHE_TTL_S", "3600")))
_CACHE_MAX = max(10, int(os.getenv("OPTIMIZE_CACHE_MAX_ENTRIES", "200")))

_semaphore = threading.BoundedSemaphore(_MAX_CONCURRENT)
_cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
_cache_lock = threading.Lock()


def cache_enabled() -> bool:
    return _env_bool("OPTIMIZE_CACHE_ENABLED", "true")


def optimize_request_key(data: Any) -> str:
    """Stable hash from optimize request body (Pydantic model or dict)."""
    if hasattr(data, "model_dump"):
        raw = data.model_dump(mode="json")
    else:
        raw = data
    blob = json.dumps(raw, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()


def get_cached_optimize(key: str) -> Any | None:
    if not cache_enabled():
        return None
    now = time.time()
    with _cache_lock:
        entry = _cache.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at <= now:
            _cache.pop(key, None)
            return None
        _cache.move_to_end(key)
        return value


def set_cached_optimize(key: str, value: Any) -> None:
    if not cache_enabled():
        return
    with _cache_lock:
        _cache[key] = (time.time() + _CACHE_TTL_S, value)
        _cache.move_to_end(key)
        while len(_cache) > _CACHE_MAX:
            _cache.popitem(last=False)


class optimize_slot:
    """Limit simultaneous /optimize pipeline runs."""

    def __enter__(self) -> optimize_slot:
        if not _semaphore.acquire(blocking=False):
            raise HTTPException(
                status_code=503,
                detail="Server is processing too many optimize requests. Please retry shortly.",
                headers={"Retry-After": "5"},
            )
        return self

    def __exit__(self, *_args: object) -> None:
        _semaphore.release()
