"""
Per-IP rate limiting via slowapi (in-memory or Redis when REDIS_URL is set).
Disable in tests with RATE_LIMIT_ENABLED=false.
"""

from __future__ import annotations

import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _rate_limits_enabled() -> bool:
    return os.getenv("RATE_LIMIT_ENABLED", "true").lower() in ("1", "true", "yes")


def _client_ip(request: Request) -> str:
    """Prefer X-Forwarded-For when behind Vercel rewrites or a reverse proxy."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


def _storage_uri() -> str:
    """In-memory by default (fine for Render's single worker). Opt in to Redis explicitly."""
    use_redis = os.getenv("RATE_LIMIT_USE_REDIS", "").lower() in ("1", "true", "yes")
    if use_redis:
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            return redis_url
    return "memory://"


limiter = Limiter(key_func=_client_ip, storage_uri=_storage_uri())


def rate_limit(limit: str):
    """Apply slowapi limit when enabled; no-op otherwise."""

    def decorator(func):
        if _rate_limits_enabled():
            return limiter.limit(limit)(func)
        return func

    return decorator


# Defaults — override via env for tuning / load tests
OPTIMIZE_LIMIT = os.getenv("RATE_LIMIT_OPTIMIZE_PER_MINUTE", "8") + "/minute"
COMPOSE_LIMIT = os.getenv("RATE_LIMIT_COMPOSE_PER_MINUTE", "8") + "/minute"
INTENT_LIMIT = os.getenv("RATE_LIMIT_INTENT_PER_MINUTE", "8") + "/minute"
AUTH_LOGIN_LIMIT = os.getenv("RATE_LIMIT_AUTH_LOGIN_PER_MINUTE", "20") + "/minute"
ASSISTANT_LIMIT = os.getenv("RATE_LIMIT_ASSISTANT_PER_MINUTE", "5") + "/minute"
