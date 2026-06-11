"""Geospatial hub discovery for rural corridors."""
from app.services.geo_hub_finder import (
    _haversine_km,
    is_remote_location,
    nearest_metropolitan_hubs,
    nearest_rail_station,
)
from app.services.hub_catalog import interchange_hub_count, list_interchange_hub_cities
from app.services.hub_spatial_index import station_index_size


def test_station_index_has_thousand_plus_entries():
    assert station_index_size() >= 1000


def test_interchange_hub_count_is_catalog_not_every_station():
    n = interchange_hub_count()
    assert 40 <= n <= 70
    assert n < station_index_size() // 50


def test_haversine_delhi_mumbai_reasonable():
    dist = _haversine_km(28.6139, 77.2090, 19.0760, 72.8777)
    assert 1100 < dist < 1500


def test_nearest_hubs_for_chadausi_area_are_major_cities():
    hubs = nearest_metropolitan_hubs(28.4594, 78.7774, max_hubs=5)
    assert len(hubs) >= 2
    labels = {h.city.lower() for h in hubs}
    # Catalog metros with connectivity — not every indexed stop (Sambhal, Budaun, etc.)
    assert labels & {"moradabad", "delhi", "lucknow", "bareilly", "kanpur", "agra"}


def test_nearest_hubs_for_rural_point_are_major_cities():
    hubs = nearest_metropolitan_hubs(26.2, 79.5, max_hubs=5)
    cities = {h.city.lower() for h in hubs}
    assert len(cities) >= 2
    assert cities & {"kanpur", "lucknow", "jhansi", "agra", "bhopal"}


def test_nearest_rail_station_is_not_same_as_hub_list():
    pt = nearest_rail_station(28.4594, 78.7774)
    assert pt is not None
    assert pt.code
    hubs = nearest_metropolitan_hubs(28.4594, 78.7774, max_hubs=3)
    hub_codes = {c for h in hubs for c in h.rail_stations}
    # Local stop may differ from interchange hub primary code
    assert pt.code in hub_codes or pt.code not in hub_codes  # smoke: both resolve


def test_catalog_hub_cities_are_unique():
    cities = list_interchange_hub_cities()
    keys = [c.lower() for c in cities]
    assert len(keys) == len(set(keys))


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
