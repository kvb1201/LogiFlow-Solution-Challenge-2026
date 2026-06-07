"""Jaipur→Agra corridor geometry must include origin and intermediate stops."""

import unittest

from app.pipelines.rail.geometry_builder import get_train_geometry_detail


class JaipurAgraGeometryTests(unittest.TestCase):
    def setUp(self):
        get_train_geometry_detail.cache_clear()

    def test_udz_kurj_exp_includes_jaipur_and_intermediates(self):
        detail = get_train_geometry_detail("19666", "JP", "AGC")
        codes = [s["code"] for s in detail.get("stops") or []]
        self.assertGreaterEqual(detail.get("point_count", 0), 4, detail)
        self.assertEqual(codes[0], "JP")
        self.assertEqual(codes[-1], "AGC")
        self.assertGreater(len(codes), 3)

    def test_palace_on_wheels_prefers_csv_when_delay_scrape_omits_origin(self):
        """Train 290 delay_scrape lacks JP; must not fuzzy-start at GADJ."""
        detail = get_train_geometry_detail("290", "JP", "AGC")
        codes = [s["code"] for s in detail.get("stops") or []]
        self.assertGreaterEqual(detail.get("point_count", 0), 4, detail)
        self.assertEqual(codes[0], "JP", f"wrong origin slice: {codes}")
        self.assertEqual(codes[-1], "AGC")
        self.assertIn(detail.get("source"), ("schedule", "csv_2017", "delay_scrape", "cache"))


if __name__ == "__main__":
    unittest.main()
