from fastapi import APIRouter, HTTPException, status, Depends
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.user import LoginRequest, SessionResponse, UserResponse
from app.models.domain import User, UserPreferences
from app.config.database import get_db
from app.services.auth_service import verify_google_token, create_access_token
from app.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=SessionResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Handle Google OAuth credential token exchange.
    Verifies token, creates/updates user, returns JWT session.
    """
    try:
        id_info = verify_google_token(request.credential)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    
    email = id_info.get("email")
    google_id = id_info.get("sub")
    name = id_info.get("name", "")
    avatar = id_info.get("picture", "")
    
    if not email or not google_id:
        raise HTTPException(status_code=400, detail="Incomplete Google profile")

    # Look up user by google_id or email
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalars().first()
    
    if not user:
        # Fallback check by email just in case
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()

    now = datetime.utcnow()

    if not user:
        # Create new user
        user = User(
            google_id=google_id,
            email=email,
            name=name,
            avatar_url=avatar,
            provider="google",
            last_login=now
        )
        db.add(user)
        # Flush to get user.id before creating preferences
        await db.flush()
        
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)
    else:
        # Update existing user info if needed
        user.name = name
        user.avatar_url = avatar
        user.last_login = now
    
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user_id=user.id, email=user.email)
    
    # Map DB model to response format
    user_response = UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=user.avatar_url,
        provider=user.provider,
        created_at=user.created_at,
        last_login=user.last_login
    )

    return SessionResponse(user=user_response, token=token)

@router.get("/session", response_model=UserResponse)
@router.get("/me", response_model=UserResponse)
async def get_session(current_user: User = Depends(get_current_user)):
    """Verify session token and return user info."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        avatar=current_user.avatar_url,
        provider=current_user.provider,
        created_at=current_user.created_at,
        last_login=current_user.last_login
    )

@router.post("/logout")
async def logout():
    """Client-side JWT clearance is expected. Optional: Implement token denylist."""
    return {"status": "logged_out"}
