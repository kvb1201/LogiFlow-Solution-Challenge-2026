# Gemini-backed natural-language explanations for hybrid multimodal comparisons.
import json
from typing import Any

from app.services.gemini_service import _gemini_config, gemini_generate_content


def is_gemini_enabled() -> bool:
    key, _ = _gemini_config()
    return bool(key)


def _clean_json_block(text: str) -> str:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) >= 3:
            cleaned = parts[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
    return cleaned.strip()


def generate_hybrid_explanations(
    *,
    priority: str,
    ranked_routes: list[dict[str, Any]],
    recommended_mode: str,
) -> dict[str, Any] | None:
    if not is_gemini_enabled():
        return None

    prompt_payload = {
        "priority": priority,
        "recommended_mode": recommended_mode,
        "ranked_routes": ranked_routes,
        "instructions": {
            "tone": "clear, practical, concise",
            "audience": "cargo logistics decision-maker",
            "constraints": [
                "Use only the supplied route data",
                "Do not invent facts or numbers",
                "Keep the overall reason under 15 words",
                "Keep each route explanation, tradeoff, and insight extremely brief and under 12 words",
                "Return valid JSON only and avoid any wordiness to prevent truncation",
            ],
            "response_schema": {
                "reason": "string",
                "tradeoffs": ["string"],
                "mode_insights": {"road": ["string"], "rail": ["string"], "air": ["string"], "water": ["string"]},
                "route_explanations": {"road": "string", "rail": "string", "air": "string", "water": "string"},
            },
        },
    }

    prompt = (
        "You are generating explainability text for a multimodal cargo optimizer. "
        "Return JSON only.\n"
        f"{json.dumps(prompt_payload, ensure_ascii=True)}"
    )

    text, err = gemini_generate_content(
        prompt,
        response_mime_type="application/json",
        temperature=0.4,
        max_output_tokens=1500,
        timeout_s=10,
    )
    if not text:
        if err:
            print(f"[GeminiExplainer] Gemini explanation failed: {err}")
        return None

    try:
        return json.loads(_clean_json_block(text), strict=False)
    except Exception as exc:
        print(f"[GeminiExplainer] JSON parse failed: {exc}")
        print(f"[GeminiExplainer] Raw text was: {text}")
        return None
