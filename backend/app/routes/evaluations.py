from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List, Optional
from app.models.user import UserRole
from app.core.supabase_client import db
from app.utils.dependencies import get_current_user, require_role
from pydantic import BaseModel

router = APIRouter(prefix="/api/evaluations", tags=["evaluations"])


class EvaluationCreate(BaseModel):
    applicant_id: str
    score: float
    comments: Optional[str] = None


class EvaluationResponse(BaseModel):
    id: str
    applicant_id: str
    evaluator_id: str
    score: float
    comments: Optional[str]


@router.get("/", response_model=List[EvaluationResponse])
async def list_evaluations(
    current_user: UserRole = Depends(require_role("ADMIN", "PM", "RSP", "LND", "RATER")),
    applicant_id: Optional[str] = Query(None),
):
    """
    List evaluations with role-based access:
    - ADMIN/PM/RSP/LND: Can see all evaluations
    - RATER/INTERVIEWER: Can see evaluations they created
    """
    try:
        client = db.get_client()
        query = client.table("evaluations").select("*")

        if applicant_id:
            query = query.eq("applicant_id", applicant_id)

        if current_user.role in ["RATER", "INTERVIEWER"]:
            # Can only see their own evaluations
            query = query.eq("evaluator_id", current_user.user_id)

        response = query.execute()
        return response.data

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch evaluations: {str(e)}",
        )


@router.post("/", response_model=EvaluationResponse)
async def create_evaluation(
    evaluation: EvaluationCreate,
    current_user: UserRole = Depends(require_role("RATER", "INTERVIEWER")),
):
    """
    Create an evaluation (Rater/Interviewer only).
    Each user can only evaluate applicants assigned to them.
    """
    try:
        client = db.get_client()

        # TODO: Add validation to ensure user is assigned to this applicant

        evaluation_data = {
            "applicant_id": evaluation.applicant_id,
            "evaluator_id": current_user.user_id,
            "score": evaluation.score,
            "comments": evaluation.comments,
        }

        response = client.table("evaluations").insert(evaluation_data).execute()
        return response.data[0]

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create evaluation: {str(e)}",
        )
