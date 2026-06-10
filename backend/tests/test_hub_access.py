"""Feeder hub access for satellite stations under a metro."""
from app.services.hub_access import get_feeder_access
from app.services.location_funnel import resolve_location


def test_dabhoi_is_feeder_to_vadodara():
    loc = resolve_location("Dabhoi")
    access = get_feeder_access(loc)
    assert access is not None
    assert access.local_place.lower() == "dabhoi"
    assert access.hub_city == "Vadodara"
    assert access.local_station and "DABHOI" in access.local_station.upper()


def test_phaphamau_is_feeder_to_prayagraj():
    loc = resolve_location("Phaphamau")
    access = get_feeder_access(loc)
    assert access is not None
    assert access.local_place.lower() == "phaphamau"
    assert access.hub_city == "Prayagraj"
    assert access.local_station_code == "PFM"


def test_phulpur_is_feeder_to_prayagraj():
    loc = resolve_location("Phulpur")
    access = get_feeder_access(loc)
    assert access is not None
    assert access.hub_city == "Prayagraj"
    assert access.local_station_code == "PLP"


def test_vadodara_metro_not_feeder():
    loc = resolve_location("Vadodara")
    assert get_feeder_access(loc) is None


def test_delhi_metro_not_feeder():
    loc = resolve_location("Delhi")
    assert get_feeder_access(loc) is None
