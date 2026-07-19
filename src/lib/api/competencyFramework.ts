/**
 * Competency Framework (Module 3).
 *
 * - position_competency_requirements: the live per-position competency + level
 *   benchmark (Position Requirements / Competency Map).
 * - competency_requirement_proposals: the Review Queue — add/revise/remove
 *   changes awaiting PM approval before touching the live list.
 * - competency_change_log: audit of every applied change.
 *
 * Direct edits (source 'direct') and approvals (source 'review-queue') both
 * write a change-log entry. See migration 016_create_competency_framework.sql.
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

// Supabase/PostgREST errors are plain objects with a `message` property, not
// Error instances — String(e) on them renders "[object Object]" in the UI.
const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  const obj = e as any;
  if (obj.message) return String(obj.message);
  if (obj.error) return typeof obj.error === 'string' ? obj.error : errMsg(obj.error);
  if (obj.error_description) return String(obj.error_description);
  try {
    return JSON.stringify(obj);
  } catch {
    return String(e);
  }
};

export const PROFICIENCY_LEVELS = ['Basic', 'Intermediate', 'Advanced'] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

export type ProposalAction = 'add' | 'revise' | 'remove';
export type ProposalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface Requirement {
  id: string;
  position: string;
  competency_name: string;
  description: string | null;
  proficiency_level: ProficiencyLevel;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Proposal {
  id: string;
  action: ProposalAction;
  position: string;
  competency_name: string;
  description: string | null;
  proficiency_level: ProficiencyLevel | null;
  target_requirement_id: string | null;
  rsp_input: boolean;
  submitted_by: string | null;
  status: ProposalStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface ChangeLogEntry {
  id: string;
  action: ProposalAction;
  position: string | null;
  competency_name: string | null;
  summary: string | null;
  approved_by: string | null;
  source: 'direct' | 'review-queue';
  created_at: string;
}

type Result<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

async function writeLog(entry: {
  action: ProposalAction;
  position: string | null;
  competency_name: string | null;
  summary: string;
  approved_by: string;
  source: 'direct' | 'review-queue';
}): Promise<void> {
  const { error } = await supabase.from('competency_change_log').insert([entry]);
  if (error) console.warn('[competencyFramework] change-log write failed:', error);
}

// ── Requirements ─────────────────────────────────────────────────────────────
export async function listRequirements(): Promise<Result<Requirement[]>> {
  try {
    const { data, error } = await supabase
      .from('position_competency_requirements')
      .select('*')
      .order('position', { ascending: true })
      .order('competency_name', { ascending: true });
    if (error) return { ok: false, error: error.message ?? 'Failed to load requirements.' };
    return { ok: true, data: (data ?? []) as Requirement[] };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function createRequirement(input: {
  position: string;
  competencyName: string;
  description: string | null;
  proficiencyLevel: ProficiencyLevel;
  by: string;
  source?: 'direct' | 'review-queue';
}): Promise<Result<Requirement>> {
  try {
    const { data, error } = await supabase
      .from('position_competency_requirements')
      .insert([
        {
          position: input.position,
          competency_name: input.competencyName,
          description: input.description,
          proficiency_level: input.proficiencyLevel,
          created_by: input.by,
        },
      ])
      .select()
      .single();
    if (error) {
      if (String(error.code) === '23505') return { ok: false, error: 'That competency already exists for this position.' };
      return { ok: false, error: error.message ?? 'Failed to add requirement.' };
    }
    await writeLog({
      action: 'add',
      position: input.position,
      competency_name: input.competencyName,
      summary: `Added “${input.competencyName}” (${input.proficiencyLevel}) to ${input.position}.`,
      approved_by: input.by,
      source: input.source ?? 'direct',
    });
    return { ok: true, data: data as Requirement };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function updateRequirement(input: {
  id: string;
  description: string | null;
  proficiencyLevel: ProficiencyLevel;
  by: string;
  prev?: Requirement | null;
  source?: 'direct' | 'review-queue';
}): Promise<Result<Requirement>> {
  try {
    const { data, error } = await supabase
      .from('position_competency_requirements')
      .update({ description: input.description, proficiency_level: input.proficiencyLevel })
      .eq('id', input.id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message ?? 'Failed to update requirement.' };
    const r = data as Requirement;
    const levelChange =
      input.prev && input.prev.proficiency_level !== input.proficiencyLevel
        ? ` level ${input.prev.proficiency_level} → ${input.proficiencyLevel};`
        : '';
    await writeLog({
      action: 'revise',
      position: r.position,
      competency_name: r.competency_name,
      summary: `Revised “${r.competency_name}” for ${r.position}.${levelChange}`,
      approved_by: input.by,
      source: input.source ?? 'direct',
    });
    return { ok: true, data: r };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function removeRequirement(input: {
  requirement: Requirement;
  by: string;
  source?: 'direct' | 'review-queue';
}): Promise<Result> {
  try {
    const { error } = await supabase
      .from('position_competency_requirements')
      .delete()
      .eq('id', input.requirement.id);
    if (error) return { ok: false, error: error.message ?? 'Failed to remove requirement.' };
    await writeLog({
      action: 'remove',
      position: input.requirement.position,
      competency_name: input.requirement.competency_name,
      summary: `Removed “${input.requirement.competency_name}” from ${input.requirement.position}.`,
      approved_by: input.by,
      source: input.source ?? 'direct',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

// ── Review Queue (proposals) ─────────────────────────────────────────────────
export async function listProposals(): Promise<Result<Proposal[]>> {
  try {
    const { data, error } = await supabase
      .from('competency_requirement_proposals')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return { ok: false, error: error.message ?? 'Failed to load proposals.' };
    return { ok: true, data: (data ?? []) as Proposal[] };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function submitProposal(input: {
  action: ProposalAction;
  position: string;
  competencyName: string;
  description: string | null;
  proficiencyLevel: ProficiencyLevel | null;
  targetRequirementId: string | null;
  rspInput: boolean;
  by: string;
}): Promise<Result> {
  try {
    const { error } = await supabase.from('competency_requirement_proposals').insert([
      {
        action: input.action,
        position: input.position,
        competency_name: input.competencyName,
        description: input.description,
        proficiency_level: input.proficiencyLevel,
        target_requirement_id: input.targetRequirementId,
        rsp_input: input.rspInput,
        submitted_by: input.by,
      },
    ]);
    if (error) return { ok: false, error: error.message ?? 'Failed to submit proposal.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/** Approve a proposal: apply the change to the live list, then mark it approved. */
