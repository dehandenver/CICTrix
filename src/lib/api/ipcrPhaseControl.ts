/**
 * PM "Open/Close Phase" orchestrator.
 * Handles system-wide phase transitions and notifications.
 *
 * The switch itself is `phase_schedules`, and for Phase 2 the per-employee
 * `phase2_status` that gates the rating sheet. Everything after that — office
 * notifications, the employee bell — is announcement, not gating.
 *
 * Those two used to be reported the same way: any failure returned
 * `{ ok: false }`, the caller alerted "Failed to open phase" and left its badge
 * on CLOSED, while the schedule row had in fact already flipped to Open. The
 * admin then saw CLOSED, employees saw Open, and pressing the button again
 * produced a second round of notifications. A failure to announce a change is
 * now a warning on a successful result, so the two can never disagree about
 * whether the phase moved.
 */

import { listSchedules, effectiveState, upsertSchedule, type EffectiveState, type PhaseKey } from './phaseSchedules';
import { getActiveCyclePeriod } from './compliance';
import { sendNotification, type IpcrPhase } from './ipcrSubmissions';
import { openSelfRatingPeriod, closeSelfRatingPeriod } from './ipcrRatings';
import { createNotifications } from './employeeNotifications';
import { fetchAllRows } from './fetchAllRows';
import { supabase as supabaseClient } from '../supabase';
import { todayManilaIso } from '../../utils/manilaDate';

const supabase = supabaseClient as any;

export interface SystemPhaseStates {
  target_setting: EffectiveState;
  rating: EffectiveState;
}

/**
 * The outcome of a phase change.
 *
 * `ok: true` means the phase moved. `warning` means it moved but something
 * secondary did not happen, which is worth telling the admin without implying
 * the switch failed.
 */
export type PhaseChangeResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

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

/** Active employees, for the notification fan-out. Failure here is not fatal. */
async function activeEmployeeIds(): Promise<{ ids: string[] } | { error: string }> {
  const { data, error } = await fetchAllRows<{ id: string }>((from, to) =>
    supabase
      .from('employees')
      .select('id')
      .eq('status', 'Active')
      .order('id', { ascending: true })
      .range(from, to),
  );
  if (error) return { error: (error as any)?.message ?? 'Failed to list active employees.' };
  return { ids: (data ?? []).map((e) => String(e.id)) };
}

