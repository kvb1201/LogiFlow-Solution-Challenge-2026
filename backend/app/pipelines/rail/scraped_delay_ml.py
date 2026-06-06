"""
Train / evaluate delay models on scraped runningstatus.in history.

- 5-fold GroupKFold CV (grouped by train_number)
- Leave-one-date-out backtest on past run_dates
- Auto-retune if accuracy is below threshold
"""
from __future__ import annotations

import json
import os
import pickle
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, cross_val_predict

from app.pipelines.rail.delay_dataset import (
    build_station_feature_matrix,
    build_train_day_feature_matrix,
    build_train_day_frame,
    load_labeled_delay_frame,
)

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
_MODEL_PATH = os.path.join(_MODEL_DIR, "scraped_delay_model.pkl")
_METRICS_PATH = os.path.join(_MODEL_DIR, "scraped_delay_metrics.json")

# Acceptable accuracy gates (tune for Indian rail delay variance)
_MAE_GOAL_MIN = 25.0
_R2_GOAL_MIN = 0.35


@dataclass
class EvalMetrics:
    mae: float
    rmse: float
    r2: float
    n_samples: int
    within_15_min_pct: float
    within_30_min_pct: float


def _pct_within(y_true: np.ndarray, y_pred: np.ndarray, mins: float) -> float:
    if len(y_true) == 0:
        return 0.0
    return float(np.mean(np.abs(y_true - y_pred) <= mins) * 100.0)


def evaluate(y_true: np.ndarray, y_pred: np.ndarray) -> EvalMetrics:
    y_pred = np.clip(y_pred, 0, None)
    return EvalMetrics(
        mae=float(mean_absolute_error(y_true, y_pred)),
        rmse=float(np.sqrt(mean_squared_error(y_true, y_pred))),
        r2=float(r2_score(y_true, y_pred)) if len(y_true) > 1 else 0.0,
        n_samples=int(len(y_true)),
        within_15_min_pct=_pct_within(y_true, y_pred, 15),
        within_30_min_pct=_pct_within(y_true, y_pred, 30),
    )


def _make_model(kind: str) -> Any:
    if kind == "hist":
        return HistGradientBoostingRegressor(
            max_depth=8,
            learning_rate=0.08,
            max_iter=400,
            min_samples_leaf=20,
            l2_regularization=0.1,
            random_state=42,
        )
    return GradientBoostingRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.06,
        min_samples_split=20,
        min_samples_leaf=10,
        subsample=0.85,
        random_state=42,
    )


def run_group_kfold_cv(
    x: np.ndarray,
    y: np.ndarray,
    groups: np.ndarray,
    *,
    n_splits: int = 5,
    model_kind: str = "hist",
    y_eval: np.ndarray | None = None,
) -> tuple[EvalMetrics, np.ndarray]:
    n_unique = len(np.unique(groups))
    splits = min(n_splits, max(2, n_unique))
    gkf = GroupKFold(n_splits=splits)
    model = _make_model(model_kind)
    preds = cross_val_predict(model, x, y, cv=gkf, groups=groups, n_jobs=-1)
    truth = y_eval if y_eval is not None else y
    return evaluate(truth, preds), preds


def backtest_leave_one_date_out(df) -> list[dict[str, Any]]:
    """Train on N-1 dates, predict all train-days on held-out past date."""
    td = build_train_day_frame(df)
    dates = sorted(td["run_date"].unique())
    results: list[dict[str, Any]] = []

    feature_cols = [
        "stations_on_run",
        "route_distance_km",
        "train_type",
        "scheduled_hour",
        "day_of_week",
    ]

    for holdout in dates:
        train = td[td["run_date"] != holdout]
        test = td[td["run_date"] == holdout]
        if len(train) < 50 or len(test) < 10:
            continue

        x_train = train[feature_cols].astype(float).values
        y_train = train["target_delay_min"].astype(float).values
        x_test = test[feature_cols].astype(float).values
        y_test = test["target_delay_min"].astype(float).values

        model = _make_model("hist")
        model.fit(x_train, y_train)
        preds = np.clip(model.predict(x_test), 0, None)
        metrics = evaluate(y_test, preds)

        sample = test.assign(predicted_delay_min=preds).head(8)
        results.append(
            {
                "holdout_date": str(holdout.date()),
                "metrics": asdict(metrics),
                "sample_predictions": [
                    {
                        "train_number": str(r.train_number),
                        "actual_delay_min": round(float(r.target_delay_min), 1),
                        "predicted_delay_min": round(float(r.predicted_delay_min), 1),
                        "error_min": round(
                            abs(float(r.target_delay_min) - float(r.predicted_delay_min)), 1
                        ),
                    }
                    for r in sample.itertuples()
                ],
            }
        )
    return results


def _clip_training_outliers(y: np.ndarray, percentile: float = 99.0) -> np.ndarray:
    cap = float(np.percentile(y, percentile))
    return np.clip(y, 0, cap)


def train_and_save(
    *,
    level: str = "auto",
    model_kind: str = "hist",
    auto_retune: bool = True,
) -> dict[str, Any]:
    os.makedirs(_MODEL_DIR, exist_ok=True)
    df = load_labeled_delay_frame()

    candidates: list[tuple[str, np.ndarray, np.ndarray, np.ndarray, list[str]]] = []
    for lvl in ("train_day", "station"):
        if level != "auto" and level != lvl:
            continue
        if lvl == "station":
            x, y, groups, feature_cols = build_station_feature_matrix(df)
        else:
            x, y, groups, feature_cols = build_train_day_feature_matrix(df)
        candidates.append((lvl, x, y, groups, feature_cols))

    best_level = candidates[0][0]
    x, y, groups, feature_cols = candidates[0][1], candidates[0][2], candidates[0][3], candidates[0][4]
    y_train = _clip_training_outliers(y)
    cv_metrics, _ = run_group_kfold_cv(
        x, y_train, groups, model_kind=model_kind, y_eval=y
    )
    print(
        f"[delay-ml] {model_kind} GroupKFold CV ({best_level}): "
        f"MAE={cv_metrics.mae:.1f}m RMSE={cv_metrics.rmse:.1f}m "
        f"R²={cv_metrics.r2:.3f} ±15m={cv_metrics.within_15_min_pct:.1f}%"
    )

    for lvl, cx, cy, cg, ccols in candidates[1:]:
        cy_clip = _clip_training_outliers(cy)
        m, _ = run_group_kfold_cv(cx, cy_clip, cg, model_kind=model_kind, y_eval=cy)
        print(
            f"[delay-ml] {model_kind} GroupKFold CV ({lvl}): "
            f"MAE={m.mae:.1f}m R²={m.r2:.3f} ±15m={m.within_15_min_pct:.1f}%"
        )
        if m.mae < cv_metrics.mae and m.r2 >= cv_metrics.r2 - 0.02:
            cv_metrics, x, y, groups, feature_cols = m, cx, cy, cg, ccols
            best_level = lvl
            y_train = cy_clip

    level = best_level
    print(f"[delay-ml] selected level={level} samples={len(y)} features={len(feature_cols)}")

    chosen_kind = model_kind
    if auto_retune and (cv_metrics.mae > _MAE_GOAL_MIN or cv_metrics.r2 < _R2_GOAL_MIN):
        alt = "gbm" if model_kind == "hist" else "hist"
        print(f"[delay-ml] Below goal — retrying with {alt}...")
        alt_metrics, _ = run_group_kfold_cv(x, y_train, groups, model_kind=alt, y_eval=y)
        print(
            f"[delay-ml] {alt} GroupKFold CV: "
            f"MAE={alt_metrics.mae:.1f}m R²={alt_metrics.r2:.3f}"
        )
        if alt_metrics.mae < cv_metrics.mae or alt_metrics.r2 > cv_metrics.r2:
            cv_metrics = alt_metrics
            chosen_kind = alt

    date_backtests = backtest_leave_one_date_out(df)
    for bt in date_backtests:
        m = bt["metrics"]
        print(
            f"[delay-ml] backtest {bt['holdout_date']}: "
            f"MAE={m['mae']:.1f}m R²={m['r2']:.3f} "
            f"n={m['n_samples']}"
        )

    final_model = _make_model(chosen_kind)
    final_model.fit(x, y_train)

    bundle = {
        "model": final_model,
        "feature_cols": feature_cols,
        "level": level,
        "model_kind": chosen_kind,
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "training_rows": int(len(y)),
        "cv_metrics": asdict(cv_metrics),
        "date_backtests": date_backtests,
        "data_source": "ir_train_delays.csv",
    }
    with open(_MODEL_PATH, "wb") as f:
        pickle.dump(bundle, f)

    report = {
        "model_path": _MODEL_PATH,
        "level": level,
        "model_kind": chosen_kind,
        "cv_metrics": asdict(cv_metrics),
        "date_backtests": date_backtests,
        "meets_goal": cv_metrics.mae <= _MAE_GOAL_MIN and cv_metrics.r2 >= _R2_GOAL_MIN,
        "feature_cols": feature_cols,
        "trained_at": bundle["trained_at"],
        "training_rows": int(len(y)),
    }
    with open(_METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"[delay-ml] saved → {_MODEL_PATH}")
    return report


