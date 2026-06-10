import logging
import os
from typing import Optional

import jwt
from datetime import datetime, timedelta, UTC
from google.oauth2 import id_token
from google.auth.transport import requests

logger = logging.getLogger(__name__)


def _is_production() -> bool:
    # Only hosted deploy markers — never treat local Next/Vercel CLI as production.
    return bool(os.getenv("RENDER") or os.getenv("RAILWAY_ENVIRONMENT"))


def _env(name: str, *, dev_default: str) -> str:
    val = (os.getenv(name) or "").strip()
    if val:
        return val
    if _is_production():
        raise RuntimeError(f"{name} environment variable is required in production")
    return dev_default


# JWT config — resolved at module level is fine (not audience-sensitive)
JWT_SECRET = _env("JWT_SECRET", dev_default="local-dev-jwt-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7


def _get_allowed_audiences() -> list[str]:
    """
    Build the list of allowed Google OAuth client IDs at call-time so that
    environment variables are always read after load_dotenv() has run.

    Resolution order:
      1. GOOGLE_ALLOWED_CLIENT_IDS — comma-separated list (multi-env support)
      2. GOOGLE_CLIENT_ID           — single client ID (backward compat)
      3. dev_default                — local fallback (will only work if Google
                                      actually issued a token for this ID, which
                                      it won't — so auth will fail fast with a
                                      clear error rather than silently using a
                                      placeholder that can never match)
    """
    multi = (os.getenv("GOOGLE_ALLOWED_CLIENT_IDS") or "").strip()
    if multi:
        return [cid.strip() for cid in multi.split(",") if cid.strip()]

    single = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    if single:
        return [single]

    if _is_production():
        raise RuntimeError(
            "GOOGLE_CLIENT_ID or GOOGLE_ALLOWED_CLIENT_IDS must be set in production"
        )

    # In dev, return an empty list so the error message below is actionable.
    return []


def verify_google_token(credential: str) -> dict:
    """
    Verifies the Google OAuth token and returns user info.
    Raises ValueError if invalid.
    """
    allowed_audiences = _get_allowed_audiences()

    if not allowed_audiences:
        raise ValueError(
            "Google OAuth is not configured: set GOOGLE_CLIENT_ID in backend/.env"
        )

    logger.debug(
        "[oauth] verifying token | allowed_audiences=%s",
        [aud[:20] + "..." for aud in allowed_audiences],  # truncate for safety
    )

    last_error: Exception | None = None
    for audience in allowed_audiences:
        try:
            id_info = id_token.verify_oauth2_token(
                credential,
                requests.Request(),
                audience,
            )
            logger.debug("[oauth] token verified for audience prefix=%s...", audience[:20])
            return id_info
        except ValueError as exc:
            last_error = exc
            logger.debug(
                "[oauth] audience mismatch | tried=%s... | error=%s",
                audience[:20],
                str(exc),
            )

    # All audiences failed — log enough to debug without leaking the full token
    received_audience = _extract_token_audience(credential)
    logger.warning(
        "[oauth] token rejected | received_audience=%s | allowed_count=%d",
        received_audience,
        len(allowed_audiences),
    )
    raise ValueError(
        f"Invalid Google token: {last_error}. "
        f"Received audience: {received_audience}. "
        f"Check that GOOGLE_CLIENT_ID in backend/.env matches "
        f"NEXT_PUBLIC_GOOGLE_CLIENT_ID in frontend/.env.local."
    )


def _extract_token_audience(credential: str) -> str:
    """
    Decode the JWT payload without verifying signature to extract the audience
    for diagnostic logging. Never trust unverified fields for auth decisions.
    """
    try:
        import base64
        import json

        parts = credential.split(".")
        if len(parts) < 2:
            return "<unparseable>"
        padding = 4 - len(parts[1]) % 4
        payload_bytes = base64.urlsafe_b64decode(parts[1] + "=" * padding)
        payload = json.loads(payload_bytes)
        return str(payload.get("aud", "<missing>"))
    except Exception:
        return "<unparseable>"

def create_access_token(user_id: str, email: str, provider: str = "google") -> str:
    """
    Generates a JWT for the authenticated user.
    """
    expire = datetime.now(UTC) + timedelta(days=JWT_EXPIRATION_DAYS)
    payload = {
        "sub": str(user_id),
        "email": email,
        "provider": provider,
        "exp": expire,
        "iat": datetime.now(UTC)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    """
    Decodes and validates a JWT. Returns payload if valid, None otherwise.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
