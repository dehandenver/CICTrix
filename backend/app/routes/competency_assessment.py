# backend/app/routes/competency_assessment.py
import json
import math
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from app.core.config import settings
from app.core.supabase_client import db
from app.prompts.competency_assessment import (
    SYSTEM_PROMPT,
    OUTPUT_SCHEMA,
    PROMPT_VERSION,
    build_assessment_user_message
)
from app.prompts.competency_matching import (
    COMPETENCIES,
    COMPETENCY_SET,
    build_user_message as build_matcher_user_message,
    SYSTEM_PROMPT as MATCHER_SYSTEM_PROMPT,
    OUTPUT_SCHEMA as MATCHER_OUTPUT_SCHEMA,
    PROMPT_VERSION as MATCHER_PROMPT_VERSION
)
from app.routes.competency_matching import _clean_targets, _rows_from_result, _extract_json

router = APIRouter(prefix="/api/competency-assessment", tags=["competency-assessment"])

class CompetencyAssessmentRequest(BaseModel):
    employee_id: str = Field(..., min_length=1)
    cycle_id: Optional[int] = None

# Text mapping to integer scores for position competency requirements
MAP_TEXT_TO_INT = {
    'Basic': 3,
    'Intermediate': 4,
    'Advanced': 5
}

def competency_from_objectives(objectives: List[str]) -> Optional[str]:
    """Helper to parse target competency from training session objectives"""
    for obj in (objectives or []):
        if obj.startswith("Competency:"):
            name = obj.replace("Competency:", "").strip()
            if name in COMPETENCY_SET:
                return name
    return None

