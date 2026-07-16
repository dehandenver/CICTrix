/**
 * IPCR Demo — workflow data layer (Stages 2–8).
 *
 * Thin wrappers over the demo-only tables for the live 8-stage cycle: phase
 * open/close, per-employee schedules, target setting, supervisor review,
 * PM vault, Phase 2 accomplishments, notifications, and cycle log. Every write
 * that advances the state machine also drops a notification for the next actor
 * and appends a cycle_log entry, so the demo audience sees each hand-off.
 *
 * Same flat { ok, error?, data? } shape as ./api.ts. All "now" reads go through
 * getSimulatedDate() so the Demo Time Control drives every date.
 */

import { supabase as supabaseClient } from '../../../../lib/supabase';
import { getSimulatedDate, getOffsetDays } from './api';
import type {
  Schedule,
  ScheduleStatus,
  TargetRow,
  AccomplishmentRow,
  DemoNotification,
  VaultRow,
  CycleState,
  DemoAccount,
} from './types';
import { officialMfo, officialIndicator } from './types';

const supabase = supabaseClient as any;

type Result<T> = { ok: boolean; data?: T; error?: string };
const errMsg = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : fallback;

const nowIso = () => getSimulatedDate().toISOString();
const addMonths = (d: Date, m: number): Date => {
  const c = new Date(d);
  c.setMonth(c.getMonth() + m);
  return c;
};

// ── Internal helpers: notify + log ──────────────────────────────────────────
async function notify(recipientId: string, role: string | null, message: string, type: string) {
  await supabase.from('notifications').insert({
    recipient_id: recipientId,
    recipient_role: role,
    message,
    type,
  });
}

async function logCycle(
  employeeId: string,
  stage: string,
  action: string,
  performedBy: string | null,
  notes?: string,
) {
  await supabase.from('cycle_log').insert({
    employee_id: employeeId,
    stage,
    action,
    performed_by: performedBy,
    notes: notes ?? null,
  });
}

/** All active Office Accounts (Supervisor + Dept Head) — they review every office. */
async function officeAccounts(): Promise<DemoAccount[]> {
  const { data } = await supabase
    .from('accounts')
    .select('id, email, full_name, employee_code, role, office, position_title, date_hired, status')
    .in('role', ['Supervisor', 'DeptHead'])
    .eq('status', 'Active');
  return (data ?? []) as DemoAccount[];
}

async function pmAccounts(): Promise<DemoAccount[]> {
  const { data } = await supabase
    .from('accounts')
    .select('id, email, full_name, employee_code, role, office, position_title, date_hired, status')
    .eq('role', 'PMAdmin')
    .eq('status', 'Active');
  return (data ?? []) as DemoAccount[];
}

// ── Cycle state (global phase toggles + simulated time) ─────────────────────
export async function getCycleState(): Promise<Result<CycleState>> {
  try {
    const { data, error } = await supabase
      .from('demo_settings')
      .select('offset_days, simulated_date, phase1_status, phase2_status')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, data: (data ?? { offset_days: 0, simulated_date: null, phase1_status: 'Closed', phase2_status: 'Closed' }) as CycleState };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to load cycle state.') };
  }
}

async function setPhaseStatus(field: 'phase1_status' | 'phase2_status', value: 'Open' | 'Closed'): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('demo_settings').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) throw error;
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to update phase.') };
  }
}

export const openPhase1 = () => setPhaseStatus('phase1_status', 'Open');
export const openPhase2 = () => setPhaseStatus('phase2_status', 'Open');

// ── Employees (for PM's notification picker) ────────────────────────────────
export async function listEmployees(): Promise<Result<DemoAccount[]>> {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, email, full_name, employee_code, role, office, position_title, date_hired, status')
      .eq('role', 'Employee')
      .eq('status', 'Active')
      .order('full_name');
    if (error) throw error;
    return { ok: true, data: (data ?? []) as DemoAccount[] };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to load employees.') };
  }
}

// ── Schedules ───────────────────────────────────────────────────────────────
export async function listSchedules(): Promise<Result<Schedule[]>> {
  try {
    const { data, error } = await supabase.from('ipcr_schedules').select('*');
    if (error) throw error;
    return { ok: true, data: (data ?? []) as Schedule[] };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to load schedules.') };
  }
}

