"""
IPCR office weighting — read for any authenticated user, write for admins only.

Why this is a backend endpoint rather than a direct Supabase write like most of
the app: changing an office's weighting silently re-computes every rating under
that office, for every employee, including cycles already rated. That is a much
larger blast radius than row-level data entry, and
`department_weighting_configs` was deliberately shipped with writes locked to
`service_role` (see 20260714_ipcr_target_setting.sql). This module is the RBAC
check that lock was designed to sit behind — it must stay the only write path.

Changing a weighting deactivates the current config and inserts a new one, so
an already-rated cycle keeps the weights that applied when it was rated.
"""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.core.security import TokenData
from app.core.supabase_client import db
from app.models.weighting import (
    WeightingConfigResponse,
    WeightingConfigUpdate,
    WeightingSchemaOption,
)
from app.utils.dependencies import get_authenticated_user, require_role

router = APIRouter(prefix="/api/offices", tags=["ipcr-weighting"])

# Who may re-weight an office. Roles come from `user_roles` and are uppercase.
#
# PM owns the IPCR cycle, and L&D consumes the ratings, so both may set a split.
# Super-admin is deliberately excluded: that portal is a read-only viewer in this
# system, and it is stored as ADMIN (the user_roles CHECK allows no SUPER_ADMIN
# value), so listing ADMIN here would hand the read-only role a write that
# recomputes every rating in an office.
WRITE_ROLES = ("PM", "LND")


def _flatten(config: dict, department_name: str | None = None) -> WeightingConfigResponse:
    """Fold the joined weighting_schema_options row up into the response."""
    option = config.get("weighting_schema_options") or {}
    return WeightingConfigResponse(
        department_id=config["department_id"],
        department_name=department_name,
        config_id=config.get("id"),
        code=option.get("code"),
        strategic_weight=option.get("strategic_weight"),
        core_weight=option.get("core_weight"),
        support_weight=option.get("support_weight"),
        effective_from=config.get("effective_from"),
        set_by_employee_id=config.get("set_by_employee_id"),
    )


@router.get("/weighting-options", response_model=List[WeightingSchemaOption])
async def list_weighting_options(current_user: TokenData = Depends(get_authenticated_user)):
    """The three legal splits. A lookup table, so an invalid split is unrepresentable."""
    try:
        client = db.get_client()
        response = client.table("weighting_schema_options").select("*").order("code").execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch weighting options: {str(e)}",
        )


@router.get("/weighting-configs", response_model=List[WeightingConfigResponse])
async def list_weighting_configs(current_user: TokenData = Depends(get_authenticated_user)):
    """Every active office's weighting — the admin table's read."""
    try:
        client = db.get_client()
        departments = (
            client.table("departments").select("id, name").eq("is_active", True).order("name").execute()
        ).data or []

        configs = (
            client.table("department_weighting_configs")
            .select("*, weighting_schema_options(code, strategic_weight, core_weight, support_weight)")
            .eq("is_active", True)
            .execute()
        ).data or []
        by_department = {c["department_id"]: c for c in configs}

        # An office with no config yet is still listed, with empty weights, so
        # the admin screen shows it as unset rather than omitting it.
        out: List[WeightingConfigResponse] = []
        for dept in departments:
            config = by_department.get(dept["id"])
            if config:
                out.append(_flatten(config, dept["name"]))
            else:
                out.append(WeightingConfigResponse(department_id=dept["id"], department_name=dept["name"]))
        return out
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch weighting configs: {str(e)}",
        )


@router.get("/{office_id}/weighting-config", response_model=WeightingConfigResponse)
async def get_weighting_config(
    office_id: str,
    current_user: TokenData = Depends(get_authenticated_user),
):
    """One office's active weighting."""
    try:
        client = db.get_client()
        response = (
            client.table("department_weighting_configs")
            .select("*, weighting_schema_options(code, strategic_weight, core_weight, support_weight)")
            .eq("department_id", office_id)
            .eq("is_active", True)
            .execute()
        )
        if not response.data:
            # Unset is a valid state, not an error — the office simply has no
            # weighting yet and the caller should show it as unconfigured.
            return WeightingConfigResponse(department_id=office_id)
        return _flatten(response.data[0])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch weighting config: {str(e)}",
        )


@router.put("/{office_id}/weighting-config", response_model=WeightingConfigResponse)
async def set_weighting_config(
    office_id: str,
    payload: WeightingConfigUpdate = Body(...),
    current_user: TokenData = Depends(require_role(*WRITE_ROLES)),
):
    """
    Move an office onto a different weighting split.

    Admin-only, and the only write path to department_weighting_configs. The
    previous config is deactivated rather than overwritten so a cycle that was
    already rated keeps the weights it was rated under.
    """
    code = (payload.code or "").strip().upper()
    if code not in ("A", "B", "C"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Weighting code must be one of A, B or C.",
        )

    try:
        client = db.get_service_client()

        department = (
            client.table("departments").select("id, name").eq("id", office_id).execute()
        ).data
        if not department:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Office not found")

        option = (
            client.table("weighting_schema_options").select("*").eq("code", code).execute()
        ).data
        if not option:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Weighting option {code} not found",
            )
        option = option[0]

        current = (
            client.table("department_weighting_configs")
            .select("id, schema_option_id")
            .eq("department_id", office_id)
            .eq("is_active", True)
            .execute()
        ).data or []

        # Already on this split — nothing to version, so don't churn history.
        if current and current[0]["schema_option_id"] == option["id"]:
            existing = (
                client.table("department_weighting_configs")
                .select("*, weighting_schema_options(code, strategic_weight, core_weight, support_weight)")
                .eq("id", current[0]["id"])
                .execute()
            ).data[0]
            return _flatten(existing, department[0]["name"])

        # Deactivate first: a partial unique index allows only one active config
        # per department, so inserting before deactivating would be rejected.
        now = datetime.now(timezone.utc).isoformat()
        for row in current:
            client.table("department_weighting_configs").update(
                {"is_active": False, "deactivated_at": now}
            ).eq("id", row["id"]).execute()

        inserted = (
            client.table("department_weighting_configs")
            .insert(
                {
                    "department_id": office_id,
                    "schema_option_id": option["id"],
                    "is_active": True,
                    "set_by_employee_id": payload.set_by_employee_id,
                }
            )
            .execute()
        ).data

        if not inserted:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Weighting config insert returned no row",
            )

        # postgrest-py 2.x can't embed a related table on an insert's return, so
        # the joined shape is read back separately.
        created = (
            client.table("department_weighting_configs")
            .select("*, weighting_schema_options(code, strategic_weight, core_weight, support_weight)")
            .eq("id", inserted[0]["id"])
            .execute()
        ).data
        return _flatten(created[0], department[0]["name"])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set weighting config: {str(e)}",
        )
