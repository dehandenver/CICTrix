/**
 * IPCR Phase 1 — Target Setting.
 *
 * Backs the relational model added in 20260714_ipcr_target_setting.sql:
 *   target_settings ─< mfos ─< success_indicators
 *
 * Phase 2 and the generated IPCR PDF still read ipcr_workspace.{core,strategic,
 * support}_target, so callers should keep those text columns in sync with a
 * flattened summary of the MFOs here. See flattenForWorkspace().
 */
import { supabase } from '../supabase';
import { loadEffectiveSchedules, effectiveState } from './phaseSchedules';
import { writeAuditEntry } from './ipcrAudit';

export type FunctionType = 'core' | 'strategic' | 'support';
// Matches the target_settings.status check in 20260715_ipcr_phase1_workflow_phase2.sql.
export type TargetStatus =
  | 'draft'
  | 'submitted_for_approval'
  | 'returned_for_revision'
  | 'approved';

export const FUNCTION_TYPES: FunctionType[] = ['core', 'strategic', 'support'];

export interface SuccessIndicatorDraft {
  id?: string;
  description: string;
}

export interface MfoDraft {
  id?: string;
  title: string;
  indicators: SuccessIndicatorDraft[];
}

export type TargetsByFunction = Record<FunctionType, MfoDraft[]>;

// Phase 2 self-rating lifecycle (migration 20260718). 'not_started' is legacy.
export type Phase2Status = 'not_started' | 'locked' | 'open' | 'in_progress' | 'completed' | 'closed';

export interface TargetSettingRow {
  id: string;
  employee_id: string;
  cycle_id: number;
  status: TargetStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  // Phase 2 gating — present only after migration 20260718 (undefined before).
  phase2_status?: Phase2Status;
  phase2_open_target_date?: string | null;
  phase2_opened_at?: string | null;
  phase2_submitted_at?: string | null;
}

export interface PerformanceCycle {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  status: string;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** One blank MFO holding one blank indicator — a category is never rendered empty. */
export const blankMfo = (): MfoDraft => ({ title: '', indicators: [{ description: '' }] });

export const emptyTargets = (): TargetsByFunction => ({
  core: [blankMfo()],
  strategic: [blankMfo()],
  support: [blankMfo()],
});

/** Submit requires at least one MFO with a non-empty success indicator. */
export const hasSubmittableTarget = (targets: TargetsByFunction): boolean =>
  FUNCTION_TYPES.some((fn) =>
    targets[fn].some((mfo) => mfo.indicators.some((si) => si.description.trim().length > 0)),
  );

/** Draft recovery accepts partial MFOs before their indicators are entered. */
export const hasTargetContent = (targets: TargetsByFunction): boolean =>
  FUNCTION_TYPES.some((fn) =>
    targets[fn].some((mfo) => mfo.title.trim() || mfo.indicators.some((si) => si.description.trim())),
  );

/**
 * Denormalise one category's MFOs into the legacy ipcr_workspace text column.
 * Kept deliberately simple and human-readable — it feeds the PDF.
 */
export const flattenForWorkspace = (mfos: MfoDraft[]): string =>
  mfos
    .filter((m) => m.title.trim() || m.indicators.some((si) => si.description.trim()))
    .map((m) => {
      const indicators = m.indicators
        .map((si) => si.description.trim())
        .filter(Boolean)
        .map((d) => `  - ${d}`)
        .join('\n');
      const title = m.title.trim() || '(untitled MFO)';
      return indicators ? `${title}\n${indicators}` : title;
    })
    .join('\n\n');

/**
 * Reconstitute an MFO list from the flattened text stored in ipcr_workspace.
 * Acts as a resilient bridge so targets are never lost even if relational
 * joins or foreign key lookups encounter temporary discrepancies.
 */
export function unflattenFromWorkspace(text: string | null | undefined): MfoDraft[] {
  if (!text || !text.trim()) return [blankMfo()];

  const blocks = text.trim().split(/\n\s*\n/);
  const mfos: MfoDraft[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    let title = '';
    const indicators: Array<{ description: string }> = [];

    if (lines[0].startsWith('-') || lines[0].startsWith('•') || lines[0].startsWith('*')) {
      for (const line of lines) {
        const desc = line.replace(/^[-•*]\s*/, '').trim();
        if (desc) indicators.push({ description: desc });
      }
    } else {
      title = lines[0] === '(untitled MFO)' ? '' : lines[0];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const desc = line.replace(/^[-•*]\s*/, '').trim();
        if (desc) indicators.push({ description: desc });
      }
    }

    mfos.push({
      title,
      indicators: indicators.length > 0 ? indicators : [{ description: '' }],
    });
  }

