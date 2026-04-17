from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Literal
from app.pipelines.hybrid.pipeline import HybridPipeline

router = APIRouter()

# ------------------ Request Schema ------------------

class Preferences(BaseModel):
    preferred_mode: Optional[str] = None


class Cargo(BaseModel):
    weight: float = 100
    type: str = "general"


class Constraints(BaseModel):
    excluded_modes: List[str] = Field(default_factory=list)
    risk_threshold: Optional[float] = None
    delay_tolerance_hours: Optional[float] = None
    max_transshipments: Optional[int] = None
    budget_max_inr: Optional[float] = None
    max_stops: Optional[int] = None
    budget_limit: Optional[float] = None

class OptimizeRequest(BaseModel):
    source: str
    destination: str
    priority: str
    departure_date: Optional[str] = None
    cargo_weight_kg: float = 100
    cargo_type: str = "General"
    cargo: Optional[Cargo] = Field(default_factory=Cargo)
    preferences: Optional[Preferences] = Field(default_factory=Preferences)
    constraints: Optional[Constraints] = Field(default_factory=Constraints)


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class HybridAssistantRequest(BaseModel):
    question: str
    context: Dict[str, Any] = Field(default_factory=dict)
    history: List[AssistantMessage] = Field(default_factory=list)


def _to_float(value: Any) -> float | None:
    try:
        n = float(value)
        return n
    except Exception:
        return None


def _format_mode_summary(row: Dict[str, Any]) -> str:
    mode = str(row.get("mode") or "mode").upper()
    time_hr = _to_float(row.get("time_hr"))
    cost_inr = _to_float(row.get("cost_inr"))
    risk = _to_float(row.get("risk"))

    parts: list[str] = []
    if time_hr is not None:
        parts.append(f"{time_hr:.2f}h")
    if cost_inr is not None:
        parts.append(f"Rs.{int(round(cost_inr))}")
    if risk is not None:
        parts.append(f"{round(risk * 100):.0f}% risk")

    if parts:
        return f"{mode}: " + ", ".join(parts)
    return f"{mode}: data not available"


def _build_hybrid_fallback_answer(question: str, context: Dict[str, Any]) -> str:
    q = (question or "").lower()
    source = str(context.get("source") or "source")
    destination = str(context.get("destination") or "destination")
    priority = str(context.get("priority") or "balanced").lower()
    recommended_mode = str(context.get("recommended_mode") or "").lower().strip()
    recommended_reason = str(context.get("recommended_reason") or context.get("reason") or "").strip()
    comparison = context.get("comparison") if isinstance(context.get("comparison"), list) else []
    tradeoffs = context.get("tradeoffs") if isinstance(context.get("tradeoffs"), list) else []

    if recommended_mode:
        intro = f"For {source} to {destination}, the current recommendation is {recommended_mode.upper()} for {priority} priority."
    else:
        intro = f"For {source} to {destination}, I can compare ROAD, RAIL, and AIR tradeoffs for {priority} priority."

    if recommended_reason:
        intro += f" {recommended_reason}"

    mode_rows = []
    for row in comparison:
        if isinstance(row, dict) and row.get("mode"):
            mode_rows.append(row)

    mode_lines = [_format_mode_summary(row) for row in mode_rows[:3]]
    tradeoff_lines = [str(x).strip() for x in tradeoffs[:3] if str(x).strip()]

    detailed_intro = [intro]
    if mode_lines:
        detailed_intro.append("Mode snapshot: " + " | ".join(mode_lines))
    if tradeoff_lines:
        detailed_intro.append("Tradeoffs: " + " | ".join(tradeoff_lines))
    detailed_intro.append("If you want, I can also break this down by cost, time, risk, or explain why one mode is not chosen.")

    detailed_intro_text = "\n".join(detailed_intro)

    if "why" in q and recommended_mode:
        return detailed_intro_text

    if any(k in q for k in ["cheapest", "cost", "expensive", "price"]):
        best_mode = None
        best_cost = None
        for row in comparison:
            if not isinstance(row, dict):
                continue
            c = _to_float(row.get("cost_inr"))
            mode = str(row.get("mode") or "").lower()
            if c is None or not mode:
                continue
            if best_cost is None or c < best_cost:
                best_cost = c
                best_mode = mode
        if best_mode and best_cost is not None:
            summary = f"Cheapest option is {best_mode.upper()} at about Rs.{int(round(best_cost))}."
            if recommended_mode and recommended_mode != best_mode:
                summary += f" That is different from the current recommendation, which is {recommended_mode.upper()} for {priority} priority."
            return summary + "\n" + detailed_intro_text
        return f"I could not read exact cost rows, but {recommended_mode.upper() if recommended_mode else 'the recommended mode'} is currently prioritized in your result.\n" + detailed_intro_text

    if any(k in q for k in ["fast", "time", "eta", "quick"]):
        best_mode = None
        best_time = None
        for row in comparison:
            if not isinstance(row, dict):
                continue
            t = _to_float(row.get("time_hr"))
            mode = str(row.get("mode") or "").lower()
            if t is None or not mode:
                continue
            if best_time is None or t < best_time:
                best_time = t
                best_mode = mode
        if best_mode and best_time is not None:
            summary = f"Fastest option is {best_mode.upper()} at about {best_time:.2f} hours."
            if recommended_mode and recommended_mode != best_mode:
                summary += f" The recommendation still favors {recommended_mode.upper()} because it balances the selected priority better."
            return summary + "\n" + detailed_intro_text
        return detailed_intro_text

    if any(k in q for k in ["risk", "safe", "safest", "reliable", "delay"]):
        lowest_risk_mode = None
        lowest_risk = None
        for row in comparison:
            if not isinstance(row, dict):
                continue
            r = _to_float(row.get("risk"))
            mode = str(row.get("mode") or "").lower()
            if r is None or not mode:
                continue
            if lowest_risk is None or r < lowest_risk:
                lowest_risk = r
                lowest_risk_mode = mode
        if lowest_risk_mode and lowest_risk is not None:
            summary = f"Lowest-risk option is {lowest_risk_mode.upper()} at about {round(lowest_risk * 100)}% modeled risk."
            if recommended_mode and recommended_mode != lowest_risk_mode:
                summary += f" The recommendation still favors {recommended_mode.upper()} because the overall tradeoff is better for {priority} priority."
            return summary + "\n" + detailed_intro_text
        return detailed_intro_text

    if tradeoffs:
        top = [str(x).strip() for x in tradeoffs[:2] if str(x).strip()]
        if top:
            return f"{intro}\nKey tradeoffs: {' | '.join(top)}\n" + detailed_intro_text

    return detailed_intro_text

