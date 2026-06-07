from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr
    name: str

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: str
    avatar: Optional[str] = None
    provider: str
    created_at: datetime
    last_login: datetime

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    credential: str

class SessionResponse(BaseModel):
    user: UserResponse
    token: str
