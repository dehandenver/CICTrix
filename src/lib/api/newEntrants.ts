/**
 * New Entrant Onboarding (Module 2 · Subtab 2.1).
 *
 * PM-facing tracker for employees new to the org or a position — orientation
 * schedule/log plus their first-ever target-setting status. Backed by the
 * new_entrant_onboarding table (migration 014).
 */

import { supabase as supabaseClient } from '../supabase';
import type { IpcrStage } from './ipcrStages';

const supabase = supabaseClient as any;

export interface NewEntrant {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  office_id: string | null;
  office_name: string | null;
  start_date: string | null;
  orientation_date: string | null;
  target_setting_deadline: string | null;
  orientation_conducted_by: string | null;
  orientation_completed_date: string | null;
  initial_target_stage: IpcrStage;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewEntrantInput {
  employeeId: string;
  employeeName: string;
  officeId: string | null;
  officeName: string | null;
  startDate: string | null;
  orientationDate: string | null;
  targetSettingDeadline: string | null;
  orientationConductedBy: string | null;
  orientationCompletedDate: string | null;
  initialTargetStage: IpcrStage;
  notes: string | null;
}

const toRow = (input: NewEntrantInput, createdBy?: string) => ({
  employee_id: input.employeeId,
  employee_name: input.employeeName,
  office_id: input.officeId,
  office_name: input.officeName,
  start_date: input.startDate,
  orientation_date: input.orientationDate,
  target_setting_deadline: input.targetSettingDeadline,
  orientation_conducted_by: input.orientationConductedBy,
  orientation_completed_date: input.orientationCompletedDate,
  initial_target_stage: input.initialTargetStage,
  notes: input.notes,
  ...(createdBy ? { created_by: createdBy } : {}),
});

export async function listNewEntrants(): Promise<
  { ok: true; data: NewEntrant[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase
      .from('new_entrant_onboarding')
      .select('*')
      .order('start_date', { ascending: false, nullsFirst: false });
    if (error) return { ok: false, error: error.message ?? 'Failed to load new entrants.' };
    return { ok: true, data: (data ?? []) as NewEntrant[] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createNewEntrant(
  input: NewEntrantInput,
  createdBy: string,
): Promise<{ ok: true; data: NewEntrant } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('new_entrant_onboarding')
      .insert([toRow(input, createdBy)])
      .select()
      .single();
    if (error) return { ok: false, error: error.message ?? 'Failed to add the new entrant.' };
    return { ok: true, data: data as NewEntrant };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateNewEntrant(
  id: string,
  input: NewEntrantInput,
): Promise<{ ok: true; data: NewEntrant } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('new_entrant_onboarding')
      .update(toRow(input))
      .eq('id', id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message ?? 'Failed to update the record.' };
    return { ok: true, data: data as NewEntrant };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteNewEntrant(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.from('new_entrant_onboarding').delete().eq('id', id);
    if (error) return { ok: false, error: error.message ?? 'Failed to remove the record.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
