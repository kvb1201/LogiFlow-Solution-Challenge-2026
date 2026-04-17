# This service calls the Gemini API to turn structured route comparison data into natural-language explanations.
import json
import os
from pathlib import Path
from typing import Any, Dict, List

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()
GEMINI_MODEL = (os.getenv("GEMINI_MODEL") or "gemini-1.5-flash-latest").strip()
GEMINI_API_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)


def is_gemini_enabled() -> bool:
    return bool(GEMINI_API_KEY)


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
    ranked_routes: List[Dict[str, Any]],
    recommended_mode: str,
) -> Dict[str, Any] | None:
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
                "Keep the overall reason to 1-2 sentences",
                "Keep each route explanation to 1 sentence",
                "Return valid JSON only",
            ],
            "response_schema": {
                "reason": "string",
                "tradeoffs": ["string"],
                "mode_insights": {"road": ["string"], "rail": ["string"], "air": ["string"]},
                "route_explanations": {"road": "string", "rail": "string", "air": "string"},
            },
        },
    }

    request_body = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "You are generating explainability text for a multimodal cargo optimizer. "
                            "Return JSON only.\n"
                            f"{json.dumps(prompt_payload, ensure_ascii=True)}"
                        )
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.4,
            "responseMimeType": "application/json",
        },
    }

    try:
        response = requests.post(
            GEMINI_API_URL,
            params={"key": GEMINI_API_KEY},
            json=request_body,
            timeout=12,
        )
        response.raise_for_status()
        data = response.json()
        text = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        if not text:
            return None
        return json.loads(_clean_json_block(text))
    except Exception as exc:
        print(f"[GeminiExplainer] Gemini explanation failed: {exc}")
        return None
