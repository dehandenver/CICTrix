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
import { embeddedRating } from './ipcrRatings';
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
// Readiness Score — transparent 100-point weighted rubric
//
// Weights are CONFIGURABLE via SUCCESSION_WEIGHTS (single source of truth), so
// HR can retune the model without touching scoring logic. Defaults:
//   Latest IPCR Rating         30
//   Relevant Training History  25
//   Tenure                     20
//   Educational Qualification  15
//   Civil Service Eligibility  10
// Every component is computed from verified records only; a missing required
// record (no finalized IPCR) marks the candidate Incomplete and drops them from
// the ranked list rather than guessing a value.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Criterion weights (must sum to 100). Centralised so the model is tunable in
 * one place — a future HR "adjust weights per critical role" UI writes here.
 */
export const SUCCESSION_WEIGHTS = {
  ipcr: 30,
  training: 25,
  tenure: 20,
  education: 15,
  eligibility: 10,
} as const;

export type SuccessionTier = 'Ready Now' | 'Ready in 1–2 Years' | 'Developmental';

export interface ReadinessScore {
  total: number;                 // 0–100 (weighted sum; 0 when data incomplete)
  education: number;
  educationMax: number;
  ipcr: number;
  ipcrMax: number;
  training: number;
  trainingMax: number;
  eligibility: number;
  eligibilityMax: number;
  tenure: number;
  tenureMax: number;
  /** Readiness tier from the total; null when data is incomplete. */
  tier: SuccessionTier | null;
  // Raw context shown alongside the bars
  ipcrScore: number | null;      // raw 1–5 IPCR score
  adjectival: string | null;
  ratedPeriod: string | null;
  yearsOfService: number;        // raw years
  educationLabel: string | null;
  eligibilityLabel: string | null;
  relevantTrainings: number;
  relevantTrainingHours: number;
  mostRecentTrainingDate: string | null;
  mostRecentTrainingTitle: string | null;
  matchedKeyword: string | null; // field keyword that matched the position
  /** False when a required record (IPCR) is missing — excluded from ranking. */
  dataComplete: boolean;
  incompleteReason: string | null;
}

