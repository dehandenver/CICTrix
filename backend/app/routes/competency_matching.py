"""
IPCR competency matching — server-side Claude call.

An HR admin sends an employee's job position plus a list of IPCR targets
(success indicators); Claude maps each target to the LGU's 12 canonical
competencies with a confidence score and justification, and we persist the
matches to `ipcr_competency_matches` for the review queue.

The Claude call lives here (not in the browser) so ANTHROPIC_API_KEY never
reaches the client. Access follows the app's anon-open posture — the L&D Portal
that surfaces this is already access-gated; enforcement is app-layer.
"""

import json
import re

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional

from app.core.config import settings
from app.core.supabase_client import db
from app.prompts.competency_matching import (
    COMPETENCY_SET,
    OUTPUT_SCHEMA,
    PROMPT_VERSION,
    SYSTEM_PROMPT,
    build_user_message,
)

router = APIRouter(prefix="/api/competency-matching", tags=["competency-matching"])


class CompetencyMatchRequest(BaseModel):
    job_position: str = Field(..., min_length=1)
    rating_period: Optional[str] = None
    targets: List[str] = Field(..., min_length=1)
    employee_id: Optional[str] = None
    # When true (default), the returned matches are written to
    # ipcr_competency_matches. Set false for a dry-run / preview.
    persist: bool = True
    created_by: Optional[str] = None


class MatchedCompetency(BaseModel):
    competency: str
    confidence: float
    justification: str


class TargetResult(BaseModel):
    target_text: str
    matched_competencies: List[MatchedCompetency]
    flag_for_review: bool


class CompetencyMatchResponse(BaseModel):
    employee_position: str
    rating_period: Optional[str]
    results: List[TargetResult]
    unmatched_targets: List[str]
    prompt_version: str
    model: str
    persisted: int


# Boilerplate lines that show up when IPCR text is copied out of a form: page
# markers, signature lines, bare separators. Stripped before the text reaches
# the model — noise in, noise out.
_BOILERPLATE = re.compile(
    r"^(page\s+\d+(\s+of\s+\d+)?|-{3,}|_{3,}|signature.*|rated by.*|reviewed by.*|approved by.*)$",
    re.IGNORECASE,
)


def _clean_targets(raw: List[str]) -> List[str]:
    cleaned: List[str] = []
    for t in raw:
        line = re.sub(r"\s+", " ", (t or "").strip())
        if not line or _BOILERPLATE.match(line):
            continue
        cleaned.append(line)
    return cleaned


def _extract_json(message) -> dict:
    """Pull the JSON text block out of the response (skips any thinking block)."""
    for block in message.content:
        if getattr(block, "type", None) == "text":
            return json.loads(block.text)
    raise ValueError("model response contained no text block")


def _rows_from_result(req: CompetencyMatchRequest, model: str, parsed: dict) -> list[dict]:
    rows: list[dict] = []
    for result in parsed.get("results", []):
        target_text = result.get("target_text", "")
        flag = bool(result.get("flag_for_review", False))
        matches = result.get("matched_competencies", []) or []

        base = {
            "employee_id": req.employee_id,
            "employee_position": parsed.get("employee_position") or req.job_position,
            "rating_period": parsed.get("rating_period") or req.rating_period,
            "target_text": target_text,
            "flag_for_review": flag,
            "prompt_version": PROMPT_VERSION,
            "model": model,
            "created_by": req.created_by,
        }

        if not matches:
            # Unmatched target -> a single row with no competency.
            rows.append({**base, "competency": None, "confidence": None})
            continue

        for m in matches:
            competency = m.get("competency")
            # Defensive: the enum in the schema should already guarantee this,
            # but never persist a competency the app doesn't recognize.
            if competency not in COMPETENCY_SET:
                continue
            rows.append({
                **base,
                "competency": competency,
                "confidence": m.get("confidence"),
                "justification": m.get("justification"),
            })
    return rows


@router.post("/analyze", response_model=CompetencyMatchResponse)
async def analyze_targets(req: CompetencyMatchRequest):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Competency matching is not configured (ANTHROPIC_API_KEY is unset).",
        )

    targets = _clean_targets(req.targets)
    if not targets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No usable IPCR targets after cleanup.",
        )

    try:
        import anthropic
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The 'anthropic' package is not installed on the server.",
        )

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    model = settings.ANTHROPIC_MODEL

    try:
        message = client.messages.create(
            model=model,
            max_tokens=8000,
            # Cache the large, static instruction+taxonomy+examples prefix so
            # repeated analyses only pay for it once.
            system=[{
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            thinking={"type": "adaptive"},
            output_config={"format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}},
            messages=[{
                "role": "user",
                "content": build_user_message(req.job_position, req.rating_period, targets),
            }],
        )
    except anthropic.APIStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Claude API error ({e.status_code}): {e.message}",
        )
    except anthropic.APIConnectionError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach the Claude API.",
        )

    if message.stop_reason == "refusal":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The model declined to analyze these targets.",
        )

    try:
        parsed = _extract_json(message)
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not parse the model response: {e}",
        )

    rows = _rows_from_result(req, model, parsed)
    persisted = 0
    if req.persist and rows:
        try:
            client_db = db.get_client()
            resp = client_db.table("ipcr_competency_matches").insert(rows).execute()
            persisted = len(resp.data or [])
        except Exception as e:  # noqa: BLE001 — surface storage failures, don't lose the analysis
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Analysis succeeded but persisting matches failed: {e}",
            )

    return {
        "employee_position": parsed.get("employee_position") or req.job_position,
        "rating_period": parsed.get("rating_period") or req.rating_period,
        "results": parsed.get("results", []),
        "unmatched_targets": parsed.get("unmatched_targets", []),
        "prompt_version": PROMPT_VERSION,
        "model": model,
        "persisted": persisted,
    }
