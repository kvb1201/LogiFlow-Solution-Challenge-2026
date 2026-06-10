from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.intent_parser import parse_shipment_intent
from app.middleware.rate_limit import rate_limit, INTENT_LIMIT

intent_router = APIRouter(prefix="/intent", tags=["intent"])


class IntentParsePayload(BaseModel):
    user_brief: str
    context_mode: str = "home"


@intent_router.post("/parse")
@rate_limit(INTENT_LIMIT)
def parse_intent(request: Request, payload: IntentParsePayload):
    try:
        result = parse_shipment_intent(payload.user_brief, payload.context_mode)
        if result.get("error") and not result.get("applied"):
            raise HTTPException(status_code=422, detail=result.get("error"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
