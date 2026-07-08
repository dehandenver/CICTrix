/**
 * Employee IPCR Workspace API (Employee Portal · "My IPCR Workspace" tab).
 *
 * One row per (employee, period) in the ipcr_workspace table (migration 019):
 *   Phase 1 — the employee writes their own Core / Strategic / Support targets.
 *   Phase 2 — ~6 months later they encode accomplishments + self-ratings; on
 *             submit the app computes an overall score + adjectival rating and
 *             (separately) attaches the generated IPCR PDF url.
 *
 * Kept separate from ipcr_performance (the 'submission'-tab row editor) so the
 * two IPCR surfaces never clobber each other. Submitting a phase also advances
 * the PM-facing submission tracker via setSubmissionStage (ipcrSubmissions.ts).
 */

import { supabase as supabaseClient } from '../supabase';
import { bucketForScore } from './performanceEvaluations';
import { setSubmissionStage } from './ipcrSubmissions';

const supabase = supabaseClient as any;

export type IpcrWorkspaceStatus =
  | 'Draft Targets'
  | 'Targets Submitted'
  | 'Accomplishments Submitted'
  | 'Completed';

export interface IpcrWorkspaceRow {
  id: string;
  employee_id: string;
  employee_num: string | null;
  employee_name: string | null;
  office_id: string | null;
  office_name: string | null;
  period: string;
  status: IpcrWorkspaceStatus;
  core_target: string | null;
  strategic_target: string | null;
  support_target: string | null;
  targets_submitted_at: string | null;
  core_accomplishment: string | null;
  strategic_accomplishment: string | null;
  support_accomplishment: string | null;
  core_rating: number | null;
  strategic_rating: number | null;
  support_rating: number | null;
  accomplishments_submitted_at: string | null;
  overall_score: number | null;
  adjectival: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

interface Identity {
  employeeId: string;
  employeeNum: string | null;
  employeeName: string | null;
  officeId: string | null;
  officeName: string | null;
  period: string;
  updatedBy: string;
}

const identityColumns = (id: Identity) => ({
  employee_id: id.employeeId,
  employee_num: id.employeeNum,
  employee_name: id.employeeName,
  office_id: id.officeId,
  office_name: id.officeName,
  period: id.period,
});

/** Load the workspace row for an employee + period, or null when none exists. */
export async function getWorkspace(
  employeeId: string,
  period: string,
): Promise<IpcrWorkspaceRow | null> {
  if (!employeeId || !period) return null;
  try {
    const { data, error } = await supabase
      .from('ipcr_workspace')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('period', period)
      .maybeSingle();
    if (error) {
      console.error('[ipcrWorkspace] getWorkspace error:', error);
      return null;
    }
    return (data as IpcrWorkspaceRow) ?? null;
  } catch (err) {
    console.error('[ipcrWorkspace] getWorkspace threw:', err);
    return null;
  }
}

/**
 * Save Phase 1 targets. `submit=true` locks them (status → Targets Submitted)
 * and advances the PM tracker to "Submitted to Office" for the target phase.
 */
export async function saveTargets(
  input: Identity & {
    core: string;
    strategic: string;
    support: string;
    submit: boolean;
  },
): Promise<{ ok: true; row: IpcrWorkspaceRow } | { ok: false; error: string }> {
  try {
    const payload: Record<string, unknown> = {
      ...identityColumns(input),
      core_target: input.core || null,
      strategic_target: input.strategic || null,
      support_target: input.support || null,
    };
    if (input.submit) {
      payload.status = 'Targets Submitted';
      payload.targets_submitted_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('ipcr_workspace')
      .upsert([payload], { onConflict: 'employee_id,period' })
      .select('*')
      .single();
    if (error) return { ok: false, error: error.message ?? 'Failed to save targets.' };

    if (input.submit) {
      // Best-effort: reflect progress on the PM submission tracker.
      await setSubmissionStage({
        employeeId: input.employeeId,
        employeeName: input.employeeName ?? '—',
        officeId: input.officeId,
        officeName: input.officeName,
        period: input.period,
        phase: 'target',
        stage: 'Submitted to Office',
        updatedBy: input.updatedBy,
      }).catch(() => undefined);
    }

    return { ok: true, row: data as IpcrWorkspaceRow };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Mean of the filled (non-null) category ratings, rounded to 2 decimals. */
export function computeOverallScore(
  ratings: Array<number | null | undefined>,
): number | null {
  const filled = ratings.filter((r): r is number => typeof r === 'number' && !Number.isNaN(r));
  if (filled.length === 0) return null;
  const sum = filled.reduce((a, b) => a + b, 0);
  return Number((sum / filled.length).toFixed(2));
}

/**
 * Save Phase 2 accomplishments + self-ratings. `submit=true` computes the
 * overall score + adjectival rating (via bucketForScore), sets status to
 * "Accomplishments Submitted", and advances the PM tracker for the rating phase.
 * The generated PDF url is attached afterwards via attachPdfUrl().
 */
export async function saveAccomplishments(
  input: Identity & {
    coreAccomplishment: string;
    strategicAccomplishment: string;
    supportAccomplishment: string;
    coreRating: number | null;
    strategicRating: number | null;
    supportRating: number | null;
    submit: boolean;
  },
): Promise<
  | { ok: true; row: IpcrWorkspaceRow; overallScore: number | null; adjectival: string | null }
  | { ok: false; error: string }
> {
  try {
    const overallScore = computeOverallScore([
      input.coreRating,
      input.strategicRating,
      input.supportRating,
    ]);
    const adjectival = overallScore !== null ? bucketForScore(overallScore) : null;

    const payload: Record<string, unknown> = {
      ...identityColumns(input),
      core_accomplishment: input.coreAccomplishment || null,
      strategic_accomplishment: input.strategicAccomplishment || null,
      support_accomplishment: input.supportAccomplishment || null,
      core_rating: input.coreRating,
      strategic_rating: input.strategicRating,
      support_rating: input.supportRating,
    };
    if (input.submit) {
      payload.status = 'Accomplishments Submitted';
      payload.accomplishments_submitted_at = new Date().toISOString();
      payload.overall_score = overallScore;
      payload.adjectival = adjectival;
    }

    const { data, error } = await supabase
      .from('ipcr_workspace')
      .upsert([payload], { onConflict: 'employee_id,period' })
      .select('*')
      .single();
    if (error) return { ok: false, error: error.message ?? 'Failed to save accomplishments.' };

    if (input.submit) {
      await setSubmissionStage({
        employeeId: input.employeeId,
        employeeName: input.employeeName ?? '—',
        officeId: input.officeId,
        officeName: input.officeName,
        period: input.period,
        phase: 'rating',
        stage: 'Submitted to Office',
        updatedBy: input.updatedBy,
      }).catch(() => undefined);
    }

    return { ok: true, row: data as IpcrWorkspaceRow, overallScore, adjectival };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Store the generated IPCR PDF url and mark the workspace Completed. */
export async function attachPdfUrl(
  id: string,
  pdfUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase
      .from('ipcr_workspace')
      .update({ pdf_url: pdfUrl, status: 'Completed' })
      .eq('id', id);
    if (error) return { ok: false, error: error.message ?? 'Failed to attach PDF url.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
