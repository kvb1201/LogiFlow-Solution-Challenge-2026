"""Integration tests: air pipeline returns OTP congestion fields."""
from __future__ import annotations

import unittest

from app.pipelines.air import AirPipeline


class AirPipelineOtpIntegrationTests(unittest.TestCase):
    def test_delhi_mumbai_routes_include_otp_fields(self):
        pipeline = AirPipeline()
        result = pipeline.generate(
            "Delhi",
            "Mumbai",
            {
                "priority": "fast",
                "departure_date": "2026-04-10",
                "cargo": {"weight": 500, "type": "general"},
            },
        )
        routes = result.get("all") or []
        self.assertGreater(len(routes), 0, "Expected at least one DEL->BOM route")

        route = routes[0]
        self.assertIn("otp_prediction", route)
        self.assertIn("congestion_score", route)
        self.assertIn("congestion_level", route)

        otp = route["otp_prediction"]
        self.assertIn("baselineOTP", otp)
        self.assertIn("adjustedOTP", otp)
        self.assertIn("congestionScore", otp)
        self.assertIn("congestionLevel", otp)
        self.assertIn("factors", otp)

        self.assertEqual(route["congestion_score"], otp["congestionScore"])
        self.assertEqual(route["congestion_level"], otp["congestionLevel"])
        self.assertIn(route["congestion_level"], {"Low", "Medium", "High", "Critical"})


if __name__ == "__main__":
    unittest.main()
