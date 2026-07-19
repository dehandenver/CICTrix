/**
 * Training Plan (Page 4) — next year's tentative calendar.
 *
 * Page 3 is the live current-year calendar; this is the forward-looking plan.
 * Entries use their own status vocabulary (Proposed / Approved / Needs Budget /
 * Confirmed) and carry provenance, so they live in training_plan_entries rather
 * than training_sessions.
 *
 * Editing is gated by a planning window stored in phase_schedules under the
 * 'training_planning' phase, resolved with the same effectiveState() helper the
 * PM phases use.
 *
 * Results use the flat `{ ok, error? }` shape: the project compiles with
 * `strict: false`, where discriminated unions do not narrow.
 */

import { supabase as supabaseClient } from '../supabase';
import { effectiveState, type PhaseSchedule } from './phaseSchedules';
import type { TrainingCategory } from '../../modules/admin/trainingCategories';

const supabase = supabaseClient as any;

export type MutationResult = { ok: boolean; error?: string };

export type PlanStatus = 'Proposed' | 'Approved' | 'Needs Budget' | 'Confirmed';
export type RecommendedFrom = 'Training Request' | 'Rating Suggestion' | 'LND Planning';

export const PLAN_STATUSES: PlanStatus[] = ['Proposed', 'Approved', 'Needs Budget', 'Confirmed'];

const nowIso = () => new Date().toISOString();

// ── Planning window ──────────────────────────────────────────────────────────

export type PlanningWindow = {
  schedule: PhaseSchedule | null;
  isOpen: boolean;
  startDate: string | null;
  deadlineDate: string | null;
};

/**
 * The system-wide training-planning window. Absent or dateless in 'Auto' mode
 * resolves to Closed, so Page 4 starts locked rather than silently editable.
 */
export async function getPlanningWindow(): Promise<PlanningWindow> {
  const { data, error } = await supabase
    .from('phase_schedules')
    .select('*')
    .eq('scope', 'system')
    .eq('phase', 'training_planning')
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('Error loading planning window:', error);
    return { schedule: null, isOpen: false, startDate: null, deadlineDate: null };
  }

  const schedule = data as PhaseSchedule;
  return {
    schedule,
    isOpen: effectiveState(schedule) === 'Open',
    startDate: schedule.start_date,
    deadlineDate: schedule.deadline_date,
  };
}

export async function setPlanningWindow(input: {
  mode: PhaseSchedule['mode'];
  startDate: string | null;
  deadlineDate: string | null;
  updatedBy: string;
}): Promise<MutationResult> {
  const { error } = await supabase
    .from('phase_schedules')
    .update({
      mode: input.mode,
      start_date: input.startDate,
      deadline_date: input.deadlineDate,
      updated_by: input.updatedBy,
    })
    .eq('scope', 'system')
    .eq('phase', 'training_planning');
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Publication ──────────────────────────────────────────────────────────────

/**
 * Publishing and rolling over are two steps, because promote_training_plan_entry
 * refuses any entry whose plan year has not arrived. A 2027 plan signed off in
 * 2026 waits until January to become Training Courses drafts.
 */
export type PlanPublication = {
  planYear: number;
  publishedAt: string;
  publishedBy: string | null;
  entryCount: number;
  rolledOverAt: string | null;
  rolledOverBy: string | null;
  draftCount: number;
};

/**
 * Null means "not published". A missing table reads as null too: this project
 * has a standing gap between migrations landing in git and being applied in
 * Supabase, and an unapplied migration must not break the page.
 */
export async function getPlanPublication(planYear: number): Promise<PlanPublication | null> {
  const { data, error } = await supabase
    .from('training_plan_publications')
    .select('*')
    .eq('plan_year', planYear)
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn('Planning publication unavailable (migration applied?):', error.message);
    return null;
  }
  return {
    planYear: data.plan_year,
    publishedAt: data.published_at,
    publishedBy: data.published_by,
    entryCount: data.entry_count ?? 0,
    rolledOverAt: data.rolled_over_at,
    rolledOverBy: data.rolled_over_by,
    draftCount: data.draft_count ?? 0,
  };
}