# ------------------ API ------------------

@router.post("/optimize")
def optimize(data: OptimizeRequest):
    # Normalize priority aliases to what scorer expects.
    p = (data.priority or "").strip()
    p_l = p.lower()
    if p_l in {"fast", "cheap", "safe"}:
        data.priority = p_l.capitalize()  # fast->Fast, cheap->Cheap, safe->Safe

    pipeline = HybridPipeline()

    payload = {
        "priority": data.priority.lower(),
        "cargo_weight_kg": data.cargo.weight if data.cargo else data.cargo_weight_kg,
        "cargo_type": data.cargo.type if data.cargo else data.cargo_type,
        "budget": data.constraints.budget_limit or data.constraints.budget_max_inr if data.constraints else None,
        "max_stops": data.constraints.max_stops if data.constraints else None,
        "preferred_mode": data.preferences.preferred_mode if data.preferences else None,
        "constraints": data.constraints.dict() if data.constraints else {},
    }

    return pipeline.generate(data.source, data.destination, payload)


@router.post("/optimize/assistant")
def hybrid_assistant(data: HybridAssistantRequest):
    from app.services.gemini_service import generate_transport_followup_response

    question = (data.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    assistant_result = generate_transport_followup_response(
        question=question,
        context=data.context,
        history=[message.model_dump() for message in data.history],
        timeout_s=5,
    )
    answer = assistant_result.get("answer")
    error_kind = assistant_result.get("error_kind")
    retry_after_s = assistant_result.get("retry_after_s")
    provider_message = str(assistant_result.get("provider_message") or "")

    if not answer:
        fallback_core = _build_hybrid_fallback_answer(question, data.context)
        if error_kind == "quota_exceeded":
            retry_suffix = f" Retry after about {retry_after_s} seconds." if isinstance(retry_after_s, int) and retry_after_s > 0 else ""
            quota_zero_hint = " Your current project quota appears to be 0 for generateContent." if "limit: 0" in provider_message else ""
            answer = (
                "Gemini API request limit appears to be reached right now. "
                "Please try again later or increase your API quota. "
                f"Here is a fallback answer from available route context: {fallback_core}{quota_zero_hint}{retry_suffix}"
            )
        elif error_kind == "auth_failed":
            answer = (
                "Gemini authentication failed (API key/config issue). "
                f"Please verify GEMINI_API_KEY or model settings and retry. Fallback answer: {fallback_core}"
            )
        elif error_kind in ("provider_unavailable", "timeout"):
            answer = (
                "Gemini service is temporarily unavailable. "
                f"Please retry in a moment. Fallback answer: {fallback_core}"
            )
        elif error_kind == "disabled":
            answer = (
                "Gemini is not enabled in this environment. "
                f"Set GEMINI_API_KEY to enable conversational explanations. Fallback answer: {fallback_core}"
            )
        else:
            answer = fallback_core

    return {"answer": answer, "source": "gemini" if not error_kind and assistant_result.get("answer") else "fallback", "error_kind": error_kind}
