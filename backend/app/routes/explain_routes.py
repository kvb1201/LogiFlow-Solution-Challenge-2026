from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict
from app.services.gemini_service import generate_generic_explanation

router = APIRouter(prefix="/explain", tags=["explanation"])

class ExplainPayload(BaseModel):
    pipeline: str
    priority: str
    route_data: Dict[str, Any]
    context: Dict[str, Any] = {}

@router.post("")
def explain_route(payload: ExplainPayload):
    try:
        explanation = generate_generic_explanation(
            pipeline=payload.pipeline,
            priority=payload.priority,
            route_data=payload.route_data,
            context=payload.context
        )
        if not explanation:
            raise HTTPException(status_code=500, detail="Failed to generate explanation")
        return {"explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
