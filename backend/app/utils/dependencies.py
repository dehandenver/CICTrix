from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.security import verify_token, TokenData

security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenData:
    """Verify a custom-issued JWT (backend login flow)."""
    try:
        token = credentials.credentials
        return verify_token(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_id(current_user: TokenData = Depends(get_current_user)) -> str:
    return current_user.user_id


async def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> TokenData:
    """
    Accepts both custom JWTs (backend login) and Supabase JWTs.
    Custom JWT is tried first; if verification fails the token is checked
    against the Supabase auth API so frontend portals using Supabase auth
    can call protected endpoints without a separate backend login step.
    """
    token = credentials.credentials

    # Fast path: custom JWT
    try:
        return verify_token(token)
    except Exception:
        pass

    # Supabase JWT path — call auth.get_user() which validates the token
    # server-side without needing the Supabase JWT signing secret locally.
    try:
        from app.core.supabase_client import db
        client = db.get_client()
        response = client.auth.get_user(token)
        if response and response.user:
            user = response.user

            # `user_roles` is the source of truth the admin portal reads after
            # sign-in, so it is authoritative here too — app_metadata can drift
            # from it. Falling back to a default role would silently grant
            # access to an account with no role assigned, so an unresolved role
            # is left as None and rejected by require_role.
            role = None
            try:
                service = db.get_service_client()
                role_rows = (
                    service.table("user_roles")
                    .select("role, is_active")
                    .eq("user_id", str(user.id))
                    .execute()
                ).data or []
                active = [r for r in role_rows if r.get("is_active", True)]
                if active:
                    role = active[0].get("role")
            except Exception:
                pass

            if not role:
                meta = user.app_metadata or {}
                role = meta.get("role") or meta.get("userrole")

            if role:
                return TokenData(
                    user_id=str(user.id),
                    email=user.email or "",
                    role=str(role).upper(),
                )
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_role(*allowed_roles: str):
    """
    Dependency factory to require specific roles.

    Accepts both custom JWTs and Supabase session tokens. The admin portals sign
    in through Supabase Auth and hold no custom JWT, so gating on the custom
    token alone would make every role-protected route unreachable from the UI.
    """
    async def role_checker(current_user: TokenData = Depends(get_authenticated_user)) -> TokenData:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User does not have required role. Required: {allowed_roles}",
            )
        return current_user

    return role_checker