  return mfos.length > 0 ? mfos : [blankMfo()];
}

/**
 * The cycle Phase 1 is being set for.
 *
 * performance_cycles.status is constrained to ('Active','Completed','Planned').
 * Prefer the newest 'Active' cycle; fall back to the newest 'Planned' one so a
 * cycle that has not opened yet still lets targets be drafted. A 'Completed'
 * cycle is never returned — targets must not be written against a closed cycle.
 */
export async function getActiveCycle(): Promise<Result<PerformanceCycle | null>> {
  try {
    const { data, error } = await (supabase as any)
      .from('performance_cycles')
      .select('id, title, start_date, end_date, status')
      .in('status', ['Active', 'Planned'])
      .order('start_date', { ascending: false });
    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as PerformanceCycle[];
    const preferred = rows.find((c) => c.status === 'Active') ?? rows[0] ?? null;
    if (preferred) return { ok: true, data: preferred };

    // Fallback: If no cycle is explicitly flagged 'Active' or 'Planned', grab the latest
    // cycle by start_date DESC (matches getActivePerformanceCycle in performanceEvaluations.ts).
    const { data: latestData, error: latestErr } = await (supabase as any)
      .from('performance_cycles')
      .select('id, title, start_date, end_date, status')
      .order('start_date', { ascending: false })
      .limit(1);
    if (latestErr) return { ok: false, error: latestErr.message };

    const latest = ((latestData ?? []) as PerformanceCycle[])[0] ?? null;
    return { ok: true, data: latest };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load cycle.' };
  }
}

/**
 * The status a save writes ahead of the final submit update. A returned record
 * stays returned, so Save Draft cannot drop it back to draft and lock the
 * employee out once the Phase 1 window has closed.
 */
export const statusForSave = (current: TargetStatus | undefined, submit: boolean): TargetStatus =>
  current === 'returned_for_revision' ? current : submit ? current ?? 'draft' : 'draft';

/** True when the supervisor has sent this employee's targets back for a fix. */
async function isReturnedForRevision(employeeId: string, cycleId: number): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from('target_settings')
    .select('status')
    .eq('employee_id', employeeId)
    .eq('cycle_id', cycleId)
    .maybeSingle();
  return !error && data?.status === 'returned_for_revision';
}

