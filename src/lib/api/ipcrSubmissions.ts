/**
 * IPCR submission pipeline + notification log (Module 2 · Subtabs 2.2 & 2.3).
 *
 * - Notifications: the log of "Targets Needed" (target) / "Accomplishment
 *   Ratings Needed" (rating) notifications PM triggered to Office Accounts.
 * - Submission tracker: per-employee stage for a period + phase. Reaching
 *   "Forwarded to PM" in the target phase auto-locks the employee's targets into
 *   the Locked Targets Vault (Module 1.2).
 *
 * Backed by ipcr_notifications + ipcr_submissions (migration 015).
 */

import { supabase as supabaseClient } from '../supabase';
import type { IpcrStage } from './ipcrStages';
import { fetchTargetRowsForEmployee, lockTargetSet } from './lockedTargets';

const supabase = supabaseClient as any;

export type IpcrPhase = 'target' | 'rating';

export interface IpcrNotification {
  id: string;
  phase: IpcrPhase;
  office_id: string | null;
  office_name: string | null;
  period: string | null;
  employee_count: number;
  message: string | null;
  triggered_by: string | null;
  created_at: string;
}

export interface SubmissionRow {
  employeeId: string;
  employeeName: string;
  officeId: string | null;
  officeName: string | null;
  stage: IpcrStage;
  submissionId: string | null;
  updatedAt: string | null;
}

// ── Notifications ────────────────────────────────────────────────────────────
export async function listNotifications(phase: IpcrPhase): Promise<IpcrNotification[]> {
  try {
    const { data, error } = await supabase
      .from('ipcr_notifications')
      .select('*')
      .eq('phase', phase)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []) as IpcrNotification[];
  } catch {
    return [];
  }
}

export async function sendNotification(input: {
  phase: IpcrPhase;
  officeId: string | null;
  officeName: string | null;
  period: string;
  employeeCount: number;
  message: string | null;
  triggeredBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.from('ipcr_notifications').insert([
      {
        phase: input.phase,
        office_id: input.officeId,
        office_name: input.officeName,
        period: input.period,
        employee_count: input.employeeCount,
        message: input.message,
        triggered_by: input.triggeredBy,
      },
    ]);
    if (error) return { ok: false, error: error.message ?? 'Failed to send notification.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Submission tracker ───────────────────────────────────────────────────────
/**
 * Build the per-employee submission tracker for a period + phase. Employees with
 * no submission row default to "Not Started". New entrants are excluded from the
 * target phase (they run through Subtab 2.1's onboarding tracker instead).
 */
export async function getSubmissionTracker(opts: {
  period: string;
  phase: IpcrPhase;
  excludeNewEntrants?: boolean;
}): Promise<{ ok: true; rows: SubmissionRow[] } | { ok: false; error: string }> {
  try {
    const [empRes, subRes, neRes] = await Promise.all([
      supabase.from('employees_with_department').select('id, full_name, department_id, department, status'),
      supabase.from('ipcr_submissions').select('*').eq('period', opts.period).eq('phase', opts.phase),
      opts.excludeNewEntrants
        ? supabase.from('new_entrant_onboarding').select('employee_id')
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (empRes.error) return { ok: false, error: empRes.error.message ?? 'Failed to load employees.' };

    const employees: any[] = empRes.data ?? [];
    const submissions: any[] = subRes.error ? [] : subRes.data ?? [];
    const newEntrantIds = new Set(((neRes as any)?.data ?? []).map((r: any) => String(r.employee_id)));

    const subByEmp = new Map<string, any>();
    for (const s of submissions) subByEmp.set(String(s.employee_id), s);

    const rows: SubmissionRow[] = employees
      .filter((e) => !(opts.excludeNewEntrants && newEntrantIds.has(String(e.id))))
      .map((e) => {
        const sub = subByEmp.get(String(e.id));
        return {
          employeeId: String(e.id),
          employeeName: String(e.full_name ?? '—'),
          officeId: e.department_id ? String(e.department_id) : null,
          officeName: e.department ?? null,
          stage: (sub?.stage as IpcrStage) ?? 'Not Started',
          submissionId: sub?.id ?? null,
          updatedAt: sub?.updated_at ?? null,
        };
      });

    rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Set an employee's submission stage for a period + phase (upsert). When the
 * stage reaches "Forwarded to PM" in the target phase, the employee's targets
 * are locked into the Vault (once — skipped if already locked for that period).
 */
export async function setSubmissionStage(input: {
  employeeId: string;
  employeeName: string;
  officeId: string | null;
  officeName: string | null;
  period: string;
  phase: IpcrPhase;
  stage: IpcrStage;
  updatedBy: string;
}): Promise<{ ok: true; lockedToVault: boolean } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.from('ipcr_submissions').upsert(
      [
        {
          employee_id: input.employeeId,
          employee_name: input.employeeName,
          office_id: input.officeId,
          office_name: input.officeName,
          period: input.period,
          phase: input.phase,
          stage: input.stage,
          forwarded_at: input.stage === 'Forwarded to PM' ? new Date().toISOString() : null,
          updated_by: input.updatedBy,
        },
      ],
      { onConflict: 'employee_id,period,phase' },
    );
    if (error) return { ok: false, error: error.message ?? 'Failed to update stage.' };

    // Auto-place into the Locked Targets Vault on forward (target phase only).
    let lockedToVault = false;
    if (input.stage === 'Forwarded to PM' && input.phase === 'target') {
      const { data: existing } = await supabase
        .from('locked_targets')
        .select('id')
        .eq('employee_id', input.employeeId)
        .eq('period', input.period)
        .maybeSingle();
      if (!existing) {
        const targets = await fetchTargetRowsForEmployee(input.employeeId, input.period);
        const res = await lockTargetSet({
          employeeId: input.employeeId,
          employeeName: input.employeeName,
          officeId: input.officeId,
          officeName: input.officeName,
          period: input.period,
          targets,
          verifiedBy: input.updatedBy,
          lockedBy: input.updatedBy,
        });
        lockedToVault = res.ok;
      }
    }

    return { ok: true, lockedToVault };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
