#!/usr/bin/env python3
"""Run 100-case all-India parcel pricing validation vs official slab reference."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.pipelines.rail.tariff_validation import run_validation  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-n", "--count", type=int, default=100)
    parser.add_argument("--json", action="store_true", help="Print full JSON report")
    args = parser.parse_args()

    report = run_validation(args.count)
    print(f"Parcel pricing validation: {report['passed']}/{report['total']} passed")
    for cat, stats in sorted(report["by_category"].items()):
        print(f"  {cat}: {stats['pass']} pass, {stats['fail']} fail")

    if report["failures"]:
        print("\nFailures:")
        for f in report["failures"][:20]:
            print(
                f"  [{f['id']}] {f['label']}: "
                f"freight prod={f['prod_freight']} ref={f['ref_freight']} | "
                f"total prod={f['prod_total']} ref={f['ref_total']}"
            )
        if len(report["failures"]) > 20:
            print(f"  ... and {len(report['failures']) - 20} more")

    if args.json:
        print(json.dumps(report, indent=2))

    return 0 if report["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
