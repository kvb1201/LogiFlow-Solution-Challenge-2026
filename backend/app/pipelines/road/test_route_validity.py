"""
Route validity validation tests.

Tests that physically impossible road routes are correctly rejected
and that valid continental routes are correctly accepted.

Run with:
    python -m pytest app/pipelines/road/test_route_validity.py -v
or:
    python app/pipelines/road/test_route_validity.py
"""
from __future__ import annotations

import os
import sys

# Allow running directly from the backend/ directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from app.pipelines.road.route_validator import (
    validate_corridor,
    is_physically_drivable,
    _haversine_km,
)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _approx_coords(city: str):
    """Return known approximate coords for test cities."""
    _COORDS = {
        "london":        (51.5074, -0.1278),
        "new york":      (40.7128, -74.0060),
        "mumbai":        (19.0760, 72.8777),
        "sydney":        (-33.8688, 151.2093),
        "melbourne":     (-37.8136, 144.9631),
        "delhi":         (28.6139, 77.2090),
        "paris":         (48.8566, 2.3522),
        "dubai":         (25.2048, 55.2708),
        "toronto":       (43.6532, -79.3832),
        "los angeles":   (34.0522, -118.2437),
        "bangalore":     (12.9716, 77.5946),
        "chennai":       (13.0827, 80.2707),
    }
    return _COORDS.get(city.lower())


# ---------------------------------------------------------------------------
# Individual validator unit tests
# ---------------------------------------------------------------------------

def test_london_to_new_york_invalid():
    """London → New York: trans-Atlantic, must be rejected."""
    src = _approx_coords("london")
    dst = _approx_coords("new york")
    valid, reason = validate_corridor(src, dst)
    assert not valid, f"Expected invalid, got valid. Reason: {reason}"
    assert "road" in reason.lower() or "drivable" in reason.lower() or "no drivable" in reason.lower(), \
        f"Reason should mention drivability: {reason}"
    print(f"[PASS] London → New York rejected: {reason}")


def test_mumbai_to_london_invalid():
    """Mumbai → London: requires crossing ocean/impassable terrain, must be rejected."""
    src = _approx_coords("mumbai")
    dst = _approx_coords("london")
    # Haversine ~7,200 km — exceeds _MAX_ROAD_DISTANCE_KM
    # Also Europe ↔ Asia: not in OCEAN_SEPARATED, but distance guard should catch it
    valid, reason = validate_corridor(src, dst)
    assert not valid, f"Expected invalid (Mumbai→London), got valid. Reason: {reason}"
    print(f"[PASS] Mumbai → London rejected: {reason}")


def test_sydney_to_melbourne_valid():
    """Sydney → Melbourne: both in Oceania, ~714 km — should be accepted."""
    src = _approx_coords("sydney")
    dst = _approx_coords("melbourne")
    dist = _haversine_km(src[0], src[1], dst[0], dst[1])
    valid, reason = validate_corridor(src, dst)
    assert valid, f"Expected valid (Sydney→Melbourne, {dist:.0f} km), got invalid: {reason}"
    print(f"[PASS] Sydney → Melbourne accepted ({dist:.0f} km)")


def test_delhi_to_mumbai_valid():
    """Delhi → Mumbai: both in Asia, ~1,150 km — should be accepted."""
    src = _approx_coords("delhi")
    dst = _approx_coords("mumbai")
    dist = _haversine_km(src[0], src[1], dst[0], dst[1])
    valid, reason = validate_corridor(src, dst)
    assert valid, f"Expected valid (Delhi→Mumbai, {dist:.0f} km), got invalid: {reason}"
    print(f"[PASS] Delhi → Mumbai accepted ({dist:.0f} km)")


def test_toronto_to_los_angeles_valid():
    """Toronto → Los Angeles: both in North America, ~3,500 km — should be accepted."""
    src = _approx_coords("toronto")
    dst = _approx_coords("los angeles")
    dist = _haversine_km(src[0], src[1], dst[0], dst[1])
    valid, reason = validate_corridor(src, dst)
    assert valid, f"Expected valid (Toronto→LA, {dist:.0f} km), got invalid: {reason}"
    print(f"[PASS] Toronto → Los Angeles accepted ({dist:.0f} km)")


def test_london_to_paris_valid():
    """London → Paris: both in Europe, ~340 km — should be accepted."""
    src = _approx_coords("london")
    dst = _approx_coords("paris")
    dist = _haversine_km(src[0], src[1], dst[0], dst[1])
    valid, reason = validate_corridor(src, dst)
    assert valid, f"Expected valid (London→Paris, {dist:.0f} km), got invalid: {reason}"
    print(f"[PASS] London → Paris accepted ({dist:.0f} km)")


def test_bangalore_to_chennai_valid():
    """Bangalore → Chennai: both in Asia/India, ~290 km — should be accepted."""
    src = _approx_coords("bangalore")
    dst = _approx_coords("chennai")
    dist = _haversine_km(src[0], src[1], dst[0], dst[1])
    valid, reason = validate_corridor(src, dst)
    assert valid, f"Expected valid (Bangalore→Chennai, {dist:.0f} km), got invalid: {reason}"
    print(f"[PASS] Bangalore → Chennai accepted ({dist:.0f} km)")


