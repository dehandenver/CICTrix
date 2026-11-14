import re
import uuid
from datetime import date
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

# RPC failure -> HTTP status. The RPC raises a machine-readable HINT (see
# supabase/migrations/20261102041556_complete_promotional_appointment.sql).
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
PROMOTION_MISSING_RPC_CODES = {"PGRST202", "42883"}
PROMOTION_NOT_AUTHORIZED_CODES = {"42501"}
# Statement timeout, deadlock, serialization failure, lock not available:
# the transaction rolled back and a retry may succeed.
PROMOTION_BUSY_CODES = {"57014", "40P01", "40001", "55P03"}


def is_promotion_application(app_type) -> bool:
    """Classify from the saved application_type, matching the frontend."""
    return str(app_type or "").strip().lower() in ("promotion", "promotional")


def _promotion_rpc_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        # No answer: the transaction may have committed. A replay is safe.
        return HTTPException(
            status_code=504,
            detail=(
                "We couldn't confirm the result of this promotion. "
                "Retrying is safe and will not appoint the employee twice."
            ),
        )

    code = str(getattr(exc, "code", "") or "")
    hint = str(getattr(exc, "hint", "") or "")
    message = str(getattr(exc, "message", "") or "").strip()

    if code in PROMOTION_MISSING_RPC_CODES:
        return HTTPException(
            status_code=503,
            detail=(
                "The promotion update has not been deployed to this database yet. "
                "Apply the latest database migration and try again."
            ),
        )
    if hint == "not_authorized" or code in PROMOTION_NOT_AUTHORIZED_CODES:
        return HTTPException(
            status_code=403,
            detail=message or "You are not authorized to complete promotional appointments.",
        )
    if code in PROMOTION_BUSY_CODES:
        return HTTPException(
            status_code=503,
            detail=(
                "Someone else was updating this employee or plantilla at the same time, "
                "so nothing was saved. Try again in a moment. "
                "Retrying is safe and will not appoint the employee twice."
            ),
        )
    if hint in PROMOTION_STATUS_BY_HINT:
        return HTTPException(
            status_code=PROMOTION_STATUS_BY_HINT[hint],
            detail=message or "The promotion could not be completed.",
        )
    return HTTPException(
        status_code=500,
        detail=message or "Failed to complete the promotion.",
    )


def complete_promotion(client, applicant_id: str, current_user: TokenData) -> dict:
    """Appoint an existing employee through the database transaction.

    The actor is the user this server already verified; nothing from the
    request body or query is used. A rejection is final here: it is never
    retried through another privileged path, and no employee is inserted.
    """
    # Only the service role may name an actor; the anon client would be
    # refused by the database. Say so instead of silently using it.
    if getattr(db, "service_client", None) is None:
        raise HTTPException(
            status_code=503,
            detail="The server is missing its service-role database credentials, so it cannot complete promotions.",
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
            PROMOTION_RPC,
            {"p_applicant_id": applicant_id, "p_actor_user_id": actor_user_id},
        ).execute()
    except Exception as exc:
        raise _promotion_rpc_http_error(exc)

    result = rpc_res.data[0] if isinstance(rpc_res.data, list) and rpc_res.data else rpc_res.data
    employee_uuid = result.get("employee_uuid") if isinstance(result, dict) else None
    if not employee_uuid:
        raise HTTPException(
            status_code=504,
            detail=(
                "We couldn't confirm the result of this promotion. "
                "Retrying is safe and will not appoint the employee twice."
            ),
        )

    view_res = client.table("employees_with_department").select("*").eq("id", employee_uuid).execute()
    if not view_res.data:
        raise HTTPException(
            status_code=500,
            detail=(
                "The promotion is recorded, but the employee record could not be loaded. "
                "Retry to load it; retrying will not appoint the employee again."
            ),
        )
    return view_res.data[0]


# Same pattern the database uses to read the number from a plantilla label
# (complete_promotional_appointment), e.g. "Plantilla 3" -> "3".
PLANTILLA_LABEL_PATTERN = re.compile(r"^\s*[Pp]lantilla\s+([0-9]+)\s*$")
NO_PLANTILLA_POSTING_DETAIL = "The job posting for this plantilla no longer exists."
NO_OFFICE_DETAIL = "This application has no office. Set the job posting's office, then hire again."


def _clean(value) -> Optional[str]:
    """Trimmed text, or None when blank."""
    text = str(value).strip() if value is not None else ""
    return text or None