export async function openPhase(input: {
  phase: 'phase1' | 'phase2';
  openedBy: string;
}): Promise<PhaseChangeResult> {
  try {
    const isPhase1 = input.phase === 'phase1';
    const dbPhase: PhaseKey = isPhase1 ? 'target_setting' : 'rating';
    const notifPhase: IpcrPhase = isPhase1 ? 'target' : 'rating';
    const today = todayManilaIso();

    // 1. The switch. Nothing has changed if this fails.
    const upsertRes = await upsertSchedule({
      scope: 'system',
      phase: dbPhase,
      mode: 'Open',
      startDate: today,
      deadlineDate: null,
      updatedBy: input.openedBy,
    });
    if (upsertRes.ok === false) return { ok: false, error: upsertRes.error };

    const cycleInfo = await getActiveCyclePeriod();
    const period = cycleInfo.period;
    const cycleId = cycleInfo.cycleId;

    // 2. Phase 2 also gates per employee via phase2_status, so this is part of
    //    opening the phase rather than announcing it. The schedule is already
    //    Open at this point, which the error says, so the admin is not left
    //    thinking nothing happened.
    if (!isPhase1) {
      const ratingRes = await openSelfRatingPeriod({
        cycleId: cycleId ?? undefined,
        openedBy: input.openedBy,
      });
      if (ratingRes.ok === false) {
        return {
          ok: false,
          error: `The phase was opened, but the rating sheets could not be unlocked: ${ratingRes.error}. Close and reopen the phase to retry.`,
        };
      }
    }

    // 3. Announcements. Past this point the phase IS open; a failure here is
    //    reported as a warning, never as a failure to open.
    const warnings: string[] = [];

    const emps = await activeEmployeeIds();
    if ('error' in emps) {
      warnings.push(`notifications were not sent (${emps.error})`);
    } else {
      const msg = isPhase1
        ? `IPCR Target Setting (Phase 1) is now open system-wide for period: ${period}.`
        : `IPCR Accomplishment Rating (Phase 2) is now open system-wide for period: ${period}.`;
      const notifRes = await sendNotification({
        phase: notifPhase,
        officeId: null,
        officeName: null,
        period,
        employeeCount: emps.ids.length,
        message: msg,
        triggeredBy: input.openedBy,
      });
      if (notifRes.ok === false) warnings.push(`the office notice was not logged (${notifRes.error})`);

      if (emps.ids.length > 0) {
        const notifTitle = isPhase1
          ? 'IPCR Phase 1 (Target Setting) is Open'
          : 'IPCR Phase 2 (Accomplishment Rating) is Open';
        const notifMsg = isPhase1
          ? `The target setting phase for ${period} has been opened system-wide. Please encode and submit your targets.`
          : `The accomplishment rating phase for ${period} has been opened system-wide. Please encode and submit your ratings.`;
        await createNotifications(
          emps.ids.map((id) => ({
            employeeId: id,
            type: isPhase1 ? 'phase1_open' : 'phase2_open',
            title: notifTitle,
            message: notifMsg,
            period,
            link: '/employee/ipcr-workspace',
          })),
        );
      }
    }

    return warnings.length > 0
      ? { ok: true, warning: `The phase is open, but ${warnings.join(' and ')}.` }
      : { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function closePhase(input: {
  phase: 'phase1' | 'phase2';
  closedBy: string;
}): Promise<PhaseChangeResult> {
  try {
    const isPhase1 = input.phase === 'phase1';
    const dbPhase: PhaseKey = isPhase1 ? 'target_setting' : 'rating';
    const notifPhase: IpcrPhase = isPhase1 ? 'target' : 'rating';
    const today = todayManilaIso();

    const phaseStates = await getSystemPhaseStates();
    const wasClosed = phaseStates[dbPhase] === 'Closed';

    // 1. The switch.
    const upsertRes = await upsertSchedule({
      scope: 'system',
      phase: dbPhase,
      mode: 'Closed',
      startDate: today,
      deadlineDate: today,
      updatedBy: input.closedBy,
    });
    if (upsertRes.ok === false) return { ok: false, error: upsertRes.error };

    const cycleInfo = await getActiveCyclePeriod();
    const period = cycleInfo.period;
    const cycleId = cycleInfo.cycleId;

    // 2. Phase 2's per-employee lock.
    if (!isPhase1) {
      const ratingRes = await closeSelfRatingPeriod({
        cycleId: cycleId ?? undefined,
        closedBy: input.closedBy,
      });
      if (ratingRes.ok === false) {
        return {
          ok: false,
          error: `The phase was closed, but the rating sheets could not be locked: ${ratingRes.error}. Reopen and close the phase to retry.`,
        };
      }
    }

    // 3. Already closed: the switch is where it should be, so do not announce
    //    it a second time.
    if (wasClosed) return { ok: true };

    const warnings: string[] = [];

    const emps = await activeEmployeeIds();
    if ('error' in emps) {
      warnings.push(`notifications were not sent (${emps.error})`);
    } else {
      const msg = isPhase1
        ? `IPCR Target Setting (Phase 1) is now closed system-wide for period: ${period}.`
        : `IPCR Accomplishment Rating (Phase 2) is now closed system-wide for period: ${period}.`;
      const notifRes = await sendNotification({
        phase: notifPhase,
        officeId: null,
        officeName: null,
        period,
        employeeCount: emps.ids.length,
        message: msg,
        triggeredBy: input.closedBy,
      });
      if (notifRes.ok === false) warnings.push(`the office notice was not logged (${notifRes.error})`);

      if (emps.ids.length > 0) {
        const notifTitle = isPhase1
          ? 'IPCR Phase 1 (Target Setting) is Closed'
          : 'IPCR Phase 2 (Accomplishment Rating) is Closed';
        const notifMsg = isPhase1
          ? `The target setting phase for ${period} has been closed system-wide. Target submission is now locked.`
          : `The accomplishment rating phase for ${period} has been closed system-wide. Accomplishment submission is now locked.`;
        await createNotifications(
          emps.ids.map((id) => ({
            employeeId: id,
            type: isPhase1 ? 'phase1_close' : 'phase2_close',
            title: notifTitle,
            message: notifMsg,
            period,
            link: '/employee/ipcr-workspace',
          })),
        );
      }
    }

    return warnings.length > 0
      ? { ok: true, warning: `The phase is closed, but ${warnings.join(' and ')}.` }
      : { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