# ---------------------------------------------------------------------------
# Pipeline-level integration tests (no TomTom API calls — mocked/offline)
# ---------------------------------------------------------------------------

def test_pipeline_london_new_york_returns_no_routes():
    """
    Full pipeline test: London → New York, Road mode.
    Should return status='no_routes' with valid=False.
    Should NOT contain fabricated distances, highways, traffic, or confidence.
    """
    from app.pipelines.road.pipeline import RoadPipeline

    pipeline = RoadPipeline()
    result = pipeline.generate(
        "London",
        "New York",
        {
            "mode": "realtime",
            "priority": "balanced",
            "cargo_weight_kg": 100,
        },
    )

    assert result.get("status") == "no_routes", \
        f"Expected status='no_routes', got: {result.get('status')!r}. Full result keys: {list(result.keys())}"
    assert result.get("valid") is False, \
        f"Expected valid=False, got: {result.get('valid')!r}"
    assert result.get("best") is None, \
        f"Expected best=None (no fabricated route), got: {result.get('best')}"
    assert result.get("all") == [], \
        f"Expected empty all[], got: {result.get('all')}"

    reason = result.get("message") or result.get("reason", "")
    assert reason, "Expected a non-empty reason/message explaining why the route is invalid"

    print(f"[PASS] Pipeline London → New York (Road) → no_routes: {reason}")


def test_pipeline_mumbai_london_returns_no_routes():
    """
    Full pipeline test: Mumbai → London, Road mode.
    Should return status='no_routes' — no fabricated trans-continental route.
    """
    from app.pipelines.road.pipeline import RoadPipeline

    pipeline = RoadPipeline()
    result = pipeline.generate(
        "Mumbai",
        "London",
        {
            "mode": "realtime",
            "priority": "balanced",
            "cargo_weight_kg": 100,
        },
    )

    assert result.get("status") == "no_routes", \
        f"Expected status='no_routes' for Mumbai→London, got: {result.get('status')!r}"
    assert result.get("best") is None, \
        "Expected best=None — no fabricated route should exist"
    print(f"[PASS] Pipeline Mumbai → London (Road) → no_routes")


def test_pipeline_sydney_melbourne_does_not_reject():
    """
    Full pipeline test: Sydney → Melbourne, Road mode.
    The corridor is valid; the pipeline may succeed or fail based on TomTom availability,
    but it must NOT return status='no_routes' due to a validity rejection.
    """
    from app.pipelines.road.pipeline import RoadPipeline

    pipeline = RoadPipeline()
    result = pipeline.generate(
        "Sydney",
        "Melbourne",
        {
            "mode": "realtime",
            "priority": "balanced",
            "cargo_weight_kg": 100,
        },
    )

    # If no_routes, it must NOT be due to corridor invalidity (valid=False)
    if result.get("status") == "no_routes":
        assert result.get("valid") is not False, \
            "Sydney → Melbourne was incorrectly rejected as invalid corridor"
    print(f"[PASS] Pipeline Sydney → Melbourne (Road) — corridor not rejected as invalid")


def test_pipeline_delhi_mumbai_does_not_reject():
    """
    Full pipeline test: Delhi → Mumbai, Road mode.
    Valid corridor — must not be rejected as invalid.
    """
    from app.pipelines.road.pipeline import RoadPipeline

    pipeline = RoadPipeline()
    result = pipeline.generate(
        "Delhi",
        "Mumbai",
        {
            "mode": "realtime",
            "priority": "balanced",
            "cargo_weight_kg": 100,
        },
    )

    if result.get("status") == "no_routes":
        assert result.get("valid") is not False, \
            "Delhi → Mumbai was incorrectly rejected as invalid corridor"
    print(f"[PASS] Pipeline Delhi → Mumbai (Road) — corridor not rejected as invalid")


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def run_all():
    tests = [
        # Validator unit tests
        test_london_to_new_york_invalid,
        test_mumbai_to_london_invalid,
        test_sydney_to_melbourne_valid,
        test_delhi_to_mumbai_valid,
        test_toronto_to_los_angeles_valid,
        test_london_to_paris_valid,
        test_bangalore_to_chennai_valid,
        # Pipeline integration tests
        test_pipeline_london_new_york_returns_no_routes,
        test_pipeline_mumbai_london_returns_no_routes,
        test_pipeline_sydney_melbourne_does_not_reject,
        test_pipeline_delhi_mumbai_does_not_reject,
    ]

    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except AssertionError as e:
            print(f"[FAIL] {t.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"[ERROR] {t.__name__}: {type(e).__name__}: {e}")
            failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)} tests")
    if failed:
        sys.exit(1)
    else:
        print("All tests passed.")


if __name__ == "__main__":
    run_all()
