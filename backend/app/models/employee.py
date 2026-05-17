from pydantic import BaseModel
from typing import Optional, Literal, List, Dict, Any
from datetime import date, datetime

class EmployeeBase(BaseModel):
    employee_id: str
    user_id: Optional[str] = None
    full_name: str
    email: str
    date_of_birth: Optional[date] = None
    place_of_birth: Optional[str] = None
    gender: Optional[Literal['Male', 'Female', 'Other', 'Prefer not to say']] = None
    civil_status: Optional[Literal['Single', 'Married', 'Widowed', 'Divorced', 'Separated']] = None
    nationality: Optional[str] = None
    mobile_number: Optional[str] = None
    home_address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_relationship: Optional[str] = None
    emergency_contact_number: Optional[str] = None
    sss_number: Optional[str] = None
    philhealth_number: Optional[str] = None
    pagibig_number: Optional[str] = None
    tin_number: Optional[str] = None
    current_position: Optional[str] = None
    current_department: Optional[str] = None
    current_division: Optional[str] = None
    status: Literal['Active', 'On Leave', 'Resigned', 'Terminated'] = 'Active'
    hire_date: Optional[date] = None
    position_history: List[Dict[str, Any]] = []
    personal_details_finalized: bool = False

class EmployeeCreate(EmployeeBase):
    pass

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    date_of_birth: Optional[date] = None
    place_of_birth: Optional[str] = None
    gender: Optional[Literal['Male', 'Female', 'Other', 'Prefer not to say']] = None
    civil_status: Optional[Literal['Single', 'Married', 'Widowed', 'Divorced', 'Separated']] = None
    nationality: Optional[str] = None
    mobile_number: Optional[str] = None
    home_address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_relationship: Optional[str] = None
    emergency_contact_number: Optional[str] = None
    sss_number: Optional[str] = None
    philhealth_number: Optional[str] = None
    pagibig_number: Optional[str] = None
    tin_number: Optional[str] = None
    current_position: Optional[str] = None
    current_department: Optional[str] = None
    current_division: Optional[str] = None
    status: Optional[Literal['Active', 'On Leave', 'Resigned', 'Terminated']] = None
    hire_date: Optional[date] = None
    position_history: Optional[List[Dict[str, Any]]] = None
    personal_details_finalized: Optional[bool] = None

class EmployeeStatusUpdate(BaseModel):
    status: Literal['Active', 'On Leave', 'Resigned', 'Terminated']

class EmployeeResponse(EmployeeBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None