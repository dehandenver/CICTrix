/**
 * IPCR Phase 2 — per-Success-Indicator QET rating.
 *
 * The rater (an Office Account: the employee's supervisor / Dept Head) scores
 * each Success Indicator of an APPROVED / frozen Phase 1 record on three 1–5
 * dimensions: Quality, Efficiency, Timeliness. The three are stored as separate
 * integers in success_indicator_ratings (migration 20260715) — never a
 * pre-averaged value. Averaging happens here at read/roll-up time.
 *
 * Partial saves are supported: saving without `complete` sets
 * target_settings.phase2_status = 'in_progress'; `complete` sets 'completed'.
 *
 * On save the per-category averages are rolled up into the legacy ipcr_workspace
 * columns (best-effort) so the existing "My IPCR Workspace" view and the IPCR
 * PDF reflect the scores without a second data entry.
 *
 * Self-rating block: the rater may not be the employee themselves — mirrors the
 * self-approval block for Phase 1 (dual-role users).
 */
import { supabase as supabaseClient } from '../supabase';
import { categoryAverage, computeOverallScore } from './ipcrWorkspace';
import { resolveOfficeWeights } from './officeWeighting';
import { bucketForScore } from './performanceEvaluations';
import type { FunctionType } from './ipcrTargets';
import { setSubmissionStage, resolveTargetSettingMeta } from './ipcrSubmissions';
import { createNotifications } from './employeeNotifications';
import { type OfficeScope, getAcceptedOfficeNames, norm } from './officeScope';

const supabase = supabaseClient as any;

export type Phase2Status = 'not_started' | 'locked' | 'open' | 'in_progress' | 'completed' | 'closed';

export interface RatableTarget {
  targetSettingId: string;
  employeeId: string;
  employeeName: string;
  position: string | null;
  department: string | null;
  period: string;
  phase2Status: Phase2Status;
  indicatorCount: number;
  ratedCount: number;
}

export interface RatingIndicator {
  successIndicatorId: string;
  description: string;
  accomplishment: string;
  quality: number | null;
  efficiency: number | null;
  timeliness: number | null;
  /** True when an Office Account overrode a value someone else had entered. */
  overriddenByOffice: boolean;
}

export interface RatingMfo {
  id: string;
  functionType: FunctionType;
  title: string;
  indicators: RatingIndicator[];
}

export interface RatingSheet {
  targetSettingId: string;
  employeeId: string;
  employeeName: string;
  period: string;
  phase2Status: Phase2Status;
  mfos: RatingMfo[];
  department?: string | null;
  position?: string | null;
  reviewComment?: string | null;
}

export interface RatingInput {
  successIndicatorId: string;
  quality: number | null;
  efficiency: number | null;
  timeliness: number | null;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const nowIso = () => new Date().toISOString();
const clamp15 = (v: number | null): number | null =>
  v === null || Number.isNaN(v) ? null : Math.max(1, Math.min(5, Math.round(v)));

/** cycle_id → title, for the period label shown on each ratable record. */
/**
 * The single rating embedded under a success indicator.
 *
 * success_indicator_ratings is UNIQUE on success_indicator_id, so PostgREST
 * treats it as a to-one relationship and embeds it as an OBJECT, not an array.
 * Indexing `[0]` into that object yields undefined, which silently dropped
 * every score: category averages came out null and the finalized IPCR read
 * "Overall Score: —" even with all indicators rated. Accepts either shape so it
 * stays correct if the constraint ever changes.
 */
export function embeddedRating(value: unknown): any | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * True when a PostgREST error is "phase2_approved_at / phase2_approved_by does
 * not exist" — i.e. migration 20260811_phase2_rating_approval.sql hasn't been
 * run yet. Callers fall back to the pre-migration behaviour rather than failing,
 * so a deploy that lands before the SQL does degrades instead of breaking.
 */
function isMissingApprovalColumn(err: { message?: string; code?: string } | null): boolean {
  const msg = String(err?.message ?? '').toLowerCase();
  return msg.includes('phase2_approved_at') || msg.includes('phase2_approved_by');
}

async function cycleTitles(cycleIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(cycleIds)].filter((n) => n != null);
  if (!ids.length) return new Map();
  const { data } = await supabase.from('performance_cycles').select('id, title').in('id', ids);
  return new Map((data ?? []).map((c: any) => [c.id, c.title as string]));
}

/**
 * Every approved (frozen) Phase 1 record that can be rated, with progress. Not
 * yet scoped to the rater's office — same posture as listPendingApprovals; the
 * office-scoping is a shared follow-up.
 */
