"""Geospatial hub discovery for rural corridors."""
from app.services.geo_hub_finder import (
    _haversine_km,
    is_remote_location,
    nearest_metropolitan_hubs,
)
from app.services.hub_spatial_index import hub_index_size


def test_hub_index_has_thousand_plus_entries():
    assert hub_index_size() >= 1000


def test_haversine_delhi_mumbai_reasonable():
    # Delhi ~28.61, 77.21 — Mumbai ~19.08, 72.88
    dist = _haversine_km(28.6139, 77.2090, 19.0760, 72.8777)
    assert 1100 < dist < 1500


def test_nearest_hubs_for_chadausi_area():
    # Chadausi UP — should pick a nearby indexed station, not require metro geocoding
    hubs = nearest_metropolitan_hubs(28.4594, 78.7774, max_hubs=5)
    assert len(hubs) >= 2
    labels = {h.city.lower() for h in hubs}
    assert labels & {"sambhal", "moradabad", "budaun", "badaun"}


def test_nearest_hubs_for_rural_point():
    # Rough coords inland UP (not a mapped metro)
    hubs = nearest_metropolitan_hubs(26.2, 79.5, max_hubs=3)
    cities = [h.city for h in hubs]
    assert len(cities) >= 2
    # Nearest indexed stations in Jalaun / Orai / Pokhrayan belt
    assert any(c.lower() in {"jalaun", "pokhrayan", "orai", "chaunrah", "jhinjhak"} for c in cities)


def test_mapped_metro_not_remote():
    assert (
        is_remote_location(
            canonical_city="Delhi",
            station_codes=["NDLS"],
            lat=28.6,
            lng=77.2,
        )
        is False
    )


def test_unknown_village_is_remote():
    assert (
        is_remote_location(
            canonical_city="Rampur Bekal",
            station_codes=[],
            lat=28.5,
            lng=79.1,
        )
        is True
    )


def test_village_geocoded_resolution_is_remote():
    assert (
        is_remote_location(
            canonical_city="Rampur",
            station_codes=["RMU"],
            lat=28.8,
            lng=79.0,
            resolution="village_geocoded",
        )
        is True
    )
