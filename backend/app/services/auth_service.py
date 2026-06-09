import os
import jwt
from datetime import datetime, timedelta, UTC
from typing import Optional
from google.oauth2 import id_token
from google.auth.transport import requests

def _is_production() -> bool:
    # Only hosted deploy markers — never treat local Next/Vercel CLI as production.
    return bool(os.getenv("RENDER") or os.getenv("RAILWAY_ENVIRONMENT"))


def _env(name: str, *, dev_default: str) -> str:
    val = (os.getenv(name) or "").strip()
    if val:
        return val
    if _is_production():
        raise RuntimeError(f"{name} environment variable is required")
    return dev_default


JWT_SECRET = _env("JWT_SECRET", dev_default="local-dev-jwt-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7
GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID", dev_default="local-dev.apps.googleusercontent.com")

def verify_google_token(credential: str) -> dict:
    """
    Verifies the Google OAuth token and returns user info.
    Raises ValueError if invalid.
    """
    try:
        id_info = id_token.verify_oauth2_token(
            credential, 
            requests.Request(), 
            GOOGLE_CLIENT_ID
        )
        return id_info
    except ValueError as e:
        raise ValueError(f"Invalid Google token: {str(e)}")

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
