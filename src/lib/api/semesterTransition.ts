/**
 * Semester transition state — the L&D "which semester" gate (Requirement 3).
 *
 * The Summary of Ratings module runs two semesters at once:
 *   • NEW (collecting)  — the Active performance_cycle, still gathering IPCRs.
 *                         Drives the new "Semester Summary of Ratings" section.
 *   • CURRENT (L&D)     — the most recent FULLY-completed semester. Every L&D
 *                         read stays pinned here until the new semester is 100%
 *                         complete AND a PM confirms the cutover.
 *
 * Completion — not the cycle's Active/Closed flag — is what promotes new →
 * current. A cycle can be Active for weeks while offices are still submitting;
 * treating "Active" as "current" would let L&D pull a half-collected semester.
 * So L&D reads `current_cycle_id` and only ever moves when a PM confirms.
 *
 * State machine (semester_transition_state.completion_status):
 *   in_progress → ready        computeNewSemesterCompletion() sees 100%
 *   ready       → complete      confirmSemesterTransition() (PM action)
 * On confirm the new semester becomes current and the old one is retired.
 *
 * See migration 20260829_semester_transition_state.sql.
 */

import { supabase as supabaseClient } from '../supabase';
import { getActiveOfficeNameSet } from './departments';

const supabase = supabaseClient as any;

export type CompletionStatus = 'in_progress' | 'ready' | 'complete';