@router.post("/assess")
async def assess_employee_competencies(req: CompetencyAssessmentRequest):
    client = db.get_service_client()
    
    # ── 1. Fetch employee details ─────────────────────────────────────────────
    emp_res = client.table("employees_with_department").select("id, full_name, current_position, department").eq("id", req.employee_id).execute()
    if not emp_res.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    employee = emp_res.data[0]
    position_title = employee.get("current_position") or "Unassigned"
    department = employee.get("department") or "Unassigned"

    # ── 2. Fetch target settings ──────────────────────────────────────────────
    ts_query = client.table("target_settings").select("id, employee_id, cycle_id")
    if req.cycle_id is not None:
        ts_query = ts_query.eq("employee_id", req.employee_id).eq("cycle_id", req.cycle_id)
    else:
        ts_query = ts_query.eq("employee_id", req.employee_id).order("created_at", desc=True).limit(1)
    
    ts_res = ts_query.execute()
    if not ts_res.data:
        raise HTTPException(status_code=404, detail="No IPCR targets found for this employee")
    target_setting = ts_res.data[0]
    ts_id = target_setting["id"]
    cycle_id = target_setting["cycle_id"]

    # ── 3. Fetch MFOs, Success Indicators and Ratings ────────────────────────
    mfos_res = client.table("mfos").select("id, title").eq("target_setting_id", ts_id).execute()
    mfo_ids = [m["id"] for m in (mfos_res.data or [])]
    if not mfo_ids:
        raise HTTPException(status_code=404, detail="No targets configured in this IPCR cycle")
    
    sis_res = client.table("success_indicators").select("id, mfo_id, description").in_("mfo_id", mfo_ids).execute()
    si_ids = [si["id"] for si in (sis_res.data or [])]
    if not si_ids:
        raise HTTPException(status_code=404, detail="No success indicators configured in this IPCR")
    
    # NOTE: the live success_indicator_ratings table has no `remarks` column —
    # selecting it raises 42703. The prompt builder already defaults missing
    # remarks to "None" via rating.get("remarks").
    ratings_res = client.table("success_indicator_ratings").select(
        "success_indicator_id, quality, efficiency, timeliness, accomplishment"
    ).in_("success_indicator_id", si_ids).execute()
    
    ratings_by_si = {r["success_indicator_id"]: r for r in (ratings_res.data or [])}
    
    # ── 4. Retrieve or generate competency matches ──────────────────────────
    matches_res = client.table("ipcr_competency_matches").select(
        "competency, confidence, target_text, success_indicator_id"
    ).eq("employee_id", req.employee_id).execute()
    
    matches = matches_res.data or []
    
    # If no matches exist, run the Claude-matching engine first to backfill
    if not matches:
        if not settings.GEMINI_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="Competency matching is required but GEMINI_API_KEY is unset.",
            )
        try:
            import google.generativeai as genai
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="The 'google-generativeai' package is not installed on the server.",
            )
        
        # Build composite target texts
        mfo_by_id = {m["id"]: m for m in mfos_res.data}
        targets_list = []
        si_mapping = {} # composite text -> success_indicator_id
        
        for si in sis_res.data:
            mfo = mfo_by_id.get(si["mfo_id"])
            mfo_title = mfo["title"] if mfo else "Untitled MFO"
            composite_text = f"{mfo_title} — {si['description'] or 'No indicator description'}"
            targets_list.append(composite_text)
            si_mapping[composite_text] = si["id"]
            
        cleaned_targets = _clean_targets(targets_list)
        if cleaned_targets:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            try:
                model_instance = genai.GenerativeModel(
                    model_name=settings.GEMINI_MODEL,
                    system_instruction=MATCHER_SYSTEM_PROMPT
                )
                response = model_instance.generate_content(
                    build_matcher_user_message(position_title, None, cleaned_targets),
                    generation_config=genai.GenerationConfig(
                        response_mime_type="application/json",
                        response_schema=MATCHER_OUTPUT_SCHEMA,
                        temperature=0.2,
                    )
                )
                parsed = _extract_json(response)
                
                # Format into database rows
                # Prepare mock request structure for _rows_from_result compatibility
                class MockReq:
                    def __init__(self, emp_id, pos, cycle):
                        self.employee_id = emp_id
                        self.job_position = pos
                        self.rating_period = str(cycle) if cycle else None
                        self.created_by = "AI Assessor"
                
                mock_req = MockReq(req.employee_id, position_title, cycle_id)
                rows = _rows_from_result(mock_req, settings.GEMINI_MODEL, parsed)
                
                # Attach success_indicator_id robustly
                for row in rows:
                    txt = row.get("target_text")
                    if txt in si_mapping:
                        row["success_indicator_id"] = si_mapping[txt]
                
                # Write to database
                insert_res = client.table("ipcr_competency_matches").insert(rows).execute()
                matches = insert_res.data or []
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"AI matching backfill failed: {e}")

    # Map success indicators and ratings by normalized text/id for join
    mfo_by_id = {m["id"]: m for m in mfos_res.data}
    si_by_id = {si["id"]: si for si in sis_res.data}
    si_to_composite = {}
    for si in sis_res.data:
        mfo = mfo_by_id.get(si["mfo_id"])
        mfo_title = mfo["title"] if mfo else "Untitled MFO"
        si_to_composite[si["id"]] = f"{mfo_title} — {si['description'] or 'No indicator description'}"

    # ── 5. Run aggregation math ───────────────────────────────────────────────
    # Group matches by competency name
    matches_by_comp: Dict[str, List[Dict[str, Any]]] = {}
    for m in matches:
        comp = m.get("competency")
        if not comp:
            continue
        if comp not in matches_by_comp:
            matches_by_comp[comp] = []
        matches_by_comp[comp].append(m)

    calculated_scores: Dict[str, Dict[str, Any]] = {}
    
    for comp in COMPETENCIES:
        comp_matches = matches_by_comp.get(comp, [])
        valid_ratings = []
        total_confidence = 0.0
        weighted_sum = 0.0
        
        for m in comp_matches:
            # Try to resolve success indicator
            si_id = m.get("success_indicator_id")
            # Fallback to text match if success_indicator_id is not set
            if not si_id:
                target_txt = m.get("target_text", "").strip().lower()
                for sid, comp_txt in si_to_composite.items():
                    if comp_txt.strip().lower() == target_txt:
                        si_id = sid
                        break
            
            if not si_id:
                continue
                
            rating = ratings_by_si.get(si_id)
            if not rating:
                continue
                
            q = rating.get("quality")
            e = rating.get("efficiency")
            t = rating.get("timeliness")
            scores = [s for s in [q, e, t] if s is not None]
            
            if scores:
                avg_rating = sum(scores) / len(scores)
                confidence = float(m.get("confidence") or 1.0)
                
                valid_ratings.append(avg_rating)
                weighted_sum += avg_rating * confidence
                total_confidence += confidence
        
        if valid_ratings:
            if total_confidence > 0:
                possessed = weighted_sum / total_confidence
            else:
                possessed = sum(valid_ratings) / len(valid_ratings)
            
            calculated_scores[comp] = {
                "status": "Assessed",
                "possessed": round(possessed, 2),
                "raw_ratings_count": len(valid_ratings)
            }
        else:
            # Competency is mapped but no ratings are completed in Phase 2
            calculated_scores[comp] = {
                "status": "Not Yet Assessed",
                "possessed": None,
                "raw_ratings_count": 0
            }

    # ── 6. Fetch requirements and map to integers ────────────────────────────
    # In CICTrix: position_competency_requirements maps position_title & competency_id
    # competency_id is an integer (1 to 12) corresponding to competency_standards
    reqs_res = client.table("position_competency_requirements").select(
        "competency_id, proficiency_level"
    ).eq("position_title", position_title).execute()
    
    req_by_standard_id = {r["competency_id"]: r["proficiency_level"] for r in (reqs_res.data or [])}
    
    # Match requirements to canonical competencies by standard ID (1 to 12)
    # The order of COMPETENCIES corresponds to ID 1 to 12
    required_levels: Dict[str, Optional[int]] = {}
    required_text_levels: Dict[str, str] = {}
    
    for idx, comp in enumerate(COMPETENCIES, start=1):
        level_text = req_by_standard_id.get(idx)
        if level_text:
            required_levels[comp] = MAP_TEXT_TO_INT.get(level_text)
            required_text_levels[comp] = level_text
        else:
            required_levels[comp] = None
            required_text_levels[comp] = "No requirement configured"

    # ── 7. Fetch active training sessions scheduled for next calendar month ──
    from datetime import datetime, timedelta
    today = datetime.now()
    next_month_start = datetime(today.year, today.month, 1) + timedelta(days=32)
    next_month_start = datetime(next_month_start.year, next_month_start.month, 1)
    # Next month end
    next_month_end = datetime(next_month_start.year, next_month_start.month, 1) + timedelta(days=32)
    next_month_end = datetime(next_month_end.year, next_month_end.month, 1)
    
    sessions_res = client.table("training_sessions").select(
        "id, title, category, objectives, status, capacity, scheduled_date"
    ).in_("status", ["Scheduled", "Ongoing"]).gte(
        "scheduled_date", next_month_start.isoformat()
    ).lt(
        "scheduled_date", next_month_end.isoformat()
    ).execute()
    
    courses_by_comp: Dict[str, List[Dict[str, Any]]] = {}
    for s in (sessions_res.data or []):
        comp = competency_from_objectives(s.get("objectives", []))
        if comp:
            if comp not in courses_by_comp:
                courses_by_comp[comp] = []
            courses_by_comp[comp].append(s)

    # ── 8. Call Gemini to generate qualitative analysis ──────────────────────
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI qualitative assessment is not configured (GEMINI_API_KEY is unset).",
        )
    import google.generativeai as genai

    # Format inputs for Gemini
    reqs_text = "\n".join([
        f"- {comp}: Required Level: {required_text_levels[comp]} (mapped to {required_levels[comp]} / 5)"
        for comp in COMPETENCIES
    ])

    scores_text = ""
    gaps_found = []
    for comp in COMPETENCIES:
        score_info = calculated_scores[comp]
        possessed = score_info["possessed"]
        required = required_levels[comp]

        possessed_label = f"{possessed} / 5" if possessed is not None else "Not Yet Assessed"
        required_label = f"{required} / 5" if required is not None else "No Requirement"

        scores_text += f"- {comp}: Demonstrated={possessed_label}, Required={required_label}"

        if possessed is not None and required is not None:
            gap = required - possessed
            if gap > 0:
                gaps_found.append(comp)
                scores_text += f" -> GAP of {round(gap, 2)}"
        scores_text += "\n"

    # IPCR details text block
    ipcr_details_text = ""
    for si in sis_res.data:
        composite = si_to_composite[si["id"]]
        rating = ratings_by_si.get(si["id"])
        if rating:
            q = rating.get("quality")
            e = rating.get("efficiency")
            t = rating.get("timeliness")
            scores = [str(s) for s in [q, e, t] if s is not None]
            score_label = "/".join(scores) if scores else "Not Rated"
            accomplishment = rating.get("accomplishment") or "No accomplishment details entered"
            ipcr_details_text += (
                f"Target: {composite}\n"
                f"  Ratings (Q/E/T): {score_label}\n"
                f"  Accomplishment: {accomplishment}\n\n"
            )

    # Available courses text
    available_courses_text = ""
    for comp in COMPETENCIES:
        courses = courses_by_comp.get(comp, [])
        if courses:
            available_courses_text += f"- {comp}:\n"
            for c in courses:
                available_courses_text += f"  * Course Title: \"{c['title']}\" (ID: {c['id']})\n"
    if not available_courses_text:
        available_courses_text = "No scheduled training courses available next month."

    genai.configure(api_key=settings.GEMINI_API_KEY)

    try:
        model_instance = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            system_instruction=SYSTEM_PROMPT
        )
        response = model_instance.generate_content(
            build_assessment_user_message(
                position_title,
                department,
                reqs_text,
                scores_text,
                ipcr_details_text,
                available_courses_text
            ),
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=OUTPUT_SCHEMA,
                temperature=0.3,
            )
        )
        qual_res = _extract_json(response)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini qualitative analysis call failed: {e}")

    # ── 9. Persist assessment results in database ─────────────────────────────
    # Fetch competencies UUID mapping by querying the `competencies` table
    comp_records_res = client.table("competencies").select("id, name").execute()
    comp_map = {c["name"]: c["id"] for c in (comp_records_res.data or [])}
    
    # Normalizing mapping by stripping spaces for slashes
    def normalize_comp_name(name: str) -> str:
        return name.replace(" ", "").replace("/", "").lower()
        
    normalized_comp_map = {normalize_comp_name(name): uuid for name, uuid in comp_map.items()}

    # Check and insert any missing competencies in `competencies` table
    # Competencies list is 12 standards
    # We map using standards info
    standards_res = client.table("competency_standards").select("*").execute()
    standards_list = standards_res.data or []
    
    for std in standards_list:
        name = std["competency_name"]
        norm_name = normalize_comp_name(name)
        if norm_name not in normalized_comp_map:
            # Create a new competency catalog row
            new_comp = {
                "name": name,
                "category": std["training_stream"],
                "description": f"Core organizational competency: {name}"
            }
            ins_res = client.table("competencies").insert(new_comp).execute()
            if ins_res.data:
                comp_uuid = ins_res.data[0]["id"]
                normalized_comp_map[norm_name] = comp_uuid
                comp_map[name] = comp_uuid

    # Now we insert/upsert employee competency levels
    for idx, comp in enumerate(COMPETENCIES, start=1):
        score_info = calculated_scores[comp]
        possessed_val = score_info["possessed"]
        required_val = required_levels[comp]
        
        if possessed_val is None:
            # Skip saving if the competency standard could not be assessed
            continue
            
        norm_name = normalize_comp_name(comp)
        comp_uuid = normalized_comp_map.get(norm_name)
        if not comp_uuid:
            # Defensive check
            continue
            
        # Convert possessed rating average (1.0 - 5.0) to integer (1 - 5)
        proficiency_level = max(1, min(5, round(possessed_val)))
        
        # Save to employee_competencies
        emp_comp_row = {
            "employee_id": req.employee_id,
            "competency_id": comp_uuid,
            "proficiency_level": proficiency_level,
            "required_level": required_val,
            "assessed_by": "AI Assessor",
            "cycle_id": cycle_id
        }
        
        # Upsert by (employee_id, competency_id)
        client.table("employee_competencies").upsert(
            [emp_comp_row],
            on_conflict="employee_id,competency_id"
        ).execute()

    # Save to employee_competency_summaries
    summary_row = {
        "employee_id": req.employee_id,
        "cycle_id": cycle_id,
        "strengths": qual_res.get("strengths", ""),
        "improvements": qual_res.get("improvements", ""),
        "recommendations": qual_res.get("recommendations", "")
    }
    
    # Upsert by employee_id + cycle_id
    client.table("employee_competency_summaries").upsert(
        [summary_row],
        on_conflict="employee_id,cycle_id"
    ).execute()

    # Formulate API response payload
    competency_gaps = []
    competency_list_res = []
    
    for comp in COMPETENCIES:
        score_info = calculated_scores[comp]
        possessed = score_info["possessed"]
        required = required_levels[comp]
        
        gap = 0.0
        status_str = "Met"
        if possessed is not None and required is not None:
            gap_val = required - possessed
            if gap_val > 0:
                gap = round(gap_val, 2)
                status_str = "Gap"
                competency_gaps.append({
                    "competency": comp,
                    "required": required,
                    "possessed": possessed,
                    "gap": gap
                })
        elif possessed is None:
            status_str = "Not Yet Assessed"

        competency_list_res.append({
            "name": comp,
            "requiredLevel": required if required is not None else 0,
            "employeeLevel": possessed if possessed is not None else 0,
            "status": status_str
        })

    return {
        "ok": True,
        "employee_name": employee["full_name"],
        "position": position_title,
        "department": department,
        "cycle_id": cycle_id,
        "competencies": competency_list_res,
        "gaps": competency_gaps,
        "strengths": qual_res.get("strengths"),
        "improvements": qual_res.get("improvements"),
        "recommendations": qual_res.get("recommendations"),
        "prompt_version": PROMPT_VERSION,
        "model": settings.GEMINI_MODEL
    }