/** Blocks unless every entry is Confirmed, has a department, and has a Dept Head. */
export async function publishTrainingPlan(
  planYear: number,
  actorName: string
): Promise<MutationResult & { entryCount?: number }> {
  const { data, error } = await supabase.rpc('publish_training_plan', {
    p_plan_year: planYear,
    p_actor: actorName,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, entryCount: data as number };
}

export async function unpublishTrainingPlan(
  planYear: number,
  actorName: string
): Promise<MutationResult> {
  const { error } = await supabase.rpc('unpublish_training_plan', {
    p_plan_year: planYear,
    p_actor: actorName,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Idempotent: promoted entries are skipped, so a partial run is safe to re-run. */
export async function rolloverTrainingPlan(
  planYear: number,
  actorName: string
): Promise<MutationResult & { draftCount?: number }> {
  const { data, error } = await supabase.rpc('rollover_training_plan', {
    p_plan_year: planYear,
    p_actor: actorName,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, draftCount: data as number };
}

// ── Plan entries ─────────────────────────────────────────────────────────────

export type PlanEntry = {
  id: string;
  planYear: number;
  title: string;
  category: string;
  startDate: string;
  endDate: string | null;
  speaker: string | null;
  location: string | null;
  objectives: string[];
  capacity: number;
  departmentId: string | null;
  departmentName: string | null;
  planStatus: PlanStatus;
  recommendedFrom: RecommendedFrom;
  sourceRequestId: string | null;
  /** Non-null once the entry has rolled forward into a Training Courses draft. */
  promotedDraftId: string | null;
};

const ENTRY_SELECT = `
  id, plan_year, title, category, tentative_start_date, tentative_end_date,
  instructor_name, location, objectives, capacity, target_department_id,
  plan_status, recommended_from, source_request_id, promoted_draft_id,
  departments ( name )
`;

const mapEntry = (row: any): PlanEntry => ({
  id: row.id,
  planYear: row.plan_year,
  title: row.title,
  category: row.category,
  startDate: row.tentative_start_date,
  endDate: row.tentative_end_date,
  speaker: row.instructor_name,
  location: row.location,
  objectives: row.objectives ?? [],
  capacity: row.capacity ?? 0,
  departmentId: row.target_department_id,
  departmentName: row.departments?.name ?? null,
  planStatus: row.plan_status,
  recommendedFrom: row.recommended_from,
  sourceRequestId: row.source_request_id,
  promotedDraftId: row.promoted_draft_id,
});

export async function listPlanEntries(planYear: number): Promise<PlanEntry[]> {
  const { data, error } = await supabase
    .from('training_plan_entries')
    .select(ENTRY_SELECT)
    .eq('plan_year', planYear)
    .order('tentative_start_date', { ascending: true });

  if (error) {
    console.error('Error fetching plan entries:', error);
    return [];
  }
  return (data ?? []).map(mapEntry);
}

export type PlanEntryInput = {
  planYear: number;
  title: string;
  category: TrainingCategory;
  startDate: string;
  endDate: string | null;
  speaker: string;
  location: string;
  objectives: string[];
  capacity: number;
  departmentId: string | null;
  planStatus: PlanStatus;
  recommendedFrom: RecommendedFrom;
  sourceRequestId: string | null;
};

const toRow = (input: PlanEntryInput) => ({
  plan_year: input.planYear,
  title: input.title,
  category: input.category,
  tentative_start_date: input.startDate,
  tentative_end_date: input.endDate,
  instructor_name: input.speaker || null,
  location: input.location || null,
  objectives: input.objectives.map((o) => o.trim()).filter(Boolean),
  capacity: input.capacity,
  target_department_id: input.departmentId,
  plan_status: input.planStatus,
  recommended_from: input.recommendedFrom,
  source_request_id: input.sourceRequestId,
});

export async function createPlanEntry(
  input: PlanEntryInput,
  actorName: string
): Promise<MutationResult & { id?: string }> {
  const { data, error } = await supabase
    .from('training_plan_entries')
    .insert([{ ...toRow(input), created_by: actorName }])
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function updatePlanEntry(id: string, input: PlanEntryInput): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_plan_entries')
    .update({ ...toRow(input), updated_at: nowIso() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Move an entry to a new start date, preserving its duration. Used by the
 * calendar's drag-to-reschedule.
 */
export async function reschedulePlanEntry(
  entry: PlanEntry,
  newStartDate: Date
): Promise<MutationResult> {
  const oldStart = new Date(entry.startDate);
  const start = new Date(newStartDate);
  start.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);

  let end: string | null = null;
  if (entry.endDate) {
    const durationMs = new Date(entry.endDate).getTime() - oldStart.getTime();
    end = new Date(start.getTime() + durationMs).toISOString();
  }

  const { error } = await supabase
    .from('training_plan_entries')
    .update({ tentative_start_date: start.toISOString(), tentative_end_date: end, updated_at: nowIso() })
    .eq('id', entry.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Plan entries are tentative, so deletion is a real delete, not a cancel. */
export async function deletePlanEntry(id: string): Promise<MutationResult> {
  const { error } = await supabase.from('training_plan_entries').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Roll a Confirmed entry forward into a Training Courses draft. The SQL function
 * enforces that it is Confirmed, unpromoted, has a department, and that its plan
 * year has actually arrived — so those rules hold no matter who calls it.
 */
export async function promotePlanEntry(
  id: string,
  actorName: string
): Promise<MutationResult & { draftId?: string }> {
  const { data, error } = await supabase.rpc('promote_training_plan_entry', {
    p_entry_id: id,
    p_actor: actorName,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, draftId: data as string };
}

// ── Recommendation feed ──────────────────────────────────────────────────────

export type Recommendation = {
  requestId: string;
  title: string;
  category: string | null;
  competency: string | null;
  justification: string | null;
  employeeName: string;
  department: string | null;
  requestedAt: string;
};

/**
 * Pending training requests that have not yet become a plan entry and have not
 * been dismissed. Page 4 shows these alongside the calendar so L&D doesn't have
 * to go hunting through Page 5.
 */
export async function listRecommendations(): Promise<Recommendation[]> {
  const { data: taken, error: takenErr } = await supabase
    .from('training_plan_entries')
    .select('source_request_id')
    .not('source_request_id', 'is', null);

  if (takenErr) {
    console.error('Error loading claimed requests:', takenErr);
    return [];
  }
  const takenIds = new Set((taken ?? []).map((r: any) => r.source_request_id));

  const { data, error } = await supabase
    .from('training_requests')
    .select('id, title, category, competency, justification, requested_at, employees ( first_name, last_name, department )')
    .eq('status', 'pending')
    .is('plan_dismissed_at', null)
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching recommendations:', error);
    return [];
  }

  return (data ?? [])
    .filter((r: any) => !takenIds.has(r.id))
    .map((r: any) => ({
      requestId: r.id,
      title: r.title,
      category: r.category,
      competency: r.competency,
      justification: r.justification,
      employeeName:
        [r.employees?.first_name, r.employees?.last_name].filter(Boolean).join(' ').trim() ||
        'Unknown employee',
      department: r.employees?.department ?? null,
      requestedAt: r.requested_at,
    }));
}

/** Dismissal is reversible and records who and why, so nothing is silently dropped. */
export async function dismissRecommendation(
  requestId: string,
  actorName: string,
  reason: string
): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_requests')
    .update({
      plan_dismissed_at: nowIso(),
      plan_dismissed_by: actorName,
      plan_dismiss_reason: reason.trim() || null,
    })
    .eq('id', requestId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function restoreRecommendation(requestId: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_requests')
    .update({ plan_dismissed_at: null, plan_dismissed_by: null, plan_dismiss_reason: null })
    .eq('id', requestId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
