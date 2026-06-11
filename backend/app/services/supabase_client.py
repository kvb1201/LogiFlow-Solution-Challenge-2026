"""Optional Supabase REST client for geometry / station caches."""

from __future__ import annotations

import os
from typing import Any

import requests

_URL = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
_KEY = (os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "").strip()


def is_configured() -> bool:
    return bool(_URL and _KEY)


def _headers() -> dict[str, str]:
    return {
        "apikey": _KEY,
        "Authorization": f"Bearer {_KEY}",
        "Content-Type": "application/json",
    }


def rest_get(
    table: str,
    params: dict[str, str],
    *,
    timeout_s: float = 8,
) -> list[dict[str, Any]]:
    if not is_configured():
        return []
    try:
        res = requests.get(
            f"{_URL}/rest/v1/{table}",
            headers={**_headers(), "Accept": "application/json"},
            params=params,
            timeout=timeout_s,
        )
        if not res.ok:
            return []
        data = res.json()
        return data if isinstance(data, list) else []
    except Exception:
        return []


def rest_upsert(table: str, row: dict[str, Any], on_conflict: str) -> bool:
    return rest_upsert_many(table, [row], on_conflict=on_conflict) > 0


def rest_patch(
    table: str,
    match_params: dict[str, str],
    body: dict[str, Any],
    *,
    timeout_s: float = 8,
) -> bool:
    if not is_configured():
        return False
    try:
        res = requests.patch(
            f"{_URL}/rest/v1/{table}",
            headers={**_headers(), "Prefer": "return=minimal"},
            params=match_params,
            json=body,
            timeout=timeout_s,
        )
        return res.status_code in (200, 204)
    except Exception:
        return False


def rest_upsert_many(
    table: str,
    rows: list[dict[str, Any]],
    *,
    on_conflict: str,
    batch_size: int = 200,
) -> int:
    """Bulk upsert rows; returns count of batches accepted."""
    if not is_configured() or not rows:
        return 0
    saved = 0
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        try:
            res = requests.post(
                f"{_URL}/rest/v1/{table}",
                headers={
                    **_headers(),
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
                params={"on_conflict": on_conflict},
                json=chunk,
                timeout=60,
            )
            if res.status_code in (200, 201, 204):
                saved += len(chunk)
        except Exception:
            continue
    return saved