def resolve_hire_office(client, app_data: dict, position_name: str) -> dict:
    """Work out the office, division and plantilla number for an external hire.

    Mirrors the Target assignment step of complete_promotional_appointment: the
    office is the plantilla's job posting office, matched to exactly one active
    department and written with that department's own name. Every refusal is a
    422 raised here, before the caller writes anything.
    """
    division = None
    plantilla_num = None
    office_source = None
    slot_id = app_data.get("plantilla_slot_id")

    if slot_id:
        slot_res = (
            client.table("plantilla_slots")
            .select("id, job_posting_id, label, division")
            .eq("id", slot_id)
            .execute()
        )
        slot = slot_res.data[0] if slot_res.data else None
        posting = None
        if slot and slot.get("job_posting_id"):
            posting_res = (
                client.table("job_postings")
                .select("id, department, division")
                .eq("id", slot["job_posting_id"])
                .is_("deleted_at", "null")
                .execute()
            )
            posting = posting_res.data[0] if posting_res.data else None
        if not slot or not posting:
            raise HTTPException(status_code=422, detail=NO_PLANTILLA_POSTING_DETAIL)

        office_source = posting.get("department")
        division = _clean(slot.get("division")) or _clean(posting.get("division"))
        label_match = PLANTILLA_LABEL_PATTERN.match(str(slot.get("label") or ""))
        plantilla_num = label_match.group(1) if label_match else None
    else:
        # Titles are not unique: only a single matching posting is trusted.
        posting_res = (
            client.table("job_postings")
            .select("department, division")
            .ilike("title", position_name)
            .is_("deleted_at", "null")
            .execute()
        )
        if len(posting_res.data or []) == 1 and _clean(posting_res.data[0].get("department")):
            office_source = posting_res.data[0]["department"]
            division = _clean(posting_res.data[0].get("division"))
        else:
            office_source = app_data.get("office")

    office = _clean(office_source)
    if office is None:
        raise HTTPException(status_code=422, detail=NO_OFFICE_DETAIL)

    dept_res = client.table("departments").select("id, name").eq("is_active", True).execute()
    matches = [d for d in (dept_res.data or []) if (_clean(d.get("name")) or "").lower() == office.lower()]
    if not matches:
        raise HTTPException(
            status_code=422,
            detail=(
                f'Office "{office}" is not an active office. '
                "Change the job posting's office to an active one, then hire again."
            ),
        )
    if len(matches) > 1:
        raise HTTPException(
            status_code=422,
            detail=f'Office "{office}" matches more than one active office. Resolve the duplicate first.',
        )
    return {"department": matches[0]["name"], "division": division, "plantilla_num": plantilla_num}


@router.post("/from-applicant/{applicant_id}", response_model=EmployeeResponse, status_code=201)
async def hire_from_applicant(
    applicant_id: str,
    current_user: TokenData = Depends(get_authenticated_user),
):
    client = db.get_service_client()
    
    # 1. Read applicant
    app_res = client.table("applicants").select("*").eq("id", applicant_id).execute()
    if not app_res.data:
        raise HTTPException(status_code=404, detail="Applicant not found")
    
    app_data = app_res.data[0]
    app_type = app_data.get("application_type", "job")

    # Promotions never reach the external-hire code below, whatever else the
    # record holds: the person is already an employee.
    if is_promotion_application(app_type):
        return complete_promotion(client, applicant_id, current_user)

    today_str = date.today().isoformat()
    position_name = app_data.get("position") or app_data.get("current_position") or "Staff"
    
    office = resolve_hire_office(client, app_data, position_name)

    # New Hire: Insert/Upsert new employee
    emp_id = app_data.get("employee_id")
    if not emp_id:
        # Deterministic employee_number generation based on applicant_id to ensure idempotency
        emp_id = f"EMP-{str(applicant_id).replace('-', '')[:8].upper()}"
    
    email = app_data.get("email")
    if not email:
        first = app_data.get("first_name", "").lower().replace(" ", "")
        last = app_data.get("last_name", "").lower().replace(" ", "")
        email = f"{first}.{last}.{emp_id.lower()}@employee.local"

    insert_data = {
        "employee_number": emp_id,
        "first_name": app_data.get("first_name", ""),
        "middle_name": app_data.get("middle_name", ""),
        "last_name": app_data.get("last_name", ""),
        "email": email,
        "phone": app_data.get("contact_number"),
        "current_address_street": app_data.get("address"),
        "sex": app_data.get("gender"),
        "position": position_name,
        "department": office["department"],
        "division": office["division"],
        "plantilla_num": office["plantilla_num"],
        "employment_status": "Regular",
        "date_hired": today_str,
        "status": "Active",
        "user_account_id": None
    }
    
    valid_genders = ['Male', 'Female', 'Other', 'Prefer not to say']
    if insert_data["sex"] not in valid_genders:
        insert_data.pop("sex", None)

    # Check email uniqueness and append disambiguator if necessary
    email_val = insert_data.get("email")
    if email_val:
        email_unique = False
        email_attempts = 0
        while not email_unique and email_attempts < 10:
            existing_email = client.table("employees").select("email").eq("email", email_val).execute()
            if not existing_email.data:
                email_unique = True
            else:
                email_attempts += 1
                parts = insert_data["email"].split('@')
                email_val = f"{parts[0]}.{email_attempts + 1}@{parts[1]}"
        insert_data["email"] = email_val

    # Check for employee_number clash first
    existing = client.table("employees").select("id").eq("employee_number", insert_data["employee_number"]).execute()
    if existing.data:
        # Clash detected — generate a new unique ID
        import secrets
        while True:
            new_id = f"EMP-NH{secrets.token_hex(4).upper()}"
            check = client.table("employees").select("id").eq("employee_number", new_id).execute()
            if not check.data:
                insert_data["employee_number"] = new_id
                break

    # 2. Insert into employees
    emp_res = client.table("employees").insert(insert_data).execute()
    if not emp_res.data:
        raise HTTPException(status_code=500, detail="Failed to insert employee record")
        
    new_emp_raw = emp_res.data[0]
    
    # 3. Update applicant
    # Case matters: every consumer (Office Directory headcount, drill-down,
    # frontend backfills) filters on the exact string 'Hired'.
    client.table("applicants").update({"status": "Hired"}).eq("id", applicant_id).execute()
    
    # 4. Fetch the row through the compatibility view to return Schema B (EmployeeResponse) format
    view_res = client.table("employees_with_department").select("*").eq("id", new_emp_raw["id"]).execute()
    if not view_res.data:
        raise HTTPException(status_code=500, detail="Failed to read created employee via view")
    
    return view_res.data[0]