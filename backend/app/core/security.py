from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from pydantic import BaseModel
from app.core.config import settings


class TokenData(BaseModel):
    user_id: str
    email: str
    role: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


def create_access_token(
    user_id: str, email: str, role: str, expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token"""
    if expires_delta is None:
        expires_delta = timedelta(hours=settings.JWT_EXPIRATION_HOURS)

    expire = datetime.utcnow() + expires_delta
    to_encode = {"user_id": user_id, "email": email, "role": role, "exp": expire}

    encoded_jwt = jwt.encode(
        to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def verify_token(token: str) -> TokenData:
    """Verify JWT token and return token data"""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id: str = payload.get("user_id")
        email: str = payload.get("email")
        role: str = payload.get("role")

        if user_id is None or email is None or role is None:
            raise JWTError("Invalid token claims")

        return TokenData(user_id=user_id, email=email, role=role)
    except JWTError as e:
        raise JWTError(f"Invalid token: {str(e)}")
