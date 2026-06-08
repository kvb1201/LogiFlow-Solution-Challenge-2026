#!/usr/bin/env python3
"""Upload rail delay ML model-info to Supabase for instant Vercel reads."""
from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")

from app.services import supabase_client as sb
from app.services.rail_ml_metrics_store import build_model_info_payload, save_model_info_payload


def main() -> None:
    if not sb.is_configured():
        print("ERROR: SUPABASE_URL / SUPABASE_KEY not set in backend/.env")
        sys.exit(1)

    payload = build_model_info_payload()
    if not payload.get("quantifiers"):
        print("WARNING: No quantifiers in payload — run make train-delay-ml first")

    if not save_model_info_payload(payload):
        print("ERROR: Supabase upsert failed")
        sys.exit(1)

    q = payload.get("quantifiers") or []
    print(f"Synced rail_ml_metrics (id=current, {len(q)} quantifiers)")
    print(json.dumps({"trained_at": payload.get("trained_at"), "training_rows": payload.get("training_rows"), "quantifiers": q}, indent=2))


if __name__ == "__main__":
    main()
