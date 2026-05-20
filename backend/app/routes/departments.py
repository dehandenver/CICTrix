from fastapi import APIRouter, HTTPException, status, Depends, Query, Body
from typing import List, Optional
from app.models.department import (
    DepartmentResponse,
    DepartmentCreate,
    DepartmentUpdate,
)
from app.core.security import TokenData
from app.core.supabase_client import db
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("/", response_model=List[DepartmentResponse])
async def list_departments(
    include_inactive: bool = Query(False),
    current_user: TokenData = Depends(get_current_user),
):
    """List departments. Any authenticated user can read."""
    try:
        client = db.get_client()
        query = client.table("departments").select("*")
        if not include_inactive:
            query = query.eq("is_active", True)
        response = query.order("name").execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch departments: {str(e)}",
        )


@router.get("/{department_id}", response_model=DepartmentResponse)
async def get_department(
    department_id: str,
    current_user: TokenData = Depends(get_current_user),
):
    try:
        client = db.get_client()
        response = (
            client.table("departments").select("*").eq("id", department_id).execute()
        )
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Department not found",
            )
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch department: {str(e)}",
        )


@router.post("/", response_model=DepartmentResponse, status_code=201)
async def create_department(
    department: DepartmentCreate = Body(...),
    current_user: TokenData = Depends(require_role("ADMIN")),
):
    """Create a new department. ADMIN only — org structure is admin-scoped."""
    try:
        client = db.get_service_client()
        response = (
            client.table("departments")
            .insert(department.model_dump(exclude_none=True))
            .execute()
        )
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create department",
            )
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create department: {str(e)}",
        )


@router.patch("/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: str,
    update_data: DepartmentUpdate,
    current_user: TokenData = Depends(require_role("ADMIN")),
):
    """Update a department. ADMIN only."""
    try:
        client = db.get_service_client()
        existing = (
            client.table("departments").select("id").eq("id", department_id).execute()
        )
        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Department not found",
            )

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No fields to update",
            )

        response = (
            client.table("departments")
            .update(update_dict)
            .eq("id", department_id)
            .execute()
        )
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update department: {str(e)}",
        )
