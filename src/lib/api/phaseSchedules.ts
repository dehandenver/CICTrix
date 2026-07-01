/**
 * Phase Scheduler (Module 1 · Tab 1.2 · Subtab 1).
 *
 * Controls what employees / Office Accounts may do at any time via two phases —
 * Target-Setting and Rating — each Open/Closed. A 'system' row is the default;
 * an 'office' row overrides it for one office (staggered calendars). Mode 'Auto'
 * derives the effective state from the start/deadline dates; 'Open'/'Closed'
 * force it. See migration 012_create_cycle_timeline.sql.
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export type PhaseKey = 'target_setting' | 'rating';
export type PhaseMode = 'Auto' | 'Open' | 'Closed';
export type EffectiveState = 'Open' | 'Closed';

export const PHASE_LABELS: Record<PhaseKey, string> = {
  target_setting: 'Target-Setting Phase',
  rating: 'Rating Phase',
};

export interface PhaseSchedule {
  id: string;
  scope: 'system' | 'office';
  office_id: string | null;
  office_name: string | null;
  phase: PhaseKey;
  mode: PhaseMode;
  start_date: string | null;
  deadline_date: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Derive Open/Closed from a schedule row for a given date (default today). */
export function effectiveState(row: Pick<PhaseSchedule, 'mode' | 'start_date' | 'deadline_date'> | null, on = todayIso()): EffectiveState {
  if (!row) return 'Closed';
  if (row.mode === 'Open') return 'Open';
  if (row.mode === 'Closed') return 'Closed';
  // Auto: open only within [start, deadline] when both are set.
  if (!row.start_date || !row.deadline_date) return 'Closed';
  return on >= row.start_date && on <= row.deadline_date ? 'Open' : 'Closed';
}

/**
 * Resolve the effective schedule for an office+phase: the office override if one
 * exists, otherwise the system default.
 */
export function resolveSchedule(
  schedules: PhaseSchedule[],
  officeId: string | null,
  phase: PhaseKey,
): PhaseSchedule | null {
  if (officeId) {
    const office = schedules.find((s) => s.scope === 'office' && s.office_id === officeId && s.phase === phase);
    if (office) return office;
  }
  return schedules.find((s) => s.scope === 'system' && s.phase === phase) ?? null;
}

export async function listSchedules(): Promise<
  { ok: true; data: PhaseSchedule[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase
      .from('phase_schedules')
      .select('*')
      .order('scope', { ascending: true });
    if (error) return { ok: false, error: error.message ?? 'Failed to load phase schedules.' };
    return { ok: true, data: (data ?? []) as PhaseSchedule[] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Insert or update a schedule row. System rows are keyed by (scope, phase);
 * office rows by (office_id, phase). We look up an existing row first because
 * PostgREST upsert onConflict can't target our partial unique indexes reliably.
 */
export async function upsertSchedule(input: {
  scope: 'system' | 'office';
  officeId?: string | null;
  officeName?: string | null;
  phase: PhaseKey;
  mode: PhaseMode;
  startDate: string | null;
  deadlineDate: string | null;
  updatedBy: string;
}): Promise<{ ok: true; data: PhaseSchedule } | { ok: false; error: string }> {
  const payload = {
    scope: input.scope,
    office_id: input.scope === 'office' ? input.officeId ?? null : null,
    office_name: input.scope === 'office' ? input.officeName ?? null : null,
    phase: input.phase,
    mode: input.mode,
    start_date: input.startDate,
    deadline_date: input.deadlineDate,
    updated_by: input.updatedBy,
  };

  try {
    let existingQuery = supabase
      .from('phase_schedules')
      .select('id')
      .eq('scope', input.scope)
      .eq('phase', input.phase);
    existingQuery =
      input.scope === 'office'
        ? existingQuery.eq('office_id', input.officeId ?? '')
        : existingQuery.is('office_id', null);

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from('phase_schedules')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return { ok: false, error: error.message ?? 'Failed to update schedule.' };
      return { ok: true, data: data as PhaseSchedule };
    }

    const { data, error } = await supabase.from('phase_schedules').insert([payload]).select().single();
    if (error) return { ok: false, error: error.message ?? 'Failed to save schedule.' };
    return { ok: true, data: data as PhaseSchedule };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Remove an office override (system rows should not be deleted). */
export async function deleteSchedule(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.from('phase_schedules').delete().eq('id', id);
    if (error) return { ok: false, error: error.message ?? 'Failed to remove override.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
