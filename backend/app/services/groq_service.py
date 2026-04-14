import os
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _groq_config() -> tuple[str | None, str]:
    key = os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY_RAIL")
    model = os.getenv("GROQ_MODEL_RAIL") or os.getenv("GROQ_MODEL") or "llama-3.1-8b-instant"
    return key, model


def _build_prompt(rec: dict[str, Any], ctx: dict[str, Any]) -> str:
    return (
        "You are LogiFlow, a railway cargo assistant.\n"
        "Write a concise, user-facing explanation for why THIS train/route is recommended.\n"
        "Keep it short and pointwise.\n"
        "Use only the facts below; do not invent station names, times, or guarantees.\n"
        "Do not mention Groq, Gemini, or LLMs.\n\n"
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


def generate_train_explanation(
    recommendation: dict[str, Any],
    context: dict[str, Any] | None = None,
    timeout_s: int = 4,
) -> str | None:
    """
    Short user-facing justification via Groq OpenAI-compatible API.
    Reads GROQ_API_KEY (or GROQ_API_KEY_RAIL) and GROQ_MODEL / GROQ_MODEL_RAIL.
    """
    api_key, model = _groq_config()
    if not api_key:
        return None

    rec = recommendation or {}
    ctx = context or {}
    prompt = _build_prompt(rec, ctx)

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens": 520,
            },
            timeout=timeout_s,
        )
        if not resp.ok:
            return None
        data = resp.json() if resp.content else {}
        choices = data.get("choices") or []
        if not choices:
            return None
        msg = (choices[0] or {}).get("message") or {}
        text = (msg.get("content") or "").strip()
        return text or None
    except Exception:
        return None
