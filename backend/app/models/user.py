from pydantic import BaseModel
from typing import Optional


class UserRole(BaseModel):
    """User role representation"""
    user_id: str
    email: str
    role: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserRole
