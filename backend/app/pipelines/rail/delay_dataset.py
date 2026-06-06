"""
Load scraped runningstatus.in delay corpus and build ML-ready features.

Target: station-level arrival delay (minutes) with robust parsing from
delay_text, numeric columns, or scheduled vs actual times.
"""
from __future__ import annotations

import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

_DELAY_CSV = (
    Path(__file__).resolve().parents[3] / "data" / "ir_delay_scrape" / "ir_train_delays.csv"
)

_HRS_MIN_RE = re.compile(r"(\d+)\s*hrs?\s*(\d+)\s*mins?", re.I)
_HRS_ONLY_RE = re.compile(r"(\d+)\s*hrs?", re.I)
_MIN_ONLY_RE = re.compile(r"(\d+)\s*mins?", re.I)
_DELAY_MIN_RE = re.compile(r"delay:\s*(\d+)\s*min", re.I)
_TIME_RE = re.compile(r"(\d{1,2}):(\d{2})\s*(AM|PM)", re.I)


def _parse_ampm_minutes(value: str) -> Optional[int]:
    if not value or not str(value).strip():
        return None
    m = _TIME_RE.search(str(value).strip())
    if not m:
        return None
    hour = int(m.group(1)) % 12
    if m.group(3).upper() == "PM":
        hour += 12
    minute = int(m.group(2))
    return hour * 60 + minute


def parse_delay_text(delay_text: str) -> Optional[int]:
    if not delay_text:
        return None
    low = str(delay_text).lower().strip()
    if "on time" in low or "right time" in low or low in {"rt", "arr: rt dep: rt"}:
        return 0
    if "rt" in low and "delay" not in low:
        return 0

    m = _DELAY_MIN_RE.search(low)
    if m:
        return int(m.group(1))

    m = _HRS_MIN_RE.search(low)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))

    m = _HRS_ONLY_RE.search(low)
    if m:
        return int(m.group(1)) * 60

    m = _MIN_ONLY_RE.search(low)
    if m:
        return int(m.group(1))
    return None


def delay_from_times(scheduled: str, actual: str) -> Optional[int]:
    sched_min = _parse_ampm_minutes(scheduled)
    act_min = _parse_ampm_minutes(actual)
    if sched_min is None or act_min is None:
        return None
    delta = act_min - sched_min
    if delta < -12 * 60:
        delta += 24 * 60
    if delta < 0:
        return 0
    return int(delta)


def resolve_delay_minutes(row: pd.Series) -> Optional[int]:
    for col in ("arrival_delay_min", "departure_delay_min"):
        val = row.get(col)
        if val is not None and str(val).strip() not in {"", "nan"}:
            try:
                mins = int(float(val))
                if mins >= 0:
                    return mins
            except (TypeError, ValueError):
                pass

    parsed = parse_delay_text(str(row.get("delay_text") or ""))
    if parsed is not None:
        return parsed

    for sched_col, act_col in (
        ("scheduled_arrival", "actual_arrival"),
        ("scheduled_departure", "actual_departure"),
    ):
        delta = delay_from_times(str(row.get(sched_col) or ""), str(row.get(act_col) or ""))
        if delta is not None:
            return delta
    return None


@lru_cache(maxsize=1)
def _train_meta() -> dict[str, dict]:
    from app.pipelines.rail import data_loader

    data_loader.load_data()
    return dict(data_loader._train_metadata or {})


def _train_type_code(train_name: str) -> int:
    name = (train_name or "").lower()
    if "rajdhani" in name or "shatabdi" in name:
        return 4
    if "duronto" in name:
        return 3
    if "superfast" in name or " sf" in name:
        return 2
    if "express" in name or " exp" in name:
        return 1
    return 0


