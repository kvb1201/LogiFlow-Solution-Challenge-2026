"""
100-train audit: each train's scheduled halts must match Supabase map points.

Requires >=100 rows in Supabase. Populate first:
  make sync-rail-geometry-trains TRAINS=100
"""
from __future__ import annotations

import os

import pytest
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.services import supabase_client as sb
from app.services.geometry_audit import run_supabase_geometry_audit
from app.services.route_geometry_store import list_geometry_rows


pytestmark = pytest.mark.skipif(
    not sb.is_configured(),
    reason="Supabase not configured (SUPABASE_URL + SUPABASE_KEY)",
)


def test_supabase_has_at_least_100_geometry_rows():
    rows = list_geometry_rows(limit=100)
    assert len(rows) >= 100, (
        f"Only {len(rows)} rows in Supabase train_route_geometry. "
        "Run: make sync-rail-geometry-trains TRAINS=100"
    )


def test_hundred_train_supabase_geometry_zero_errors():
    report = run_supabase_geometry_audit(limit=100)
    if report.get("error") and report["audited"] < 100:
        pytest.fail(report["error"])
    assert report["audited"] >= 100
    assert report["failed"] == 0, (
        f"{report['failed']}/{report['audited']} Supabase rows failed. "
        f"Failures: {report['failures'][:3]}"
    )
