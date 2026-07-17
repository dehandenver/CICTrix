/**
 * PM "Open/Close Phase" orchestrator.
 * Handles system-wide phase transitions and notifications.
 */

import { listSchedules, effectiveState, upsertSchedule, type EffectiveState, type PhaseKey } from './phaseSchedules';
import { getActiveCyclePeriod } from './compliance';
import { sendNotification, type IpcrPhase } from './ipcrSubmissions';
import { openSelfRatingPeriod, closeSelfRatingPeriod } from './ipcrRatings';
import { createNotifications } from './employeeNotifications';
import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export interface SystemPhaseStates {
  target_setting: EffectiveState;
  rating: EffectiveState;
}

/** Get the system-wide effective open/closed state for both phases. */
export async function getSystemPhaseStates(): Promise<SystemPhaseStates> {
  const res = await listSchedules();
  if (!res.ok) {
    return { target_setting: 'Closed', rating: 'Closed' };
  }
  // If a schedule is missing, it defaults to Closed
  const targetSched = res.data.find((s) => s.scope === 'system' && s.phase === 'target_setting') ?? null;
  const ratingSched = res.data.find((s) => s.scope === 'system' && s.phase === 'rating') ?? null;
  return {
    target_setting: targetSched ? effectiveState(targetSched) : 'Closed',
    rating: ratingSched ? effectiveState(ratingSched) : 'Closed',
  };
}

export async function openPhase(input: {
  phase: 'phase1' | 'phase2';
  openedBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const isPhase1 = input.phase === 'phase1';
    const dbPhase: PhaseKey = isPhase1 ? 'target_setting' : 'rating';
    const notifPhase: IpcrPhase = isPhase1 ? 'target' : 'rating';
    const today = new Date().toISOString().slice(0, 10);

    // 1. Upsert system schedule
    const upsertRes = await upsertSchedule({
      scope: 'system',
      phase: dbPhase,
      mode: 'Open',
      startDate: today,
      deadlineDate: null,
      updatedBy: input.openedBy,
    });
    if (upsertRes.ok === false) return { ok: false, error: upsertRes.error };

    // 2. Get active cycle and period label
    const cycleInfo = await getActiveCyclePeriod();
    const period = cycleInfo.period;
    const cycleId = cycleInfo.cycleId;

    // Get count of employees
    const { count, error: countErr } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true });
    if (countErr) return { ok: false, error: countErr.message };
    const employeeCount = count ?? 0;

    // 3. Log Office notification
    const msg = isPhase1
      ? `IPCR Target Setting (Phase 1) is now open system-wide for period: ${period}.`
      : `IPCR Accomplishment Rating (Phase 2) is now open system-wide for period: ${period}.`;
    const notifRes = await sendNotification({
      phase: notifPhase,
      officeId: null,
      officeName: null,
      period,
      employeeCount,
      message: msg,
      triggeredBy: input.openedBy,
    });
    if (notifRes.ok === false) return { ok: false, error: notifRes.error };

    // 4. Handle Phase 2 specifics (openSelfRatingPeriod)
    let ratingEmpIds: string[] = [];
    if (!isPhase1) {
      const ratingRes = await openSelfRatingPeriod({
        cycleId: cycleId ?? undefined,
        openedBy: input.openedBy,
      });
      if (ratingRes.ok === false) return { ok: false, error: ratingRes.error };
      ratingEmpIds = ratingRes.data.employeeIds;
    }

    // 5. Notify employees via employee_notifications
    const { data: emps, error: empErr } = await supabase
      .from('employees')
      .select('id');
    if (empErr) return { ok: false, error: empErr.message };

    if (emps && emps.length > 0) {
      const notifType = isPhase1 ? 'phase1_open' : 'phase2_open';
      const notifTitle = isPhase1 ? 'IPCR Phase 1 (Target Setting) is Open' : 'IPCR Phase 2 (Accomplishment Rating) is Open';
      const notifMsg = isPhase1
        ? `The target setting phase for ${period} has been opened system-wide. Please encode and submit your targets.`
        : `The accomplishment rating phase for ${period} has been opened system-wide. Please encode and submit your ratings.`;

      // Combined notification logic: send phase open notification to all active employees.
      // If Phase 2, we already flipped their phase2_status via openSelfRatingPeriod.
      const payloads = emps.map((e: any) => ({
        employeeId: String(e.id),
        type: notifType,
        title: notifTitle,
        message: notifMsg,
        period,
        link: '/employee/ipcr-workspace',
      }));

      await createNotifications(payloads);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function closePhase(input: {
  phase: 'phase1' | 'phase2';
  closedBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const isPhase1 = input.phase === 'phase1';
    const dbPhase: PhaseKey = isPhase1 ? 'target_setting' : 'rating';
    const today = new Date().toISOString().slice(0, 10);

    // 1. Upsert system schedule to Closed
    const upsertRes = await upsertSchedule({
      scope: 'system',
      phase: dbPhase,
      mode: 'Closed',
      startDate: today,
      deadlineDate: today,
      updatedBy: input.closedBy,
    });
    if (upsertRes.ok === false) return { ok: false, error: upsertRes.error };

    // 2. Handle Phase 2 specifics (closeSelfRatingPeriod)
    if (!isPhase1) {
      const cycleInfo = await getActiveCyclePeriod();
      const ratingRes = await closeSelfRatingPeriod({
        cycleId: cycleInfo.cycleId ?? undefined,
        closedBy: input.closedBy,
      });
      if (ratingRes.ok === false) return { ok: false, error: ratingRes.error };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