def load_scraped_model_bundle() -> dict[str, Any] | None:
    if not os.path.exists(_MODEL_PATH):
        return None
    try:
        with open(_MODEL_PATH, "rb") as f:
            bundle = pickle.load(f)
        return bundle if isinstance(bundle, dict) and bundle.get("model") is not None else None
    except Exception:
        return None


def load_metrics() -> dict[str, Any] | None:
    if not os.path.exists(_METRICS_PATH):
        return None
    try:
        with open(_METRICS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def predict_route_delay(route: dict[str, Any]) -> float | None:
    """Predict journey delay (minutes) from an enriched route dict."""
    bundle = load_scraped_model_bundle()
    if not bundle:
        return None

    cols = bundle["feature_cols"]
    model = bundle["model"]

    total_stops = 0
    total_distance = float(route.get("total_distance_km") or 0)
    dep_hour = 12
    train_type = 0
    train_type_str = ""

    for t in route.get("trains") or []:
        total_stops += int(t.get("stops_between") or 0) + 2
        train_type_str += (str(t.get("train_type") or "") + " " + str(t.get("train_name") or "")).lower()
        dep_time = t.get("departure_time", "12:00")
        try:
            dep_hour = int(str(dep_time).split(":")[0])
        except (ValueError, IndexError):
            dep_hour = 12

    if "rajdhani" in train_type_str or "shatabdi" in train_type_str:
        train_type = 4
    elif "duronto" in train_type_str:
        train_type = 3
    elif "superfast" in train_type_str or "sf " in train_type_str:
        train_type = 2
    elif "express" in train_type_str or "exp" in train_type_str:
        train_type = 1

    day_of_week = 0
    dep_date = route.get("departure_date") or route.get("run_date")
    if dep_date:
        try:
            day_of_week = datetime.fromisoformat(str(dep_date)[:10]).weekday()
        except ValueError:
            pass

    import math

    row = {
        "stations_on_run": max(total_stops, 2),
        "route_distance_km": total_distance,
        "train_type": train_type,
        "scheduled_hour": dep_hour,
        "day_of_week": day_of_week,
        "distance_km": total_distance,
        "log_distance_km": math.log1p(max(total_distance, 0)),
        "frac_along_route": 1.0,
        "hour_sin": math.sin(2 * math.pi * dep_hour / 24.0),
        "hour_cos": math.cos(2 * math.pi * dep_hour / 24.0),
        "is_major_junction": 0,
        "is_origin": 0,
        "is_destination": 1,
    }
    vec = np.array([[float(row.get(c, 0)) for c in cols]])
    return max(0.0, float(model.predict(vec)[0]))
