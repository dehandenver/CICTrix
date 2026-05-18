import uuid
from datetime import date
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Optional
from app.models.employee import EmployeeResponse, EmployeeCreate, EmployeeUpdate, EmployeeStatusUpdate
from app.models.user import UserRole
from app.core.supabase_client import db
from app.utils.dependencies import get_current_user, require_role

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

@router.post("/from-applicant/{applicant_id}", response_model=EmployeeResponse, status_code=201)
async def hire_from_applicant(
    applicant_id: str,
    current_user: UserRole = Depends(require_role("ADMIN", "PM", "RSP", "LND"))
):
    client = db.get_service_client()
    
    # 1. Read applicant
    app_res = client.table("applicants").select("*").eq("id", applicant_id).execute()
    if not app_res.data:
        raise HTTPException(status_code=404, detail="Applicant not found")
    
    app_data = app_res.data[0]
    app_type = app_data.get("application_type", "job")
    
    today_str = date.today().isoformat()
    department_name = app_data.get("office") or app_data.get("current_department") or "Operations"
    position_name = app_data.get("position") or app_data.get("current_position") or "Staff"

    if app_type == "promotion" and app_data.get("employee_id"):
        # Promotion: Update existing employee (Schema C uses employee_number)
        emp_id = app_data.get("employee_id")
        update_data = {
            "position": position_name,
            "department": department_name,
        }
        
        emp_res = client.table("employees").update(update_data).eq("employee_number", emp_id).execute()
        if not emp_res.data:
            raise HTTPException(status_code=500, detail="Failed to update existing employee record for promotion")
            
        new_emp_raw = emp_res.data[0]
    else:
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
            "department": department_name,
            "employment_status": "Permanent",
            "date_hired": today_str,
            "status": "Active",
            "user_account_id": None
        }
        
        valid_genders = ['Male', 'Female', 'Other', 'Prefer not to say']
        if insert_data["sex"] not in valid_genders:
            insert_data.pop("sex", None)

        # 2. Upsert into employees (using on_conflict to ensure idempotency)
        emp_res = client.table("employees").upsert(insert_data, on_conflict="employee_number").execute()
        if not emp_res.data:
            raise HTTPException(status_code=500, detail="Failed to insert employee record")
            
        new_emp_raw = emp_res.data[0]
        
    # 3. Update applicant
    client.table("applicants").update({"status": "hired"}).eq("id", applicant_id).execute()
    
    # 4. Fetch the row through the compatibility view to return Schema B (EmployeeResponse) format
    view_res = client.table("employees_with_department").select("*").eq("id", new_emp_raw["id"]).execute()
    if not view_res.data:
        raise HTTPException(status_code=500, detail="Failed to read created employee via view")
    
    return view_res.data[0]