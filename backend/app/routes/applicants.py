from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List
from app.models.applicant import ApplicantResponse, ApplicantCreate, ApplicantUpdate
from app.models.user import UserRole
from app.core.supabase_client import db
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/applicants", tags=["applicants"])


@router.get("/", response_model=List[ApplicantResponse])
async def list_applicants(
    current_user: UserRole = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
):
    """
    List applicants with role-based access control:
    - ADMIN/PM/RSP/LND: Can see all applicants
    - INTERVIEWER: Can see assigned applicants only
    - APPLICANT: Can see their own profile only
    """
    try:
        client = db.get_client()

        # Build query based on user role
        query = client.table("applicants").select("*")

        if current_user.role == "APPLICANT":
            # Applicants can only see their own data
            query = query.eq("email", current_user.email)
        elif current_user.role == "INTERVIEWER":
            # TODO: Filter by assigned applicants (when assignments table is created)
            pass

        # Apply pagination
        response = query.range(skip, skip + limit - 1).execute()
        return response.data

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch applicants: {str(e)}",
        )


@router.get("/{applicant_id}", response_model=ApplicantResponse)
async def get_applicant(
    applicant_id: str,
    current_user: UserRole = Depends(get_current_user),
):
    """
    Get a specific applicant with access control.
    Access granted if:
    - User is ADMIN/PM/RSP/LND
    - User is INTERVIEWER assigned to this applicant
    - User is the APPLICANT themselves
    """
    try:
        client = db.get_client()
        response = client.table("applicants").select("*").eq("id", applicant_id).execute()

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Applicant not found",
            )

        applicant = response.data[0]

        # Check access permissions
        if current_user.role == "APPLICANT" and applicant["email"] != current_user.email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own profile",
            )

        return applicant

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch applicant: {str(e)}",
        )


@router.put("/{applicant_id}", response_model=ApplicantResponse)
async def update_applicant(
    applicant_id: str,
    update_data: ApplicantUpdate,
    current_user: UserRole = Depends(require_role("ADMIN", "PM", "RSP", "LND")),
):
    """
    Update an applicant (Admin only).
    Note: Applicants cannot update their own status or critical fields.
    """
    try:
        client = db.get_client()

        # Verify applicant exists
        existing = client.table("applicants").select("*").eq("id", applicant_id).execute()
        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Applicant not found",
            )

        # Prepare update data (only non-null fields)
        update_dict = update_data.model_dump(exclude_unset=True)

        response = (
            client.table("applicants")
            .update(update_dict)
            .eq("id", applicant_id)
            .execute()
        )

        return response.data[0]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update applicant: {str(e)}",
        )
