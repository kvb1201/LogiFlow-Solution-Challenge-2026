"""
Unified train recommendation explanation: Groq first (free tier), then Gemini.
"""
from typing import Any, Optional, Dict


def generate_train_explanation(
    recommendation: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None,
    timeout_s: int = 4,
) -> Optional[str]:
    provider_timeout = max(2, min(int(timeout_s), 4))
    try:
        from app.services.groq_service import generate_train_explanation as groq_explain

        text = groq_explain(recommendation, context=context, timeout_s=provider_timeout)
        if text:
            return text
    except Exception:
        pass

    try:
        from app.services.gemini_service import generate_train_explanation as gemini_explain

        return gemini_explain(recommendation, context=context, timeout_s=provider_timeout)
    except Exception:
        return None