def load_labeled_delay_frame(csv_path: Path | None = None) -> pd.DataFrame:
    path = csv_path or _DELAY_CSV
    if not path.exists():
        raise FileNotFoundError(f"Delay corpus not found: {path}")

    raw = pd.read_csv(path, low_memory=False)
    raw["delay_min"] = raw.apply(resolve_delay_minutes, axis=1)
    df = raw[raw["delay_min"].notna()].copy()
    df["delay_min"] = df["delay_min"].astype(float)
    df["train_number"] = df["train_number"].astype(str).str.zfill(5)
    df["station_code"] = df["station_code"].astype(str).str.upper().str.strip()
    df["run_date"] = pd.to_datetime(df["run_date"], errors="coerce")
    df = df[df["run_date"].notna()].copy()

    df["distance_km"] = pd.to_numeric(df["distance_km"], errors="coerce").fillna(0.0)
    df["scheduled_hour"] = df["scheduled_arrival"].map(
        lambda s: (_parse_ampm_minutes(str(s)) or 720) // 60
    )
    df["day_of_week"] = df["run_date"].dt.dayofweek

    order = (
        df.sort_values(["train_number", "run_date", "distance_km"])
        .groupby(["train_number", "run_date"])
        .cumcount()
    )
    df["station_ord"] = order
    totals = df.groupby(["train_number", "run_date"])["station_ord"].transform("max") + 1
    df["stations_on_run"] = totals
    df["frac_along_route"] = np.where(
        totals > 1, df["station_ord"] / (totals - 1), 0.0
    )

    meta = _train_meta()
    from app.pipelines.rail.config import MAJOR_JUNCTIONS

    def _meta_row(train_no: str) -> dict:
        return meta.get(train_no) or meta.get(train_no.lstrip("0")) or {}

    df["train_name"] = df["train_number"].map(lambda t: _meta_row(t).get("train_name", ""))
    df["train_type"] = df["train_name"].map(_train_type_code)
    df["route_distance_km"] = df["train_number"].map(
        lambda t: float(_meta_row(t).get("total_distance") or 0)
    )
    df["is_major_junction"] = df["station_code"].isin(MAJOR_JUNCTIONS).astype(int)
    df["is_origin"] = (df["station_ord"] == 0).astype(int)
    df["is_destination"] = (df["station_ord"] == df["stations_on_run"] - 1).astype(int)
    hour = df["scheduled_hour"].astype(float)
    df["hour_sin"] = np.sin(2 * np.pi * hour / 24.0)
    df["hour_cos"] = np.cos(2 * np.pi * hour / 24.0)
    df["log_distance_km"] = np.log1p(df["distance_km"].clip(lower=0))
    return df


def build_station_feature_matrix(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    """Station-level features for delay regression."""
    feature_cols = [
        "distance_km",
        "log_distance_km",
        "frac_along_route",
        "stations_on_run",
        "scheduled_hour",
        "hour_sin",
        "hour_cos",
        "day_of_week",
        "train_type",
        "route_distance_km",
        "is_major_junction",
        "is_origin",
        "is_destination",
    ]
    x = df[feature_cols].astype(float).values
    y = df["delay_min"].astype(float).values
    groups = df["train_number"].astype(str).values
    return x, y, groups, feature_cols


def build_train_day_frame(df: pd.DataFrame) -> pd.DataFrame:
    """One row per train × run_date (destination / max delay)."""
    agg = (
        df.groupby(["train_number", "run_date"], as_index=False)
        .agg(
            delay_max=("delay_min", "max"),
            delay_mean=("delay_min", "mean"),
            delay_dest=("delay_min", lambda s: float(s.iloc[-1])),
            stations_on_run=("stations_on_run", "max"),
            route_distance_km=("route_distance_km", "max"),
            train_type=("train_type", "max"),
            scheduled_hour=("scheduled_hour", "first"),
            day_of_week=("day_of_week", "first"),
        )
    )
    agg["target_delay_min"] = agg["delay_max"]
    return agg


def build_train_day_feature_matrix(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    td = build_train_day_frame(df)
    feature_cols = [
        "stations_on_run",
        "route_distance_km",
        "train_type",
        "scheduled_hour",
        "day_of_week",
    ]
    x = td[feature_cols].astype(float).values
    y = td["target_delay_min"].astype(float).values
    groups = td["train_number"].astype(str).values
    return x, y, groups, feature_cols