export async function listRatableTargets(scope?: OfficeScope | null): Promise<Result<RatableTarget[]>> {
  try {
    const { data: settings, error } = await supabase
      .from('target_settings')
      .select('id, employee_id, cycle_id, phase2_status')
      .eq('status', 'approved')
      .order('approved_at', { ascending: false });
    if (error) return { ok: false, error: error.message };
    if (!settings?.length) return { ok: true, data: [] };

    const empIds = [...new Set(settings.map((s: any) => s.employee_id))];
    const { data: emps } = await supabase
      .from('employees_with_department')
      .select('id, full_name, current_department, current_position')
      .in('id', empIds);
    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
    const titles = await cycleTitles(settings.map((s: any) => s.cycle_id));

    // Progress = rated indicators / total indicators, per target setting.
    const settingIds = settings.map((s: any) => s.id);
    const { data: mfoRows } = await supabase
      .from('mfos')
      .select('target_setting_id, success_indicators(id, success_indicator_ratings(quality, efficiency, timeliness))')
      .in('target_setting_id', settingIds);
    const counts = new Map<string, { total: number; rated: number }>();
    for (const m of (mfoRows ?? []) as any[]) {
      const c = counts.get(m.target_setting_id) ?? { total: 0, rated: 0 };
      for (const si of (m.success_indicators ?? []) as any[]) {
        c.total++;
        const r = embeddedRating(si.success_indicator_ratings);
        if (r && (r.quality != null || r.efficiency != null || r.timeliness != null)) c.rated++;
      }
      counts.set(m.target_setting_id, c);
    }

    const data: RatableTarget[] = (settings as any[]).map((s) => {
      const e: any = empMap.get(s.employee_id);
      const c = counts.get(s.id) ?? { total: 0, rated: 0 };
      return {
        targetSettingId: s.id,
        employeeId: s.employee_id,
        employeeName: (e?.full_name ?? '(unknown employee)').trim(),
        position: e?.current_position ?? null,
        department: e?.current_department ?? null,
        period: titles.get(s.cycle_id) ?? '—',
        phase2Status: (s.phase2_status ?? 'not_started') as Phase2Status,
        indicatorCount: c.total,
        ratedCount: c.rated,
      };
    });

    const acceptedNames = await getAcceptedOfficeNames(scope);
    let list = data;
    if (acceptedNames) {
      list = list.filter((t) => {
        const dept = norm(t.department);
        return dept && acceptedNames.has(dept);
      });
    }
    return { ok: true, data: list };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load ratable records.' };
  }
}

