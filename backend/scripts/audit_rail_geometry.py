#!/usr/bin/env python3
"""Audit: independent train schedule halts vs Supabase map geometry."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")

from app.services.geometry_audit import run_supabase_geometry_audit


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit Supabase train_route_geometry")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    report = run_supabase_geometry_audit(limit=args.limit)
    print(json.dumps(report, indent=2))
    if report.get("error") or report.get("failed", 0) > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
