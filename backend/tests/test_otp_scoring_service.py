"""Unit tests for OTP Congestion Scoring."""
from __future__ import annotations

import unittest
from datetime import datetime
from pathlib import Path

from app.services.otp_scoring_service import (
    OTPScoringService,
    categorize_congestion,
    inbound_delay_penalty,
    parse_departure_time,
    peak_hour_penalty,
    weather_penalty_from_api_response,
    weekend_penalty,
)

BASELINES = Path(__file__).resolve().parents[1] / "data" / "otp-baselines.json"


class WeatherPenaltyTests(unittest.TestCase):
    def test_clear_is_zero(self):
        self.assertEqual(weather_penalty_from_api_response({"condition": "Clear"}), 0.0)

    def test_clouds(self):
        self.assertEqual(weather_penalty_from_api_response({"condition": "Clouds"}), 0.02)

    def test_rain(self):
        self.assertEqual(weather_penalty_from_api_response({"condition": "Rain"}), 0.05)

    def test_drizzle(self):
        self.assertEqual(weather_penalty_from_api_response({"condition": "Drizzle"}), 0.04)

    def test_thunderstorm(self):
        self.assertEqual(weather_penalty_from_api_response({"condition": "Thunderstorm"}), 0.12)

    def test_fog_mist_haze(self):
        self.assertEqual(weather_penalty_from_api_response({"condition": "Fog"}), 0.10)
        self.assertEqual(weather_penalty_from_api_response({"condition": "Mist"}), 0.10)
        self.assertEqual(weather_penalty_from_api_response({"condition": "Haze"}), 0.10)


class PenaltyHelperTests(unittest.TestCase):
    def test_peak_morning(self):
        self.assertEqual(peak_hour_penalty(datetime(2026, 4, 10, 8, 0)), 0.03)

    def test_peak_evening(self):
        self.assertEqual(peak_hour_penalty(datetime(2026, 4, 10, 18, 0)), 0.03)

    def test_off_peak(self):
        self.assertEqual(peak_hour_penalty(datetime(2026, 4, 10, 14, 0)), 0.0)

    def test_weekend(self):
        self.assertEqual(weekend_penalty(datetime(2026, 4, 11, 10, 0)), 0.01)  # Saturday

    def test_weekday(self):
        self.assertEqual(weekend_penalty(datetime(2026, 4, 10, 10, 0)), 0.0)  # Friday

    def test_inbound_delay_cap(self):
        self.assertEqual(inbound_delay_penalty(0), 0.0)
        self.assertEqual(inbound_delay_penalty(5), 0.05)
        self.assertEqual(inbound_delay_penalty(10), 0.10)
        self.assertEqual(inbound_delay_penalty(50), 0.10)
        self.assertEqual(inbound_delay_penalty(200), 0.10)


class BaselineLookupTests(unittest.TestCase):
    def setUp(self):
        self.service = OTPScoringService()

    def test_month_lookup_del_july(self):
        otp, source = self.service.lookup_baseline_otp("DEL", "2026-07-15")
        self.assertEqual(source, "airport_month")
        self.assertAlmostEqual(otp, 0.71)

    def test_airport_default_when_month_missing(self):
        otp, source = self.service.lookup_baseline_otp("BLR", "2026-04-10")
        self.assertEqual(source, "airport_default")
        self.assertAlmostEqual(otp, 0.82)

    def test_global_default_unknown_airport(self):
        otp, source = self.service.lookup_baseline_otp("XYZ", "2026-04-10")
        self.assertEqual(source, "global_default")
        self.assertAlmostEqual(otp, 0.76)


class ScoringIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.service = OTPScoringService()

    def test_full_score_shape(self):
        result = self.service.score(
            departure_airport="DEL",
            departure_time="2026-04-10T08:30:00",
            weather_data={"condition": "Clear", "temp": 28, "rain": 0},
            inbound_delay_minutes=0,
        )
        self.assertIn("baselineOTP", result)
        self.assertIn("adjustedOTP", result)
        self.assertIn("congestionScore", result)
        self.assertIn("congestionLevel", result)
        self.assertIn("factors", result)

    def test_penalties_reduce_otp(self):
        clear = self.service.score("DEL", "2026-04-10T08:00:00", {"condition": "Clear"}, 0)
        storm = self.service.score("DEL", "2026-04-10T08:00:00", {"condition": "Thunderstorm"}, 0)
        self.assertLess(storm["adjustedOTP"], clear["adjustedOTP"])

    def test_congestion_score_formula(self):
        result = self.service.score("DEL", "2026-04-10T08:00:00", {"condition": "Clear"}, 0)
        expected = round((1 - result["adjustedOTP"]) * 100)
        self.assertEqual(result["congestionScore"], expected)

    def test_clamp_adjusted_otp(self):
        result = self.service.score(
            "DEL",
            "2026-07-15T08:00:00",
            {"condition": "Thunderstorm"},
            inbound_delay_minutes=120,
        )
        self.assertGreaterEqual(result["adjustedOTP"], 0.0)
        self.assertLessEqual(result["adjustedOTP"], 1.0)

    def test_categorization(self):
        self.assertEqual(categorize_congestion(10), "Low")
        self.assertEqual(categorize_congestion(30), "Medium")
        self.assertEqual(categorize_congestion(50), "High")
        self.assertEqual(categorize_congestion(70), "Critical")

    def test_parse_date_only_defaults_hour(self):
        dt = parse_departure_time("2026-04-10")
        self.assertEqual(dt.hour, 8)


class BaselinesFileTests(unittest.TestCase):
    def test_baselines_file_exists(self):
        self.assertTrue(BASELINES.exists(), f"Missing {BASELINES}")


if __name__ == "__main__":
    unittest.main()
