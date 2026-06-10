"""Rate limiting, optimize cache, and concurrency guard tests."""

from __future__ import annotations

import threading

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.middleware import optimize_guard
from app.middleware.optimize_guard import (
    get_cached_optimize,
    optimize_request_key,
    optimize_slot,
    set_cached_optimize,
)
from app.routes.optimize import OptimizeRequest


@pytest.fixture(autouse=True)
def _enable_security_features(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("OPTIMIZE_CACHE_ENABLED", "true")
    monkeypatch.setenv("OPTIMIZE_MAX_CONCURRENT", "1")


def test_optimize_cache_roundtrip():
    req = OptimizeRequest(source="Mumbai", destination="Delhi", priority="fast")
    key = optimize_request_key(req)
    assert get_cached_optimize(key) is None
    set_cached_optimize(key, {"status": "ok", "modes": []})
    assert get_cached_optimize(key) == {"status": "ok", "modes": []}


def test_optimize_slot_returns_503_when_saturated(monkeypatch):
    monkeypatch.setattr(optimize_guard, "_semaphore", threading.BoundedSemaphore(1))
    with optimize_slot():
        with pytest.raises(HTTPException) as exc:
            with optimize_slot():
                pass
    assert exc.value.status_code == 503
    assert exc.value.headers.get("Retry-After") == "5"


def test_health_is_not_rate_limited():
    from app.main import app

    client = TestClient(app)
    for _ in range(30):
        resp = client.get("/health")
        assert resp.status_code == 200


def test_rate_limit_storage_defaults_to_memory(monkeypatch):
    monkeypatch.delenv("RATE_LIMIT_USE_REDIS", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)

    import importlib
    import app.middleware.rate_limit as rate_limit_mod

    importlib.reload(rate_limit_mod)
    assert rate_limit_mod._storage_uri() == "memory://"
