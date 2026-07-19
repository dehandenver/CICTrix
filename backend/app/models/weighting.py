"""
Pydantic models for IPCR office weighting.

An office's weighting decides how Core / Strategic / Support ratings combine
into an employee's overall score, so a single write here changes how every
rating in that office is computed. That is why the write path lives behind the
backend's RBAC and the service-role key rather than being exposed to the
browser like most row-level data.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class WeightingSchemaOption(BaseModel):
    """One of the three legal splits (A / B / C), from weighting_schema_options."""

    id: str
    code: str
    strategic_weight: float
    core_weight: float
    support_weight: float


class WeightingConfigResponse(BaseModel):
    """An office's active weighting, flattened for the client."""

    department_id: str
    department_name: Optional[str] = None
    config_id: Optional[str] = None
    code: Optional[str] = None
    strategic_weight: Optional[float] = None
    core_weight: Optional[float] = None
    support_weight: Optional[float] = None
    effective_from: Optional[datetime] = None
    set_by_employee_id: Optional[str] = None


class WeightingConfigUpdate(BaseModel):
    """Request body: which split to move this office onto."""

    code: str = Field(..., description="Weighting option code: A, B or C")
    set_by_employee_id: Optional[str] = Field(
        None, description="Employee making the change, recorded for audit"
    )