export async function getSchedule(employeeId: string): Promise<Result<Schedule | null>> {
  try {
    const { data, error } = await supabase.from('ipcr_schedules').select('*').eq('employee_id', employeeId).maybeSingle();
    if (error) throw error;
    return { ok: true, data: (data ?? null) as Schedule | null };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to load schedule.') };
  }
}

async function upsertSchedule(employeeId: string, patch: Partial<Schedule>): Promise<Schedule | null> {
  const { data } = await supabase
    .from('ipcr_schedules')
    .upsert({ employee_id: employeeId, ...patch }, { onConflict: 'employee_id' })
    .select('*')
    .maybeSingle();
  return (data ?? null) as Schedule | null;
}

/**
 * Stage 2: PM opens Phase 1 for the selected employees and notifies each.
 * Creates/updates their schedule to 'Phase1 Open' and drops a bell alert.
 */
export async function sendPhase1Notification(
  employeeIds: string[],
  pmId: string,
  dueDate?: string,
): Promise<Result<number>> {
  try {
    const start = getSimulatedDate().toISOString().slice(0, 10);
    for (const empId of employeeIds) {
      await upsertSchedule(empId, {
        phase: 1,
        status: 'Phase1 Open' as ScheduleStatus,
        phase_start_date: start,
        phase_due_date: dueDate ?? null,
      });
      await notify(
        empId,
        'Employee',
        'Your IPCR Target Setting is now open. Please fill out and submit your targets before the due date.',
        'phase1_open',
      );
      await logCycle(empId, 'Phase 1', 'Target Setting opened & employee notified', pmId);
    }
    return { ok: true, data: employeeIds.length };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to send notifications.') };
  }
}

// ── Targets (Phase 1) ───────────────────────────────────────────────────────
export async function listTargets(employeeId: string): Promise<Result<TargetRow[]>> {
  try {
    const { data, error } = await supabase
      .from('ipcr_targets')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return { ok: true, data: (data ?? []) as TargetRow[] };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to load targets.') };
  }
}

export interface TargetInput {
  mfo_pap: string;
  success_indicator: string;
  category: string;
  item_weight_pct: number;
  category_weight_pct: number;
}

/**
 * Stage 3: employee submits their Phase 1 targets. Replaces any prior draft,
 * snapshots the original text (for the revision diff later), flips the schedule
 * to 'Phase1 Submitted', and notifies every Office Account.
 */
export async function submitTargets(
  employeeId: string,
  rows: TargetInput[],
): Promise<Result<boolean>> {
  try {
    const sched = await getSchedule(employeeId);
    const scheduleId = sched.ok && sched.data ? sched.data.id : null;

    // Replace any prior draft rows for a clean re-submit.
    await supabase.from('ipcr_targets').delete().eq('employee_id', employeeId);

    const payload = rows.map((r) => ({
      employee_id: employeeId,
      schedule_id: scheduleId,
      mfo_pap: r.mfo_pap,
      success_indicator: r.success_indicator,
      category: r.category,
      item_weight_pct: r.item_weight_pct,
      category_weight_pct: r.category_weight_pct,
      original_mfo_pap: r.mfo_pap,
      original_success_indicator: r.success_indicator,
    }));
    const { error } = await supabase.from('ipcr_targets').insert(payload);
    if (error) throw error;

    await upsertSchedule(employeeId, { status: 'Phase1 Submitted' as ScheduleStatus });

    const emp = await accountName(employeeId);
    for (const off of await officeAccounts()) {
      await notify(off.id, off.role, `${emp} has submitted their IPCR targets for your review.`, 'phase1_submitted');
    }
    await logCycle(employeeId, 'Phase 1', 'Employee submitted targets', employeeId);
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to submit targets.') };
  }
}

async function accountName(id: string): Promise<string> {
  const { data } = await supabase.from('accounts').select('full_name').eq('id', id).maybeSingle();
  return (data?.full_name as string) ?? 'An employee';
}

// ── Supervisor review — Phase 1 ─────────────────────────────────────────────
export interface TargetRevision {
  id: string;
  revised_mfo_pap: string;
  revised_success_indicator: string;
}

/**
 * Stage 4: supervisor saves their revised version of each target, marks changed
 * fields, records mandatory remarks, flips the schedule to 'Phase1 Verified',
 * and notifies PM.
 */
