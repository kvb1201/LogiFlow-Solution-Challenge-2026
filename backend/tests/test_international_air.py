"""International air routing tests — backward compatible with Indian corridors."""
from __future__ import annotations

import unittest

from app.pipelines.air import AirPipeline
from app.services.air_data_service import get_live_air_routes
from app.services.air_timezone_service import build_route_schedule, parse_departure_utc
from app.services.airport_locator_service import get_airport_by_iata, resolve_city_to_airport
from app.services.otp_scoring_service import get_otp_scoring_service
from app.services.weather_service import get_weather, get_weather_by_coords


class AirportLookupTests(unittest.TestCase):
    def test_indian_city_unchanged(self):
        airport = resolve_city_to_airport("Delhi")
        self.assertEqual(airport["code"], "DEL")

    def test_international_city_alias(self):
        airport = resolve_city_to_airport("Dubai")
        self.assertEqual(airport["code"], "DXB")
        self.assertIsNotNone(airport.get("lat"))

    def test_iata_code_input(self):
        airport = resolve_city_to_airport("JFK")
        self.assertEqual(airport["code"], "JFK")
        self.assertEqual(airport.get("timezone"), "America/New_York")

    def test_get_airport_by_iata_international(self):
        fra = get_airport_by_iata("FRA")
        self.assertIsNotNone(fra)
        self.assertEqual(fra["code"], "FRA")
        self.assertIsNotNone(fra.get("timezone"))


class WeatherTests(unittest.TestCase):
    def test_city_weather_still_works(self):
        result = get_weather("Mumbai")
        self.assertIn("temp", result)
        self.assertIn("condition", result)

    def test_coordinate_weather(self):
        airport = get_airport_by_iata("BLR")
        self.assertIsNotNone(airport)
        result = get_weather_by_coords(airport["lat"], airport["lng"])
        self.assertIn("temp", result)
        self.assertIn("condition", result)


class OtpScoringTests(unittest.TestCase):
    def test_indian_airport_month_lookup_unchanged(self):
        otp, source = get_otp_scoring_service().lookup_baseline_otp("DEL", "2026-07-15")
        self.assertEqual(source, "airport_month")
        self.assertAlmostEqual(otp, 0.71)

    def test_international_airport_baseline(self):
        otp, source = get_otp_scoring_service().lookup_baseline_otp("DXB", "2026-04-10")
        self.assertEqual(source, "airport_baseline")
        self.assertGreaterEqual(otp, 0.75)

    def test_unknown_airport_region_or_global_fallback(self):
        otp, source = get_otp_scoring_service().lookup_baseline_otp("XYZ", "2026-04-10")
        self.assertIn(source, {"global_default", "region_baseline"})
        self.assertGreaterEqual(otp, 0.0)
        self.assertLessEqual(otp, 1.0)


class TimezoneTests(unittest.TestCase):
    def test_departure_utc_from_indian_airport(self):
        del_airport = get_airport_by_iata("DEL") or {"code": "DEL", "timezone": "Asia/Kolkata"}
        utc = parse_departure_utc("2026-04-10T10:00:00", del_airport)
        self.assertEqual(utc.hour, 4)
        self.assertEqual(utc.minute, 30)

    def test_route_schedule_fields(self):
        source = get_airport_by_iata("DEL")
        dest = get_airport_by_iata("FRA")
        schedule = build_route_schedule("2026-04-10T10:00:00", 9.0, source, dest)
        for key in ("departure_local", "arrival_local", "departure_utc", "arrival_utc"):
            self.assertIn(key, schedule)
            self.assertTrue(schedule[key])


class RouteGraphTests(unittest.TestCase):
    CORRIDORS = [
        ("Bengaluru", "Dubai", "BLR", "DXB"),
        ("Delhi", "Frankfurt", "DEL", "FRA"),
        ("New York", "London", "JFK", "LHR"),
        ("Singapore", "Hong Kong", "SIN", "HKG"),
        ("Los Angeles", "Tokyo", "LAX", "NRT"),
        ("Singapore", "Sydney", "SIN", "SYD"),
        ("Mumbai", "New York", "BOM", "JFK"),
    ]

    def test_international_direct_or_one_stop(self):
        for source, dest, src_code, dst_code in self.CORRIDORS:
            routes = get_live_air_routes(source, dest, "2026-04-10")
            self.assertGreater(
                len(routes),
                0,
                f"Expected routes for {source} -> {dest} ({src_code}->{dst_code})",
            )
            src = routes[0]["source_airport"]["code"]
            dst = routes[0]["destination_airport"]["code"]
            self.assertEqual(src, src_code)
            self.assertEqual(dst, dst_code)

    def test_indian_corridor_unchanged(self):
        routes = get_live_air_routes("Delhi", "Mumbai", "2026-04-10")
        self.assertGreater(len(routes), 0)
        self.assertEqual(routes[0]["source_airport"]["code"], "DEL")
        self.assertEqual(routes[0]["destination_airport"]["code"], "BOM")


class PipelineIntegrationTests(unittest.TestCase):
    def test_international_pipeline_response_shape(self):
        pipeline = AirPipeline()
        result = pipeline.generate(
            "Delhi",
            "Frankfurt",
            {
                "priority": "balanced",
                "departure_date": "2026-04-10",
                "cargo": {"weight": 200, "type": "general"},
            },
        )
        routes = result.get("all") or []
        self.assertGreater(len(routes), 0)
        details = routes[0]["air_details"]
        self.assertIn("schedule", details)
        self.assertIn("departure_utc", details)
        self.assertIn("otp_prediction", routes[0])


if __name__ == "__main__":
    unittest.main()
