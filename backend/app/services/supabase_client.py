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


def rest_get(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    if not is_configured():
        return []
    try:
        res = requests.get(
            f"{_URL}/rest/v1/{table}",
            headers={**_headers(), "Accept": "application/json"},
            params=params,
            timeout=8,
        )
        if not res.ok:
            return []
        data = res.json()
        return data if isinstance(data, list) else []
    except Exception:
        return []


def rest_upsert(table: str, row: dict[str, Any], on_conflict: str) -> bool:
    if not is_configured():
        return False
    try:
        res = requests.post(
            f"{_URL}/rest/v1/{table}",
            headers={
                **_headers(),
                "Prefer": f"resolution=merge-duplicates,return=minimal",
            },
            params={"on_conflict": on_conflict},
            json=row,
            timeout=10,
        )
        return res.status_code in (200, 201, 204)
    except Exception:
        return False
