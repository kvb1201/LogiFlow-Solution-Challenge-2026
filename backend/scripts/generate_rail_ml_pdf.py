#!/usr/bin/env python3
"""Generate rail ML pipeline PDF for frontend/public/docs/."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
METRICS = ROOT / "backend/app/pipelines/rail/models/scraped_delay_metrics.json"
OUT = ROOT / "frontend/public/docs/rail-ml-pipeline.pdf"


def _load_metrics() -> dict:
    if METRICS.exists():
        return json.loads(METRICS.read_text(encoding="utf-8"))
    return {}


def main() -> None:
    try:
        from fpdf import FPDF
    except ImportError:
        print("Install fpdf2: pip install fpdf2", file=sys.stderr)
        sys.exit(1)

    m = _load_metrics()
    cv = m.get("cv_metrics") or {}
    backtests = m.get("date_backtests") or []
    bt_30 = [
        float((b.get("metrics") or {}).get("within_30_min_pct", 0))
        for b in backtests
        if (b.get("metrics") or {}).get("within_30_min_pct") is not None
    ]
    bt_avg = sum(bt_30) / len(bt_30) if bt_30 else 0

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "LogiFlow Railway Pipeline & Delay ML", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(
        0,
        5,
        "Document version: June 2026. Describes the Indian Railways cargo decision "
        "pipeline, scraped delay corpus training, and the three public accuracy quantifiers.",
    )
    pdf.ln(4)

    sections = [
        (
            "1. Rail pipeline overview",
            "LogiFlow rail optimization chains: (1) station resolution from city names, "
            "(2) route discovery from the 2017 IR schedule CSV plus live ConfirmTkt/RailRadar "
            "enrichment, (3) feature engineering (tariff, weather, live delay APIs), "
            "(4) ML delay prediction adjusting ETA and risk, (5) ranking by cost/time/risk priority. "
            "Map geometry uses full A-to-B schedule slices with offline station coordinates.",
        ),
        (
            "2. Training data",
            "Primary ML corpus: ir_train_delays.csv scraped from runningstatus.in "
            f"({int(cv.get('n_samples', m.get('training_rows', 0))):,} labeled train-days). "
            "Each row is a station on a train run_date with scheduled/actual times and delay text. "
            "Labels are parsed from arrival_delay_min, delay_text (e.g. '4 hrs 48 mins'), "
            "or actual minus scheduled clock times.",
        ),
        (
            "3. Model & validation",
            f"Algorithm: GradientBoostingRegressor ({m.get('model_kind', 'gbm')}). "
            "Features: stations_on_run, route_distance_km, train_type, scheduled_hour, day_of_week. "
            "Validation: 5-fold GroupKFold grouped by train_number (no train leakage). "
            "Temporal backtest: leave-one-run_date-out on scraped history days.",
        ),
        (
            "4. Quantifier 1 - +/-15 min accuracy",
            f"Value: {cv.get('within_15_min_pct', 0):.1f}%. "
            "Definition: fraction of cross-validated predictions where |predicted - actual| <= 15 minutes. "
            "Derivation: sklearn cross_val_predict with GroupKFold splits; counted over all held-out folds.",
        ),
        (
            "4. Quantifier 2 - +/-30 min accuracy",
            f"Value: {cv.get('within_30_min_pct', 0):.1f}%. "
            "Same CV protocol as Quantifier 1 with a 30-minute tolerance band. "
            "Used for operational planning where wider slack is acceptable.",
        ),
        (
            "4. Quantifier 3 - Past-date backtest (+/-30 min)",
            f"Value: {bt_avg:.1f}% (average across {len(backtests)} held-out run_dates). "
            "For each scraped date D: train on all other dates, predict every train on D, "
            "measure +/-30 min hit rate. Simulates forecasting delay on a past day using prior history.",
        ),
        (
            "5. Error metrics",
            f"CV MAE: {cv.get('mae', 0):.1f} min. CV RMSE: {cv.get('rmse', 0):.1f} min. "
            f"R-squared: {cv.get('r2', 0):.3f}. "
            "MAE is mean absolute error in minutes; RMSE penalises large outliers more heavily.",
        ),
        (
            "6. Retraining",
            "Run: make train-delay-ml or python backend/scripts/train_delay_ml.py. "
            "Updates scraped_delay_model.pkl and scraped_delay_metrics.json. "
            "Redeploy backend so /railway/model-info serves fresh quantifiers.",
        ),
    ]

    for title, body in sections:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, title, ln=True)
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, body)
        pdf.ln(2)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
