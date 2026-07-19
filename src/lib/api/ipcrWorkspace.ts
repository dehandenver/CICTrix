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
import { resolveOfficeWeights } from './officeWeighting';

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
  // Per-category Q/E/T sub-ratings + % weight (migration 020). The Average (A)
  // per category is stored in the pre-existing *_rating columns below.
  core_quality: number | null;
  core_efficiency: number | null;
  core_timeliness: number | null;
  core_weight: number | null;
  strategic_quality: number | null;
  strategic_efficiency: number | null;
  strategic_timeliness: number | null;
  strategic_weight: number | null;
  support_quality: number | null;
  support_efficiency: number | null;
  support_timeliness: number | null;
  support_weight: number | null;
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

/** Per-category self-rating: Q/E/T sub-scores + an optional % weight. */
export interface CategoryRating {
  accomplishment: string;
  quality: number | null;
  efficiency: number | null;
  timeliness: number | null;
  weight: number | null;
}

/** Average (A) of the filled Q/E/T sub-scores for a category, or null. */
export function categoryAverage(c: CategoryRating): number | null {
  const filled = [c.quality, c.efficiency, c.timeliness].filter(
    (r): r is number => typeof r === 'number' && !Number.isNaN(r),
  );
  if (filled.length === 0) return null;
  return Number((filled.reduce((a, b) => a + b, 0) / filled.length).toFixed(2));
}

/**
 * Overall score across the three categories. When weights are provided it is
 * the weight-blended average of the category averages; otherwise a simple mean
 * of the filled category averages. Rounded to 2 decimals.
 */
export function computeOverallScore(
  parts: Array<{ average: number | null; weight: number | null }>,
): number | null {
  const filled = parts.filter(
    (p): p is { average: number; weight: number | null } =>
      typeof p.average === 'number' && !Number.isNaN(p.average),
  );
  if (filled.length === 0) return null;
  const weightSum = filled.reduce((s, p) => s + (p.weight ?? 0), 0);
  if (weightSum > 0) {
    const weighted = filled.reduce((s, p) => s + p.average * (p.weight ?? 0), 0);
    return Number((weighted / weightSum).toFixed(2));
  }
  const mean = filled.reduce((s, p) => s + p.average, 0) / filled.length;
  return Number(mean.toFixed(2));
}

/**
 * Save Phase 2 accomplishments + Q/E/T self-ratings and per-category weights.
 * `submit=true` computes each category Average (A) and the overall score +
 * adjectival rating (via bucketForScore), sets status to "Accomplishments
 * Submitted", and advances the PM tracker for the rating phase. The generated
 * PDF url is attached afterwards via attachPdfUrl().
 */
export async function saveAccomplishments(
  input: Identity & {
    core: CategoryRating;
    strategic: CategoryRating;
    support: CategoryRating;
    submit: boolean;
  },
): Promise<
  | { ok: true; row: IpcrWorkspaceRow; overallScore: number | null; adjectival: string | null }
  | { ok: false; error: string }
> {
  try {
    const coreAvg = categoryAverage(input.core);
    const strategicAvg = categoryAverage(input.strategic);
    const supportAvg = categoryAverage(input.support);

    // The office's weighting option (A/B/C) is the policy for how the three
    // categories combine, so it drives the score. Explicit per-category weights
    // still win where they are set — an office can deviate for one employee
    // without its whole split being ignored — but when they are absent the
    // office config applies instead of falling through to an unweighted mean,
    // which is what previously made the configured split have no effect.
    const officeWeights = await resolveOfficeWeights(input.officeId);
    const weightFor = (explicit: number | null, fromOffice: number | undefined) =>
      explicit ?? fromOffice ?? null;

    const overallScore = computeOverallScore([
      { average: coreAvg, weight: weightFor(input.core.weight, officeWeights?.core) },
      { average: strategicAvg, weight: weightFor(input.strategic.weight, officeWeights?.strategic) },
      { average: supportAvg, weight: weightFor(input.support.weight, officeWeights?.support) },
    ]);
    const adjectival = overallScore !== null ? bucketForScore(overallScore) : null;

    const payload: Record<string, unknown> = {
      ...identityColumns(input),
      core_accomplishment: input.core.accomplishment || null,
      strategic_accomplishment: input.strategic.accomplishment || null,
      support_accomplishment: input.support.accomplishment || null,
      core_quality: input.core.quality,
      core_efficiency: input.core.efficiency,
      core_timeliness: input.core.timeliness,
      // Store the weight actually used, not the (often null) input. Otherwise the
      // row shows no weights beside a weighted overall_score and the number
      // cannot be reproduced from the record.
      core_weight: weightFor(input.core.weight, officeWeights?.core),
      strategic_quality: input.strategic.quality,
      strategic_efficiency: input.strategic.efficiency,
      strategic_timeliness: input.strategic.timeliness,
      strategic_weight: weightFor(input.strategic.weight, officeWeights?.strategic),
      support_quality: input.support.quality,
      support_efficiency: input.support.efficiency,
      support_timeliness: input.support.timeliness,
      support_weight: weightFor(input.support.weight, officeWeights?.support),
      core_rating: coreAvg,
      strategic_rating: strategicAvg,
      support_rating: supportAvg,
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
