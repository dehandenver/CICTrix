from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime



# Match frontend fields for applicant creation
class ApplicantBase(BaseModel):
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    gender: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    email: str
    position: Optional[str] = None
    item_number: Optional[str] = None
    office: Optional[str] = None
    is_pwd: bool = False
    application_type: str = 'job'
    employee_id: Optional[str] = None
    current_position: Optional[str] = None
    current_department: Optional[str] = None
    current_division: Optional[str] = None
    employee_username: Optional[str] = None


class ApplicantCreate(ApplicantBase):
    pass


class ApplicantUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    position: Optional[str] = None
    item_number: Optional[str] = None
    office: Optional[str] = None
    is_pwd: Optional[bool] = None
    status: Optional[str] = None  # Accept any string, including 'hired'
    disqualification_reason: Optional[str] = None


class StatusUpdateRequest(BaseModel):
    applicant_id: str
    status: Literal["shortlisted", "qualified", "disqualified", "hired"]  # Add 'hired'
    disqualification_reason: Optional[str] = None


class ApplicantResponse(ApplicantBase):
    id: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
