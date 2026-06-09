#!/usr/bin/env python3
"""
Train delay predictor on scraped ir_train_delays.csv with k-fold CV and date backtests.

Usage:
    cd backend
    python scripts/train_delay_ml.py
    python scripts/train_delay_ml.py --level station
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipelines.rail.scraped_delay_ml import train_and_save


def main() -> None:
    parser = argparse.ArgumentParser(description="Train scraped delay ML model")
    parser.add_argument(
        "--level",
        choices=("auto", "train_day", "station"),
        default="auto",
        help="auto = pick best; train_day = per train×date; station = per stop",
    )
    parser.add_argument(
        "--model",
        choices=("hist", "gbm"),
        default="hist",
        help="Initial model family",
    )
    parser.add_argument("--no-retune", action="store_true", help="Skip auto model swap")
    args = parser.parse_args()

    print("=" * 60)
    print("  LOGIFLOW — SCRAPED DELAY ML TRAINING")
    print("=" * 60)

    report = train_and_save(
        level=args.level,
        model_kind=args.model,
        auto_retune=not args.no_retune,
    )

    print("\n" + "=" * 60)
    print("  RESULTS")
    print("=" * 60)
    cv = report["cv_metrics"]
    print(f"  CV MAE       : {cv['mae']:.1f} min")
    print(f"  CV RMSE      : {cv['rmse']:.1f} min")
    print(f"  CV R²        : {cv['r2']:.3f}")
    print(f"  Within ±15m  : {cv['within_15_min_pct']:.1f}%")
    print(f"  Within ±30m  : {cv['within_30_min_pct']:.1f}%")
    print(f"  Meets goal   : {report['meets_goal']}")
    print(f"  Model saved  : {report.get('model_path', 'n/a')}")

    for bt in report.get("date_backtests") or []:
        m = bt["metrics"]
        print(f"\n  Backtest {bt['holdout_date']}: MAE={m['mae']:.1f}m R²={m['r2']:.3f}")
        for s in bt.get("sample_predictions") or [][:3]:
            print(
                f"    train {s['train_number']}: "
                f"actual={s['actual_delay_min']}m pred={s['predicted_delay_min']}m "
                f"err={s['error_min']}m"
            )

    print("=" * 60)
    print(json.dumps(report["cv_metrics"], indent=2))

    try:
        from app.services.rail_ml_metrics_store import save_model_info_payload

        if save_model_info_payload():
            print("\nSupabase: rail_ml_metrics synced")
        else:
            print("\nSupabase: sync skipped (not configured)")
    except Exception as exc:
        print(f"\nSupabase: sync failed — {exc}")


if __name__ == "__main__":
    main()
