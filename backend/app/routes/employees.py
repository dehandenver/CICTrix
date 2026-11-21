import uuid
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Optional
import httpx
from app.models.employee import EmployeeResponse, EmployeeCreate, EmployeeUpdate, EmployeeStatusUpdate
from app.models.user import UserRole
from app.core.security import TokenData
from app.core.supabase_client import db
from app.utils.dependencies import get_current_user, get_authenticated_user, require_role

router = APIRouter(prefix="/api/employees", tags=["employees"])

@router.post("/", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    employee: EmployeeCreate = Body(...),
    current_user: UserRole = Depends(require_role("ADMIN", "PM", "RSP", "LND"))
):
    client = db.get_service_client()
    insert_data = employee.model_dump(exclude_unset=True)
    if "date_of_birth" in insert_data and insert_data["date_of_birth"]:
        insert_data["date_of_birth"] = insert_data["date_of_birth"].isoformat()
    if "hire_date" in insert_data and insert_data["hire_date"]:
        insert_data["hire_date"] = insert_data["hire_date"].isoformat()

    response = client.table("employees").insert(insert_data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create employee")
    return response.data[0]

@router.get("/", response_model=List[EmployeeResponse])
async def list_employees(
    department: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: UserRole = Depends(get_current_user)
):
    client = db.get_service_client()
    query = client.table("employees_with_department").select("*")
    
    if department:
        query = query.eq("current_department", department)
    if status:
        query = query.eq("status", status)
    if search:
        query = query.ilike("full_name", f"%{search}%")
        
    response = query.execute()
    return response.data

@router.get("/{id}", response_model=EmployeeResponse)
async def get_employee(
    id: str,
    current_user: UserRole = Depends(get_current_user)
):
    client = db.get_service_client()
    response = client.table("employees_with_department").select("*").eq("id", id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    emp = response.data[0]
    if current_user.get("role") not in ["ADMIN", "PM", "RSP", "LND"]:
        if emp.get("user_id") != current_user.get("id"):
            raise HTTPException(status_code=403, detail="Not authorized to access this employee profile")
            
    return emp

@router.put("/{id}", response_model=EmployeeResponse)
async def update_employee(
    id: str,
    employee: EmployeeUpdate = Body(...),
    current_user: UserRole = Depends(require_role("ADMIN", "PM", "RSP", "LND"))
):
    client = db.get_service_client()
    update_data = employee.model_dump(exclude_unset=True)
    if "date_of_birth" in update_data and update_data["date_of_birth"]:
        update_data["date_of_birth"] = update_data["date_of_birth"].isoformat()
    if "hire_date" in update_data and update_data["hire_date"]:
        update_data["hire_date"] = update_data["hire_date"].isoformat()

    response = client.table("employees").update(update_data).eq("id", id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Employee not found or update failed")
    return response.data[0]

@router.patch("/{id}/status", response_model=EmployeeResponse)
async def update_employee_status(
    id: str,
    status_update: EmployeeStatusUpdate = Body(...),
    current_user: UserRole = Depends(require_role("ADMIN", "PM", "RSP", "LND"))
):
    client = db.get_service_client()
    response = client.table("employees").update({"status": status_update.status}).eq("id", id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Employee not found or update failed")
    return response.data[0]

PROMOTION_RPC = "complete_promotional_appointment"
EXTERNAL_HIRE_RPC = "complete_external_hire"

# RPC failure -> HTTP status. Each RPC raises a machine-readable HINT.
PROMOTION_STATUS_BY_HINT = {
    "not_authorized": 403,
    "application_not_found": 404,
    # Conflicts with the current state of the plantilla or the record
    "partial_completion": 409,
    "concurrent_change": 409,
    "slot_missing": 409,
    "slot_filled_elsewhere": 409,
    "slot_reserved_elsewhere": 409,
    "not_reserved": 409,
    # Data that has to be fixed before the promotion can complete
    "not_promotion": 422,
    "employee_not_found": 422,
    "employee_ambiguous": 422,
    "account_missing": 422,
    "account_ambiguous": 422,
    "assessment_incomplete": 422,
    "posting_missing": 422,
    "office_inactive": 422,
    "office_ambiguous": 422,
    "plantilla_ambiguous": 422,
}

EXTERNAL_HIRE_STATUS_BY_HINT = {
    "not_authorized": 403,
    "application_not_found": 404,
    "partial_completion": 409,
    "concurrent_change": 409,
    "slot_missing": 409,
    "slot_filled_elsewhere": 409,
    "slot_reserved_elsewhere": 409,
    "not_reserved": 409,
    "employee_number_conflict": 409,
    "email_conflict": 409,
    "is_promotion": 422,
    "posting_missing": 422,
    "office_inactive": 422,
    "office_ambiguous": 422,
    "plantilla_ambiguous": 422,
}

RPC_MISSING_CODES = {"PGRST202", "42883"}
RPC_NOT_AUTHORIZED_CODES = {"42501"}
# Statement timeout, deadlock, serialization failure, lock not available:
# the transaction rolled back and a retry may succeed.
RPC_BUSY_CODES = {"57014", "40P01", "40001", "55P03"}


def is_promotion_application(app_type) -> bool:
    """Classify from the saved application_type, matching the frontend."""
    return str(app_type or "").strip().lower() in ("promotion", "promotional")


def _rpc_http_error(
    exc: Exception,
    *,
    status_by_hint: dict,
    action_label: str,
    migration_label: str,
    busy_subject: str,
    repeat_action_verb: str,
) -> HTTPException:
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        # No answer: the transaction may have committed. A replay is safe.
        return HTTPException(
            status_code=504,
            detail=(
                f"We couldn't confirm the result of this {action_label}. "
                f"Retrying is safe and will not {repeat_action_verb} twice."
            ),
        )

    code = str(getattr(exc, "code", "") or "")
    hint = str(getattr(exc, "hint", "") or "")
    message = str(getattr(exc, "message", "") or "").strip()

    if code in RPC_MISSING_CODES:
        return HTTPException(
            status_code=503,
            detail=(
                f"The {migration_label} has not been deployed to this database yet. "
                "Apply the latest database migration and try again."
            ),
        )
    if hint == "not_authorized" or code in RPC_NOT_AUTHORIZED_CODES:
        return HTTPException(
            status_code=403,
            detail=message or f"You are not authorized to complete {action_label}s.",
        )
    if code in RPC_BUSY_CODES:
        return HTTPException(
            status_code=503,
            detail=(
                f"Someone else was updating this {busy_subject} at the same time, "
                "so nothing was saved. Try again in a moment. "
                f"Retrying is safe and will not {repeat_action_verb} twice."
            ),
        )
    if hint in status_by_hint:
        return HTTPException(
            status_code=status_by_hint[hint],
            detail=message or f"The {action_label} could not be completed.",
        )
    return HTTPException(
        status_code=500,
        detail=message or f"Failed to complete the {action_label}.",
    )


def _complete_appointment_via_rpc(
    client,
    *,
    rpc_name: str,
    applicant_id: str,
    current_user: TokenData,
    status_by_hint: dict,
    action_label: str,
    migration_label: str,
    busy_subject: str,
    repeat_action_verb: str,
) -> dict:
    """Complete a promotional or external appointment through its Postgres RPC.

    The actor is the user this server already verified; nothing from the
    request body or query is used. A rejection is final here: it is never
    retried through another write path.
    """
    if getattr(db, "service_client", None) is None:
        raise HTTPException(
            status_code=503,
            detail=f"The server is missing its service-role database credentials, so it cannot complete {action_label}s.",
        )
    try:
        actor_user_id = str(uuid.UUID(str(current_user.user_id)))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status_code=403,
            detail="Your account has no verifiable user identity for this action.",
        )

    try:
        rpc_res = client.rpc(
            rpc_name,
            {"p_applicant_id": applicant_id, "p_actor_user_id": actor_user_id},
        ).execute()
    except Exception as exc:
        raise _rpc_http_error(
            exc,
            status_by_hint=status_by_hint,
            action_label=action_label,
            migration_label=migration_label,
            busy_subject=busy_subject,
            repeat_action_verb=repeat_action_verb,
        )

    result = rpc_res.data[0] if isinstance(rpc_res.data, list) and rpc_res.data else rpc_res.data
    employee_uuid = result.get("employee_uuid") if isinstance(result, dict) else None
    if not employee_uuid:
        raise HTTPException(
            status_code=504,
            detail=(
                f"We couldn't confirm the result of this {action_label}. "
                f"Retrying is safe and will not {repeat_action_verb} twice."
            ),
        )

    view_res = client.table("employees_with_department").select("*").eq("id", employee_uuid).execute()
    if not view_res.data:
        raise HTTPException(
            status_code=500,
            detail=(
                f"The {action_label} is recorded, but the employee record could not be loaded. "
                f"Retry to load it; retrying will not {repeat_action_verb} again."
            ),
        )
    return view_res.data[0]


def complete_promotion(client, applicant_id: str, current_user: TokenData) -> dict:
    return _complete_appointment_via_rpc(
        client,
        rpc_name=PROMOTION_RPC,
        applicant_id=applicant_id,
        current_user=current_user,
        status_by_hint=PROMOTION_STATUS_BY_HINT,
        action_label="promotion",
        migration_label="promotion update",
        busy_subject="employee or plantilla",
        repeat_action_verb="appoint the employee",
    )


def complete_external_appointment(client, applicant_id: str, current_user: TokenData) -> dict:
    return _complete_appointment_via_rpc(
        client,
        rpc_name=EXTERNAL_HIRE_RPC,
        applicant_id=applicant_id,
        current_user=current_user,
        status_by_hint=EXTERNAL_HIRE_STATUS_BY_HINT,
        action_label="external hire",
        migration_label="external hiring update",
        busy_subject="record or plantilla",
        repeat_action_verb="hire the applicant",
    )


@router.post("/from-applicant/{applicant_id}", response_model=EmployeeResponse, status_code=201)
async def hire_from_applicant(
    applicant_id: str,
    current_user: TokenData = Depends(get_authenticated_user),
):
    client = db.get_service_client()

    app_res = client.table("applicants").select("*").eq("id", applicant_id).execute()
    if not app_res.data:
        raise HTTPException(status_code=404, detail="Applicant not found")

    app_data = app_res.data[0]
    app_type = app_data.get("application_type", "job")

    if is_promotion_application(app_type):
        return complete_promotion(client, applicant_id, current_user)
    return complete_external_appointment(client, applicant_id, current_user)