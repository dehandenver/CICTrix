from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import Optional
from app.core.supabase_client import db
from app.utils.dependencies import get_current_user_id

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ============================================================================
# MODELS
# ============================================================================

class UserSettingsResponse(BaseModel):
    email_notifications_enabled: bool
    notification_frequency: str
    profile_visibility: str
    preferred_language: str
    timezone: str
    work_mode: Optional[str] = None


class UpdateNotificationSettings(BaseModel):
    email_notifications_enabled: Optional[bool] = None
    notification_frequency: Optional[str] = None


class UpdateProfileSettings(BaseModel):
    profile_visibility: Optional[str] = None
    preferred_language: Optional[str] = None
    timezone: Optional[str] = None


class UpdateAppearanceSettings(BaseModel):
    preferred_language: Optional[str] = None
    timezone: Optional[str] = None


class UpdateLocalizationSettings(BaseModel):
    timezone: Optional[str] = None
    preferred_language: Optional[str] = None


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/me", response_model=UserSettingsResponse)
async def get_user_settings(user_id: str = Depends(get_current_user_id)):
    """Get current user's settings"""
    try:
        response = await db.table("employee_settings").select("*").eq("employee_id", user_id).single().execute()
        if response.data:
            return UserSettingsResponse(**response.data)
        # Return defaults if no settings exist
        return UserSettingsResponse(
            email_notifications_enabled=True,
            notification_frequency="daily",
            profile_visibility="private",
            preferred_language="en",
            timezone="Asia/Manila",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch settings",
        )


@router.put("/notifications")
async def update_notification_settings(
    settings: UpdateNotificationSettings,
    user_id: str = Depends(get_current_user_id),
):
    """Update notification settings"""
    try:
        update_data = {}
        if settings.email_notifications_enabled is not None:
            update_data["email_notifications_enabled"] = settings.email_notifications_enabled
        if settings.notification_frequency is not None:
            update_data["notification_frequency"] = settings.notification_frequency

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No settings to update",
            )

        response = await db.table("employee_settings").update(update_data).eq("employee_id", user_id).execute()
        return {"message": "Notification settings updated", "data": response.data}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update notification settings",
        )


@router.put("/profile")
async def update_profile_settings(
    settings: UpdateProfileSettings,
    user_id: str = Depends(get_current_user_id),
):
    """Update profile settings"""
    try:
        update_data = {}
        if settings.profile_visibility is not None:
            update_data["profile_visibility"] = settings.profile_visibility

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No settings to update",
            )

        response = await db.table("employee_settings").update(update_data).eq("employee_id", user_id).execute()
        return {"message": "Profile settings updated", "data": response.data}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile settings",
        )


@router.put("/appearance")
async def update_appearance_settings(
    settings: UpdateAppearanceSettings,
    user_id: str = Depends(get_current_user_id),
):
    """Update appearance settings (language)"""
    try:
        update_data = {}
        if settings.preferred_language is not None:
            update_data["preferred_language"] = settings.preferred_language

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No settings to update",
            )

        response = await db.table("employee_settings").update(update_data).eq("employee_id", user_id).execute()
        return {"message": "Appearance settings updated", "data": response.data}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update appearance settings",
        )


@router.put("/localization")
async def update_localization_settings(
    settings: UpdateLocalizationSettings,
    user_id: str = Depends(get_current_user_id),
):
    """Update localization settings (timezone & language)"""
    try:
        update_data = {}
        if settings.timezone is not None:
            update_data["timezone"] = settings.timezone
        if settings.preferred_language is not None:
            update_data["preferred_language"] = settings.preferred_language

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No settings to update",
            )

        response = await db.table("employee_settings").update(update_data).eq("employee_id", user_id).execute()
        return {"message": "Localization settings updated", "data": response.data}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update localization settings",
        )
