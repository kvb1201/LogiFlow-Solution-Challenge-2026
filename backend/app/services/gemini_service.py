"""
Gemini REST client for LogiFlow.

Uses the official generateContent API with X-goog-api-key header auth
(AI Studio keys including AQ.* format). Tries fallback models on quota/unavailable errors.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

# gemini_service.py -> backend/app/services -> parents[2] = backend/
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

_MODEL_CACHE: tuple[float, set[str]] | None = None
_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

# Works on current free tier; gemini-2.0-flash often hits quota (429).
_DEFAULT_MODEL = "gemini-2.5-flash"
_MODEL_FALLBACKS = (
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
)


def _gemini_config() -> tuple[str | None, str]:
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY_RAIL")
    model = os.getenv("GEMINI_MODEL_RAIL") or os.getenv("GEMINI_MODEL") or _DEFAULT_MODEL
    return key, model


def _normalize_model_id(model: str) -> str:
    """Return bare id: gemini-2.5-flash (no models/ prefix)."""
    m = (model or "").strip()
    if m.startswith("models/"):
        m = m[len("models/") :]
    return m or _DEFAULT_MODEL


def _model_resource(model: str) -> str:
    """Return API resource path: models/gemini-2.5-flash."""
    mid = _normalize_model_id(model)
    return f"models/{mid}"


def _gemini_headers(api_key: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-goog-api-key": api_key,
    }


def _list_models(api_key: str, timeout_s: int = 10) -> set[str]:
    global _MODEL_CACHE
    if _MODEL_CACHE and (time.time() - _MODEL_CACHE[0]) < 600:
        return _MODEL_CACHE[1]

    try:
        resp = requests.get(
            f"{_API_BASE}/models",
            headers=_gemini_headers(api_key),
            timeout=timeout_s,
        )
        if not resp.ok:
            return set()
        data = resp.json() if resp.content else {}
        names: set[str] = set()
        for m in data.get("models") or []:
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
    Pick a model resource that supports generateContent.
    Accepts gemini-2.5-flash or models/gemini-2.5-flash.
    """
    req = _model_resource(requested)
    available = _list_models(api_key)
    if req in available:
        return req

    for fb in _MODEL_FALLBACKS:
        resource = _model_resource(fb)
        if resource in available:
            return resource
    return req


def _model_try_order(preferred: str) -> list[str]:
    """Deduplicated model ids to try, preferred first."""
    ordered = [_normalize_model_id(preferred), *_MODEL_FALLBACKS]
    seen: set[str] = set()
    out: list[str] = []
    for m in ordered:
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out


def _extract_text(data: dict[str, Any]) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        return ""
    parts = ((candidates[0] or {}).get("content") or {}).get("parts") or []
    return " ".join(
        (p.get("text") or "").strip() for p in parts if isinstance(p, dict)
    ).strip()


def _should_retry_model(status_code: int, body: dict[str, Any]) -> bool:
    if status_code in (404, 429, 503):
        return True
    err = body.get("error") or {}
    status = str(err.get("status") or "").upper()
    return status in ("NOT_FOUND", "RESOURCE_EXHAUSTED", "UNAVAILABLE")


def gemini_generate_content(
    prompt: str,
    *,
    response_mime_type: str | None = None,
    temperature: float = 0.3,
    max_output_tokens: int = 600,
    timeout_s: int = 12,
    model: str | None = None,
) -> tuple[str | None, str | None]:
    """
    Call Gemini generateContent. Returns (text, error_message).
    Tries fallback models when the preferred one is quota-blocked or unavailable.
    """
    api_key, configured = _gemini_config()
    if not api_key:
        return None, "Gemini API key not configured"

    preferred = model or configured
    errors: list[str] = []

    generation_config: dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_output_tokens,
    }
    if response_mime_type:
        generation_config["responseMimeType"] = response_mime_type

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": generation_config,
    }

    for model_id in _model_try_order(preferred):
        resource = _model_resource(model_id)
        url = f"{_API_BASE}/{resource}:generateContent"
        try:
            resp = requests.post(
                url,
                headers=_gemini_headers(api_key),
                json=payload,
                timeout=timeout_s,
            )
            body = resp.json() if resp.content else {}
            if resp.ok:
                text = _extract_text(body)
                if text:
                    return text, None
                errors.append(f"{model_id}: empty response")
                continue

            detail = (body.get("error") or {}).get("message") or resp.text[:160]
            errors.append(f"{model_id}: HTTP {resp.status_code} — {detail}")
            if _should_retry_model(resp.status_code, body):
                continue
            break
        except Exception as exc:
            errors.append(f"{model_id}: {exc}")
            continue

    return None, "; ".join(errors[:3])


def generate_train_explanation(
    recommendation: dict[str, Any],
    context: dict[str, Any] | None = None,
    timeout_s: int = 8,
) -> str | None:
    """Short user-facing rail recommendation justification via Gemini."""
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
    text, _err = gemini_generate_content(
        prompt,
        temperature=0.4,
        max_output_tokens=550,
        timeout_s=timeout_s,
    )
    return text
