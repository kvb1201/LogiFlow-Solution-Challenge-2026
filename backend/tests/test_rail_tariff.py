"""Official IRCA parcel slab pricing — generalized all-India validation."""

import unittest

from app.pipelines.rail.tariff import (
    calc_parcel_cost,
    lookup_tariff,
    resolve_chargeable_weight,
    resolve_billing_scale,
)
from app.pipelines.rail.tariff_validation import generate_validation_cases, validate_case


class RailTariffSlabTests(unittest.TestCase):
    def test_pdf_slab_spot_values(self):
        """Spot checks from luggage_rates.pdf / Standered_rates.pdf / Premier_rates.pdf."""
        cases = [
            (50, 10, "L", 4.73),
            (50, 100, "L", 47.25),
            (927, 100, "L", 301.95),
            (50, 10, "S", 2.10),
            (50, 100, "S", 20.93),
            (50, 10, "P", 4.19),
            (50, 100, "P", 41.84),
            (50, 10, "R", 6.28),
            (50, 100, "R", 62.76),
        ]
        for dist, wt, scale, expected in cases:
            got = lookup_tariff(dist, wt, scale, include_surcharge=False)
            self.assertAlmostEqual(got, expected, places=2, msg=f"{scale} {dist}km {wt}kg")

    def test_heavy_cargo_multi_block(self):
        got = lookup_tariff(927, 300, "L", include_surcharge=False)
        self.assertAlmostEqual(got, 301.95 * 3, places=2)

    def test_cargo_chargeable_weight_generalized(self):
        """IR min chargeable weights apply by cargo type, not by route."""
        self.assertEqual(resolve_chargeable_weight("Bicycle", 15), 40)
        self.assertEqual(resolve_chargeable_weight("Bike", 8), 40)
        self.assertEqual(resolve_chargeable_weight("General", 15), 15)
        self.assertEqual(resolve_billing_scale("Bicycle", "SF EXPRESS", "SF"), "L")
        self.assertEqual(resolve_billing_scale("General", "Rajdhani Express", "RAJ"), "R")

    def test_minimum_distance_50km(self):
        a = calc_parcel_cost(10, 50, scale="S")
        b = calc_parcel_cost(50, 50, scale="S")
        self.assertEqual(a, b)

    def test_all_india_100_case_validation(self):
        """100 diverse cases: slab grid + real routes + edge rules vs reference."""
        cases = generate_validation_cases(100)
        self.assertEqual(len(cases), 100)
        failures = []
        for case in cases:
            result = validate_case(case)
            if not result["ok"]:
                failures.append(result)
        if failures:
            msgs = [
                f"{f['id']} {f['label']}: total {f['prod_total']} vs {f['ref_total']}"
                for f in failures[:5]
            ]
            self.fail(f"{len(failures)}/100 pricing mismatches. First: " + "; ".join(msgs))


if __name__ == "__main__":
    unittest.main()
