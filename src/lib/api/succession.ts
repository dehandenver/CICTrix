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
import { DIVISION_PARENT_COLUMN } from './departments';
import { categoryAverage, computeOverallScore } from './ipcrWorkspace';
import { bucketForScore } from './performanceEvaluations';
import { embeddedRating } from './ipcrRatings';
import type { FunctionType } from './ipcrTargets';
import {
  fetchSuccessionPoolsV2,
  type SuccessionPoolV2,
} from './successionPipelineV2';

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
  /**
   * False for a department that has been deactivated but still owns critical
   * positions. Those rows stay visible (see listDepartmentSummaries) so a
   * Department Head's work never silently disappears from RSP — the flag lets
   * the UI mark them rather than mix them in unannounced.
   */
  isActive: boolean;
}

export interface CriticalPosition {
  id: string;
  departmentId: string;
  title: string;
  incumbentEmployeeId: string | null;
  incumbentName: string | null;
  /** Expected leaving/retirement date of the incumbent (migration 20260828), or null. */
  incumbentLeavingDate: string | null;
  criticalityReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Qualification requirements (migration 20260809)
  positionDescription: string | null;
  requiredSuccessorsCount: number;
  minYearsExperience: number | null;
  minIpcrRating: string | null; // one of the 5 adjectival buckets, or null
  requiredEducation: string | null;
  requiredEligibility: string | null;
  requiredCertifications: string[];
  // Training gate + weight overrides (migration 20260818)
  requiredTrainingHours: number | null;           // minimum hours floor for Stage 1 gate
  requiredTrainingCategories: string[];           // required category labels (e.g. ["Leadership"])
  successionWeights: Record<string, number> | null; // per-position override; null = use global defaults
}

export interface CompetencyRequirement {
  id: string;
  criticalPositionId: string;
  competencyId: string;
  competencyName: string;
  requiredLevel: number; // 1-5
}

export interface TrainingRequirement {
  id: string;
  criticalPositionId: string;
  trainingTitle: string;
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
// Position-field keyword matching (shared utilities)
//
// Generic rank/level words carry no field meaning, so they're stripped before
// comparing two job titles — otherwise every "… Officer" would match every
// other. What's left is the role's field keyword ("engineer", "accountant",
// "nurse"), which is what makes an employee a plausible successor.
// ─────────────────────────────────────────────────────────────────────────────

export const TITLE_STOPWORDS = new Set([
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
  'of', 'the', 'and', 'for', 'to', 'in', 'a', 'an',
  'officer', 'office', 'head', 'chief', 'senior', 'junior', 'assistant',
  'associate', 'staff', 'division', 'unit', 'city', 'manager', 'supervisor',
  'administrator', 'coordinator', 'aide', 'level',
]);

export const titleKeywords = (text: string): Set<string> =>
  new Set(
    String(text ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w)),
  );

/**
 * The shared field keyword between two job titles, or null. E.g. "Engineer II"
 * and "Chief Engineer" both reduce to "engineer" → a match. Used to flag
 * employees who share the critical position's field as eligible successors.
 */
export const sharedFieldKeyword = (a: string, b: string): string | null => {
  const ka = titleKeywords(a);
  for (const w of titleKeywords(b)) if (ka.has(w)) return w;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Live IPCR score roll-up (derived, never stored on the succession tables)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeScore {
  overallScore: number | null;
  adjectival: string | null;
  period: string | null;
  /** performance_cycles.id the score is drawn from (for downstream source_cycle_id). */
  cycleId: number | null;
}

/** cycle_id → title, for the period label shown next to each score. */
async function cycleTitles(cycleIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(cycleIds)].filter((n) => n != null);
  if (!ids.length) return new Map();
  const { data } = await supabase.from('performance_cycles').select('id, title').in('id', ids);
  return new Map((data ?? []).map((c: any) => [c.id, c.title as string]));
}

/** Core/Strategic/Support split configured for a department, if any. */
type FunctionWeights = { core: number; strategic: number; support: number };