export interface AutoSuccessor {
  employeeId: string;
  employeeName: string;
  currentPosition: string | null;
  department: string | null;
  readiness: ReadinessScore;
  isManuallyAdded: boolean;  // false for auto-discovered, true for manually added
  manualNote: string | null; // only for manually-added entries
  candidateId: string | null; // succession_candidates.id, null for auto-discovered
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
      supabase.from('departments').select('id, code, name, is_active').order('name'),
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
      updatedAt: String(r.updated_at ?? r.created_at),
      positionDescription: r.position_description ?? null,
      requiredSuccessorsCount: Number(r.required_successors_count ?? 1),
      minYearsExperience: r.min_years_experience != null ? Number(r.min_years_experience) : null,
      minIpcrRating: r.min_ipcr_rating ?? null,
      requiredEducation: r.required_education ?? null,
      requiredEligibility: r.required_eligibility ?? null,
      requiredCertifications: Array.isArray(r.required_certifications) ? r.required_certifications : [],
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
        updatedAt: String(data.updated_at ?? data.created_at),
        positionDescription: data.position_description ?? null,
        requiredSuccessorsCount: Number(data.required_successors_count ?? 1),
        minYearsExperience: data.min_years_experience != null ? Number(data.min_years_experience) : null,
        minIpcrRating: data.min_ipcr_rating ?? null,
        requiredEducation: data.required_education ?? null,
        requiredEligibility: data.required_eligibility ?? null,
        requiredCertifications: Array.isArray(data.required_certifications) ? data.required_certifications : [],
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
// Auto-Successor Discovery Engine
//
// For each critical position, automatically discovers eligible successors:
//   1. Eligibility gate — completed IPCR (Phase 2 approved)
//   2. Field matching  — position-title keyword match
//   3. Readiness score — 60 performance + 25 tenure + 15 field alignment
//   4. Merge manual    — manually-added candidates are included too
// ─────────────────────────────────────────────────────────────────────────────

/** Coarse education level ranking, used only to compare against a requirement. */
function educationRank(label: string | null | undefined): number {
  const s = String(label ?? '').toLowerCase();
  if (!s.trim()) return -1; // no record
  if (s.includes('ph.d') || s.includes('phd') || s.includes('doctorate') || s.includes('doctor of philosophy')) return 6;
  if (s.includes('doctor of medicine') || s.includes('dental medicine') || s.includes('juris doctor') || s.includes('bachelor of laws') || s.includes('ll.b') || s.includes('ll.m')) return 5;
  if (s.includes('master') || s.includes('m.a') || s.includes('m.s') || s.includes('mba')) return 4;
  if (s.includes('bachelor') || s.includes('college graduate') || s.includes('degree')) return 3;
  if (s.includes('vocational') || s.includes('technical') || s.includes('two-year') || s.includes('associate')) return 2;
  if (s.includes('college level') || s.includes('undergraduate')) return 1;
  return 0; // high school / other recorded
}

/** Education fit as a 0–1 ratio. No requirement = full when a record exists. */
function educationRatio(empEdu: string | null, requiredEdu: string | null): number {
  const empRank = educationRank(empEdu);
  if (empRank < 0) return 0; // no record → cannot credit (don't infer)
  const reqRank = educationRank(requiredEdu);
  if (reqRank < 0) return 1; // no stated requirement → a recorded attainment meets it
  if (empRank >= reqRank) return 1;
  if (empRank === reqRank - 1) return 0.6;
  return 0.3;
}

/** Eligibility fit as a 0–1 ratio, from recorded values only. */
function eligibilityRatio(empElig: string | null, requiredElig: string | null): number {
  const emp = String(empElig ?? '').trim().toLowerCase();
  if (!emp) return 0; // no record
  const req = String(requiredElig ?? '').trim().toLowerCase();
  if (!req) return 1; // no requirement → a recorded eligibility meets it
  const tokens = req.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  return tokens.some((t) => emp.includes(t)) ? 1 : 0.5;
}

/** Readiness tier from the weighted total. */
function tierFromTotal(total: number): SuccessionTier {
  if (total >= 80) return 'Ready Now';
  if (total >= 60) return 'Ready in 1–2 Years';
  return 'Developmental';
}

function computeReadinessScore(input: {
  ipcrScore: number | null;
  adjectival: string | null;
  ratedPeriod: string | null;
  yearsOfService: number;
  matchedKeyword: string | null;
  empEducation: string | null;
  requiredEducation: string | null;
  empEligibility: string | null;
  requiredEligibility: string | null;
  relevantTrainings: number;
  relevantTrainingHours: number;
  mostRecentTrainingDate: string | null;
  mostRecentTrainingTitle: string | null;
}): ReadinessScore {
  const W = SUCCESSION_WEIGHTS;
  const w1 = (ratio: number, weight: number) => Number((ratio * weight).toFixed(1));

  const education = w1(educationRatio(input.empEducation, input.requiredEducation), W.education);
  const ipcr = input.ipcrScore != null ? w1(input.ipcrScore / 5, W.ipcr) : 0;
  const training = w1(Math.min(input.relevantTrainings, 3) / 3, W.training);
  const eligibility = w1(eligibilityRatio(input.empEligibility, input.requiredEligibility), W.eligibility);
  const tenure = w1(Math.min(input.yearsOfService, 15) / 15, W.tenure);

  const dataComplete = input.ipcrScore != null; // IPCR is the required record for scoring
  const total = dataComplete
    ? Number((education + ipcr + training + eligibility + tenure).toFixed(1))
    : 0;
  return {
    total,
    education,
    educationMax: W.education,
    ipcr,
    ipcrMax: W.ipcr,
    training,
    trainingMax: W.training,
    eligibility,
    eligibilityMax: W.eligibility,
    tenure,
    tenureMax: W.tenure,
    tier: dataComplete ? tierFromTotal(total) : null,
    ipcrScore: input.ipcrScore,
    adjectival: input.adjectival,
    ratedPeriod: input.ratedPeriod,
    yearsOfService: input.yearsOfService,
    educationLabel: input.empEducation,
    eligibilityLabel: input.empEligibility,
    relevantTrainings: input.relevantTrainings,
    relevantTrainingHours: input.relevantTrainingHours,
    mostRecentTrainingDate: input.mostRecentTrainingDate,
    mostRecentTrainingTitle: input.mostRecentTrainingTitle,
    matchedKeyword: input.matchedKeyword,
    dataComplete,
    incompleteReason: dataComplete ? null : 'No current IPCR record',
  };
}

/** Years since date_hired until today, floored at 0. */
function yearsFromHireDate(dateHired: string | null): number {
  if (!dateHired) return 0;
  const d = new Date(dateHired);
  if (Number.isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Number((ms / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1)));
}

/**
 * Auto-discover, score, and rank successors for a critical position.
 *
 * The engine works in five steps:
 *   1. Gate: only employees with a completed IPCR enter the pool.
 *   2. Filter: the employee's current position must share a field keyword
 *      with the critical position's title.
 *   3. Score: transparent 100-point rubric (Performance 60, Tenure 25, Field 15).
 *   4. Merge: manually-added succession_candidates are included and scored
 *      the same way (but flagged as manual).
 *   5. Rank: highest readiness score first.
 */
export async function listAutoSuccessors(
  criticalPositionId: string,
): Promise<Result<AutoSuccessor[]>> {
  try {
    // ── Fetch the critical position + its qualification requirements ─────────
    const { data: posRow, error: posErr } = await supabase
      .from('critical_positions')
      .select('id, title, required_education, required_eligibility')
      .eq('id', criticalPositionId)
      .maybeSingle();
    if (posErr) return { ok: false, error: posErr.message };
    if (!posRow) return { ok: false, error: 'Critical position not found.' };
    const positionTitle = String(posRow.title ?? '');
    const requiredEducation = posRow.required_education ?? null;
    const requiredEligibility = posRow.required_eligibility ?? null;

    // ── Eligibility gate — Regular/Permanent, Active, not Probationary ───────
    // Unlike before, IPCR is NOT a gate: a gate-passing employee with no
    // finalized IPCR still appears, flagged "Incomplete Data" and excluded from
    // ranking (per spec) rather than silently dropped.
    const { data: empRows, error: empErr } = await supabase
      .from('employees')
      .select('id, first_name, middle_name, last_name, position, department, employment_status, status, date_hired, highest_educational_attainment, eligibility')
      .eq('status', 'Active')
      .in('employment_status', ['Regular', 'Permanent']);
    if (empErr) return { ok: false, error: empErr.message };

    const fullName = (e: any) =>
      [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ').trim() || '(unknown)';
    const posTokens = positionTitle.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 3);
    const isRelevantTraining = (title: string): boolean => {
      const t = String(title ?? '').toLowerCase();
      return !!sharedFieldKeyword(title, positionTitle) || posTokens.some((tok) => t.includes(tok));
    };

    // Field-match the gated pool against the target position.
    const matched = ((empRows ?? []) as any[])
      .filter((e) => String(e.employment_status ?? '').toLowerCase() !== 'probationary')
      .map((e) => ({ e, keyword: sharedFieldKeyword(String(e.position ?? ''), positionTitle) }))
      .filter(({ keyword }) => !!keyword);

    const matchedIds = matched.map(({ e }) => String(e.id));

    // Scores + relevant training history for the matched pool.
    const [scores, { data: trainingRows }] = await Promise.all([
      getLatestOverallScores(matchedIds),
      matchedIds.length
        ? supabase
            .from('employee_training')
            .select('employee_id, training_title, number_of_hours, from_date')
            .in('employee_id', matchedIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Aggregate relevant trainings per employee.
    const trainAgg = new Map<string, { count: number; hours: number; latest: string | null; latestTitle: string | null }>();
    for (const t of (trainingRows ?? []) as any[]) {
      if (!isRelevantTraining(t.training_title)) continue;
      const id = String(t.employee_id);
      const cur = trainAgg.get(id) ?? { count: 0, hours: 0, latest: null, latestTitle: null };
      cur.count += 1;
      cur.hours += Number(t.number_of_hours ?? 0);
      if (t.from_date && (!cur.latest || t.from_date > cur.latest)) {
        cur.latest = t.from_date;
        cur.latestTitle = t.training_title ?? null;
      }
      trainAgg.set(id, cur);
    }

    const autoMap = new Map<string, AutoSuccessor>();
    for (const { e, keyword } of matched) {
      const empId = String(e.id);
      const score = scores.get(empId);
      const agg = trainAgg.get(empId) ?? { count: 0, hours: 0, latest: null, latestTitle: null };
      const readiness = computeReadinessScore({
        ipcrScore: score?.overallScore ?? null,
        adjectival: score?.adjectival ?? null,
        ratedPeriod: score?.period ?? null,
        yearsOfService: yearsFromHireDate(e.date_hired ?? null),
        matchedKeyword: keyword,
        empEducation: e.highest_educational_attainment ?? null,
        requiredEducation,
        empEligibility: e.eligibility ?? null,
        requiredEligibility,
        relevantTrainings: agg.count,
        relevantTrainingHours: agg.hours,
        mostRecentTrainingDate: agg.latest,
        mostRecentTrainingTitle: agg.latestTitle,
      });
      autoMap.set(empId, {
        employeeId: empId,
        employeeName: fullName(e),
        currentPosition: String(e.position ?? '') || null,
        department: e.department ?? null,
        readiness,
        isManuallyAdded: false,
        manualNote: null,
        candidateId: null,
      });
    }

    // ── Merge manually-added candidates (bypass the field-match gate) ────────
    const { data: manualRows } = await supabase
      .from('succession_candidates')
      .select('*')
      .eq('critical_position_id', criticalPositionId);

    for (const mc of (manualRows ?? []) as any[]) {
      const mcId = String(mc.employee_id);
      if (autoMap.has(mcId)) {
        const existing = autoMap.get(mcId)!;
        existing.candidateId = String(mc.id);
        existing.manualNote = mc.note ?? null;
        continue;
      }
      const { data: mcEmp } = await supabase
        .from('employees')
        .select('id, first_name, middle_name, last_name, position, department, date_hired, highest_educational_attainment, eligibility')
        .eq('id', mcId)
        .maybeSingle();
      const mcScore = scores.get(mcId) ?? (await getLatestOverallScores([mcId])).get(mcId);
      const { data: mcTrain } = await supabase
        .from('employee_training')
        .select('training_title, number_of_hours, from_date')
        .eq('employee_id', mcId);
      let count = 0, hours = 0, latest: string | null = null, latestTitle: string | null = null;
      for (const t of (mcTrain ?? []) as any[]) {
        if (!isRelevantTraining(t.training_title)) continue;
        count += 1; hours += Number(t.number_of_hours ?? 0);
        if (t.from_date && (!latest || t.from_date > latest)) { latest = t.from_date; latestTitle = t.training_title ?? null; }
      }
      const readiness = computeReadinessScore({
        ipcrScore: mcScore?.overallScore ?? null,
        adjectival: mcScore?.adjectival ?? null,
        ratedPeriod: mcScore?.period ?? null,
        yearsOfService: yearsFromHireDate(mcEmp?.date_hired ?? null),
        matchedKeyword: sharedFieldKeyword(String(mcEmp?.position ?? ''), positionTitle),
        empEducation: mcEmp?.highest_educational_attainment ?? null,
        requiredEducation,
        empEligibility: mcEmp?.eligibility ?? null,
        requiredEligibility,
        relevantTrainings: count,
        relevantTrainingHours: hours,
        mostRecentTrainingDate: latest,
        mostRecentTrainingTitle: latestTitle,
      });
      autoMap.set(mcId, {
        employeeId: mcId,
        employeeName: mcEmp ? fullName(mcEmp) : '(unknown)',
        currentPosition: String(mcEmp?.position ?? '') || null,
        department: mcEmp?.department ?? null,
        readiness,
        isManuallyAdded: true,
        manualNote: mc.note ?? null,
        candidateId: String(mc.id),
      });
    }

    // ── Sort: complete records ranked by weighted score; incomplete last ─────
    const result = [...autoMap.values()].sort((a, b) => {
      if (a.readiness.dataComplete !== b.readiness.dataComplete) return a.readiness.dataComplete ? -1 : 1;
      if (b.readiness.total !== a.readiness.total) return b.readiness.total - a.readiness.total;
      if (b.readiness.ipcr !== a.readiness.ipcr) return b.readiness.ipcr - a.readiness.ipcr;
      return a.employeeName.localeCompare(b.employeeName);
    });

    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load auto-successors.' };
  }
}
