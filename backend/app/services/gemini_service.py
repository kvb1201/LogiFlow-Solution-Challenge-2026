"""
Gemini REST client for LogiFlow.

Uses the official generateContent API with X-goog-api-key header auth
(AI Studio keys including AQ.* format). Tries fallback models on quota/unavailable errors.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Optional

import requests
import re
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

# After quota/auth failures, skip Gemini for a cooldown window (avoids 4× timeout chains).
_QUOTA_COOLDOWN_S = max(30, int(os.getenv("GEMINI_QUOTA_COOLDOWN_S", "120")))
_quota_blocked_until: float = 0.0


def _gemini_enabled() -> bool:
    if os.getenv("GEMINI_ENABLED", "true").strip().lower() in ("0", "false", "no", "off"):
        return False
    key, _ = _gemini_config()
    return bool(key)


def _gemini_config() -> tuple[Optional[str], str]:
    key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL") or "gemini-1.5-flash"
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


def _error_status(body: dict[str, Any]) -> str:
    err = body.get("error") or {}
    return str(err.get("status") or "").upper()


def _is_quota_error(status_code: int, body: dict[str, Any]) -> bool:
    if status_code == 429:
        return True
    return _error_status(body) == "RESOURCE_EXHAUSTED"


def _is_auth_error(status_code: int, body: dict[str, Any]) -> bool:
    if status_code in (401, 403):
        return True
    return _error_status(body) in ("UNAUTHENTICATED", "PERMISSION_DENIED")


def _parse_retry_after_s(body: dict[str, Any], message: str) -> int | None:
    err = body.get("error") or {}
    details = err.get("details") or []
    for item in details:
        if not isinstance(item, dict):
            continue
        if item.get("@type") == "type.googleapis.com/google.rpc.RetryInfo":
            delay = (item.get("retryDelay") or "").strip()
            if delay.endswith("s"):
                try:
                    return max(1, int(float(delay[:-1])))
                except ValueError:
                    pass
    match = re.search(r"retry in\s+([\d.]+)s", message, re.I)
    if match:
        try:
            return max(1, int(float(match.group(1))))
        except ValueError:
            pass
    return None


def _should_retry_model(status_code: int, body: dict[str, Any]) -> bool:
    if _is_quota_error(status_code, body) or _is_auth_error(status_code, body):
        return False
    if status_code in (404, 503):
        return True
    return _error_status(body) in ("NOT_FOUND", "UNAVAILABLE")


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
    global _quota_blocked_until

    if not _gemini_enabled():
        return None, "Gemini disabled"

    api_key, configured = _gemini_config()
    if not api_key:
        return None, "Gemini API key not configured"

    if time.time() < _quota_blocked_until:
        return None, "Gemini quota cooldown active"

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

    per_model_timeout = max(4, min(timeout_s, 10))

    for model_id in _model_try_order(preferred):
        resource = _model_resource(model_id)
        url = f"{_API_BASE}/{resource}:generateContent"
        try:
            resp = requests.post(
                url,
                headers=_gemini_headers(api_key),
                json=payload,
                timeout=per_model_timeout,
            )
            body = resp.json() if resp.content else {}
            if resp.ok:
                candidates = body.get("candidates") or []
                if candidates:
                    c = candidates[0] or {}
                    finish_reason = c.get("finishReason")
                    if finish_reason and finish_reason != "STOP":
                        print(f"[GeminiService] Warning: model {model_id} finished with reason {finish_reason}")
                        print(f"[GeminiService] Candidate content: {c.get('content')}")
                text = _extract_text(body)
                if text:
                    return text, None
                errors.append(f"{model_id}: empty response")
                continue

            detail = (body.get("error") or {}).get("message") or resp.text[:160]
            errors.append(f"{model_id}: HTTP {resp.status_code} — {detail}")
            if _is_quota_error(resp.status_code, body):
                retry_s = _parse_retry_after_s(body, detail) or _QUOTA_COOLDOWN_S
                _quota_blocked_until = time.time() + retry_s
                break
            if _is_auth_error(resp.status_code, body):
                break
            if _should_retry_model(resp.status_code, body):
                continue
            break
        except Exception as exc:
            errors.append(f"{model_id}: {exc}")
            continue

    return None, "; ".join(errors[:2])


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


def generate_generic_explanation(
    pipeline: str,
    priority: str,
    route_data: dict[str, Any],
    context: dict[str, Any] | None = None,
    timeout_s: int = 15,
) -> str | None:
    """Generic pipeline route explanation for /explain API."""
    ctx = context or {}
    prompt = (
        "You are LogiFlow, an intelligent multimodal cargo assistant.\n"
        f"You are explaining a {pipeline} route option to the user.\n"
        f"The user prioritized: {priority}.\n"
        "Write a concise, pointwise explanation analyzing this route. Highlight why it's good or why it might not be ideal.\n"
        "Use the provided fields only; do not invent distances or costs.\n"
        "Keep the explanation practical and keep constraints in mind.\n"
        f"Route Details: {route_data}\n"
        f"Context/Best Options: {ctx}\n\n"
        "Structure your response strictly as:\n"
        "- A concise 1-2 sentence overview of the route's value proposition.\n"
        "- 3 to 5 detailed bullet points analyzing specific tradeoffs (cost, speed, risk, and specialized constraints).\n"
        "Keep each bullet point informative but under 25 words."
    )
    text, err = gemini_generate_content(
        prompt,
        temperature=0.3,
        max_output_tokens=400,
        timeout_s=timeout_s,
    )
    if not text and err:
        print(f"[GeminiService] generic explanation error: {err}")
    return text


def generate_transport_followup_response(
    question: str,
    context: dict[str, Any] | None = None,
    history: list[dict[str, Any]] | None = None,
    timeout_s: int = 8,
) -> dict[str, Any]:
    """
    Conversational follow-up for hybrid comparator context.
    Returns {answer, error_kind?, retry_after_s?, provider_message?}.
    """
    ctx = context or {}
    hist = history or []
    hist_lines = []
    for msg in hist[-6:]:
        role = str((msg or {}).get("role") or "user")
        content = str((msg or {}).get("content") or "").strip()
        if content:
            hist_lines.append(f"{role}: {content}")

    prompt = (
        "You are LogiFlow, a multimodal cargo planning assistant.\n"
        "Answer the user's question using ONLY the route comparison context below.\n"
        "Be concise (under 120 words). Do not mention Gemini or AI.\n\n"
        f"Context JSON: {ctx}\n"
        f"Recent chat:\n" + "\n".join(hist_lines) + "\n\n"
        f"User question: {question.strip()}\n"
    )

    text, err = gemini_generate_content(
        prompt,
        temperature=0.35,
        max_output_tokens=400,
        timeout_s=timeout_s,
    )
    if text:
        return {"answer": text.strip()}

    if not err:
        return {"answer": None, "error_kind": "provider_unavailable"}

    err_l = err.lower()
    if "quota" in err_l or "429" in err_l or "resource_exhausted" in err_l:
        retry_s = _parse_retry_after_s({}, err)
        return {
            "answer": None,
            "error_kind": "quota_exceeded",
            "retry_after_s": retry_s,
            "provider_message": err,
        }
    if "disabled" in err_l or "not configured" in err_l:
        return {"answer": None, "error_kind": "disabled", "provider_message": err}
    if "auth" in err_l or "401" in err_l or "403" in err_l:
        return {"answer": None, "error_kind": "auth_failed", "provider_message": err}
    if "timeout" in err_l or "timed out" in err_l:
        return {"answer": None, "error_kind": "timeout", "provider_message": err}

    return {"answer": None, "error_kind": "provider_unavailable", "provider_message": err}
