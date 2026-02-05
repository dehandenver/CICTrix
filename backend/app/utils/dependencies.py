from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthCredentials
from app.core.security import verify_token, TokenData

security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthCredentials = Depends(security)) -> TokenData:
    """Dependency to get and verify current user from JWT token"""
    try:
        token = credentials.credentials
        return verify_token(token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_role(*allowed_roles: str):
    """Dependency factory to require specific roles"""
    async def role_checker(current_user: TokenData = Depends(get_current_user)) -> TokenData:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User does not have required role. Required: {allowed_roles}",
            )
        return current_user

    return role_checker