/** Load an employee's target setting for a cycle, with its MFOs and indicators. */
export async function loadTargetSetting(
  employeeId: string,
  cycleId: number,
): Promise<Result<{ setting: TargetSettingRow | null; targets: TargetsByFunction }>> {
  try {
    const { data: settings, error: sErr } = await (supabase as any)
      .from('target_settings')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('cycle_id', cycleId)
      .limit(1);
    if (sErr) return { ok: false, error: sErr.message };

    const setting = (settings?.[0] as TargetSettingRow) ?? null;
    if (!setting) return { ok: true, data: { setting: null, targets: emptyTargets() } };

    const targets = await hydrateTargets(setting.id);
    return { ok: true, data: { setting, targets } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load targets.' };
  }
}

/** Load + group an MFO/SI tree for one target setting into TargetsByFunction. */
async function hydrateTargets(settingId: string, mfoIdsToLoad?: string[]): Promise<TargetsByFunction> {
  let mfoQuery = (supabase as any)
    .from('mfos')
    .select('id, function_type, title, sort_order')
    .eq('target_setting_id', settingId);
  if (mfoIdsToLoad) mfoQuery = mfoQuery.in('id', mfoIdsToLoad);
  const { data: mfoRows, error: mfoErr } = await mfoQuery.order('sort_order', { ascending: true });

  const targets = emptyTargets();
  for (const fn of FUNCTION_TYPES) targets[fn] = [];

  if (mfoErr) throw new Error(mfoErr.message ?? 'Failed to load saved MFOs.');
  if (!mfoRows || !mfoRows.length) {
    for (const fn of FUNCTION_TYPES) targets[fn] = [blankMfo()];
    return targets;
  }

  const mfoIds = mfoRows.map((m: any) => m.id);
  const { data: siRows, error: siErr } = await (supabase as any)
    .from('success_indicators')
    .select('id, mfo_id, description, sort_order')
    .in('mfo_id', mfoIds)
    .order('sort_order', { ascending: true });
  if (siErr) throw new Error(siErr.message ?? 'Failed to load saved success indicators.');

  const siByMfo = new Map<string, Array<{ id: string; description: string }>>();
  for (const si of (siRows ?? []) as any[]) {
    if (!siByMfo.has(si.mfo_id)) siByMfo.set(si.mfo_id, []);
    siByMfo.get(si.mfo_id)!.push({
      id: si.id as string,
      description: (si.description ?? '') as string,
    });
  }

  for (const row of mfoRows as any[]) {
    const indicators = siByMfo.get(row.id) ?? [];
    const fn = row.function_type as FunctionType;
    if (targets[fn]) {
      targets[fn].push({
        id: row.id as string,
        title: (row.title ?? '') as string,
        indicators: indicators.length ? indicators : [{ description: '' }],
      });
    }
  }

  // A category with no persisted rows still renders one blank MFO.
  for (const fn of FUNCTION_TYPES) if (targets[fn].length === 0) targets[fn] = [blankMfo()];
  return targets;
}

/**
 * Load the employee's frozen targets WITHOUT needing the cycle id. Used as a
 * fallback when performance_cycles isn't readable by the anon client (RLS), so
 * the Employee Portal's "Frozen Targets" still render. Prefers the approved
 * (frozen) record, else the most recent one.
 */
export async function loadLatestTargetSetting(
  employeeId: string,
): Promise<Result<{ setting: TargetSettingRow | null; targets: TargetsByFunction }>> {
  try {
    const { data: settings, error } = await (supabase as any)
      .from('target_settings')
      .select('*')
      .eq('employee_id', employeeId)
      .order('updated_at', { ascending: false });
    if (error) return { ok: false, error: error.message };
    const rows = (settings ?? []) as TargetSettingRow[];
    if (!rows.length) return { ok: true, data: { setting: null, targets: emptyTargets() } };

    // Search for the best candidate:
    // 1. First, check active workflow records (approved, submitted_for_approval, returned_for_revision)
    //    that have actual hydrated targets.
    let chosenSetting: TargetSettingRow | null = null;
    let chosenTargets: TargetsByFunction = emptyTargets();

    const activeWorkflowRows = rows.filter(
      (r) => r.status === 'approved' || r.status === 'submitted_for_approval' || r.status === 'returned_for_revision'
    );
    for (const candidate of activeWorkflowRows) {
      const t = await hydrateTargets(candidate.id);
      if (hasTargetContent(t)) {
        chosenSetting = candidate;
        chosenTargets = t;
        break;
      }
    }

    // 2. If no active workflow row has targets, check any other row that has targets.
    if (!chosenSetting) {
      for (const candidate of rows) {
        const t = await hydrateTargets(candidate.id);
        if (hasTargetContent(t)) {
          chosenSetting = candidate;
          chosenTargets = t;
          break;
        }
      }
    }

    // 3. If no row has targets at all, prioritize an approved/submitted record, else the most recent row.
    if (!chosenSetting) {
      chosenSetting = activeWorkflowRows[0] ?? rows[0];
      chosenTargets = await hydrateTargets(chosenSetting.id);
    }

    return { ok: true, data: { setting: chosenSetting, targets: chosenTargets } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load targets.' };
  }
}

/**
 * Replace draft MFOs only after their replacements and indicators are written.
 * This preserves the previous draft if a replacement insert fails.
 */
export async function saveTargetSetting(params: {
  employeeId: string;
  cycleId: number;
  targets: TargetsByFunction;
  submit: boolean;
}): Promise<Result<TargetSettingRow>> {
  const { employeeId, cycleId, targets, submit } = params;

  if (submit && !hasSubmittableTarget(targets)) {
    return { ok: false, error: 'Add at least one MFO with a success indicator before submitting.' };
  }

  // Submit guard: Check if Phase 1 is open or if employee has probationary window.
  // A record the supervisor returned is fixed on their schedule, not the window's.
  if (submit && !(await isReturnedForRevision(employeeId, cycleId))) {
    try {
      const { data: emp } = await (supabase as any)
        .from('employees')
        .select('employment_status, date_hired')
        .eq('id', employeeId)
        .maybeSingle();
        
      let hasProbationaryWindow = false;
      if (emp && emp.employment_status === 'Probationary' && emp.date_hired) {
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const hireMonth = monthNames[new Date(emp.date_hired).getMonth()];
        const { data: schedData } = await (supabase as any)
          .from('probationary_ipcr_schedules')
          .select('*')
          .eq('hired_month', hireMonth)
          .maybeSingle();
        if (schedData) {
          const nowStr = new Date().toISOString().slice(0, 10);
          if (nowStr >= schedData.target_start && nowStr <= schedData.target_end) {
            hasProbationaryWindow = true;
          }
        }
      }

      if (!hasProbationaryWindow) {
        const { target } = await loadEffectiveSchedules(employeeId);
        const isOpen = target ? effectiveState(target) === 'Open' : false;
        if (!isOpen) {
          return { ok: false, error: 'Phase 1 (Target Setting) is not currently open. The PM Division will notify you when it opens.' };
        }
      }
    } catch (err) {
      console.warn('[ipcrTargets] submit guard check failed:', err);
    }
  }

  try {
    const nowIso = new Date().toISOString();
    const existing = await loadTargetSetting(employeeId, cycleId);
    if (existing.ok === false) return existing;

    const current = existing.data.setting;
    const wasReturned = current?.status === 'returned_for_revision';
    if (current &&(current.status === 'submitted_for_approval' || current.status === 'approved')) {
      return { ok: false, error: 'Targets are locked and can no longer be edited.' };
    }

    // Keep submission editable until all target writes and read-back checks pass.
    const settingPayload: Record<string, unknown> = {
      employee_id: employeeId,
      cycle_id: cycleId,
      status: statusForSave(current?.status, submit),
      updated_at: nowIso,
    };

    const { data: saved, error: upErr } = await (supabase as any)
      .from('target_settings')
      .upsert(settingPayload, { onConflict: 'employee_id,cycle_id' })
      .select('*')
      .single();
    if (upErr) return { ok: false, error: upErr.message };

    const settingId = (saved as TargetSettingRow).id;

    // Keep the previous children until all replacements are written successfully.
    // Deleting first loses the saved draft if either insert fails.
    const previousMfoIds = FUNCTION_TYPES.flatMap((fn) => existing.data.targets[fn])
      .map((mfo) => mfo.id).filter((id): id is string => Boolean(id));
    let replacementMfoIds: string[] = [];
    const discardReplacement = async () => {
      if (replacementMfoIds.length) {
        await (supabase as any).from('mfos').delete().in('id', replacementMfoIds);
      }
    };

    const mfoPayload: any[] = [];
    for (const fn of FUNCTION_TYPES) {
      targets[fn].forEach((mfo, i) => {
        const meaningful = mfo.title.trim() || mfo.indicators.some((si) => si.description.trim());
        if (!meaningful) return;
        mfoPayload.push({ target_setting_id: settingId, function_type: fn, title: mfo.title.trim(), sort_order: i });
      });
    }

    if (mfoPayload.length) {
      const { data: insertedMfos, error: mErr } = await (supabase as any)
        .from('mfos')
        .insert(mfoPayload)
        .select('id, function_type, sort_order');
      if (mErr) return { ok: false, error: mErr.message };
      replacementMfoIds = (insertedMfos ?? []).map((row: any) => row.id);
      if (replacementMfoIds.length !== mfoPayload.length) {
        await discardReplacement();
        return { ok: false, error: 'The replacement targets could not be verified. Please try saving again.' };
      }

      // Match inserted ids back to the drafts by (function_type, sort_order).
      const byKey = new Map<string, string>();
      for (const row of (insertedMfos ?? []) as any[]) byKey.set(`${row.function_type}:${row.sort_order}`, row.id);

      const siPayload: any[] = [];
      for (const fn of FUNCTION_TYPES) {
        targets[fn].forEach((mfo, i) => {
          const mfoId = byKey.get(`${fn}:${i}`);
          if (!mfoId) return;
          mfo.indicators
            .filter((si) => si.description.trim())
            .forEach((si, j) => siPayload.push({ mfo_id: mfoId, description: si.description.trim(), sort_order: j }));
        });
      }

      if (siPayload.length) {
        const { error: siErr } = await (supabase as any).from('success_indicators').insert(siPayload);
        if (siErr) {
          await discardReplacement();
          return { ok: false, error: siErr.message };
        }
      }
    }

    // Verify only the replacements while the previous draft is still intact.
    try {
      const replacement = replacementMfoIds.length ? await hydrateTargets(settingId, replacementMfoIds) : emptyTargets();
      if (FUNCTION_TYPES.some((fn) => flattenForWorkspace(replacement[fn]) !== flattenForWorkspace(targets[fn]))) {
        await discardReplacement();
        return { ok: false, error: 'The saved targets could not be verified. Keep your entries open and try saving again.' };
      }
    } catch (err) {
      await discardReplacement();
      throw err;
    }

    if (previousMfoIds.length) {
      const { error: delErr } = await (supabase as any).from('mfos').delete().in('id', previousMfoIds);
      if (delErr) {
        await discardReplacement();
        return { ok: false, error: delErr.message };
      }
    }

    // Confirm the relational record can actually be restored before reporting success.
    const persisted = await hydrateTargets(settingId);
    if (FUNCTION_TYPES.some((fn) => flattenForWorkspace(persisted[fn]) !== flattenForWorkspace(targets[fn]))) {
      return { ok: false, error: 'The saved targets could not be verified. Keep your entries open and try saving again.' };
    }

    if (submit) {
      const { data: submitted, error: submitErr } = await (supabase as any)
        .from('target_settings')
        .update({ status: 'submitted_for_approval', submitted_at: nowIso, review_comment: null, reviewed_by: null, reviewed_at: null })
        .eq('id', settingId)
        .select('*')
        .single();
      if (submitErr) return { ok: false, error: submitErr.message };
      // The employee is not the reader of the audit trail; writeAuditEntry logs a failure.
      await writeAuditEntry({
        target_setting_id: settingId,
        action: 'submit',
        performed_by: employeeId,
        performed_by_role: 'employee',
        reason: wasReturned ? 'Resubmitted after revision' : null,
      });
      return { ok: true, data: submitted as TargetSettingRow };
    }

    return { ok: true, data: saved as TargetSettingRow };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save targets.' };
  }
}
