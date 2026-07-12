/**
 * Succession Planning API.
 *
 * Backs the RSP Portal drill-down: Departments → Critical Positions → Ranked
 * Candidates. Critical positions and candidate nominations are explicit,
 * admin-managed records (critical_positions / succession_candidates, migration
 * 20260720). Candidate RANKING is never stored — it is derived live at query
 * time from each candidate's latest COMPLETED IPCR overall score, using the same
 * roll-up the IPCR module itself uses (computeOverallScore + bucketForScore). So
 * when an employee's IPCR updates in a later period, their rank moves the next
 * time the list is viewed; there is no stale snapshot.
 *
 * Employees with no completed IPCR yet are returned in a separate "not yet
 * rated" group rather than hidden or ranked as zero.
 */

import { supabase as supabaseClient } from '../supabase';
import { categoryAverage, computeOverallScore } from './ipcrWorkspace';
import { bucketForScore } from './performanceEvaluations';
import type { FunctionType } from './ipcrTargets';

const supabase = supabaseClient as any;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const nowIso = () => new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DepartmentSummary {
  departmentId: string;
  departmentName: string;
  code: string;
  criticalPositionCount: number;
  vacantCriticalCount: number;
}

export interface CriticalPosition {
  id: string;
  departmentId: string;
  title: string;
  incumbentEmployeeId: string | null;
  incumbentName: string | null;
  criticalityReason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface RankedCandidate {
  id: string;                 // succession_candidates.id
  employeeId: string;
  employeeName: string;
  currentPosition: string | null;
  department: string | null;
  note: string | null;
  addedBy: string | null;
  addedAt: string;
  /** Latest completed IPCR overall score (1–5), or null when never rated. */
  overallScore: number | null;
  /** Adjectival label for the score (Outstanding / Very Satisfactory / …). */
  adjectival: string | null;
  /** Period the score is drawn from, e.g. "January–June 2026". */
  ratedPeriod: string | null;
  /** Convenience: true when overallScore is available. */
  rated: boolean;
}

export interface EmployeeOption {
  id: string;
  fullName: string;
  department: string | null;
  position: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live IPCR score roll-up (derived, never stored on the succession tables)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeScore {
  overallScore: number | null;
  adjectival: string | null;
  period: string | null;
}

/** cycle_id → title, for the period label shown next to each score. */
async function cycleTitles(cycleIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(cycleIds)].filter((n) => n != null);
  if (!ids.length) return new Map();
  const { data } = await supabase.from('performance_cycles').select('id, title').in('id', ids);
  return new Map((data ?? []).map((c: any) => [c.id, c.title as string]));
}

/** Roll one target setting's per-indicator Q/E/T up into a single overall score. */
function overallFromMfoRows(mfoRows: any[]): number | null {
  const acc: Record<FunctionType, { q: number[]; e: number[]; t: number[] }> = {
    core: { q: [], e: [], t: [] },
    strategic: { q: [], e: [], t: [] },
    support: { q: [], e: [], t: [] },
  };
  for (const m of mfoRows) {
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
  const cat = (fn: FunctionType) =>
    categoryAverage({
      accomplishment: '',
      quality: mean(acc[fn].q),
      efficiency: mean(acc[fn].e),
      timeliness: mean(acc[fn].t),
      weight: null,
    });
  return computeOverallScore([
    { average: cat('core'), weight: null },
    { average: cat('strategic'), weight: null },
    { average: cat('support'), weight: null },
  ]);
}

/**
 * Latest COMPLETED IPCR overall score per employee, computed live. Picks the most
 * recently approved completed record for each employee (their newest rated
 * period), then rolls its Q/E/T up. Employees with no completed record are simply
 * absent from the returned map (callers treat that as "not yet rated").
 */
export async function getLatestOverallScores(
  employeeIds: string[],
): Promise<Map<string, EmployeeScore>> {
  const result = new Map<string, EmployeeScore>();
  const ids = [...new Set(employeeIds)].filter(Boolean);
  if (!ids.length) return result;

  const { data: settings } = await supabase
    .from('target_settings')
    .select('id, employee_id, cycle_id, approved_at')
    .eq('status', 'approved')
    .eq('phase2_status', 'completed')
    .in('employee_id', ids)
    .order('approved_at', { ascending: false });
  const rows = (settings ?? []) as any[];
  if (!rows.length) return result;

  // Keep only the most recent completed record per employee (rows are desc).
  const latestByEmployee = new Map<string, any>();
  for (const s of rows) {
    const key = String(s.employee_id);
    if (!latestByEmployee.has(key)) latestByEmployee.set(key, s);
  }

  const settingIds = [...latestByEmployee.values()].map((s) => s.id);
  const [{ data: mfoRows }, titles] = await Promise.all([
    supabase
      .from('mfos')
      .select(
        'target_setting_id, function_type, success_indicators(id, success_indicator_ratings(quality, efficiency, timeliness))',
      )
      .in('target_setting_id', settingIds),
    cycleTitles([...latestByEmployee.values()].map((s) => s.cycle_id)),
  ]);

  const mfosBySetting = new Map<string, any[]>();
  for (const m of (mfoRows ?? []) as any[]) {
    const list = mfosBySetting.get(m.target_setting_id) ?? [];
    list.push(m);
    mfosBySetting.set(m.target_setting_id, list);
  }

  for (const [employeeId, setting] of latestByEmployee) {
    const overall = overallFromMfoRows(mfosBySetting.get(setting.id) ?? []);
    if (overall === null) continue; // completed but unexpectedly empty → treat as unrated
    result.set(employeeId, {
      overallScore: overall,
      adjectival: bucketForScore(overall),
      period: titles.get(setting.cycle_id) ?? null,
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Departments (top level)
// ─────────────────────────────────────────────────────────────────────────────

/** Active departments with their critical-position counts (total + vacant). */
export async function listDepartmentSummaries(): Promise<Result<DepartmentSummary[]>> {
  try {
    const [{ data: depts, error: dErr }, { data: positions, error: pErr }] = await Promise.all([
      supabase.from('departments').select('id, code, name, is_active').eq('is_active', true).order('name'),
      supabase.from('critical_positions').select('department_id, incumbent_employee_id'),
    ]);
    if (dErr) return { ok: false, error: dErr.message };
    if (pErr) return { ok: false, error: pErr.message };

    const totals = new Map<string, number>();
    const vacants = new Map<string, number>();
    for (const p of (positions ?? []) as any[]) {
      const key = String(p.department_id);
      totals.set(key, (totals.get(key) ?? 0) + 1);
      if (!p.incumbent_employee_id) vacants.set(key, (vacants.get(key) ?? 0) + 1);
    }

    const data: DepartmentSummary[] = ((depts ?? []) as any[]).map((d) => ({
      departmentId: String(d.id),
      departmentName: String(d.name ?? '').trim(),
      code: String(d.code ?? ''),
      criticalPositionCount: totals.get(String(d.id)) ?? 0,
      vacantCriticalCount: vacants.get(String(d.id)) ?? 0,
    }));
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load departments.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Critical positions (inside a department)
// ─────────────────────────────────────────────────────────────────────────────

export async function listCriticalPositions(departmentId: string): Promise<Result<CriticalPosition[]>> {
  try {
    const { data, error } = await supabase
      .from('critical_positions')
      .select('*')
      .eq('department_id', departmentId)
      .order('created_at', { ascending: true });
    if (error) return { ok: false, error: error.message };
    const rows = (data ?? []) as any[];

    // Resolve incumbent names in one round-trip.
    const incumbentIds = rows.map((r) => r.incumbent_employee_id).filter(Boolean);
    const nameById = new Map<string, string>();
    if (incumbentIds.length) {
      const { data: emps } = await supabase
        .from('employees_with_department')
        .select('id, full_name')
        .in('id', incumbentIds);
      for (const e of (emps ?? []) as any[]) nameById.set(String(e.id), String(e.full_name ?? '').trim());
    }

    const data2: CriticalPosition[] = rows.map((r) => ({
      id: String(r.id),
      departmentId: String(r.department_id),
      title: String(r.title ?? ''),
      incumbentEmployeeId: r.incumbent_employee_id ? String(r.incumbent_employee_id) : null,
      incumbentName: r.incumbent_employee_id ? nameById.get(String(r.incumbent_employee_id)) ?? null : null,
      criticalityReason: r.criticality_reason ?? null,
      createdBy: r.created_by ?? null,
      createdAt: String(r.created_at),
    }));
    return { ok: true, data: data2 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load critical positions.' };
  }
}

export async function createCriticalPosition(input: {
  departmentId: string;
  title: string;
  incumbentEmployeeId?: string | null;
  criticalityReason?: string | null;
  createdBy: string;
}): Promise<Result<CriticalPosition>> {
  try {
    if (!input.title.trim()) return { ok: false, error: 'A position title is required.' };
    const { data, error } = await supabase
      .from('critical_positions')
      .insert({
        department_id: input.departmentId,
        title: input.title.trim(),
        incumbent_employee_id: input.incumbentEmployeeId || null,
        criticality_reason: input.criticalityReason?.trim() || null,
        created_by: input.createdBy,
      })
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      data: {
        id: String(data.id),
        departmentId: String(data.department_id),
        title: String(data.title),
        incumbentEmployeeId: data.incumbent_employee_id ? String(data.incumbent_employee_id) : null,
        incumbentName: null,
        criticalityReason: data.criticality_reason ?? null,
        createdBy: data.created_by ?? null,
        createdAt: String(data.created_at),
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to add critical position.' };
  }
}

export async function updateCriticalPosition(
  id: string,
  patch: { title?: string; incumbentEmployeeId?: string | null; criticalityReason?: string | null },
): Promise<Result<null>> {
  try {
    const update: Record<string, unknown> = { updated_at: nowIso() };
    if (patch.title !== undefined) update.title = patch.title.trim();
    if (patch.incumbentEmployeeId !== undefined) update.incumbent_employee_id = patch.incumbentEmployeeId || null;
    if (patch.criticalityReason !== undefined) update.criticality_reason = patch.criticalityReason?.trim() || null;
    const { error } = await supabase.from('critical_positions').update(update).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update critical position.' };
  }
}

/** Remove a critical position. Its candidates cascade away with it. */
export async function deleteCriticalPosition(id: string): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('critical_positions').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to remove critical position.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Succession candidates (inside a critical position) — ranked live
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Candidates for a critical position, ranked highest → lowest by latest completed
 * IPCR overall score. Unrated candidates are returned last, alphabetically, so the
 * caller can render them as a separate "Not yet rated" group.
 */
export async function listCandidates(criticalPositionId: string): Promise<Result<RankedCandidate[]>> {
  try {
    const { data: rows, error } = await supabase
      .from('succession_candidates')
      .select('*')
      .eq('critical_position_id', criticalPositionId);
    if (error) return { ok: false, error: error.message };
    const candidates = (rows ?? []) as any[];
    if (!candidates.length) return { ok: true, data: [] };

    const employeeIds = candidates.map((c) => String(c.employee_id));
    const [{ data: emps }, scores] = await Promise.all([
      supabase
        .from('employees_with_department')
        .select('id, full_name, current_position, department')
        .in('id', employeeIds),
      getLatestOverallScores(employeeIds),
    ]);
    const empById = new Map((emps ?? []).map((e: any) => [String(e.id), e]));

    const mapped: RankedCandidate[] = candidates.map((c) => {
      const e: any = empById.get(String(c.employee_id));
      const score = scores.get(String(c.employee_id));
      return {
        id: String(c.id),
        employeeId: String(c.employee_id),
        employeeName: (e?.full_name ?? '(unknown employee)').trim(),
        currentPosition: e?.current_position ?? null,
        department: e?.department ?? null,
        note: c.note ?? null,
        addedBy: c.added_by ?? null,
        addedAt: String(c.added_at),
        overallScore: score?.overallScore ?? null,
        adjectival: score?.adjectival ?? null,
        ratedPeriod: score?.period ?? null,
        rated: !!score,
      };
    });

    // Rated first (desc by score, tie-break by name); unrated last (by name).
    mapped.sort((a, b) => {
      if (a.rated && b.rated) {
        if (b.overallScore! !== a.overallScore!) return b.overallScore! - a.overallScore!;
        return a.employeeName.localeCompare(b.employeeName);
      }
      if (a.rated !== b.rated) return a.rated ? -1 : 1;
      return a.employeeName.localeCompare(b.employeeName);
    });

    return { ok: true, data: mapped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load candidates.' };
  }
}

export async function addCandidate(input: {
  criticalPositionId: string;
  employeeId: string;
  note?: string | null;
  addedBy: string;
}): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('succession_candidates').insert({
      critical_position_id: input.criticalPositionId,
      employee_id: input.employeeId,
      note: input.note?.trim() || null,
      added_by: input.addedBy,
    });
    if (error) {
      // 23505 = unique violation (already a candidate for this position).
      if ((error as any).code === '23505')
        return { ok: false, error: 'That employee is already a candidate for this position.' };
      return { ok: false, error: error.message };
    }
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to add candidate.' };
  }
}

export async function updateCandidateNote(id: string, note: string | null): Promise<Result<null>> {
  try {
    const { error } = await supabase
      .from('succession_candidates')
      .update({ note: note?.trim() || null })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update note.' };
  }
}

export async function removeCandidate(id: string): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('succession_candidates').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to remove candidate.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee picker (for incumbent + candidate selection)
// ─────────────────────────────────────────────────────────────────────────────

/** All employees, for the incumbent / candidate pickers. Sorted by name. */
export async function listEmployeeOptions(): Promise<EmployeeOption[]> {
  try {
    const { data, error } = await supabase
      .from('employees_with_department')
      .select('id, full_name, department, current_position')
      .order('full_name');
    if (error) return [];
    return (data ?? []).map((e: any) => ({
      id: String(e.id),
      fullName: String(e.full_name ?? '').trim(),
      department: e.department ?? null,
      position: e.current_position ?? null,
    }));
  } catch {
    return [];
  }
}