export async function verifyTargets(
  employeeId: string,
  revisions: TargetRevision[],
  remarks: string,
  supervisorId: string,
): Promise<Result<boolean>> {
  try {
    const current = await listTargets(employeeId);
    const byId = new Map((current.ok ? current.data : []).map((t) => [t.id, t]));
    for (const rev of revisions) {
      const orig = byId.get(rev.id);
      const changed =
        (orig?.original_mfo_pap ?? '') !== rev.revised_mfo_pap ||
        (orig?.original_success_indicator ?? '') !== rev.revised_success_indicator;
      const { error } = await supabase
        .from('ipcr_targets')
        .update({
          revised_mfo_pap: rev.revised_mfo_pap,
          revised_success_indicator: rev.revised_success_indicator,
          is_revised: changed,
          revised_by: changed ? supervisorId : null,
          revision_remarks: remarks,
        })
        .eq('id', rev.id);
      if (error) throw error;
    }
    await upsertSchedule(employeeId, { status: 'Phase1 Verified' as ScheduleStatus });

    const emp = await accountName(employeeId);
    for (const pm of await pmAccounts()) {
      await notify(pm.id, 'PMAdmin', `${emp} — IPCR targets have been verified by the Office Account and are ready for your review.`, 'phase1_verified');
    }
    await notify(employeeId, 'Employee', 'Your IPCR targets have been verified by the Office Account. Pending PM storage.', 'phase1_verified_emp');
    await logCycle(employeeId, 'Phase 1', 'Office Account verified & forwarded to PM', supervisorId, remarks);
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to verify targets.') };
  }
}

// ── PM vault ────────────────────────────────────────────────────────────────
export async function listVault(): Promise<Result<VaultRow[]>> {
  try {
    const { data, error } = await supabase.from('cold_storage_vault').select('*').order('locked_at', { ascending: false });
    if (error) throw error;
    return { ok: true, data: (data ?? []) as VaultRow[] };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to load vault.') };
  }
}

/**
 * Stage 6: PM accepts a verified target set and locks it in the Cold Storage
 * Vault. Records locked_at (simulated) + a Phase-2-eligible date 6 months out.
 */
export async function acceptAndLock(employeeId: string, pmId: string): Promise<Result<boolean>> {
  try {
    const sched = await getSchedule(employeeId);
    const scheduleId = sched.ok && sched.data ? sched.data.id : null;
    const eligible = addMonths(getSimulatedDate(), 6).toISOString().slice(0, 10);

    const { error } = await supabase.from('cold_storage_vault').upsert(
      {
        employee_id: employeeId,
        schedule_id: scheduleId,
        locked_at: nowIso(),
        locked_by: pmId,
        phase2_eligible_date: eligible,
      },
      { onConflict: 'employee_id' },
    );
    if (error) throw error;

    await upsertSchedule(employeeId, { status: 'Phase1 Locked' as ScheduleStatus });
    await notify(employeeId, 'Employee', 'Your IPCR targets have been stored in the vault by PM.', 'phase1_locked');
    await logCycle(employeeId, 'Phase 1', 'PM accepted & locked targets in vault', pmId);
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to lock targets.') };
  }
}

/** Is an employee's vaulted target set past its Phase-2-eligible date (simulated)? */
export function isPhase2Eligible(v: VaultRow): boolean {
  if (!v.phase2_eligible_date) return false;
  return getSimulatedDate() >= new Date(v.phase2_eligible_date + 'T00:00:00');
}

/**
 * Stage 6→7: PM opens Phase 2 for the selected (locked) employees and notifies
 * each employee + every Office Account. Targets stay in the vault; Phase 2 just
 * pulls them into the read-only left column.
 */
export async function sendPhase2Notification(employeeIds: string[], pmId: string): Promise<Result<number>> {
  try {
    for (const empId of employeeIds) {
      await upsertSchedule(empId, { phase: 2, status: 'Phase2 Open' as ScheduleStatus });
      await notify(empId, 'Employee', 'Your IPCR Accomplishment Rating is now open. Please fill in your accomplishments before the due date.', 'phase2_open');
      await logCycle(empId, 'Phase 2', 'Accomplishment Rating opened & employee notified', pmId);
    }
    for (const off of await officeAccounts()) {
      await notify(off.id, off.role, 'The Accomplishment Rating phase is now open for your employees.', 'phase2_open_office');
    }
    return { ok: true, data: employeeIds.length };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to open Phase 2.') };
  }
}

