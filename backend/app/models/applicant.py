from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ApplicantBase(BaseModel):
    name: str
    address: str
    contact_number: str
    email: str
    position: str
    item_number: str
    office: str
    is_pwd: bool = False


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
    status: Optional[str] = None


class ApplicantResponse(ApplicantBase):
    id: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
