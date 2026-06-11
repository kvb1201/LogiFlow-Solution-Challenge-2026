"""Compose leg cache — gzip round-trip and Supabase tier."""
from __future__ import annotations

import base64
import gzip
import json
import time

import pytest

from app.services import compose_leg_cache as cache
from app.services import rural_hub_cache as hub_cache
from app.services.geo_hub_finder import HubPair
from app.services.hub_catalog import Hub


@pytest.fixture(autouse=True)
def _clear_caches():
    cache.clear_compose_leg_cache_for_tests()
    hub_cache.clear_rural_hub_cache_for_tests()
    yield
    cache.clear_compose_leg_cache_for_tests()
    hub_cache.clear_rural_hub_cache_for_tests()


def test_slim_leg_strips_segments():
    full = {
        "mode": "rail",
        "source": "Delhi",
        "destination": "Vadodara",
        "time_hr": 12.5,
        "cost_inr": 800,
        "risk": 0.1,
        "status": "ok",
        "segments": [{"train": "12951"}],
        "explanation": "long",
    }
    slim = cache.slim_leg_for_cache(full)
    assert slim == {
        "mode": "rail",
        "source": "Delhi",
        "destination": "Vadodara",
        "time_hr": 12.5,
        "cost_inr": 800,
        "risk": 0.1,
        "status": "ok",
    }
    assert "segments" not in slim


def test_gzip_round_trip():
    slim = {"mode": "road", "source": "a", "destination": "b", "time_hr": 1.0, "cost_inr": 100, "risk": 0.2, "status": "ok"}
    b64 = cache._compress_payload(slim)
    assert b64
    raw = gzip.decompress(base64.b64decode(b64))
    assert len(raw) < len(json.dumps(slim).encode()) + 50
    assert cache._decompress_payload(b64) == slim


def test_memory_cache_hit_and_fail(monkeypatch):
    monkeypatch.setattr(cache, "_supabase_enabled", lambda: False)
    monkeypatch.setattr(cache, "_redis_ok", False)

    leg = {"mode": "rail", "source": "delhi", "destination": "mumbai", "time_hr": 16.0, "cost_inr": 1200, "risk": 0.15, "status": "ok"}
    cache.set_cached_leg("rail", "Delhi", "Mumbai", "balanced", leg)
    hit = cache.get_cached_leg("rail", "Delhi", "Mumbai", "balanced")
    assert hit == ("hit", cache.slim_leg_for_cache(leg))

    cache.set_cached_leg("air", "Delhi", "Goa", "fast", None)
    miss = cache.get_cached_leg("air", "Delhi", "Goa", "fast")
    assert miss == ("fail", None)


def test_supabase_backfill_on_miss(monkeypatch):
    monkeypatch.setattr(cache, "_redis_ok", False)
    monkeypatch.setattr(cache, "_supabase_enabled", lambda: True)

    leg_key = cache._leg_key("rail", "vadodara", "dabhoi", "balanced")
    slim = {"mode": "rail", "source": "vadodara", "destination": "dabhoi", "time_hr": 0.5, "cost_inr": 50, "risk": 0.05, "status": "ok"}
    b64 = cache._compress_payload(slim)

    def fake_get(table, params, **kwargs):
        assert table == "compose_leg_cache"
        assert params["leg_key"] == f"eq.{leg_key}"
        return [{"status": "hit", "payload_gz_b64": b64, "hit_count": 3}]

    patched = []

    def fake_patch(table, match_params, body, **kwargs):
        patched.append((table, match_params, body))
        return True

    monkeypatch.setattr("app.services.compose_leg_cache.supabase_client.rest_get", fake_get)
    monkeypatch.setattr("app.services.compose_leg_cache.supabase_client.rest_patch", fake_patch)

    result = cache.get_cached_leg("rail", "Vadodara", "Dabhoi", "balanced")
    assert result == ("hit", slim)

    # local tiers warmed
    again = cache.get_cached_leg("rail", "Vadodara", "Dabhoi", "balanced")
    assert again == ("hit", slim)

    time.sleep(0.05)
    assert patched and patched[0][0] == "compose_leg_cache"


def test_supabase_persist_on_set(monkeypatch):
    monkeypatch.setattr(cache, "_redis_ok", False)
    monkeypatch.setattr(cache, "_supabase_enabled", lambda: True)

    saved = []

    def fake_upsert(table, row, on_conflict):
        saved.append((table, row, on_conflict))
        return True

    monkeypatch.setattr("app.services.compose_leg_cache.supabase_client.rest_upsert", fake_upsert)

    leg = {"mode": "road", "source": "delhi", "destination": "dabhoi", "time_hr": 8.0, "cost_inr": 4000, "risk": 0.2, "status": "ok", "segments": []}
    cache.set_cached_leg("road", "Delhi", "Dabhoi", "cheap", leg)
    time.sleep(0.1)
    assert saved
    table, row, on_conflict = saved[0]
    assert table == "compose_leg_cache"
    assert on_conflict == "leg_key"
    assert row["status"] == "hit"
    assert row["leg_key"] == cache._leg_key("road", "Delhi", "Dabhoi", "cheap")
    assert cache._decompress_payload(row["payload_gz_b64"]) == cache.slim_leg_for_cache(leg)


def test_rural_hub_cache_round_trip(monkeypatch):
    monkeypatch.setattr(hub_cache, "_enabled", lambda: False)

    pair = HubPair(
        origin_hub=Hub(
            city="Delhi",
            display_name="Delhi",
            rail_stations=["NDLS"],
            airport_code="DEL",
            on_route=True,
        ),
        dest_hub=Hub(
            city="Vadodara",
            display_name="Vadodara",
            rail_stations=["BRC"],
            airport_code="BDQ",
            on_route=True,
        ),
    )
    key = hub_cache.rural_hub_cache_key(28.6, 77.2, 22.3, 73.2, max_pairs=6, hubs_per_end=3)
    hub_cache.set_cached_rural_hub_pairs(key, [pair])
    loaded = hub_cache.get_cached_rural_hub_pairs(key)
    assert loaded and len(loaded) == 1
    assert loaded[0].origin_hub.city == "Delhi"
    assert loaded[0].dest_hub.city == "Vadodara"