/** Load the frozen MFO/SI context + any existing ratings for one record. */
export async function loadRatingSheet(targetSettingId: string): Promise<Result<RatingSheet>> {
  try {
    const { data: setting, error: sErr } = await supabase
      .from('target_settings')
      .select('id, employee_id, cycle_id, status, phase2_status, review_comment')
      .eq('id', targetSettingId)
      .maybeSingle();
    if (sErr) return { ok: false, error: sErr.message };
    if (!setting) return { ok: false, error: 'Target setting not found.' };
    if (setting.status !== 'approved')
      return { ok: false, error: 'Phase 2 rating is only available once Phase 1 is approved.' };

    const { data: mfoRows, error: mErr } = await supabase
      .from('mfos')
      .select('id, function_type, title, sort_order, success_indicators(id, description, sort_order)')
      .eq('target_setting_id', targetSettingId)
      .order('sort_order', { ascending: true });
    if (mErr) return { ok: false, error: mErr.message };

    const siIds: string[] = [];
    for (const m of (mfoRows ?? []) as any[])
      for (const si of (m.success_indicators ?? []) as any[]) siIds.push(si.id);

    const ratingBySi = new Map<string, any>();
    if (siIds.length) {
      // select('*') so a not-yet-migrated `accomplishment` column can't 400 the query.
      const { data: ratings } = await supabase
        .from('success_indicator_ratings')
        .select('*')
        .in('success_indicator_id', siIds);
      for (const r of (ratings ?? []) as any[]) ratingBySi.set(r.success_indicator_id, r);
    }

    const [emp, titles] = await Promise.all([
      supabase.from('employees_with_department').select('full_name').eq('id', setting.employee_id).maybeSingle(),
      cycleTitles([setting.cycle_id]),
    ]);

    const mfos: RatingMfo[] = (mfoRows ?? [])
      .map((m: any) => ({
        id: m.id,
        functionType: m.function_type as FunctionType,
        title: m.title ?? '',
        indicators: ((m.success_indicators ?? []) as any[])
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((si) => {
            const r = ratingBySi.get(si.id);
            return {
              successIndicatorId: si.id,
              description: si.description ?? '',
              accomplishment: r?.accomplishment ?? '',
              quality: r?.quality ?? null,
              efficiency: r?.efficiency ?? null,
              timeliness: r?.timeliness ?? null,
              overriddenByOffice: !!r?.overridden_by,
            };
          }),
      }));

    return {
      ok: true,
      data: {
        targetSettingId,
        employeeId: setting.employee_id,
        employeeName: (emp.data?.full_name ?? '(unknown employee)').trim(),
        period: titles.get(setting.cycle_id) ?? '—',
        phase2Status: (setting.phase2_status ?? 'not_started') as Phase2Status,
        reviewComment: setting.review_comment ?? null,
        mfos,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load rating sheet.' };
  }
}

/**
 * Persist Q/E/T scores for a record. `complete` marks Phase 2 completed;
 * otherwise it is a partial save (in_progress). Rolls the per-category averages
 * up into ipcr_workspace (best-effort). Blocks the employee rating their own IPCR.
 */
export async function saveRatings(params: {
  targetSettingId: string;
  raterEmployeeId: string | null;
  ratings: RatingInput[];
  complete: boolean;
}): Promise<Result<{ phase2Status: Phase2Status; overallScore: number | null; adjectival: string | null }>> {
  const { targetSettingId, raterEmployeeId, ratings, complete } = params;
  try {
    const { data: setting, error: sErr } = await supabase
      .from('target_settings')
      .select('id, employee_id, cycle_id, status')
      .eq('id', targetSettingId)
      .maybeSingle();
    if (sErr) return { ok: false, error: sErr.message };
    if (!setting) return { ok: false, error: 'Target setting not found.' };
    if (setting.status !== 'approved')
      return { ok: false, error: 'Phase 2 rating is only available once Phase 1 is approved.' };
    if (raterEmployeeId && raterEmployeeId === setting.employee_id)
      return { ok: false, error: 'You cannot rate your own IPCR.' };

    // Existing rows tell us whose score we may be overriding.
    const siIds = ratings.map((r) => r.successIndicatorId);
    const existing = new Map<string, any>();
    if (siIds.length) {
      const { data: rows } = await supabase
        .from('success_indicator_ratings')
        .select('success_indicator_id, rated_by')
        .in('success_indicator_id', siIds);
      for (const r of (rows ?? []) as any[]) existing.set(r.success_indicator_id, r);
    }

    const upsertRows = ratings.map((r) => {
      const prior = existing.get(r.successIndicatorId);
      const priorRater = prior?.rated_by ?? null;
      const isOverride = !!priorRater && !!raterEmployeeId && priorRater !== raterEmployeeId;
      return {
        success_indicator_id: r.successIndicatorId,
        quality: clamp15(r.quality),
        efficiency: clamp15(r.efficiency),
        timeliness: clamp15(r.timeliness),
        rated_by: priorRater ?? raterEmployeeId,
        overridden_by: isOverride ? raterEmployeeId : (prior?.overridden_by ?? null),
        overridden_at: isOverride ? nowIso() : undefined,
        updated_at: nowIso(),
      };
    });

    if (upsertRows.length) {
      const { error: upErr } = await supabase
        .from('success_indicator_ratings')
        .upsert(upsertRows, { onConflict: 'success_indicator_id' });
      if (upErr) return { ok: false, error: upErr.message };
    }

    const phase2Status: Phase2Status = complete ? 'completed' : 'in_progress';
    // phase2_status alone can't express "approved": the employee's own Phase 2
    // submit sets 'completed' too, so the pending list (which filters on it)
    // could never drop an approved sheet. phase2_approved_at is written only
    // here, by the rater, and is what listPendingRatingApprovals excludes on.
    const baseUpdate = {
      phase2_status: phase2Status,
      phase2_completed_at: complete ? nowIso() : null,
      updated_at: nowIso(),
    };
    let { error: stErr } = await supabase
      .from('target_settings')
      .update({
        ...baseUpdate,
        phase2_approved_at: complete ? nowIso() : null,
        phase2_approved_by: complete ? raterEmployeeId : null,
      })
      .eq('id', targetSettingId);
    // Tolerate the approval columns not existing yet (migration
    // 20260811_phase2_rating_approval.sql not run). Approving still works; the
    // sheet just won't leave the pending list until the migration lands.
    if (stErr && isMissingApprovalColumn(stErr)) {
      ({ error: stErr } = await supabase
        .from('target_settings')
        .update(baseUpdate)
        .eq('id', targetSettingId));
    }
    if (stErr) return { ok: false, error: stErr.message };

    if (complete) {
      try {
        const meta = await resolveTargetSettingMeta(targetSettingId);
        if (meta) {
          await setSubmissionStage({
            employeeId: meta.employeeId,
            employeeName: meta.employeeName,
            officeId: meta.officeId,
            officeName: meta.officeName,
            period: meta.period,
            phase: 'rating',
            stage: 'Forwarded to PM',
            updatedBy: raterEmployeeId || 'office_account',
          });
        }
      } catch (err) {
        console.warn('[ipcrRatings] saveRatings pm tracker sync failed:', err);
      }
      try {
        await createNotifications([
          {
            employeeId: setting.employee_id,
            type: 'ipcr_rated',
            title: 'Your IPCR has been rated',
            message: 'Your supervisor / Department Head has rated your accomplishments and finalized your IPCR for this period.',
            link: '/employee/ipcr-workspace',
          },
        ]);
      } catch (err) {
        console.warn('[ipcrRatings] saveRatings notification failed:', err);
      }
    }

    const { overallScore, adjectival } = await rollUpToWorkspace(targetSettingId, setting, complete).catch(() => ({
      overallScore: null,
      adjectival: null,
    }));

    // Best-effort audit line.
    supabase
      .from('ipcr_audit_log')
      .insert({
        target_setting_id: targetSettingId,
        action: 'rate',
        performed_by: raterEmployeeId,
        performed_by_role: 'office_account',
        reason: complete ? 'Phase 2 rating completed' : 'Phase 2 partial save',
      })
      .then(() => undefined, () => undefined);

    return { ok: true, data: { phase2Status, overallScore, adjectival } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save ratings.' };
  }
}

/**
 * Roll the freshly-saved per-indicator scores up into the three legacy
 * ipcr_workspace category columns, so the existing view + PDF reflect Phase 2.
 * Only updates an existing workspace row (matched by employee + period); it does
 * not create one, and it never changes the workspace status.
 */
/**
 * The department id for an employee. `employees` has no department_id — only a
 * department *name* — so this resolves the name to a departments row, which is
 * what department_weighting_configs keys on.
 */
async function officeIdForEmployee(employeeId: string): Promise<string | null> {
  try {
    const { data: emp } = await supabase
      .from('employees_with_department')
      .select('department')
      .eq('id', employeeId)
      .maybeSingle();
    const name = String(emp?.department ?? '').trim();
    if (!name) return null;
    const { data: dep } = await supabase
      .from('departments')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    return dep?.id ?? null;
  } catch {
    return null;
  }
}

async function rollUpToWorkspace(
  targetSettingId: string,
  setting: { employee_id: string; cycle_id: number },
  complete: boolean,
): Promise<{ overallScore: number | null; adjectival: string | null }> {
  const { data: mfoRows } = await supabase
    .from('mfos')
    .select('function_type, success_indicators(id, success_indicator_ratings(quality, efficiency, timeliness))')
    .eq('target_setting_id', targetSettingId);

  const acc: Record<FunctionType, { q: number[]; e: number[]; t: number[] }> = {
    core: { q: [], e: [], t: [] },
    strategic: { q: [], e: [], t: [] },
    support: { q: [], e: [], t: [] },
  };
  for (const m of (mfoRows ?? []) as any[]) {
    const fn = m.function_type as FunctionType;
    if (!acc[fn]) continue;
    for (const si of (m.success_indicators ?? []) as any[]) {
      const r = embeddedRating(si.success_indicator_ratings);
      if (!r) continue;
      if (r.quality != null) acc[fn].q.push(r.quality);
      if (r.efficiency != null) acc[fn].e.push(r.efficiency);
      if (r.timeliness != null) acc[fn].t.push(r.timeliness);
    }
  }
  const mean = (xs: number[]): number | null =>
    xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)) : null;

  const cat = (fn: FunctionType) => {
    const q = mean(acc[fn].q), e = mean(acc[fn].e), t = mean(acc[fn].t);
    const average = categoryAverage({ accomplishment: '', quality: q, efficiency: e, timeliness: t, weight: null });
    return { q, e, t, average };
  };
  const core = cat('core'), strategic = cat('strategic'), support = cat('support');

  // Apply the employee's office weighting split. Without this the PM-side
  // roll-up scored an unweighted mean while the employee-side save applied the
  // office split, so the same IPCR could produce two different overall scores.
  const officeWeights = await resolveOfficeWeights(await officeIdForEmployee(setting.employee_id));
  const overallScore = computeOverallScore([
    { average: core.average, weight: officeWeights?.core ?? null },
    { average: strategic.average, weight: officeWeights?.strategic ?? null },
    { average: support.average, weight: officeWeights?.support ?? null },
  ]);
  const adjectival = overallScore !== null ? bucketForScore(overallScore) : null;

  // Find the employee's workspace row by id rather than matching on a period
  // label. The two sides label the same period differently — the employee's
  // workspace stores a semester ("July–December 2026", from defaultPeriod())
  // while this roll-up only knew the cycle title ("2026 Performance Cycle") —
  // so `.eq('period', cycleTitle)` matched no rows. A PostgREST update that
  // matches nothing is not an error, so the score silently never landed and the
  // approval banner reported "Overall Score: —".
  const titles = await cycleTitles([setting.cycle_id]);
  const cycleTitle = titles.get(setting.cycle_id) ?? null;

  const { data: wsRows } = await supabase
    .from('ipcr_workspace')
    .select('id, period, updated_at')
    .eq('employee_id', setting.employee_id)
    .order('updated_at', { ascending: false });

  const rows = (wsRows ?? []) as any[];
  // Prefer an exact label match when one exists; otherwise the most recently
  // touched row, which is the period the employee is actually working in.
  const target = (cycleTitle ? rows.find((r) => r.period === cycleTitle) : null) ?? rows[0] ?? null;

  if (target) {
    const patch: Record<string, unknown> = {
      core_quality: core.q, core_efficiency: core.e, core_timeliness: core.t, core_rating: core.average,
      strategic_quality: strategic.q, strategic_efficiency: strategic.e, strategic_timeliness: strategic.t, strategic_rating: strategic.average,
      support_quality: support.q, support_efficiency: support.e, support_timeliness: support.t, support_rating: support.average,
      updated_at: nowIso(),
    };
    if (complete) {
      patch.overall_score = overallScore;
      patch.adjectival = adjectival;
    }
    const { error: wsErr } = await supabase.from('ipcr_workspace').update(patch).eq('id', target.id);
    // Surfaced rather than swallowed: a failure here means the finalized score
    // never reaches the PDF or the dashboards.
    if (wsErr) console.error('[ipcrRatings] rollUpToWorkspace update failed:', wsErr);
  } else {
    console.error('[ipcrRatings] rollUpToWorkspace: no ipcr_workspace row for employee', setting.employee_id);
  }

  return { overallScore, adjectival };
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee-facing Phase 2 (self-rating) — gated by phase2_status.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeRatingSheet extends RatingSheet {
  phase2OpenTargetDate: string | null;
}

/**
 * The employee's own Phase 2 sheet: their frozen (approved) record, its
 * phase2_status gate, and every Success Indicator with any existing self-rating
 * + achievement text. Resolves the record by employee (latest approved) so it
 * doesn't depend on performance_cycles being readable by anon.
 */
export async function loadEmployeeRatingSheet(
  employeeId: string,
): Promise<Result<EmployeeRatingSheet | null>> {
  try {
    const { data: settings, error } = await supabase
      .from('target_settings')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(1);
    if (error) return { ok: false, error: error.message };
    const setting = (settings ?? [])[0];
    if (!setting) return { ok: true, data: null };

    const res = await loadRatingSheet(setting.id);
    if (res.ok === false) return res;
    return {
      ok: true,
      data: {
        ...res.data,
        // phase2_status may be undefined pre-migration → treat as locked.
        phase2Status: (setting.phase2_status ?? 'locked') as Phase2Status,
        phase2OpenTargetDate: setting.phase2_open_target_date ?? null,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load your rating sheet.' };
  }
}

/**
 * Save the employee's own per-indicator self-ratings + achievement text.
 * `submit=true` locks it (phase2_status → 'completed'); otherwise 'in_progress'.
 * Only allowed while the window is open. Rolls up to ipcr_workspace.
 */
export async function saveEmployeeRatings(params: {
  targetSettingId: string;
  employeeId: string;
  entries: Array<RatingInput & { accomplishment: string }>;
  submit: boolean;
}): Promise<Result<{ phase2Status: Phase2Status; overallScore: number | null; adjectival: string | null }>> {
  const { targetSettingId, employeeId, entries, submit } = params;
  try {
    const { data: setting, error: sErr } = await supabase
      .from('target_settings')
      .select('id, employee_id, cycle_id, status, phase2_status')
      .eq('id', targetSettingId)
      .maybeSingle();
    if (sErr) return { ok: false, error: sErr.message };
    if (!setting) return { ok: false, error: 'Record not found.' };
    if (setting.employee_id !== employeeId)
      return { ok: false, error: 'You can only rate your own IPCR.' };
    const gate = (setting.phase2_status ?? 'locked') as Phase2Status;
    // Employees may PREPARE (draft-save) while locked, but may only SUBMIT once the
    // Office Account has opened the rating period.
    if (gate === 'completed')
      return { ok: false, error: 'Your self-ratings have already been submitted.' };
    if (gate === 'closed')
      return { ok: false, error: 'The self-rating period has closed.' };
    if (submit && (gate === 'locked' || gate === 'not_started'))
      return { ok: false, error: 'Submission opens during the rating period. You can save a draft for now.' };

    const rows = entries.map((e) => ({
      success_indicator_id: e.successIndicatorId,
      accomplishment: e.accomplishment?.trim() || null,
      quality: clamp15(e.quality),
      efficiency: clamp15(e.efficiency),
      timeliness: clamp15(e.timeliness),
      rated_by: employeeId,
      updated_at: nowIso(),
    }));
    if (rows.length) {
      const { error: upErr } = await supabase
        .from('success_indicator_ratings')
        .upsert(rows, { onConflict: 'success_indicator_id' });
      if (upErr) return { ok: false, error: upErr.message };
    }

    // Draft-saving while locked keeps it locked (prep only); draft while open →
    // in_progress; submit → completed.
    const phase2Status: Phase2Status = submit
      ? 'completed'
      : gate === 'locked' || gate === 'not_started'
      ? 'locked'
      : 'in_progress';
    const { error: stErr } = await supabase
      .from('target_settings')
      .update({
        phase2_status: phase2Status,
        phase2_completed_at: submit ? nowIso() : null,
        phase2_submitted_at: submit ? nowIso() : null,
        updated_at: nowIso(),
      })
      .eq('id', targetSettingId);
    if (stErr) return { ok: false, error: stErr.message };

    if (submit) {
      try {
        const meta = await resolveTargetSettingMeta(targetSettingId);
        if (meta) {
          await setSubmissionStage({
            employeeId: meta.employeeId,
            employeeName: meta.employeeName,
            officeId: meta.officeId,
            officeName: meta.officeName,
            period: meta.period,
            phase: 'rating',
            stage: 'Submitted to Office',
            updatedBy: employeeId,
          });
        }
      } catch (err) {
        console.warn('[ipcrRatings] saveEmployeeRatings pm tracker sync failed:', err);
      }
    }

    const { overallScore, adjectival } = await rollUpToWorkspace(targetSettingId, setting, submit).catch(() => ({
      overallScore: null,
      adjectival: null,
    }));

    supabase
      .from('ipcr_audit_log')
      .insert({
        target_setting_id: targetSettingId,
        action: 'rate',
        performed_by: employeeId,
        performed_by_role: 'employee',
        reason: submit ? 'Phase 2 self-rating submitted' : 'Phase 2 self-rating draft',
      })
      .then(() => undefined, () => undefined);

    return { ok: true, data: { phase2Status, overallScore, adjectival } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save your ratings.' };
  }
}

/**
 * Office/PM bulk action: OPEN the self-rating window for a whole period. Flips
 * every LOCKED approved record for that cycle to 'open', records who/when, and
 * returns the affected employee ids so the caller can notify them. This is the
 * explicit, audited transition (not a silent date flip).
 */
export async function openSelfRatingPeriod(params: {
  cycleId?: number;
  openedBy: string;
}): Promise<Result<{ employeeIds: string[] }>> {
  try {
    // Open/re-open: anything not currently open and not still-submitted becomes
    // 'open' (includes 'closed', so a closed period can be re-opened).
    let query = supabase
      .from('target_settings')
      .select('id, employee_id')
      .eq('status', 'approved')
      .in('phase2_status', ['locked', 'not_started', 'closed']);
    if (params.cycleId != null) query = query.eq('cycle_id', params.cycleId);
    const { data: locked, error } = await query;
    if (error) return { ok: false, error: error.message };
    const rows = (locked ?? []) as any[];
    if (!rows.length) return { ok: true, data: { employeeIds: [] } };

    const { error: upErr } = await supabase
      .from('target_settings')
      .update({ phase2_status: 'open', phase2_opened_at: nowIso(), phase2_opened_by: params.openedBy, updated_at: nowIso() })
      .in('id', rows.map((r) => r.id));
    if (upErr) return { ok: false, error: upErr.message };

    return { ok: true, data: { employeeIds: rows.map((r) => String(r.employee_id)) } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to open the self-rating period.' };
  }
}

/**
 * Office/PM bulk action: CLOSE the self-rating window. Flips every currently
 * OPEN or IN_PROGRESS record to 'closed' (records who/when). Records that were
 * already 'completed' (employee submitted) are left as-is — they're terminal.
 * Closing is allowed even if not every employee has submitted; the employee then
 * sees a read-only view of whatever they had saved.
 */
export async function closeSelfRatingPeriod(params: {
  cycleId?: number;
  closedBy: string;
}): Promise<Result<{ employeeIds: string[] }>> {
  try {
    let query = supabase
      .from('target_settings')
      .select('id, employee_id')
      .eq('status', 'approved')
      .in('phase2_status', ['open', 'in_progress']);
    if (params.cycleId != null) query = query.eq('cycle_id', params.cycleId);
    const { data: openRows, error } = await query;
    if (error) return { ok: false, error: error.message };
    const rows = (openRows ?? []) as any[];
    if (!rows.length) return { ok: true, data: { employeeIds: [] } };

    const { error: upErr } = await supabase
      .from('target_settings')
      .update({ phase2_status: 'closed', phase2_closed_at: nowIso(), phase2_closed_by: params.closedBy, updated_at: nowIso() })
      .in('id', rows.map((r) => r.id));
    if (upErr) return { ok: false, error: upErr.message };

    return { ok: true, data: { employeeIds: rows.map((r) => String(r.employee_id)) } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to close the self-rating period.' };
  }
}

/**
 * List Phase 2 submissions currently awaiting approval (stage = 'Submitted to Office').
 */
export async function listPendingRatingApprovals(
  scope?: OfficeScope | null,
): Promise<Result<RatingSheet[]>> {
  try {
    // 1. Settings the employee has submitted for Phase 2 and that no rater has
    //    approved yet. phase2_approved_at is the authoritative "already
    //    approved" marker — filtering on phase2_status alone kept approved
    //    sheets in this list forever, because the employee's submit writes the
    //    same 'completed' value the approval does.
    const pending = () =>
      supabase
        .from('target_settings')
        .select('id, employee_id, cycle_id, phase2_status, review_comment')
        .eq('status', 'approved')
        .eq('phase2_status', 'completed');

    let { data: settings, error } = await pending().is('phase2_approved_at', null);
    if (error && isMissingApprovalColumn(error)) {
      ({ data: settings, error } = await pending());
    }
    if (error) return { ok: false, error: error.message };
    if (!settings?.length) return { ok: true, data: [] };

    // 2. Fetch submission pipeline stage to filter only those in 'Submitted to Office' or missing
    const { data: pipeline } = await supabase
      .from('ipcr_submissions')
      .select('employee_id, period, stage')
      .eq('phase', 'rating');
    const pipelineMap = new Map((pipeline ?? []).map((p: any) => [`${p.employee_id}::${p.period}`, p.stage]));

    const empIds = [...new Set(settings.map((s: any) => s.employee_id))];
    const [emps, titles] = await Promise.all([
      supabase.from('employees_with_department').select('id, full_name, current_department, current_position').in('id', empIds),
      cycleTitles(settings.map((s: any) => s.cycle_id)),
    ]);
    const empMap = new Map<string, any>((emps.data ?? []).map((e: any) => [e.id, e]));

    // Filter and map
    const settingIdsToLoad: string[] = [];
    for (const s of settings as any[]) {
      const periodLabel = titles.get(s.cycle_id) ?? '—';
      const submissionStage = pipelineMap.get(`${s.employee_id}::${periodLabel}`);

      // Self-healing: if stage is 'Submitted to Office' OR if the stage row is missing/not 'Forwarded to PM' (but setting has phase2_status = completed)
      if (submissionStage === 'Submitted to Office' || (!submissionStage || submissionStage !== 'Forwarded to PM')) {
        settingIdsToLoad.push(s.id);
      }
    }

    if (!settingIdsToLoad.length) return { ok: true, data: [] };

    // 3. Load MFOs and success indicator ratings for these selected settings
    const { data: mfoRows, error: mErr } = await supabase
      .from('mfos')
      .select('id, target_setting_id, function_type, title, sort_order, success_indicators(id, description, sort_order)')
      .in('target_setting_id', settingIdsToLoad)
      .order('sort_order', { ascending: true });
    if (mErr) return { ok: false, error: mErr.message };

    const siIds: string[] = [];
    for (const m of (mfoRows ?? []) as any[])
      for (const si of (m.success_indicators ?? []) as any[]) siIds.push(si.id);

    const ratingBySi = new Map<string, any>();
    if (siIds.length) {
      const { data: ratings } = await supabase
        .from('success_indicator_ratings')
        .select('*')
        .in('success_indicator_id', siIds);
      for (const r of (ratings ?? []) as any[]) ratingBySi.set(r.success_indicator_id, r);
    }

    const bySettingId = new Map<string, RatingSheet>();
    for (const s of settings as any[]) {
      if (!settingIdsToLoad.includes(s.id)) continue;
      const e = empMap.get(s.employee_id);
      bySettingId.set(s.id, {
        targetSettingId: s.id,
        employeeId: s.employee_id,
        employeeName: (e?.full_name ?? '(unknown employee)').trim(),
        department: e?.current_department ?? null,
        position: e?.current_position ?? null,
        period: titles.get(s.cycle_id) ?? '—',
        phase2Status: s.phase2_status as Phase2Status,
        reviewComment: s.review_comment ?? null,
        mfos: [],
      });
    }

    for (const m of (mfoRows ?? []) as any[]) {
      const p = bySettingId.get(m.target_setting_id);
      if (!p) continue;
      p.mfos.push({
        id: m.id,
        functionType: m.function_type as FunctionType,
        title: m.title ?? '',
        indicators: ((m.success_indicators ?? []) as any[])
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((si) => {
            const r = ratingBySi.get(si.id);
            return {
              successIndicatorId: si.id,
              description: si.description ?? '',
              accomplishment: r?.accomplishment ?? '',
              quality: r?.quality ?? null,
              efficiency: r?.efficiency ?? null,
              timeliness: r?.timeliness ?? null,
              overriddenByOffice: !!r?.overridden_by,
            };
          }),
      });
    }

    const acceptedNames = await getAcceptedOfficeNames(scope);
    let resultList = [...bySettingId.values()];
    if (acceptedNames) {
      resultList = resultList.filter((t: any) => {
        const dept = norm(t.department);
        return dept && acceptedNames.has(dept);
      });
    }

    return { ok: true, data: resultList };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load pending rating approvals.' };
  }
}

/**
 * Return Phase 2 accomplishments & self-ratings to the employee for revision.
 */
export async function returnPhase2ForRevision(p: {
  targetSettingId: string;
  approverEmployeeId: string | null;
  submitterEmployeeId: string;
  comment: string;
}): Promise<Result<null>> {
  try {
    const { error } = await supabase
      .from('target_settings')
      .update({
        phase2_status: 'in_progress', // revert to in_progress so employee can edit
        review_comment: p.comment?.trim() || null,
        updated_at: nowIso(),
      })
      .eq('id', p.targetSettingId);
    if (error) return { ok: false, error: error.message };

    await supabase.from('ipcr_audit_log').insert({
      target_setting_id: p.targetSettingId,
      action: 'return_phase2',
      performed_by: p.approverEmployeeId,
      performed_by_role: 'office_account',
      reason: p.comment?.trim() || null,
    });

    const meta = await resolveTargetSettingMeta(p.targetSettingId);
    if (meta) {
      await setSubmissionStage({
        employeeId: meta.employeeId,
        employeeName: meta.employeeName,
        officeId: meta.officeId,
        officeName: meta.officeName,
        period: meta.period,
        phase: 'rating',
        stage: 'Returned for Revision',
        updatedBy: p.approverEmployeeId || 'office_account',
      });
    }

    await createNotifications([
      {
        employeeId: p.submitterEmployeeId,
        type: 'ipcr_returned_phase2',
        title: 'IPCR accomplishments returned for revision',
        message: `Your accomplishments and self-ratings have been returned for revision. Reason: ${p.comment?.trim() || 'No reason specified'}`,
        link: '/employee/ipcr-workspace',
      },
    ]);

    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Return failed.' };
  }
}

/**
 * Edit the employee's Accomplishment texts inline during Phase 2 review.
 *
 * Only accomplishments are editable here. The MFO titles and Success Indicator
 * descriptions are the Phase 1 targets, which are frozen the moment Phase 1 is
 * approved — a database trigger (migration 20260715) blocks any write to mfos /
 * success_indicators of an approved target_setting. Attempting to update them
 * raised "IPCR target setting … is approved and frozen; its targets cannot be
 * modified." and failed the whole save. Phase 2 rates accomplishments against
 * the frozen targets; it never rewrites them.
 */
export async function adminEditRatings(p: {
  targetSettingId: string;
  approverEmployeeId: string | null;
  submitterEmployeeId: string;
  accomplishments: Array<{ successIndicatorId: string; accomplishment: string }>;
}): Promise<Result<null>> {
  try {
    // Edit Accomplishments only (success_indicator_ratings is exempt from the
    // freeze trigger; mfos / success_indicators are not and must not change).
    for (const acc of p.accomplishments) {
      const { error } = await supabase
        .from('success_indicator_ratings')
        .update({ accomplishment: acc.accomplishment })
        .eq('success_indicator_id', acc.successIndicatorId);
      if (error) return { ok: false, error: error.message };
    }

    await supabase.from('ipcr_audit_log').insert({
      target_setting_id: p.targetSettingId,
      action: 'admin_edit_ratings',
      performed_by: p.approverEmployeeId,
      performed_by_role: 'office_account',
      reason: 'Office Account edited ratings/accomplishments before approval',
    });

    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Edit failed.' };
  }
}
