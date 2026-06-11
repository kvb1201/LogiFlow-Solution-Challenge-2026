from __future__ import annotations

import json
import queue
import threading
from typing import List, Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.route_composer import RouteComposer
from app.utils.request_context import RequestContext
from app.middleware.rate_limit import rate_limit, COMPOSE_LIMIT

router = APIRouter()


class ComposeCargo(BaseModel):
    weight: float = 100
    type: str = "general"


class ComposeConstraints(BaseModel):
    excluded_modes: List[str] = Field(default_factory=list)
    max_transshipments: Optional[int] = None
    budget_max_inr: Optional[float] = None
    budget_limit: Optional[float] = None
    delay_tolerance_hours: Optional[float] = None


class ComposeOptions(BaseModel):
    max_hubs: int = 2
    budget_seconds: int = 42
    include_road_water: bool = False


class ComposeRequest(BaseModel):
    source: str
    destination: str
    priority: str = "balanced"
    departure_date: Optional[str] = None
    cargo_weight_kg: float = 100
    cargo_type: str = "General"
    cargo: Optional[ComposeCargo] = Field(default_factory=ComposeCargo)
    constraints: Optional[ComposeConstraints] = Field(default_factory=ComposeConstraints)
    compose_options: Optional[ComposeOptions] = Field(default_factory=ComposeOptions)
    scenario_brief: Optional[str] = None


def _request_payload(data: ComposeRequest) -> dict:
    return {
        "priority": (data.priority or "balanced").lower(),
        "cargo_weight_kg": data.cargo.weight if data.cargo else data.cargo_weight_kg,
        "cargo_type": data.cargo.type if data.cargo else data.cargo_type,
        "departure_date": data.departure_date,
        "scenario_brief": data.scenario_brief,
        "budget": (
            (data.constraints.budget_limit or data.constraints.budget_max_inr)
            if data.constraints
            else None
        ),
        "constraints": data.constraints.dict() if data.constraints else {},
        "compose_options": data.compose_options.dict() if data.compose_options else {},
    }


@router.post("/compose")
@rate_limit(COMPOSE_LIMIT)
def compose_multimodal(request: Request, data: ComposeRequest):
    context = RequestContext()
    composer = RouteComposer()
    return composer.compose(
        data.source,
        data.destination,
        _request_payload(data),
        context=context,
    )


@router.post("/compose/stream")
@rate_limit(COMPOSE_LIMIT)
def compose_multimodal_stream(request: Request, data: ComposeRequest):
    """SSE stream — emit ranked partial itineraries as legs are discovered."""
    context = RequestContext()
    composer = RouteComposer()
    payload = _request_payload(data)
    events: queue.SimpleQueue[dict] = queue.SimpleQueue()

    def on_progress(snap: dict) -> None:
        events.put({**snap, "done": False})

    def run() -> None:
        try:
            result = composer.compose(
                data.source,
                data.destination,
                payload,
                context=context,
                on_progress=on_progress,
            )
            events.put({**result, "done": True, "streaming": False})
        except Exception as exc:
            events.put({"error": str(exc), "done": True, "streaming": False})

    threading.Thread(target=run, name="compose-stream", daemon=True).start()

    def generate():
        while True:
            item = events.get()
            yield f"data: {json.dumps(item, default=str)}\n\n"
            if item.get("done"):
                break

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
