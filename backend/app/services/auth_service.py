import os
import jwt
from datetime import datetime, timedelta, UTC
from typing import Optional
from google.oauth2 import id_token
from google.auth.transport import requests

JWT_SECRET = os.getenv("JWT_SECRET")

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required")

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

if not GOOGLE_CLIENT_ID:
    raise RuntimeError("GOOGLE_CLIENT_ID environment variable is required")

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
