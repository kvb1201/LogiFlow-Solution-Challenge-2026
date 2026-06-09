"""
Water pipeline — Phase 4: Train GradientBoosting delay/ETA model.

Builds the training dataset (via delay_dataset.py) then trains two models:
  1. water_delay_model.pkl   — predicts delay_hours for a voyage
  2. water_eta_model.pkl     — predicts eta_multiplier (delay_hours / base_voyage_hours + 1)

Both models use the same GradientBoostingRegressor feature set.

Outputs:
  backend/app/pipelines/water/models/water_delay_model.pkl
  backend/app/pipelines/water/models/water_eta_model.pkl
  backend/app/pipelines/water/models/water_model_metrics.json

Usage:
  cd backend
  python -m app.pipelines.water.train_model
  python -m app.pipelines.water.train_model --max-pairs 10000 --skip-dataset
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import pickle
from pathlib import Path

log = logging.getLogger(__name__)

# Feature columns used during training and inference
FEATURE_COLS = [
    "sea_distance_nm",
    "month",
    "origin_vessel_count",
    "dest_vessel_count",
    "origin_congestion_index",
    "dest_congestion_index",
    "chokepoint_stress_max",
    "wave_height_m",
    "wind_speed_kn",
    "storm_flag",
    "precipitation_mm",
    "has_disruption",
    "disruption_severity",
    "infrastructure_quality_avg",
    "cross_region_flag",
]

TARGET_DELAY    = "delay_hours"
TARGET_TRANSIT  = "transit_days_observed"


def _models_dir() -> Path:
    d = Path(__file__).resolve().parent / "models"
    d.mkdir(parents=True, exist_ok=True)
    return d


def train(
    max_pairs: int = 5000,
    skip_dataset: bool = False,
    n_estimators: int = 200,
    max_depth: int = 5,
    learning_rate: float = 0.05,
    test_size: float = 0.15,
    random_state: int = 42,
) -> dict:
    """
    Full training pipeline. Returns a dict with evaluation metrics.

    Parameters
    ----------
    max_pairs : int
        Max port pairs to include in the training dataset.
    skip_dataset : bool
        If True, load existing water_training_data.csv instead of rebuilding.
    n_estimators, max_depth, learning_rate : GradientBoostingRegressor hyperparams.
    test_size : float
        Fraction of rows held out for evaluation.
    random_state : int
        Seed for reproducibility.
    """
    try:
        import pandas as pd
        import numpy as np
        from sklearn.ensemble import GradientBoostingRegressor
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import mean_absolute_error, r2_score
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import Pipeline
    except ImportError as e:
        raise ImportError(
            f"Training requires scikit-learn + pandas: pip install scikit-learn pandas  ({e})"
        )

    models_dir = _models_dir()

    # ── 1. Load or build training data ────────────────────────────────────────
    csv_path = models_dir / "water_training_data.csv"

    if skip_dataset and csv_path.exists():
        log.info("[train] Loading existing training data from %s", csv_path)
        df = pd.read_csv(csv_path)
    else:
        log.info("[train] Building training dataset (max_pairs=%d)...", max_pairs)
        from app.pipelines.water.delay_dataset import build_dataset
        df = build_dataset(max_pairs=max_pairs, output_csv=True)

    if df.empty:
        raise ValueError("Training dataset is empty — check PortWatch CSV files")

    log.info("[train] Dataset: %d rows × %d columns", *df.shape)

    # ── 2. Prepare features ───────────────────────────────────────────────────
    # Drop rows with missing target or features
    required = FEATURE_COLS + [TARGET_DELAY, TARGET_TRANSIT]
    df = df.dropna(subset=required)
    log.info("[train] After dropping NaN: %d rows", len(df))

    X = df[FEATURE_COLS].values.astype(float)
    y_delay  = df[TARGET_DELAY].values.astype(float)

    # Derive ETA multiplier from delay and observed transit
    base_hr = df[TARGET_TRANSIT].values * 24.0
    eta_mult = np.where(
        base_hr > 0,
        1.0 + np.clip(y_delay / base_hr, 0, 1.0),
        1.0,
    )

    # ── 3. Train/test split ───────────────────────────────────────────────────
    X_tr, X_te, yd_tr, yd_te, ye_tr, ye_te = train_test_split(
        X, y_delay, eta_mult, test_size=test_size, random_state=random_state
    )
    log.info("[train] Train: %d rows   Test: %d rows", len(X_tr), len(X_te))

    # ── 4. Train delay model ──────────────────────────────────────────────────
    log.info("[train] Training water_delay_model (n_est=%d depth=%d lr=%.3f)...",
             n_estimators, max_depth, learning_rate)

    delay_model = Pipeline([
        ("scaler", StandardScaler()),
        ("gbr", GradientBoostingRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            subsample=0.8,
            min_samples_leaf=5,
            random_state=random_state,
            loss="huber",          # robust to outlier delay spikes
            validation_fraction=0.1,
            n_iter_no_change=20,
        )),
    ])
    delay_model.fit(X_tr, yd_tr)

    yd_pred = delay_model.predict(X_te)
    yd_pred = np.clip(yd_pred, 0, 72)

    delay_mae = float(mean_absolute_error(yd_te, yd_pred))
    delay_r2  = float(r2_score(yd_te, yd_pred))
    log.info("[train] delay_model  MAE=%.2f h   R²=%.3f", delay_mae, delay_r2)

    # ── 5. Train ETA multiplier model ─────────────────────────────────────────
    log.info("[train] Training water_eta_model...")

    eta_model = Pipeline([
        ("scaler", StandardScaler()),
        ("gbr", GradientBoostingRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            subsample=0.8,
            min_samples_leaf=5,
            random_state=random_state,
            loss="huber",
            validation_fraction=0.1,
            n_iter_no_change=20,
        )),
    ])
    eta_model.fit(X_tr, ye_tr)

    ye_pred = eta_model.predict(X_te)
    ye_pred = np.clip(ye_pred, 1.0, 2.0)

    eta_mae = float(mean_absolute_error(ye_te, ye_pred))
    eta_r2  = float(r2_score(ye_te, ye_pred))
    log.info("[train] eta_model    MAE=%.4f    R²=%.3f", eta_mae, eta_r2)

    # ── 6. Feature importance ─────────────────────────────────────────────────
    fi = delay_model.named_steps["gbr"].feature_importances_
    feature_importance = dict(sorted(
        zip(FEATURE_COLS, fi.tolist()),
        key=lambda x: x[1], reverse=True
    ))
    log.info("[train] Top 5 features: %s",
             list(feature_importance.items())[:5])

    # ── 7. Save models ────────────────────────────────────────────────────────
    delay_path = models_dir / "water_delay_model.pkl"
    eta_path   = models_dir / "water_eta_model.pkl"

    with open(delay_path, "wb") as f:
        pickle.dump(delay_model, f)
    with open(eta_path, "wb") as f:
        pickle.dump(eta_model, f)

    log.info("[train] Saved delay model → %s", delay_path)
    log.info("[train] Saved ETA model   → %s", eta_path)

    # ── 8. Save metrics ───────────────────────────────────────────────────────
    metrics = {
        "train_rows": int(len(X_tr)),
        "test_rows":  int(len(X_te)),
        "delay_model": {
            "mae_hours":    round(delay_mae, 3),
            "r2":           round(delay_r2, 3),
        },
        "eta_model": {
            "mae":  round(eta_mae, 4),
            "r2":   round(eta_r2, 3),
        },
        "hyperparams": {
            "n_estimators":   n_estimators,
            "max_depth":      max_depth,
            "learning_rate":  learning_rate,
        },
        "feature_importance": feature_importance,
        "feature_cols": FEATURE_COLS,
    }

    metrics_path = models_dir / "water_model_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    log.info("[train] Saved metrics → %s", metrics_path)

    return metrics


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    parser = argparse.ArgumentParser(description="Train water pipeline ML models")
    parser.add_argument("--max-pairs",     type=int,   default=5000)
    parser.add_argument("--skip-dataset",  action="store_true",
                        help="Re-use existing water_training_data.csv")
    parser.add_argument("--n-estimators",  type=int,   default=200)
    parser.add_argument("--max-depth",     type=int,   default=5)
    parser.add_argument("--learning-rate", type=float, default=0.05)
    parser.add_argument("--test-size",     type=float, default=0.15)
    args = parser.parse_args()

    metrics = train(
        max_pairs=args.max_pairs,
        skip_dataset=args.skip_dataset,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        test_size=args.test_size,
    )

    print("\n=== Training complete ===")
    print(f"  delay_model  MAE={metrics['delay_model']['mae_hours']:.2f}h  R²={metrics['delay_model']['r2']:.3f}")
    print(f"  eta_model    MAE={metrics['eta_model']['mae']:.4f}          R²={metrics['eta_model']['r2']:.3f}")
    print(f"\nModels saved to: {Path(__file__).parent / 'models'}/")
