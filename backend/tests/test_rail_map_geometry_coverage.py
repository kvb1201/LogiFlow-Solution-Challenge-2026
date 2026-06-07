"""
Supabase-only map geometry coverage (replaces local schedule comparison).
"""
from __future__ import annotations

from pathlib import Path

import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.services import supabase_client as sb
from app.services.geometry_audit import audit_supabase_row
from app.services.route_geometry_store import get_cached_geometry

pytestmark = pytest.mark.skipif(
    not sb.is_configured(),
    reason="Supabase not configured",
)


@pytest.mark.parametrize(
    "train_no,from_code,to_code",
    [
        ("56238", "PRYJ", "BSB"),
        ("19024", "NDLS", "BCT"),
        ("13007", "HWH", "NDLS"),
    ],
)
def test_supabase_cached_geometry_valid(train_no: str, from_code: str, to_code: str):
    row = get_cached_geometry(train_no, from_code, to_code)
    if not row:
        pytest.skip(f"No Supabase row for {train_no} {from_code}→{to_code}")
    result = audit_supabase_row(row)
    assert result.ok, f"{train_no} {from_code}→{to_code}: {result.errors}"
