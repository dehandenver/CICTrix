/**
 * Locked Targets Vault (Module 1 · Tab 1.2 · Subtab 2).
 *
 * A secured, read-only store of office-verified targets, frozen for the cycle.
 * Once a set is locked it is never edited — the vault only reads it back (and,
 * later, feeds it into Accomplishment Rating when the Rating Phase opens). The
 * lock action captures the verification + lock audit. See migration
 * 012_create_cycle_timeline.sql.
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export interface LockedTargetRow {
  function_type?: string;
  target_text?: string;
  [key: string]: any;
}

export interface LockedTargetSet {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  office_id: string | null;
  office_name: string | null;
  period: string | null;
  targets: LockedTargetRow[];
  verified_by: string | null;
  verified_at: string | null;
  locked_by: string | null;
  locked_at: string;
  created_at: string;
}

/** List every locked target set, most recently locked first. */
export async function listLockedTargets(): Promise<
  { ok: true; data: LockedTargetSet[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase
      .from('locked_targets')
      .select('*')
      .order('locked_at', { ascending: false });
    if (error) return { ok: false, error: error.message ?? 'Failed to load the vault.' };
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      targets: Array.isArray(r.targets) ? r.targets : [],
    })) as LockedTargetSet[];
    return { ok: true, data: rows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Best-effort snapshot of an employee's target rows for a period from
 * ipcr_performance. Tolerant of schema drift / missing table: returns [] on any
 * error so the caller can still decide how to proceed.
 */
export async function fetchTargetRowsForEmployee(
  employeeId: string,
  period: string,
): Promise<LockedTargetRow[]> {
  try {
    // Resolve the employee's number (schema has drifted across environments).
    const { data: emp } = await supabase.from('employees').select('*').eq('id', employeeId).maybeSingle();
    const employeeNum =
      emp?.employee_id ?? emp?.employee_number ?? emp?.employee_no ?? emp?.employeeNumber ?? null;
    if (!employeeNum) return [];

    const { data, error } = await supabase
      .from('ipcr_performance')
      .select('function_type, target_text, competency_id, mapped_competency_standard')
      .eq('employee_num', employeeNum)
      .eq('rating_period', period)
      .order('id', { ascending: true });
    if (error || !Array.isArray(data)) return [];
    return data as LockedTargetRow[];
  } catch {
    return [];
  }
}

/**
 * Freeze a verified target set into the vault. Normally triggered by the Office
 * Account confirming targets at the end of Target-Setting; exposed here so PM
 * can lock a set and to seed the vault. Returns the created record.
 */
export async function lockTargetSet(input: {
  employeeId: string;
  employeeName: string;
  officeId: string | null;
  officeName: string | null;
  period: string;
  targets: LockedTargetRow[];
  verifiedBy: string;
  lockedBy: string;
}): Promise<{ ok: true; data: LockedTargetSet } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('locked_targets')
      .insert([
        {
          employee_id: input.employeeId,
          employee_name: input.employeeName,
          office_id: input.officeId,
          office_name: input.officeName,
          period: input.period,
          targets: input.targets ?? [],
          verified_by: input.verifiedBy,
          verified_at: new Date().toISOString(),
          locked_by: input.lockedBy,
          locked_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();
    if (error) return { ok: false, error: error.message ?? 'Failed to lock the target set.' };
    return { ok: true, data: { ...(data as any), targets: (data as any).targets ?? [] } as LockedTargetSet };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
