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
import { bucketForScore } from './performanceEvaluations';
import type { FunctionType } from './ipcrTargets';

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
export async function listRatableTargets(): Promise<Result<RatableTarget[]>> {
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
        const r = (si.success_indicator_ratings ?? [])[0];
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
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load ratable records.' };
  }
}

/** Load the frozen MFO/SI context + any existing ratings for one record. */
export async function loadRatingSheet(targetSettingId: string): Promise<Result<RatingSheet>> {
  try {
    const { data: setting, error: sErr } = await supabase
      .from('target_settings')
      .select('id, employee_id, cycle_id, status, phase2_status')
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
    const { error: stErr } = await supabase
      .from('target_settings')
      .update({
        phase2_status: phase2Status,
        phase2_completed_at: complete ? nowIso() : null,
        updated_at: nowIso(),
      })
      .eq('id', targetSettingId);
    if (stErr) return { ok: false, error: stErr.message };

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
      const r = (si.success_indicator_ratings ?? [])[0];
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
  const overallScore = computeOverallScore([
    { average: core.average, weight: null },
    { average: strategic.average, weight: null },
    { average: support.average, weight: null },
  ]);
  const adjectival = overallScore !== null ? bucketForScore(overallScore) : null;

  // Resolve the workspace period from the cycle title; update in place if present.
  const titles = await cycleTitles([setting.cycle_id]);
  const period = titles.get(setting.cycle_id);
  if (period) {
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
    await supabase.from('ipcr_workspace').update(patch).eq('employee_id', setting.employee_id).eq('period', period);
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
    if (gate === 'locked' || gate === 'not_started')
      return { ok: false, error: 'The self-rating period has not opened yet.' };
    if (gate === 'completed')
      return { ok: false, error: 'Your self-ratings have already been submitted.' };

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

    const phase2Status: Phase2Status = submit ? 'completed' : 'in_progress';
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
    let query = supabase
      .from('target_settings')
      .select('id, employee_id')
      .eq('status', 'approved')
      .in('phase2_status', ['locked', 'not_started']);
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
