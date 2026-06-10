"""
Condition History V1 — lightweight history stored in optimization_result.

No new database table. History entries are appended to:
  optimization_result.condition_history

Max 20 entries (rolling window — oldest dropped when limit exceeded).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any


_MAX_HISTORY = 20


def append_condition_history(
    optimization_result: dict[str, Any],
    health_score: int,
    health_level: str,
    condition_profile_dict: dict[str, Any],
    now: datetime,
) -> dict[str, Any]:
    """
    Append a new condition entry to optimization_result.condition_history.

    Returns the updated optimization_result dict (does not mutate in place).
    """
    result = dict(optimization_result)
    history: list[dict[str, Any]] = list(result.get("condition_history") or [])

    entry = {
        "evaluated_at": now.isoformat(),
        "health_score": health_score,
        "health_level": health_level,
        "traffic_score": condition_profile_dict.get("traffic_score"),
        "weather_score": condition_profile_dict.get("weather_score"),
        "congestion_score": condition_profile_dict.get("congestion_score"),
        "route_adherence_score": condition_profile_dict.get("route_adherence_score"),
        "eta_variance_score": condition_profile_dict.get("eta_variance_score"),
        "confidence_score": condition_profile_dict.get("confidence_score"),
        "signal_freshness": condition_profile_dict.get("signal_freshness", {}),
        "signals_refreshed_at": condition_profile_dict.get("signals_refreshed_at"),
    }

    history.append(entry)

    # Keep only the most recent _MAX_HISTORY entries
    if len(history) > _MAX_HISTORY:
        history = history[-_MAX_HISTORY:]

    result["condition_history"] = history
    return result


def get_condition_history(
    optimization_result: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Return condition history entries, newest first."""
    if not optimization_result:
        return []
    history = list(optimization_result.get("condition_history") or [])
    return list(reversed(history))
