"""Compose corridors with feeder / satellite stations near metro hubs."""
from app.services.hub_access import get_feeder_access
from app.services.location_funnel import resolve_location
from app.services.route_composer import (
    RouteComposer,
    _SHORT_CORRIDOR_KM,
    _corridor_distance_for_resolution,
)
from app.utils.request_context import RequestContext


def test_phaphamau_is_feeder_to_prayagraj():
    loc = resolve_location("Phaphamau")
    access = get_feeder_access(loc)
    assert access is not None
    assert access.hub_city == "Prayagraj"
    assert access.local_station_code == "PFM"


def test_phulpur_is_feeder_to_prayagraj():
    loc = resolve_location("Phulpur")
    access = get_feeder_access(loc)
    assert access is not None
    assert access.hub_city == "Prayagraj"
    assert access.local_station_code == "PLP"


def test_feeder_corridor_not_classified_short():
    ctx = RequestContext()
    src = resolve_location("Phaphamau, India")
    dst = resolve_location("Lucknow, India")
    src_f = get_feeder_access(src)
    km = _corridor_distance_for_resolution(src, dst, src_f, None, ctx)
    assert km is not None
    assert km < _SHORT_CORRIDOR_KM
    assert src_f is not None


def test_compose_phaphamau_to_lucknow():
    result = RouteComposer().compose(
        "Phaphamau, India",
        "Lucknow, India",
        {"priority": "balanced", "cargo_weight_kg": 10, "compose_options": {"budget_seconds": 55}},
        RequestContext(),
    )
    assert not result.get("error"), result.get("error")
    assert result.get("recommended")
    assert result.get("feeder_corridor") is True
    template = result["recommended"].get("template_id") or ""
    assert template.startswith("feeder+")


def test_compose_phulpur_to_lucknow():
    result = RouteComposer().compose(
        "Phulpur, India",
        "Lucknow, India",
        {"priority": "balanced", "cargo_weight_kg": 10, "compose_options": {"budget_seconds": 55}},
        RequestContext(),
    )
    assert not result.get("error"), result.get("error")
    assert result.get("recommended")
    assert result.get("feeder_corridor") is True


def test_feeder_without_access_leg_not_mislabeled():
    """Hub-only legs must not appear when local feeder access could not be scheduled."""
    from unittest.mock import patch

    composer = RouteComposer()
    with patch.object(RouteComposer, "_fetch_access_leg", return_value=None):
        result = composer.compose(
            "Phaphamau, India",
            "Lucknow, India",
            {"priority": "balanced", "compose_options": {"budget_seconds": 20}},
            RequestContext(),
        )
    assert not result.get("recommended")
    assert result.get("feeder_corridor") is True
    assert "feeder:in" in (result.get("unavailable_templates") or {})