export async function approveProposal(proposal: Proposal, by: string): Promise<Result> {
  try {
    let applied: Result | Result<Requirement>;
    if (proposal.action === 'add') {
      applied = await createRequirement({
        position: proposal.position,
        competencyName: proposal.competency_name,
        description: proposal.description,
        proficiencyLevel: (proposal.proficiency_level ?? 'Basic') as ProficiencyLevel,
        by,
        source: 'review-queue',
      });
    } else if (proposal.action === 'revise') {
      if (!proposal.target_requirement_id) return { ok: false, error: 'Proposal has no target requirement to revise.' };
      applied = await updateRequirement({
        id: proposal.target_requirement_id,
        description: proposal.description,
        proficiencyLevel: (proposal.proficiency_level ?? 'Basic') as ProficiencyLevel,
        by,
        source: 'review-queue',
      });
    } else {
      if (!proposal.target_requirement_id) return { ok: false, error: 'Proposal has no target requirement to remove.' };
      applied = await removeRequirement({
        requirement: {
          id: proposal.target_requirement_id,
          position: proposal.position,
          competency_name: proposal.competency_name,
        } as Requirement,
        by,
        source: 'review-queue',
      });
    }

    if (!applied.ok) return { ok: false, error: 'error' in applied ? applied.error : 'Failed to apply change.' };

    const { error } = await supabase
      .from('competency_requirement_proposals')
      .update({ status: 'Approved', reviewed_by: by, reviewed_at: new Date().toISOString() })
      .eq('id', proposal.id);
    if (error) return { ok: false, error: error.message ?? 'Applied change but failed to mark proposal approved.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function rejectProposal(id: string, by: string, note: string): Promise<Result> {
  try {
    const { error } = await supabase
      .from('competency_requirement_proposals')
      .update({ status: 'Rejected', reviewed_by: by, reviewed_at: new Date().toISOString(), review_note: note || null })
      .eq('id', id);
    if (error) return { ok: false, error: error.message ?? 'Failed to reject proposal.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

// ── Change Log ───────────────────────────────────────────────────────────────
export async function listChangeLog(limit = 100): Promise<ChangeLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('competency_change_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as ChangeLogEntry[];
  } catch {
    return [];
  }
}

// ── AI Competency Assessment & Gaps ───────────────────────────────────────────
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface CompetencyAssessmentResult {
  ok: boolean;
  error?: string;
  data?: any;
}

export async function assessEmployeeCompetencies(
  employeeId: string,
  cycleId?: number | null
): Promise<CompetencyAssessmentResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/competency-assessment/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId, cycle_id: cycleId ?? null }),
    });

    if (!res.ok) {
      let detail = `Assessment failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.detail) detail = String(body.detail);
      } catch {
        /* ignore parsing failures */
      }
      return { ok: false, error: detail };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function getEmployeeCompetencyDetails(
  employeeId: string,
  cycleId?: number | null
) {
  try {
    // 1. Fetch scores
    const { data: scores, error: sErr } = await supabase
      .from('employee_competencies')
      .select('competency_id, proficiency_level, required_level, assessed_at, assessed_by, competencies(name)')
      .eq('employee_id', employeeId);
    if (sErr) throw sErr;

    // 2. Fetch summary
    let query = supabase
      .from('employee_competency_summaries')
      .select('*')
      .eq('employee_id', employeeId);
    
    if (cycleId != null) {
      query = query.eq('cycle_id', cycleId);
    } else {
      // No cycle specified — return the most recent summary for this employee
      query = query.order('created_at', { ascending: false }).limit(1);
    }
    const { data: summaries, error: sumErr } = await query;
    if (sumErr) throw sumErr;

    const summary = summaries?.[0] || null;

    return {
      ok: true,
      scores: (scores ?? []).map((s: any) => ({
        name: s.competencies?.name ?? 'Unknown Competency',
        proficiencyLevel: s.proficiency_level,
        requiredLevel: s.required_level,
        // A null required level means the position has no configured requirement
        // for this competency — that's neither Met nor a Gap.
        status:
          s.required_level == null
            ? 'No Requirement'
            : s.proficiency_level >= s.required_level
              ? 'Met'
              : 'Gap',
      })),
      summary: summary
        ? {
            strengths: summary.strengths,
            improvements: summary.improvements,
            recommendations: summary.recommendations,
            assessedAt: summary.created_at,
          }
        : null,
    };
  } catch (e) {
    console.error('getEmployeeCompetencyDetails failed:', e);
    return { ok: false, error: errMsg(e), scores: [], summary: null };
  }
}

export async function getGapAnalysisReport() {
  try {
    // Fetch employees and scores
    const [empRes, scoresRes] = await Promise.all([
      supabase.from('employees_with_department').select('id, full_name, department, current_position, status'),
      supabase.from('employee_competencies').select('employee_id, proficiency_level, required_level'),
    ]);

    if (empRes.error) throw empRes.error;
    if (scoresRes.error) throw scoresRes.error;

    const emps = empRes.data ?? [];
    const scores = scoresRes.data ?? [];

    const scoresByEmp = new Map<string, any[]>();
    for (const s of scores) {
      const list = scoresByEmp.get(s.employee_id) ?? [];
      list.push(s);
      scoresByEmp.set(s.employee_id, list);
    }

    const report = emps.map((e: any) => {
      const empScores = scoresByEmp.get(e.id) ?? [];
      
      let status: 'Not Yet Assessed' | 'Meets Requirement' | 'Below Requirement' = 'Not Yet Assessed';
      let missingCount = 0;

      if (empScores.length > 0) {
        const gaps = empScores.filter((s) => s.proficiency_level < s.required_level);
        missingCount = gaps.length;
        status = missingCount > 0 ? 'Below Requirement' : 'Meets Requirement';
      }

      return {
        id: e.id,
        employeeName: e.full_name,
        department: e.department || 'Unassigned',
        position: e.current_position || 'Unassigned',
        status,
        missingCompetencies: missingCount,
        assessedAt: empScores[0]?.assessed_at || '',
        assessor: empScores[0]?.assessed_by || '',
      };
    });

    return { ok: true, data: report };
  } catch (e) {
    console.error('getGapAnalysisReport failed:', e);
    return { ok: false, error: errMsg(e), data: [] };
  }
}
