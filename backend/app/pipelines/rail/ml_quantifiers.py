"""Public-facing ML quantifiers for the rail delay predictor."""
from __future__ import annotations

from typing import Any


DOC_PDF_URL = "/docs/rail-ml-pipeline.pdf"


def _avg_backtest_metric(backtests: list[dict], key: str) -> float | None:
    vals = []
    for row in backtests:
        m = row.get("metrics") or {}
        v = m.get(key)
        if v is not None:
            vals.append(float(v))
    if not vals:
        return None
    return sum(vals) / len(vals)


def build_rail_ml_quantifiers(metrics: dict[str, Any] | None) -> list[dict[str, Any]]:
    """
    Three headline quantifiers shown on Home + Rail pipeline pages.
    All values are computed offline from scraped_delay_metrics.json —
    never estimated or hard-coded in the UI.

    1. ±15 min cross-validation hit rate (GroupKFold)
    2. ±30 min cross-validation hit rate (GroupKFold)
    3. Leave-one-date-out backtest ±30 min hit rate (temporal validation)
    """
    if not metrics or not metrics.get("cv_metrics"):
        return [
            {
                "id": "cv_within_15",
                "label": "±15 min CV hit rate",
                "short_label": "CV ±15 min",
                "value": None,
                "unit": "%",
                "summary": "Model metrics unavailable — run make train-delay-ml",
                "derivation": "Trained on scraped ir_train_delays.csv after deployment.",
            },
            {
                "id": "cv_within_30",
                "label": "±30 min CV hit rate",
                "short_label": "CV ±30 min",
                "value": None,
                "unit": "%",
                "summary": "Model metrics unavailable",
                "derivation": "5-fold GroupKFold grouped by train_number.",
            },
            {
                "id": "backtest_within_30",
                "label": "Past-date backtest",
                "short_label": "Backtest ±30 min",
                "value": None,
                "unit": "%",
                "summary": "Leave-one-date-out validation on scraped history",
                "derivation": "See documentation PDF for methodology.",
            },
        ]

    cv = metrics.get("cv_metrics") or {}
    backtests = metrics.get("date_backtests") or []

    within_15 = float(cv.get("within_15_min_pct") or 0)
    within_30 = float(cv.get("within_30_min_pct") or 0)
    backtest_30 = _avg_backtest_metric(backtests, "within_30_min_pct")
    mae = float(cv.get("mae") or 0)
    n_samples = int(cv.get("n_samples") or metrics.get("training_rows") or 0)

    quantifiers = [
        {
            "id": "cv_within_15",
            "label": "±15 min CV hit rate",
            "short_label": "CV ±15 min",
            "value": round(within_15, 1),
            "unit": "%",
            "summary": "Share of CV folds where |predicted − actual| ≤ 15 min",
            "derivation": (
                "5-fold GroupKFold (grouped by train_number) on scraped runningstatus.in "
                f"labels ({n_samples:,} train-days). "
                "A prediction counts as a hit when |predicted − actual| ≤ 15 min."
            ),
        },
        {
            "id": "cv_within_30",
            "label": "±30 min CV hit rate",
            "short_label": "CV ±30 min",
            "value": round(within_30, 1),
            "unit": "%",
            "summary": "Share of CV folds where |predicted − actual| ≤ 30 min",
            "derivation": (
                "Same GroupKFold splits as ±15 min. "
                "Wider tolerance captures operational slack for corridor planning."
            ),
        },
        {
            "id": "backtest_within_30",
            "label": "Past-date backtest",
            "short_label": "Backtest ±30 min",
            "value": round(backtest_30, 1) if backtest_30 is not None else None,
            "unit": "%",
            "summary": "Mean ±30 min hit rate on held-out scraped run dates",
            "derivation": (
                "Leave-one-date-out: for each scraped run_date, train on remaining dates "
                "and score all trains on the held-out day. "
                f"Average ±30 min hit rate across {len(backtests)} day(s). "
                f"CV mean absolute error: {mae:.1f} min."
            ),
        },
    ]
    return quantifiers