/** Match the IPCR roll-up's trimmed, exact office-name lookup, but in bulk. */
async function departmentsByEmployee(employeeIds: string[]): Promise<Map<string, string>> {
  const failure = 'Unable to resolve employee departments for IPCR scoring. Please try again.';
  try {
    // Neither employees nor employees_with_department has a department_id.
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, department')
      .in('id', employeeIds);
    if (empError || !Array.isArray(employees)) throw new Error(failure);

    const nameByEmployee = new Map<string, string>();
    for (const employee of employees) {
      const name = typeof employee.department === 'string' ? employee.department.trim() : '';
      if (!name || nameByEmployee.has(employee.id)) throw new Error(failure);
      nameByEmployee.set(employee.id, name);
    }
    // Missing/hidden/truncated rows must not masquerade as unconfigured offices.
    if (employeeIds.some((id) => !nameByEmployee.has(id))) throw new Error(failure);

    const names = [...new Set(nameByEmployee.values())];
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, name')
      .in('name', names);
    if (deptError || !Array.isArray(departments)) throw new Error(failure);

    const idByName = new Map<string, string>();
    for (const department of departments) {
      if (!department.id || idByName.has(department.name)) throw new Error(failure);
      idByName.set(department.name, department.id);
    }
    const out = new Map<string, string>();
    for (const id of employeeIds) {
      const departmentId = idByName.get(nameByEmployee.get(id)!);
      if (!departmentId) throw new Error(failure);
      out.set(id, departmentId);
    }
    return out;
  } catch {
    // Do not expose database details or employee identity through shared callers.
    throw new Error(failure);
  }
}

/**
 * Active weighting schema per department, in one query.
 *
 * resolveOfficeWeights() in officeWeighting.ts answers this for a single
 * office; succession scores a whole department at a time, so this batches
 * rather than firing one request per employee.
 */
async function weightsByDepartment(departmentIds: (string | null)[]): Promise<Map<string, FunctionWeights>> {
  const ids = [...new Set(departmentIds)].filter(Boolean) as string[];
  const out = new Map<string, FunctionWeights>();
  if (!ids.length) return out;

  const failure = 'Unable to load department weights for IPCR scoring. Please try again.';
  try {
    const { data, error, count } = await supabase
      .from('department_weighting_configs')
      .select('department_id, weighting_schema_options(core_weight, strategic_weight, support_weight)', { count: 'exact' })
      .in('department_id', ids)
      .eq('is_active', true);
    // Unlike missing mappings, missing configs are legitimate. Confirm the
    // response is complete before treating an absent config as unweighted.
    if (error || !Array.isArray(data) || count !== data.length) throw new Error(failure);

    for (const row of data as any[]) {
      const opt = row.weighting_schema_options;
      if (!ids.includes(row.department_id) || !opt || Array.isArray(opt) || out.has(row.department_id)) throw new Error(failure);
      const values = [opt.core_weight, opt.strategic_weight, opt.support_weight];
      if (values.some((value) =>
        !['number', 'string'].includes(typeof value) || String(value).trim() === '' ||
        !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100,
      )) throw new Error(failure);
      const [core, strategic, support] = values.map(Number);
      if (Math.abs(core + strategic + support - 100) > 0.000001) throw new Error(failure);
      out.set(String(row.department_id), { core, strategic, support });
    }
  } catch {
    throw new Error(failure);
  }
  return out;
}

/**
 * Roll one target setting's per-indicator Q/E/T up into a single overall score.
 *
 * `weights` is the department's configured Core/Strategic/Support split. Pass
 * null when the department has no active configuration — computeOverallScore
 * then falls back to an unweighted mean, which is the documented behaviour
 * rather than scoring against zeroes.
 *
 * Previously this always passed null, so every succession score used a plain
 * average of the three function averages regardless of configuration. A
 * department on schema B (Core 60 / Support 40) was effectively scored 50/50,
 * and Performance is the heaviest ranking criterion at 30%.
 */
