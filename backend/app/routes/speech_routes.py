"""Server-side speech transcription fallback (Groq Whisper) when browser STT fails."""
from __future__ import annotations

import os

import requests
from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from app.middleware.rate_limit import INTENT_LIMIT, rate_limit

router = APIRouter(prefix="/speech", tags=["speech"])

_MAX_BYTES = 8 * 1024 * 1024
_WHISPER_MODEL = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")


@router.post("/transcribe")
@rate_limit(INTENT_LIMIT)
async def transcribe_speech(request: Request, file: UploadFile = File(...)):
    api_key = os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY_RAIL")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Server speech transcription is not configured (GROQ_API_KEY missing).",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio upload.")
    if len(raw) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Audio too long — keep recordings under ~60 seconds.")

    content_type = (file.content_type or "audio/webm").split(";")[0]
    filename = file.filename or "speech.webm"

    try:
        res = requests.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": (filename, raw, content_type)},
            data={"model": _WHISPER_MODEL, "language": "en", "response_format": "json"},
            timeout=45,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Transcription service unreachable: {exc}") from exc

    if res.status_code != 200:
        detail = res.text[:300] if res.text else res.reason
        raise HTTPException(status_code=502, detail=f"Transcription failed: {detail}")

    payload = res.json()
    text = str(payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="No speech detected — try speaking closer to the mic.")

    return {"text": text, "source": "groq_whisper"}
