"""Tests for PDF-backed location funnel."""
from __future__ import annotations

import math

import pytest

from app.pipelines.rail.route_finder import _resolve_stations
from app.services.location_funnel import (
    _pdf_match_too_broad,
    normalize_corridor,
    resolve_location,
)
from app.services.geocoder import geocode_latlng
from app.services.station_pdf_index import build_pdf_index, get_pdf_index


@pytest.fixture(scope="module", autouse=True)
def _ensure_pdf_index():
    records = build_pdf_index(force=True)
    assert len(records) > 5000, "station_name.pdf index failed to build"


def test_pdf_index_loaded():
    idx = get_pdf_index()
    assert len(idx.records) > 5000
    assert idx.lookup_code("PRYJ") is not None
    assert idx.lookup_code("BSB") is not None


def test_pryj_expands_full_prayagraj_district_from_pdf():
    loc = resolve_location("PRYJ")
    assert loc.canonical_city == "Prayagraj"
    assert "PRYJ" in loc.station_codes
    assert "ALD" in loc.station_codes
    assert len(loc.station_codes) >= 2
    assert loc.resolution.startswith("pdf_")


def test_bsb_expands_varanasi_district_from_pdf():
    loc = resolve_location("BSB")
    assert loc.canonical_city == "Varanasi"
    assert "BSB" in loc.station_codes
    assert len(loc.station_codes) >= 2


def test_banaras_resolves_via_pdf_station_name():
    loc = resolve_location("Banaras")
    assert loc.canonical_city == "Varanasi"
    assert "BSB" in loc.station_codes or "BSBS" in loc.station_codes


def test_rail_search_uses_full_pdf_clusters():
    src = _resolve_stations("PRYJ")
    dst = _resolve_stations("BSB")
    assert "PRYJ" in src and "ALD" in src
    assert "BSB" in dst


def test_blr_uses_airport_when_pdf_code_is_different_district():
    loc = resolve_location("BLR")
    assert loc.canonical_city == "Bengaluru"
    assert "SBC" in loc.station_codes


def test_normalize_corridor_pryj_bsb():
    src, dst = normalize_corridor("PRYJ", "BSB")
    assert src.canonical_city == "Prayagraj"
    assert dst.canonical_city == "Varanasi"


def test_pdf_match_too_broad_detects_village_suffix():
    assert _pdf_match_too_broad("Rampur Bekal", "Rampur", "Rampur", "Rampur") is True
    assert _pdf_match_too_broad("Delhi", "Delhi", "Delhi", "Delhi") is False
    assert _pdf_match_too_broad("New Delhi", "Delhi", "Delhi", "Delhi") is True


def test_geocoder_accepts_station_codes():
    pryj = geocode_latlng("PRYJ")
    bsb = geocode_latlng("BSB")
    assert pryj and bsb
    dist_km = 6371 * 2 * math.asin(
        math.sqrt(
            math.sin(math.radians(bsb[0] - pryj[0]) / 2) ** 2
            + math.cos(math.radians(pryj[0]))
            * math.cos(math.radians(bsb[0]))
            * math.sin(math.radians(bsb[1] - pryj[1]) / 2) ** 2
        )
    )
    assert 80 < dist_km < 200