// ── Accomplishments (Phase 2) ───────────────────────────────────────────────
export async function listAccomplishments(employeeId: string): Promise<Result<AccomplishmentRow[]>> {
  try {
    const { data, error } = await supabase.from('ipcr_accomplishments').select('*').eq('employee_id', employeeId);
    if (error) throw error;
    return { ok: true, data: (data ?? []) as AccomplishmentRow[] };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to load accomplishments.') };
  }
}

export interface AccomplishmentInput {
  target_id: string;
  actual_accomplishment: string;
  q_rating: number;
  e_rating: number;
  t_rating: number;
}

/**
 * Stage 7: employee submits Phase 2 accomplishments + Q/E/T against the locked
 * targets. Upserts one row per target, flips the schedule to 'Phase2 Submitted',
 * and notifies every Office Account.
 */
export async function submitAccomplishments(employeeId: string, rows: AccomplishmentInput[]): Promise<Result<boolean>> {
  try {
    const payload = rows.map((r) => ({
      target_id: r.target_id,
      employee_id: employeeId,
      actual_accomplishment: r.actual_accomplishment,
      original_accomplishment: r.actual_accomplishment,
      q_rating: r.q_rating,
      e_rating: r.e_rating,
      t_rating: r.t_rating,
      submitted_at: nowIso(),
    }));
    const { error } = await supabase.from('ipcr_accomplishments').upsert(payload, { onConflict: 'target_id' });
    if (error) throw error;

    await upsertSchedule(employeeId, { status: 'Phase2 Submitted' as ScheduleStatus });
    const emp = await accountName(employeeId);
    for (const off of await officeAccounts()) {
      await notify(off.id, off.role, `${emp} has submitted their IPCR accomplishments for your review.`, 'phase2_submitted');
    }
    await logCycle(employeeId, 'Phase 2', 'Employee submitted accomplishments', employeeId);
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to submit accomplishments.') };
  }
}

// ── Supervisor review — Phase 2 ─────────────────────────────────────────────
export interface AccomplishmentRevision {
  id: string;
  revised_accomplishment: string;
}

export async function verifyAccomplishments(
  employeeId: string,
  revisions: AccomplishmentRevision[],
  remarks: string,
  supervisorId: string,
): Promise<Result<boolean>> {
  try {
    const current = await listAccomplishments(employeeId);
    const byId = new Map((current.ok ? current.data : []).map((a) => [a.id, a]));
    for (const rev of revisions) {
      const orig = byId.get(rev.id);
      const changed = (orig?.original_accomplishment ?? '') !== rev.revised_accomplishment;
      const { error } = await supabase
        .from('ipcr_accomplishments')
        .update({
          revised_accomplishment: rev.revised_accomplishment,
          is_revised: changed,
          revised_by: changed ? supervisorId : null,
          revision_remarks: remarks,
          verified_at: nowIso(),
          verified_by: supervisorId,
        })
        .eq('id', rev.id);
      if (error) throw error;
    }
    await upsertSchedule(employeeId, { status: 'Phase2 Verified' as ScheduleStatus });
    const emp = await accountName(employeeId);
    for (const pm of await pmAccounts()) {
      await notify(pm.id, 'PMAdmin', `${emp} — IPCR accomplishments have been verified by the Office Account and are ready for your review.`, 'phase2_verified');
    }
    await notify(employeeId, 'Employee', 'Your IPCR accomplishments have been verified by the Office Account.', 'phase2_verified_emp');
    await logCycle(employeeId, 'Phase 2', 'Office Account verified & forwarded to PM', supervisorId, remarks);
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to verify accomplishments.') };
  }
}

/** Stage 8: PM closes the cycle for an employee. */
export async function closeCycle(employeeId: string, pmId: string): Promise<Result<boolean>> {
  try {
    await upsertSchedule(employeeId, { status: 'Cycle Completed' as ScheduleStatus });
    await notify(employeeId, 'Employee', 'Your IPCR cycle has been completed. 🏁', 'cycle_completed');
    await logCycle(employeeId, 'Complete', 'PM closed the cycle', pmId);
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to close cycle.') };
  }
}

// ── Notifications ───────────────────────────────────────────────────────────
export async function listNotifications(accountId: string): Promise<Result<DemoNotification[]>> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', accountId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return { ok: true, data: (data ?? []) as DemoNotification[] };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to load notifications.') };
  }
}

export async function markNotificationsRead(accountId: string): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', accountId).eq('is_read', false);
    if (error) throw error;
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to update notifications.') };
  }
}

// Re-exports used across the workflow UI.
export { officialMfo, officialIndicator, getOffsetDays };
