import os
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv


# Load backend/.env if present (same convention as other services).
# gemini_service.py -> backend/app/services -> parents[2] = backend/
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

_MODEL_CACHE: tuple[float, set[str]] | None = None


def _gemini_config() -> tuple[str | None, str]:
    # Prefer generic env vars, but support rail-scoped ones too.
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY_RAIL")
    # If you set GEMINI_MODEL globally for other pipelines, rail can override via GEMINI_MODEL_RAIL.
    model = os.getenv("GEMINI_MODEL_RAIL") or os.getenv("GEMINI_MODEL") or "gemini-2.0-flash"
    return key, model


def _list_models(api_key: str, timeout_s: int = 10) -> set[str]:
    global _MODEL_CACHE
    # Cache for 10 minutes to avoid extra calls.
    import time

    if _MODEL_CACHE and (time.time() - _MODEL_CACHE[0]) < 600:
        return _MODEL_CACHE[1]

    try:
        resp = requests.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": api_key},
            timeout=timeout_s,
        )
        if not resp.ok:
            return set()
        data = resp.json() if resp.content else {}
        names = set()
        for m in (data.get("models") or []):
            n = (m or {}).get("name")
            methods = (m or {}).get("supportedGenerationMethods") or []
            if n and "generateContent" in methods:
                names.add(str(n))
        _MODEL_CACHE = (time.time(), names)
        return names
    except Exception:
        return set()


def _resolve_model_name(api_key: str, requested: str) -> str:
    """
    Ensure model name exists and supports generateContent.
    Accepts either 'gemini-2.0-flash' or 'models/gemini-2.0-flash'.
    """
    req = (requested or "").strip()
    if not req:
        req = "gemini-2.0-flash"
    if not req.startswith("models/"):
        req = f"models/{req}"

    available = _list_models(api_key)
    if req in available:
        return req

    # Fallbacks: prefer a Flash model for latency/cost.
    for fb in ("models/gemini-2.0-flash", "models/gemini-2.5-flash", "models/gemini-2.0-flash-lite"):
        if fb in available:
            return fb
    # Last resort: return requested even if not in cache.
    return req


def generate_train_explanation(
    recommendation: dict[str, Any],
    context: dict[str, Any] | None = None,
    timeout_s: int = 4,
) -> str | None:
    """
    Use Gemini to produce a short, user-facing justification for why a train was chosen.
    Reads GEMINI_API_KEY and GEMINI_MODEL from env.
    """
    api_key, model = _gemini_config()
    if not api_key:
        return None
    # Support common alias used in curl examples.
    if (model or "").strip() == "gemini-flash-latest":
        model = "models/gemini-flash-latest"
    model_name = _resolve_model_name(api_key, model)

    rec = recommendation or {}
    ctx = context or {}

    prompt = (
        "You are LogiFlow, a railway cargo assistant.\n"
        "Write a concise, pointwise explanation for why THIS train/route is recommended.\n"
        "Use the provided fields only; do not invent facts. Avoid mentioning 'Gemini' or 'LLM'.\n"
        "If reliability evidence is present (RailRadar delays, RailYatri past record), mention it carefully.\n\n"
        f"Recommendation priority: {rec.get('priority')}\n"
        f"Train: {rec.get('train_number')} {rec.get('train_name')}\n"
        f"From/To: {ctx.get('origin')} -> {ctx.get('destination')}\n"
        f"Duration (hours): {rec.get('duration_hours')}\n"
        f"Cost (INR): {rec.get('parcel_cost_inr')}\n"
        f"Risk score: {rec.get('risk_pct') or rec.get('risk_score')}\n"
        f"Key factors: {', '.join(rec.get('key_factors') or [])}\n"
        f"Delay info: {rec.get('delay_info')}\n"
        f"RailYatri past track record: {ctx.get('railyatri_past_track_record')}\n"
        "\n"
        "Structure your response as:\n"
        "- 1 sentence summary\n"
        "- Exactly 3 or 4 bullet points only\n"
        "- Keep each bullet to one line\n"
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/{model_name}:generateContent"
    try:
        resp = requests.post(
            url,
            # Prefer header auth (works with curl's X-goog-api-key); also pass query param for compatibility.
            headers={"Content-Type": "application/json", "X-goog-api-key": api_key},
            params={"key": api_key},
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.4,
                    "maxOutputTokens": 550,
                },
            },
            timeout=timeout_s,
        )
        if not resp.ok:
            return None
        data = resp.json() if resp.content else {}
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        content = (candidates[0] or {}).get("content") or {}
        parts = content.get("parts") or []
        text = " ".join([(p.get("text") or "").strip() for p in parts if isinstance(p, dict)]).strip()
        return text or None
    except Exception:
        return None

