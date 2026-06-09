"""Supabase cache for rail delay ML model-info (Vercel reads without Render)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services import supabase_client as sb

_TABLE = "rail_ml_metrics"
_ROW_ID = "current"


def build_model_info_payload() -> dict[str, Any]:
    """Same shape as GET /railway/model-info."""
    from app.pipelines.rail.ml_models import get_model_info

    return get_model_info()


def save_model_info_payload(payload: dict[str, Any] | None = None) -> bool:
    if not sb.is_configured():
        return False
    data = payload if payload is not None else build_model_info_payload()
    trained_raw = data.get("trained_at")
    trained_at: str | None = None
    if trained_raw:
        trained_at = str(trained_raw)
    row = {
        "id": _ROW_ID,
        "payload": data,
        "trained_at": trained_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return sb.rest_upsert(_TABLE, row, on_conflict="id")


def load_model_info_payload() -> dict[str, Any] | None:
    if not sb.is_configured():
        return None
    rows = sb.rest_get(_TABLE, {"id": f"eq.{_ROW_ID}", "select": "payload", "limit": "1"})
    if not rows:
        return None
    payload = rows[0].get("payload")
    return payload if isinstance(payload, dict) else None
