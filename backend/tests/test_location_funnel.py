"""Tests for centralized location resolution funnel."""
from __future__ import annotations

import math

import pytest

from app.services.location_funnel import normalize_corridor, resolve_location
from app.services.geocoder import geocode_latlng


def test_station_code_pryj_resolves_to_prayagraj():
    loc = resolve_location("PRYJ")
    assert loc.canonical_city == "Prayagraj"
    assert loc.station_code == "PRYJ"
    assert loc.resolution == "station_code"


def test_station_code_bsb_resolves_to_varanasi():
    loc = resolve_location("BSB")
    assert loc.canonical_city == "Varanasi"
    assert loc.station_code == "BSB"


def test_banaras_alias():
    loc = resolve_location("Banaras")
    assert loc.canonical_city == "Varanasi"


def test_geocoder_accepts_station_codes():
    pryj = geocode_latlng("PRYJ")
    bsb = geocode_latlng("BSB")
    assert pryj is not None
    assert bsb is not None
    dist_km = 6371 * 2 * math.asin(
        math.sqrt(
            math.sin(math.radians(bsb[0] - pryj[0]) / 2) ** 2
            + math.cos(math.radians(pryj[0]))
            * math.cos(math.radians(bsb[0]))
            * math.sin(math.radians(bsb[1] - pryj[1]) / 2) ** 2
        )
    )
    assert 80 < dist_km < 200


def test_normalize_corridor_pryj_bsb():
    src, dst = normalize_corridor("PRYJ", "BSB")
    assert src.canonical_city == "Prayagraj"
    assert dst.canonical_city == "Varanasi"
    assert src.lat is not None
    assert dst.lat is not None


def test_compose_short_corridor_detection():
    from app.services.route_composer import _corridor_distance_km
    from app.utils.request_context import RequestContext

    ctx = RequestContext()
    km = _corridor_distance_km("Prayagraj", "Varanasi", ctx)
    assert km is not None
    assert km < 200