export interface TransitionState {
  currentCycleId: number | null;
  newCycleId: number | null;
  completionStatus: CompletionStatus;
  completedCount: number;
  expectedCount: number;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

export interface CompletionSnapshot {
  completed: number;
  expected: number;
  /** completed / expected, as a whole percentage (0 when nothing expected). */
  pct: number;
  /** True only when expected > 0 and every expected employee is done. */
  is100: boolean;
}

const rowToState = (r: any): TransitionState => ({
  currentCycleId: r?.current_cycle_id ?? null,
  newCycleId: r?.new_cycle_id ?? null,
  completionStatus: (r?.completion_status as CompletionStatus) ?? 'in_progress',
  completedCount: Number(r?.completed_count ?? 0),
  expectedCount: Number(r?.expected_count ?? 0),
  confirmedBy: r?.confirmed_by ?? null,
  confirmedAt: r?.confirmed_at ?? null,
});

/** The singleton transition row (or a safe default if the table is empty). */
export async function getTransitionState(): Promise<TransitionState> {
  const { data, error } = await supabase
    .from('semester_transition_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    console.error('Error loading semester_transition_state:', error);
    return {
      currentCycleId: null,
      newCycleId: null,
      completionStatus: 'in_progress',
      completedCount: 0,
      expectedCount: 0,
      confirmedBy: null,
      confirmedAt: null,
    };
  }
  return rowToState(data ?? {});
}

/**
 * The cycle L&D reads. The single funnel every L&D finalized-IPCR read goes
 * through. `null` = no pinned semester yet, so callers fall back to their
 * pre-existing "latest finalized" behaviour rather than blanking.
 */
export async function getLndSourceCycleId(): Promise<number | null> {
  const state = await getTransitionState();
  return state.currentCycleId;
}

/**
 * Reduce a semester label to a format-agnostic key so the two conventions in the
 * codebase line up: performance_cycles.title ("January–June 2025") vs
 * ipcr_competency_matches.rating_period ("Jan 1-Jun 30 2025") both become
 * "2025-H1". Returns null when a label carries no recognisable year+half.
 */
export function normalizeSemesterKey(label: unknown): string | null {
  const s = String(label ?? '').toLowerCase();
  const year = s.match(/\b(20\d{2})\b/)?.[1];
  if (!year) return null;
  const half = /\b(jan|feb|mar|apr|may|jun)/.test(s)
    ? 'H1'
    : /\b(jul|aug|sep|oct|nov|dec)/.test(s)
      ? 'H2'
      : null;
  return half ? `${year}-${half}` : null;
}

/**
 * Format-agnostic semester key for the cycle L&D reads. The needs-assessment
 * gate uses this to keep new-semester competency matches out until transition,
 * while still counting legacy rows whose period can't be parsed. Null = no pin.
 */
export async function getLndSourcePeriodKey(): Promise<string | null> {
  const cycleId = await getLndSourceCycleId();
  if (cycleId == null) return null;
  const { data } = await supabase
    .from('performance_cycles')
    .select('title')
    .eq('id', cycleId)
    .maybeSingle();
  return normalizeSemesterKey(data?.title);
}

/** Active employee ids scoped to the 5 active offices (the completion denominator). */
async function activeOfficeEmployeeIds(): Promise<string[]> {
  const [{ data: emps, error }, activeOffices] = await Promise.all([
    supabase
      .from('employees_with_department')
      .select('id, department, status')
      .eq('status', 'Active'),
    getActiveOfficeNameSet(),
  ]);
  if (error) {
    console.error('Error loading employees for completion:', error);
    return [];
  }
  // Empty active set (lookup failed) → don't filter, mirroring the needs-assessment
  // module's philosophy (better to count everyone than to under-count on a blip).
  const inActive = (dept: unknown) =>
    activeOffices.size === 0 || activeOffices.has(String(dept ?? '').trim().toLowerCase());
  return ((emps ?? []) as any[])
    .filter((e) => inActive(e.department))
    .map((e) => String(e.id));
}

/**
 * How complete the NEW semester's Summary of Ratings is: of the active-office
 * active employees, how many have a finalized IPCR (approved + phase2 completed
 * target_settings) for the new cycle. Persists the snapshot on the singleton row
 * and, when 100% is reached, advances in_progress → ready (never straight to
 * complete — that's the PM's call). Reaching 100% and then dropping back below
 * (a new hire, a reopened record) rolls ready back to in_progress.
 */
export async function computeNewSemesterCompletion(): Promise<CompletionSnapshot> {
  const state = await getTransitionState();
  const empty: CompletionSnapshot = { completed: 0, expected: 0, pct: 0, is100: false };

  if (state.newCycleId == null) return empty;
  // Once the PM has confirmed the cutover there is nothing left to gate on.
  if (state.completionStatus === 'complete') {
    return {
      completed: state.completedCount,
      expected: state.expectedCount,
      pct: state.expectedCount ? Math.round((state.completedCount / state.expectedCount) * 100) : 0,
      is100: true,
    };
  }

  const expectedIds = await activeOfficeEmployeeIds();
  const expected = expectedIds.length;
  if (!expected) return empty;

  const { data: finalized, error } = await supabase
    .from('target_settings')
    .select('employee_id')
    .eq('status', 'approved')
    .eq('phase2_status', 'completed')
    .eq('cycle_id', state.newCycleId)
    .in('employee_id', expectedIds);
  if (error) {
    console.error('Error computing new-semester completion:', error);
    return empty;
  }

  const done = new Set((finalized ?? []).map((r: any) => String(r.employee_id)));
  const completed = done.size;
  const pct = Math.round((completed / expected) * 100);
  const is100 = completed >= expected;

  // Persist snapshot + advance/rollback the ready flag (but never touch 'complete').
  const nextStatus: CompletionStatus = is100 ? 'ready' : 'in_progress';
  await supabase
    .from('semester_transition_state')
    .update({
      completed_count: completed,
      expected_count: expected,
      completion_status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  return { completed, expected, pct, is100 };
}

/**
 * PM confirms the cutover. Allowed only from 'ready' (100% reached). Promotes the
 * new semester to current, retires the old one, and marks the transition
 * complete so L&D begins reading the new semester. Idempotent-ish: a second call
 * once already 'complete' is a no-op success.
 */
export async function confirmSemesterTransition(
  pmActor: string,
): Promise<{ ok: boolean; error?: string }> {
  const state = await getTransitionState();
  if (state.completionStatus === 'complete') return { ok: true };
  if (state.completionStatus !== 'ready') {
    return { ok: false, error: 'The new semester is not yet 100% complete across all offices.' };
  }
  if (state.newCycleId == null) {
    return { ok: false, error: 'No new semester is set to transition to.' };
  }

  const { error } = await supabase
    .from('semester_transition_state')
    .update({
      current_cycle_id: state.newCycleId,
      new_cycle_id: null,
      completion_status: 'complete',
      confirmed_by: pmActor,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);
  return error ? { ok: false, error: error.message } : { ok: true };
}