function overallFromMfoRows(mfoRows: any[], weights: FunctionWeights | null): number | null {
  const acc: Record<FunctionType, { q: number[]; e: number[]; t: number[] }> = {
    core: { q: [], e: [], t: [] },
    strategic: { q: [], e: [], t: [] },
    support: { q: [], e: [], t: [] },
  };
  for (const m of mfoRows) {
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
  const cat = (fn: FunctionType) =>
    categoryAverage({
      accomplishment: '',
      quality: mean(acc[fn].q),
      efficiency: mean(acc[fn].e),
      timeliness: mean(acc[fn].t),
      weight: null,
    });
  return computeOverallScore([
    { average: cat('core'), weight: weights ? weights.core : null },
    { average: cat('strategic'), weight: weights ? weights.strategic : null },
    { average: cat('support'), weight: weights ? weights.support : null },
  ]);
}

/**
 * Latest COMPLETED IPCR overall score per employee, computed live. Picks the most
 * recently approved completed record for each employee (their newest rated
 * period), then rolls its Q/E/T up. Employees with no completed record are simply
 * absent from the returned map (callers treat that as "not yet rated").
 *
 * `cycleId` pins the read to a specific semester — the L&D transition gate passes
 * the "current" (fully-completed) cycle so recommendations never pull from a
 * half-collected new semester (see semesterTransition.getLndSourceCycleId). When
 * omitted or null it keeps the original "newest across all semesters" behaviour.
 * Office mapping/config failures reject, rather than silently returning
 * unweighted scores. Only a confirmed absence of active configuration falls back.
 */
export async function getLatestOverallScores(
  employeeIds: string[],
  cycleId?: number | null,
): Promise<Map<string, EmployeeScore>> {
  const result = new Map<string, EmployeeScore>();
  const ids = [...new Set(employeeIds)].filter(Boolean);
  if (!ids.length) return result;

  let settingsQuery = supabase
    .from('target_settings')
    .select('id, employee_id, cycle_id, approved_at')
    .eq('status', 'approved')
    .eq('phase2_status', 'completed')
    .in('employee_id', ids)
    .order('approved_at', { ascending: false });
  if (cycleId != null) settingsQuery = settingsQuery.eq('cycle_id', cycleId);
  const { data: settings } = await settingsQuery;
  const rows = (settings ?? []) as any[];
  if (!rows.length) return result;

  // Keep only the most recent completed record per employee (rows are desc).
  const latestByEmployee = new Map<string, any>();
  for (const s of rows) {
    const key = String(s.employee_id);
    if (!latestByEmployee.has(key)) latestByEmployee.set(key, s);
  }

  const settingIds = [...latestByEmployee.values()].map((s) => s.id);
  const [{ data: mfoRows }, titles, deptByEmployee] = await Promise.all([
    supabase
      .from('mfos')
      .select(
        'target_setting_id, function_type, success_indicators(id, success_indicator_ratings(quality, efficiency, timeliness))',
      )
      .in('target_setting_id', settingIds),
    cycleTitles([...latestByEmployee.values()].map((s) => s.cycle_id)),
    departmentsByEmployee([...latestByEmployee.keys()]),
  ]);

  const mfosBySetting = new Map<string, any[]>();
  for (const m of (mfoRows ?? []) as any[]) {
    const list = mfosBySetting.get(m.target_setting_id) ?? [];
    list.push(m);
    mfosBySetting.set(m.target_setting_id, list);
  }

  // Each employee's score is weighted by their own department's configured
  // Core/Strategic/Support split, so two employees with identical ratings in
  // differently-configured offices score differently — which is the point of
  // the configuration.
  const weightsByDept = await weightsByDepartment([...deptByEmployee.values()]);

  for (const [employeeId, setting] of latestByEmployee) {
    const dept = deptByEmployee.get(employeeId) ?? null;
    const weights = dept ? weightsByDept.get(dept) ?? null : null;
    const overall = overallFromMfoRows(mfosBySetting.get(setting.id) ?? [], weights);
    if (overall === null) continue; // completed but unexpectedly empty → treat as unrated
    result.set(employeeId, {
      overallScore: overall,
      adjectival: bucketForScore(overall),
      period: titles.get(setting.cycle_id) ?? null,
      cycleId: setting.cycle_id != null ? Number(setting.cycle_id) : null,
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Departments (top level)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Departments with their critical-position counts (total + vacant).
 *
 * Active departments are always listed. An INACTIVE one is listed too if it
 * still owns at least one critical position: filtering those out in SQL meant a
 * Department Head assigned to a deactivated office could flag positions that RSP
 * could never see, with no error anywhere. The filter therefore runs in JS,
 * after the counts are known — no extra round-trip, since every
 * critical_positions row is already fetched here.
 */
export async function listDepartmentSummaries(): Promise<Result<DepartmentSummary[]>> {
  try {
    const [{ data: depts, error: dErr }, { data: positions, error: pErr }] = await Promise.all([
      supabase.from('departments').select('id, code, name, is_active').is(DIVISION_PARENT_COLUMN, null).order('name'),
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

    const data: DepartmentSummary[] = ((depts ?? []) as any[])
      .map((d) => ({
        departmentId: String(d.id),
        departmentName: String(d.name ?? '').trim(),
        code: String(d.code ?? ''),
        criticalPositionCount: totals.get(String(d.id)) ?? 0,
        vacantCriticalCount: vacants.get(String(d.id)) ?? 0,
        isActive: d.is_active === true,
      }))
      .filter((d) => d.isActive || d.criticalPositionCount > 0);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load departments.' };
  }
}

export interface SuccessionOverviewPosition {
  id: string;
  title: string;
  /** Null when the position has no office; the Succession page cannot open it then. */
  departmentId: string | null;
  departmentName: string;
  incumbentName: string | null;
  incumbentLeavingDate: string | null;
  /**
   * Size of the ranked successor pool the Succession Planning page shows for
   * this position (pool.ranked.length). Null when the V2 engine failed or the
   * position was missing.
   */
  successorCount: number | null;
}

export interface SuccessionOverview {
  positions: SuccessionOverviewPosition[];
}

/**
 * Every critical position with its successor count, for the RSP dashboard.
 *
 * The count comes from the same V2 pipeline as the Succession Planning page,
 * so the two always agree.
 */
export async function getSuccessionDashboardOverview(): Promise<Result<SuccessionOverview>> {
  try {
    const [{ data: positions, error: pErr }, { data: depts, error: dErr }] = await Promise.all([
      supabase
        .from('critical_positions')
        .select('id, title, department_id, incumbent_employee_id, incumbent_leaving_date'),
      supabase.from('departments').select('id, name'),
    ]);
    if (pErr) return { ok: false, error: pErr.message };
    if (dErr) return { ok: false, error: dErr.message };

    const rows = (positions ?? []) as any[];
    if (!rows.length) {
      return { ok: true, data: { positions: [] } };
    }

    const deptName = new Map(((depts ?? []) as any[]).map((d) => [String(d.id), String(d.name ?? '').trim()]));
    const positionDept = new Map(rows.map((r) => [String(r.id), deptName.get(String(r.department_id)) || 'Unassigned']));

    let pools = new Map<string, SuccessionPoolV2>();
    try {
      pools = await fetchSuccessionPoolsV2(rows.map((r) => String(r.id)));
    } catch {
      // Batch read or scoring failure: leave successorCount null per position.
    }

    const incumbentIds = rows.map((r) => r.incumbent_employee_id).filter(Boolean);
    const nameById = new Map<string, string>();
    if (incumbentIds.length) {
      const { data: emps } = await supabase
        .from('employees_with_department')
        .select('id, full_name')
        .in('id', incumbentIds);
      for (const e of (emps ?? []) as any[]) nameById.set(String(e.id), String(e.full_name ?? '').trim());
    }

    return {
      ok: true,
      data: {
        positions: rows.map((r) => {
          const pool = pools.get(String(r.id));
          return {
            id: String(r.id),
            title: String(r.title ?? ''),
            departmentId: r.department_id ? String(r.department_id) : null,
            departmentName: positionDept.get(String(r.id)) ?? 'Unassigned',
            incumbentName: r.incumbent_employee_id ? nameById.get(String(r.incumbent_employee_id)) ?? null : null,
            incumbentLeavingDate: r.incumbent_leaving_date ?? null,
            successorCount: pool ? pool.ranked.length : null,
          };
        }),
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load succession overview.' };
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
      incumbentLeavingDate: r.incumbent_leaving_date ?? null,
      criticalityReason: r.criticality_reason ?? null,
      createdBy: r.created_by ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at ?? r.created_at),
      positionDescription: r.position_description ?? null,
      requiredSuccessorsCount: Number(r.required_successors_count ?? 1),
      minYearsExperience: r.min_years_experience != null ? Number(r.min_years_experience) : null,
      minIpcrRating: r.min_ipcr_rating ?? null,
      requiredEducation: r.required_education ?? null,
      requiredEligibility: r.required_eligibility ?? null,
      requiredCertifications: Array.isArray(r.required_certifications) ? r.required_certifications : [],
      // Training gate + weight overrides (migration 20260818)
      requiredTrainingHours: r.required_training_hours != null ? Number(r.required_training_hours) : null,
      requiredTrainingCategories: Array.isArray(r.required_training_categories) ? r.required_training_categories : [],
      successionWeights: r.succession_weights ?? null,
    }));
    return { ok: true, data: data2 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load critical positions.' };
  }
}

/** Incumbent employment status, resolved live from employees_with_department. */
export async function getIncumbentStatuses(employeeIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(employeeIds)].filter(Boolean);
  const result = new Map<string, string>();
  if (!ids.length) return result;
  const { data } = await supabase.from('employees_with_department').select('id, status').in('id', ids);
  for (const e of (data ?? []) as any[]) result.set(String(e.id), String(e.status ?? ''));
  return result;
}

export async function createCriticalPosition(input: {
  departmentId: string;
  title: string;
  incumbentEmployeeId?: string | null;
  criticalityReason?: string | null;
  createdBy: string;
  positionDescription?: string | null;
  requiredSuccessorsCount?: number;
  minYearsExperience?: number | null;
  minIpcrRating?: string | null;
  requiredEducation?: string | null;
  requiredEligibility?: string | null;
  requiredCertifications?: string[];
  requiredTrainingHours?: number | null;
  requiredTrainingCategories?: string[];
  successionWeights?: Record<string, number> | null;
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
        position_description: input.positionDescription?.trim() || null,
        required_successors_count: input.requiredSuccessorsCount ?? 1,
        min_years_experience: input.minYearsExperience ?? null,
        min_ipcr_rating: input.minIpcrRating || null,
        required_education: input.requiredEducation?.trim() || null,
        required_eligibility: input.requiredEligibility?.trim() || null,
        required_certifications: input.requiredCertifications ?? [],
        required_training_hours: input.requiredTrainingHours ?? null,
        required_training_categories: input.requiredTrainingCategories ?? [],
        succession_weights: input.successionWeights ?? null,
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
        incumbentLeavingDate: data.incumbent_leaving_date ?? null,
        criticalityReason: data.criticality_reason ?? null,
        createdBy: data.created_by ?? null,
        createdAt: String(data.created_at),
        updatedAt: String(data.updated_at ?? data.created_at),
        positionDescription: data.position_description ?? null,
        requiredSuccessorsCount: Number(data.required_successors_count ?? 1),
        minYearsExperience: data.min_years_experience != null ? Number(data.min_years_experience) : null,
        minIpcrRating: data.min_ipcr_rating ?? null,
        requiredEducation: data.required_education ?? null,
        requiredEligibility: data.required_eligibility ?? null,
        requiredCertifications: Array.isArray(data.required_certifications) ? data.required_certifications : [],
        requiredTrainingHours: data.required_training_hours != null ? Number(data.required_training_hours) : null,
        requiredTrainingCategories: Array.isArray(data.required_training_categories) ? data.required_training_categories : [],
        successionWeights: data.succession_weights ?? null,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to add critical position.' };
  }
}

export async function updateCriticalPosition(
  id: string,
  patch: {
    title?: string;
    incumbentEmployeeId?: string | null;
    criticalityReason?: string | null;
    positionDescription?: string | null;
    requiredSuccessorsCount?: number;
    minYearsExperience?: number | null;
    minIpcrRating?: string | null;
    requiredEducation?: string | null;
    requiredEligibility?: string | null;
    requiredCertifications?: string[];
    requiredTrainingHours?: number | null;
    requiredTrainingCategories?: string[];
    successionWeights?: Record<string, number> | null;
  },
): Promise<Result<null>> {
  try {
    const update: Record<string, unknown> = { updated_at: nowIso() };
    if (patch.title !== undefined) update.title = patch.title.trim();
    if (patch.incumbentEmployeeId !== undefined) update.incumbent_employee_id = patch.incumbentEmployeeId || null;
    if (patch.criticalityReason !== undefined) update.criticality_reason = patch.criticalityReason?.trim() || null;
    if (patch.positionDescription !== undefined) update.position_description = patch.positionDescription?.trim() || null;
    if (patch.requiredSuccessorsCount !== undefined) update.required_successors_count = patch.requiredSuccessorsCount;
    if (patch.minYearsExperience !== undefined) update.min_years_experience = patch.minYearsExperience;
    if (patch.minIpcrRating !== undefined) update.min_ipcr_rating = patch.minIpcrRating || null;
    if (patch.requiredEducation !== undefined) update.required_education = patch.requiredEducation?.trim() || null;
    if (patch.requiredEligibility !== undefined) update.required_eligibility = patch.requiredEligibility?.trim() || null;
    if (patch.requiredCertifications !== undefined) update.required_certifications = patch.requiredCertifications;
    if (patch.requiredTrainingHours !== undefined) update.required_training_hours = patch.requiredTrainingHours;
    if (patch.requiredTrainingCategories !== undefined) update.required_training_categories = patch.requiredTrainingCategories;
    if (patch.successionWeights !== undefined) update.succession_weights = patch.successionWeights;
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

// ─────────────────────────────────────────────────────────────────────────────
// Critical Position qualification requirements (migration 20260809)
//
// "Not required" is the absence of a row — save is an upsert on the unique
// pair, remove is a delete. Mirrors the pattern src/lib/api/pmCompetency.ts
// already uses for position_competency_requirements.
// ─────────────────────────────────────────────────────────────────────────────

/** Competency requirements for one critical position, with names resolved for display. */
export async function listCompetencyRequirements(
  criticalPositionId: string,
): Promise<Result<CompetencyRequirement[]>> {
  try {
    const { data, error } = await supabase
      .from('critical_position_competency_requirements')
      .select('id, critical_position_id, competency_id, required_level, competencies ( name )')
      .eq('critical_position_id', criticalPositionId);
    if (error) return { ok: false, error: error.message };
    const rows: CompetencyRequirement[] = (data ?? []).map((r: any) => ({
      id: String(r.id),
      criticalPositionId: String(r.critical_position_id),
      competencyId: String(r.competency_id),
      competencyName: r.competencies?.name ?? 'Unknown',
      requiredLevel: Number(r.required_level),
    }));
    return { ok: true, data: rows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load competency requirements.' };
  }
}

/** Upsert on (critical_position_id, competency_id) — re-saving edits, never duplicates. */
export async function saveCompetencyRequirement(input: {
  criticalPositionId: string;
  competencyId: string;
  requiredLevel: number; // 1-5
}): Promise<Result<null>> {
  try {
    const { error } = await supabase
      .from('critical_position_competency_requirements')
      .upsert(
        [
          {
            critical_position_id: input.criticalPositionId,
            competency_id: input.competencyId,
            required_level: input.requiredLevel,
            updated_at: nowIso(),
          },
        ],
        { onConflict: 'critical_position_id,competency_id' },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save competency requirement.' };
  }
}

/** Mark a competency Not Required — the row simply goes away. */
export async function removeCompetencyRequirement(input: {
  criticalPositionId: string;
  competencyId: string;
}): Promise<Result<null>> {
  try {
    const { error } = await supabase
      .from('critical_position_competency_requirements')
      .delete()
      .eq('critical_position_id', input.criticalPositionId)
      .eq('competency_id', input.competencyId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to remove competency requirement.' };
  }
}

/** Training requirements for one critical position. */
export async function listTrainingRequirements(
  criticalPositionId: string,
): Promise<Result<TrainingRequirement[]>> {
  try {
    const { data, error } = await supabase
      .from('critical_position_training_requirements')
      .select('id, critical_position_id, training_title')
      .eq('critical_position_id', criticalPositionId)
      .order('training_title');
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: String(r.id),
        criticalPositionId: String(r.critical_position_id),
        trainingTitle: String(r.training_title),
      })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load training requirements.' };
  }
}

export async function saveTrainingRequirement(input: {
  criticalPositionId: string;
  trainingTitle: string;
}): Promise<Result<null>> {
  try {
    const title = input.trainingTitle.trim();
    if (!title) return { ok: false, error: 'Training title is required.' };
    const { error } = await supabase
      .from('critical_position_training_requirements')
      .upsert(
        [{ critical_position_id: input.criticalPositionId, training_title: title }],
        { onConflict: 'critical_position_id,training_title' },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save training requirement.' };
  }
}

export async function removeTrainingRequirement(id: string): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('critical_position_training_requirements').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to remove training requirement.' };
  }
}

/**
 * Position titles that exist in one department — the "select from existing
 * Job Positions" source for Critical Position. There is no positions-with-IDs
 * catalog in active use for this kind of picker; this mirrors the same
 * distinct-current_position approach src/lib/api/pmCompetency.ts's
 * listPositions()/listPositionDepartments() already use for the same purpose.
 */
export interface PositionQualifications {
  positionDescription: string;
  minYearsExperience: string;
  requiredEducation: string;
  requiredEligibility: string;
  requiredCertifications: string[];
  competency: string;
  trainingRequirement: string;
}

/**
 * The qualification requirements RSP already recorded when this position was
 * posted, so the Department Head doesn't retype them onto the critical position.
 *
 * Education, eligibility, experience, certifications, competency and training
 * are captured on the job posting at creation (education and eligibility are
 * required fields there) and are the same set the critical position asks for.
 * Entering them twice guarantees the two copies drift apart, so the posting is
 * treated as the source and these prefill the form — the Department Head can
 * still override any of them.
 *
 * Returns null when the position has no posting (e.g. a role that predates the
 * job board), which simply leaves the form blank as before.
 */
export async function getPositionQualifications(
  departmentName: string,
  title: string,
): Promise<PositionQualifications | null> {
  const dept = String(departmentName ?? '').trim();
  const pos = String(title ?? '').trim();
  if (!dept || !pos) return null;

  try {
    const { data, error } = await supabase
      .from('job_postings')
      .select(
        'title, department, description, summary, education_requirement, education_field, experience_years, eligibility, competency, training_requirement, certifications, created_at',
      )
      .eq('department', dept)
      .ilike('title', pos)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as any;

    const certifications = Array.isArray(row.certifications)
      ? row.certifications.map((c: unknown) => String(c ?? '').trim()).filter(Boolean)
      : [];

    const years = Number(row.experience_years);
    const education = [row.education_requirement, row.education_field]
      .map((v: unknown) => String(v ?? '').trim())
      .filter(Boolean)
      .join(' — ');

    return {
      positionDescription: String(row.description ?? row.summary ?? '').trim(),
      // 0 is the posting's "no requirement" default, not a real minimum.
      minYearsExperience: Number.isFinite(years) && years > 0 ? String(years) : '',
      requiredEducation: education,
      requiredEligibility: String(row.eligibility ?? '').trim(),
      requiredCertifications: certifications,
      competency: String(row.competency ?? '').trim(),
      trainingRequirement: String(row.training_requirement ?? '').trim(),
    };
  } catch {
    return null;
  }
}

/** One field whose stored requirement no longer matches the job posting. */
export interface QualificationDrift {
  label: string;
  stored: string;
  posted: string;
}

const asText = (v: unknown): string => String(v ?? '').trim();

/**
 * Fields where a critical position's stored requirements have diverged from its
 * job posting.
 *
 * Requirements are snapshotted when the position is flagged, deliberately: a
 * reposted job must not silently raise the bar on successors already assessed as
 * ready. But a stale snapshot shouldn't pass unnoticed either, so this reports
 * the difference and the Department Head decides whether to adopt it.
 *
 * Only fields the posting actually specifies are compared — a posting that never
 * recorded an eligibility can't be said to disagree with one.
 */
export function diffQualifications(
  stored: CriticalPosition,
  posted: PositionQualifications,
): QualificationDrift[] {
  const drift: QualificationDrift[] = [];

  const compare = (label: string, storedValue: string, postedValue: string) => {
    if (!postedValue) return;
    if (storedValue.toLowerCase() === postedValue.toLowerCase()) return;
    drift.push({ label, stored: storedValue || '—', posted: postedValue });
  };

  compare('Education', asText(stored.requiredEducation), posted.requiredEducation);
  compare('Eligibility', asText(stored.requiredEligibility), posted.requiredEligibility);
  compare(
    'Minimum experience',
    stored.minYearsExperience != null ? String(stored.minYearsExperience) : '',
    posted.minYearsExperience,
  );

  const storedCerts = (stored.requiredCertifications ?? []).map(asText).filter(Boolean).sort();
  const postedCerts = posted.requiredCertifications.map(asText).filter(Boolean).sort();
  if (postedCerts.length > 0 && storedCerts.join('|').toLowerCase() !== postedCerts.join('|').toLowerCase()) {
    drift.push({
      label: 'Certifications',
      stored: storedCerts.join(', ') || '—',
      posted: postedCerts.join(', '),
    });
  }

  return drift;
}

/**
 * Every posting's qualifications for one office, keyed by lowercased title.
 * One query for the whole page — comparing each critical position separately
 * would be a request per row.
 */
export async function listPositionQualificationsForDepartment(
  departmentName: string,
): Promise<Map<string, PositionQualifications>> {
  const dept = asText(departmentName);
  const byTitle = new Map<string, PositionQualifications>();
  if (!dept) return byTitle;

  try {
    const { data, error } = await supabase
      .from('job_postings')
      .select(
        'title, description, summary, education_requirement, education_field, experience_years, eligibility, competency, training_requirement, certifications, created_at',
      )
      .eq('department', dept)
      .order('created_at', { ascending: false });
    if (error) return byTitle;

    for (const row of (data ?? []) as any[]) {
      const key = asText(row.title).toLowerCase();
      // Ordered newest-first, so the first entry per title is the current posting.
      if (!key || byTitle.has(key)) continue;

      const years = Number(row.experience_years);
      byTitle.set(key, {
        positionDescription: asText(row.description) || asText(row.summary),
        minYearsExperience: Number.isFinite(years) && years > 0 ? String(years) : '',
        requiredEducation: [row.education_requirement, row.education_field].map(asText).filter(Boolean).join(' — '),
        requiredEligibility: asText(row.eligibility),
        requiredCertifications: Array.isArray(row.certifications)
          ? row.certifications.map(asText).filter(Boolean)
          : [],
        competency: asText(row.competency),
        trainingRequirement: asText(row.training_requirement),
      });
    }
    return byTitle;
  } catch {
    return byTitle;
  }
}

/**
 * Every position that exists in an office, from both sources:
 *   - employees_with_department — roles currently held (the office directory)
 *   - job_postings              — roles being recruited for
 *
 * Job postings are included because a vacant position can still be critical —
 * arguably more so — and a directory-only list would hide exactly the roles
 * with nobody in them.
 */
export async function listPositionTitlesForDepartment(departmentName: string): Promise<string[]> {
  if (!departmentName) return [];
  try {
    const [empRes, jobRes] = await Promise.all([
      supabase
        .from('employees_with_department')
        .select('current_position, department')
        .eq('department', departmentName),
      supabase.from('job_postings').select('title, department').eq('department', departmentName),
    ]);

    const titles = new Set<string>();
    if (!empRes.error) {
      for (const r of (empRes.data ?? []) as any[]) {
        const t = String(r.current_position ?? '').trim();
        if (t) titles.add(t);
      }
    }
    // A posting failing shouldn't empty the dropdown — the directory alone is
    // still a usable list.
    if (!jobRes.error) {
      for (const r of (jobRes.data ?? []) as any[]) {
        const t = String(r.title ?? '').trim();
        if (t) titles.add(t);
      }
    }
    return [...titles].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-candidate Remarks (OCBO table Remarks column; migration 20260828)
// ─────────────────────────────────────────────────────────────────────────────

/** Remarks for every candidate under a position, keyed by employee_id. */
export async function getCandidateRemarks(criticalPositionId: string): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const { data, error } = await supabase
    .from('succession_candidate_remarks')
    .select('employee_id, remarks')
    .eq('critical_position_id', criticalPositionId);
  if (error) { console.error('getCandidateRemarks error:', error); return m; }
  for (const r of (data ?? []) as any[]) if (r.remarks) m.set(String(r.employee_id), String(r.remarks));
  return m;
}

/** Upsert one candidate's Remarks (works for auto-discovered and manual candidates). */
export async function saveCandidateRemark(input: {
  criticalPositionId: string;
  employeeId: string;
  remarks: string;
  updatedBy: string;
}): Promise<Result<null>> {
  const { error } = await supabase
    .from('succession_candidate_remarks')
    .upsert(
      {
        critical_position_id: input.criticalPositionId,
        employee_id: input.employeeId,
        remarks: input.remarks.trim() || null,
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'critical_position_id,employee_id' },
    );
  return error ? { ok: false, error: error.message } : { ok: true, data: null };
}

// ── V2 Succession Pipeline (staged, fixed-weight 30/20/20/15/15 model) ─────
export { fetchSuccessionPoolV2, fetchSuccessionPoolsV2 } from './successionPipelineV2';
export type {
  SuccessionPoolV2,
  CandidateMetaV2,
  CandidateCompetencyItemV2,
  CandidateEligibilityDetailV2,
} from './successionPipelineV2';
