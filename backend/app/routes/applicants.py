from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List
from app.models.applicant import ApplicantResponse, ApplicantCreate, ApplicantUpdate, StatusUpdateRequest
from app.models.user import UserRole
from app.core.supabase_client import db
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/applicants", tags=["applicants"])


# POST endpoint to create a new applicant
from fastapi import Body
from app.models.applicant import ApplicantResponse

@router.post("/", response_model=ApplicantResponse, status_code=201)
async def create_applicant(
    applicant: ApplicantCreate = Body(...),
    # current_user: UserRole = Depends(require_role("ADMIN", "PM", "RSP", "LND")),  # Disabled for testing
):
    """
    Create a new applicant (Admin/PM/RSP/LND only).
    
    CRITICAL: Handles Supabase NOT NULL constraints by providing safe defaults.
    If this breaks, check Supabase table schema for new NOT NULL columns.
    """
    try:
        # Use service client for admin operations (falls back to anon if service key not available)
        client = db.get_service_client()
        insert_data = applicant.model_dump()
        
        # Handle NOT NULL columns in Supabase by providing defaults for empty/null values
        # CRITICAL: These fields have NOT NULL constraints in the database schema.
        # If applicant submission fails with "null value in column" errors, add the missing field here.
        # Column name -> default value to use when field is empty/null
        not_null_fields = {
            'address': 'Not provided',
            'contact_number': 'N/A',
            'middle_name': '',
            'item_number': 'UNASSIGNED',
            'office': 'Unassigned',
            'employee_id': '',
            'current_position': '',
            'current_department': '',
            'current_division': '',
            'employee_username': '',
        }
        
        # Apply defaults for missing NOT NULL fields
        for field, default_value in not_null_fields.items():
            if not insert_data.get(field):
                insert_data[field] = default_value
        
        # SPECIAL: Gender has a CHECK constraint - omit if not provided
        # Gender CHECK constraint only allows specific values. If missing, omit the field.
        if not insert_data.get('gender'):
            insert_data.pop('gender', None)
        
        print("[DEBUG] Applicant create payload:", insert_data)
        
        response = client.table("applicants").insert(insert_data).execute()
        print("[DEBUG] Full Supabase response:", response)
        print("[DEBUG] Response data:", response.data)
        print("[DEBUG] Response error:", response.error if hasattr(response, 'error') else "No error attr")
        
        # Better error handling
        if hasattr(response, 'error') and response.error:
            error_msg = str(response.error)
            print(f"[ERROR] Supabase returned error: {error_msg}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {error_msg}",
            )
        
        if not response.data or len(response.data) == 0:
            print("[ERROR] Supabase insert returned empty data")
            print(f"[ERROR] Full response object: {response}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create applicant record - no data returned from database",
            )
        
        created_applicant = response.data[0]
        print("[DEBUG] Successfully created applicant with ID:", created_applicant.get('id'))
        return created_applicant
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        print("[EXCEPTION] Applicant creation error:", error_msg)
        print("[EXCEPTION] Error type:", type(e).__name__)
        import traceback
        print("[EXCEPTION] Traceback:", traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create applicant record: {error_msg}",
        )


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


@router.patch("/{applicant_id}/status", response_model=ApplicantResponse)
async def update_applicant_status(
    applicant_id: str,
    body: StatusUpdateRequest,
    current_user: UserRole = Depends(require_role("ADMIN", "PM", "RSP", "LND")),
):
    """
    Update an applicant's evaluation status.
    Payload:
      - status: "shortlisted" | "qualified" | "disqualified"
      - disqualification_reason: required (non-null) when status == "disqualified"

    If status is "disqualified", the disqualification_reason is persisted.
    For shortlisted/qualified the disqualification_reason is stored as null.
    """
    if body.status == "disqualified" and not (body.disqualification_reason or "").strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="disqualification_reason is required when status is 'disqualified'.",
        )

    status_label_map = {
        "shortlisted": "Shortlisted",
        "qualified": "Recommended for Hiring",
        "disqualified": "Not Qualified",
        "hired": "Hired",
    }

    try:
        client = db.get_client()

        existing = client.table("applicants").select("*").eq("id", applicant_id).execute()
        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Applicant not found",
            )

        update_dict: dict = {"status": status_label_map[body.status]}
        if body.status == "disqualified":
            update_dict["disqualification_reason"] = (body.disqualification_reason or "").strip()
        else:
            update_dict["disqualification_reason"] = None

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
            detail=f"Failed to update applicant status: {str(e)}",
        )
