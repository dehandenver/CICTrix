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
  // Training gate + weight overrides (migration 20260818)
  requiredTrainingHours: number | null;           // minimum hours floor for Stage 1 gate
  requiredTrainingCategories: string[];           // required category labels (e.g. ["Leadership"])
  successionWeights: SuccessionWeights | null;    // per-position override; null = use global defaults
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
// HR can retune the model without touching scoring logic. Defaults (Tenure
// removed per 2026-07-26 spec update):
//   Latest IPCR Rating         35
//   Relevant Training History  30
//   Educational Qualification  20
//   Civil Service Eligibility  15
// Every component is computed from verified records only; a missing required
// record (no finalized IPCR) marks the candidate as a gate failure and moves
// them to the "Not Yet Qualified" section rather than ranking them at zero.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global default criterion weights (must sum to 100). Centralised so the model
 * is tunable in one place. Per-position overrides can be stored in
 * critical_positions.succession_weights (JSONB) — the scoring functions accept
 * an optional weights parameter and fall back to these defaults.
 *
 * Tenure has been removed entirely per the 2026-07-26 succession-gate spec.
 */
export const SUCCESSION_WEIGHTS = {
  ipcr: 35,
  training: 30,
  education: 20,
  eligibility: 15,
} as const;

export type SuccessionWeights = typeof SUCCESSION_WEIGHTS;

export type SuccessionTier = 'Ready Now' | 'Ready in 1–2 Years' | 'Developmental';

/** One required competency and whether the candidate's trainings cover it. */
export interface CompetencyCoverage {
  name: string;
  met: boolean;
  /** Training title that satisfied it, or null when unmet. */
  satisfiedBy: string | null;
}

/** Default months to close each missing competency (Timeline column, Part 4). */
export const DEFAULT_MONTHS_PER_MISSING_COMPETENCY = 6;

export interface ReadinessScore {
  total: number;                 // 0–100 (weighted sum)
  education: number;
  educationMax: number;
  ipcr: number;
  ipcrMax: number;
  training: number;
  trainingMax: number;
  eligibility: number;
  eligibilityMax: number;
  // Tenure removed per 2026-07-26 spec — no tenure field here any more.
  /** Readiness tier from the total. */
  tier: SuccessionTier | null;
  // Raw context shown alongside the bars
  ipcrScore: number | null;      // raw 1–5 IPCR score
  adjectival: string | null;
  ratedPeriod: string | null;
  educationLabel: string | null;
  eligibilityLabel: string | null;
  /** Count of completed trainings on file. */
  relevantTrainings: number;
  relevantTrainingHours: number;
  mostRecentTrainingDate: string | null;
  mostRecentTrainingTitle: string | null;
  /** Subset that are role/category-fit (Leadership or field-matching). */
  categoryFitTrainings: number;
  /** Required training hours for this position (null = no threshold set). */
  trainingHoursRequired: number | null;
  /** True when the employee meets the position's training hours + category gate. */
  trainingMeetsRequirement: boolean;
  /**
   * Stage-2 competency readiness (2026-07-26 spec): share of the position's
   * required competencies covered by ≥1 completed training. null when the
   * position has no required competencies configured (then the weighted total
   * drives the tier instead).
   */
  competencyMatchPct: number | null;
  competencyBreakdown: CompetencyCoverage[];
  matchedKeyword: string | null; // field keyword that matched the position
  /** Always true here — non-passers never reach ReadinessScore; they land in GateFailure. */
  dataComplete: boolean;
  incompleteReason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate-failure record — employees who did NOT clear all Stage 1 gates.
// Returned in the "notQualified" array of AutoSuccessorsResult so the UI can
// render a collapsed "Not Yet Qualified (N)" section with per-gate reasons.
// ─────────────────────────────────────────────────────────────────────────────

export interface GateFailure {
  employeeId: string;
  employeeName: string;
  currentPosition: string | null;
  department: string | null;
  /** Each string describes one failed gate, e.g. "Missing finalized IPCR". */
  failedGates: string[];
  /** Auto-generated: what's missing (mirrors failedGates, Part 4 Gap Analysis). */
  gapAnalysis: string[];
  /** Auto-generated next step(s) per failed gate (Part 4 Required Actions). */
  requiredActions: string[];
  /** True when the only blocker is a missing finalized IPCR (Pending Evaluation). */
  pendingEvaluation: boolean;
  /** Present when the employee also has a manual succession_candidates row. */
  candidateId: string | null;
}

/** Combined result from listAutoSuccessors. */
export interface AutoSuccessorsResult {
  /** Gate-passers, ranked highest score first. */
  qualified: AutoSuccessor[];
  /** Gate-failures, in alphabetical order. */
  notQualified: GateFailure[];
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
  /** True for manually-added entries that bypassed Stage 1 gates. */
  gatesBypassed: boolean;
  /** Auto-generated gap text for missing competencies (Part 4 Gap Analysis). */
  gapAnalysis: string[];
  /** Auto-generated next step(s) to close the competency gap. */
  requiredActions: string[];
  /** Estimated time to reach 100% competency, e.g. "12 months"; null at 100%. */
  timeline: string | null;
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
  successionWeights?: SuccessionWeights | null;
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
    successionWeights?: SuccessionWeights | null;
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

/**
 * Eligibility tier level for Professional vs Sub-Professional gate comparison.
 * Returns 2 for Professional, 1 for Sub-Professional, 0 for nothing on record.
 */
function eligibilityLevel(label: string | null | undefined): number {
  const s = String(label ?? '').trim().toLowerCase();
  if (!s) return 0;
  // "sub-professional" must be checked first (contains "professional" as substring)
  if (s.includes('sub-professional') || s.includes('sub professional')) return 1;
  // Professional-level markers: CSC Professional, plus board/licensure eligibilities
  // that RA 1080 confers Professional standing to (PRC licence, Bar, board exams).
  if (
    s.includes('professional') ||
    s.includes('ra 1080') || s.includes('ra1080') ||
    s.includes('board') || s.includes('bar') || s.includes('prc') || s.includes('licens')
  ) {
    return 2;
  }
  // Has some eligibility on file but not on the CSC professional scale — sub-pro level.
  return 1;
}

/** Required eligibility level from the position's requiredEligibility text. */
function requiredEligibilityLevel(req: string | null | undefined): number {
  const s = String(req ?? '').trim().toLowerCase();
  if (!s) return 0; // no requirement
  if (s.includes('sub-professional') || s.includes('sub professional')) return 1;
  if (s.includes('professional')) return 2;
  return 1; // generic "eligibility required" → at least sub-pro
}

/** Eligibility fit as a 0–1 ratio for scoring (gate check is stricter). */
function eligibilityRatio(empElig: string | null, requiredElig: string | null): number {
  const empLevel = eligibilityLevel(empElig);
  if (empLevel === 0) return 0; // no record
  const reqLevel = requiredEligibilityLevel(requiredElig);
  if (reqLevel === 0) return 1; // no requirement → a recorded eligibility meets it
  return empLevel >= reqLevel ? 1 : 0.5;
}

/**
 * Training subscore, out of W.training (default 30), measured relative to the
 * position's required training threshold:
 *
 *   If the position has a required_training_hours threshold (T):
 *     - Hours component (60% of weight): employee_hours / T, capped at 1.0
 *     - Recency component (25% of weight): same bands as before
 *     - Category fit component (15% of weight): any required-category training met
 *
 *   If no threshold is set (T = null):
 *     Falls back to the volume/recency/relevance/hours heuristic used before
 *     (same logic, just relative to the 40-hr default).
 *
 * Scaled to the configured training weight.
 */
function scoreTraining(input: {
  completed: number;
  hours: number;
  mostRecentDate: string | null;
  categoryFit: number;
  requiredHours: number | null;
  requiredCategories: string[];
  empCategories: string[];       // actual training category labels employee has
  W: SuccessionWeights;
}): number {
  const { W } = input;
  const totalWeight = W.training; // e.g. 30

  // Recency component (shared between both modes)
  let recency = 0;
  if (input.mostRecentDate) {
    const months = (Date.now() - new Date(input.mostRecentDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000);
    recency = months <= 12 ? 1 : months <= 24 ? 0.75 : months <= 36 ? 0.375 : 0;
  }

  if (input.requiredHours != null && input.requiredHours > 0) {
    // Threshold-relative mode
    const hoursRatio = Math.min(1, input.hours / input.requiredHours);    // 60%
    const recencyRatio = recency;                                          // 25%
    // Category fit: full credit if all required categories met, partial otherwise
    let catRatio = 1;
    if (input.requiredCategories.length > 0) {
      const empCatNorm = input.empCategories.map((c) => c.trim().toLowerCase());
      const met = input.requiredCategories.filter((rc) =>
        empCatNorm.some((ec) => ec.includes(rc.toLowerCase()) || rc.toLowerCase().includes(ec)),
      ).length;
      catRatio = met / input.requiredCategories.length;                    // 15%
    }
    const ratio = 0.60 * hoursRatio + 0.25 * recencyRatio + 0.15 * catRatio;
    return Number((ratio * totalWeight).toFixed(1));
  }

  // Heuristic mode (no hours threshold)
  const volume = input.completed === 0 ? 0 : input.completed <= 2 ? 4 : input.completed <= 5 ? 7 : 10;
  const recencyPts = recency * 8;
  const relevance = (Math.min(input.categoryFit, 3) / 3) * 5;
  const hours = (Math.min(input.hours, 40) / 40) * 2;
  const outOf25 = volume + recencyPts + relevance + hours; // 0–25 (legacy scale)
  return Number(((outOf25 / 25) * totalWeight).toFixed(1));
}

/** Readiness tier from the weighted total. */
function tierFromTotal(total: number): SuccessionTier {
  if (total >= 80) return 'Ready Now';
  if (total >= 60) return 'Ready in 1–2 Years';
  return 'Developmental';
}

/** Significant keywords from a competency name (drops generic/level words). */
function competencyKeywords(name: string): string[] {
  return String(name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !TITLE_STOPWORDS.has(w));
}

/**
 * Stage-2 coverage: for each required competency, find a completed training that
 * satisfies it. A training satisfies a competency when its title shares a
 * significant keyword; leadership/supervisory competencies are also satisfied by
 * any Leadership-category training. (Heuristic name match — the archive has no
 * per-record competency tags yet; see the phase-2 note.)
 */
/**
 * Stage-2 coverage from the REAL join (employee_training_competencies), not a
 * keyword heuristic: a required competency is met when one of the employee's
 * completed trainings is tagged with it. `tagged` maps a competency_id to the
 * title of a training that satisfied it. (Migration 20260828; the old title
 * heuristic silently over-credited via generic tokens like "public"/"management".)
 */
function computeCompetencyCoverage(
  required: { id: string; name: string }[],
  tagged: Map<string, string>,
): CompetencyCoverage[] {
  return required.map(({ id, name }) => {
    const satisfiedBy = tagged.get(id) ?? null;
    return { name, met: !!satisfiedBy, satisfiedBy };
  });
}

const EDU_LEVEL_WORDS = new Set([
  'bachelor', 'bachelors', 'master', 'masters', 'masteral', 'doctorate', 'doctoral', 'phd',
  'degree', 'graduate', 'undergraduate', 'college', 'level', 'course', 'science', 'arts',
  'related', 'field', 'units', 'postgraduate', 'post', 'school', 'diploma', 'vocational',
  'technical', 'associate', 'studies', 'major',
]);

/** Field-of-study tokens from an education string, stripping level/degree words. */
function educationFields(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !EDU_LEVEL_WORDS.has(w));
}

/**
 * Education gate as a COURSE/FIELD match (2026-07-26 spec §2.1), not a generic
 * attainment ladder: passes when the position names no specific field, or the
 * employee's degree/field shares a field token with the required field(s). So a
 * Master's in an unrelated field does not auto-pass, and a Bachelor's in the
 * exact required field can.
 */
function educationFieldMatches(empEdu: string | null, requiredEdu: string | null): boolean {
  const reqFields = educationFields(requiredEdu ?? '');
  if (reqFields.length === 0) return true; // no specific field required
  const empFields = new Set(educationFields(empEdu ?? ''));
  return reqFields.some((f) => empFields.has(f));
}

/** Auto-suggested next step for a failed gate (Part 4 Required Actions). */
function actionForGate(gate: string): string {
  const g = gate.toLowerCase();
  if (g.includes('education')) return 'Complete relevant units/certification in the required field, or consider an alternate candidate.';
  if (g.includes('eligibility')) return 'Take and pass the required CSC eligibility exam.';
  if (g.includes('ipcr')) return g.includes('missing') ? 'Complete the current IPCR cycle so a rating is finalized.' : 'Sustain improved performance through the next rating cycle(s).';
  if (g.includes('training')) return "Attend the training needed to meet the position's requirement.";
  return 'Address the noted requirement.';
}

function computeReadinessScore(input: {
  ipcrScore: number | null;
  adjectival: string | null;
  ratedPeriod: string | null;
  matchedKeyword: string | null;
  empEducation: string | null;
  requiredEducation: string | null;
  empEligibility: string | null;
  requiredEligibility: string | null;
  relevantTrainings: number;
  relevantTrainingHours: number;
  mostRecentTrainingDate: string | null;
  mostRecentTrainingTitle: string | null;
  categoryFitTrainings: number;
  empTrainingCategories: string[];        // category labels employee has completed
  requiredTrainingHours: number | null;   // position's required hours threshold
  requiredTrainingCategories: string[];   // position's required category labels
  requiredCompetencies: { id: string; name: string }[]; // position's required competencies (Stage 2)
  taggedCompetencies: Map<string, string>;              // employee's tagged competency_id → satisfying training title
  W: SuccessionWeights;                   // weights (per-position or global defaults)
}): ReadinessScore {
  const w1 = (ratio: number, weight: number) => Number((ratio * weight).toFixed(1));

  const education = w1(educationRatio(input.empEducation, input.requiredEducation), input.W.education);
  const ipcr = input.ipcrScore != null ? w1(input.ipcrScore / 5, input.W.ipcr) : 0;
  const training = scoreTraining({
    completed: input.relevantTrainings,
    hours: input.relevantTrainingHours,
    mostRecentDate: input.mostRecentTrainingDate,
    categoryFit: input.categoryFitTrainings,
    requiredHours: input.requiredTrainingHours,
    requiredCategories: input.requiredTrainingCategories,
    empCategories: input.empTrainingCategories,
    W: input.W,
  });
  const eligibility = w1(eligibilityRatio(input.empEligibility, input.requiredEligibility), input.W.eligibility);

  // Gate-passers always have a valid IPCR score (non-passers are GateFailure)
  const dataComplete = input.ipcrScore != null;
  const total = dataComplete
    ? Number((education + ipcr + training + eligibility).toFixed(1))
    : 0;

  // Stage-2 competency readiness. When the position lists required competencies,
  // it drives the tier (Ready Now = 100%); otherwise the weighted total does.
  const competencyBreakdown = computeCompetencyCoverage(
    input.requiredCompetencies,
    input.taggedCompetencies,
  );
  const competencyMatchPct = input.requiredCompetencies.length
    ? Math.round((competencyBreakdown.filter((c) => c.met).length / input.requiredCompetencies.length) * 100)
    : null;
  const tier: SuccessionTier | null = !dataComplete
    ? null
    : competencyMatchPct != null
      ? competencyMatchPct >= 100
        ? 'Ready Now'
        : competencyMatchPct >= 50
          ? 'Ready in 1–2 Years'
          : 'Developmental'
      : tierFromTotal(total);

  // Check if training meets the threshold (informational, gate already passed)
  const hoursReq = input.requiredTrainingHours;
  const trainingMeetsRequirement =
    (hoursReq == null || input.relevantTrainingHours >= hoursReq) &&
    (input.requiredTrainingCategories.length === 0 ||
      (() => {
        const empCatNorm = input.empTrainingCategories.map((c) => c.trim().toLowerCase());
        return input.requiredTrainingCategories.every((rc) =>
          empCatNorm.some((ec) => ec.includes(rc.toLowerCase()) || rc.toLowerCase().includes(ec)),
        );
      })());

  return {
    total,
    education,
    educationMax: input.W.education,
    ipcr,
    ipcrMax: input.W.ipcr,
    training,
    trainingMax: input.W.training,
    eligibility,
    eligibilityMax: input.W.eligibility,
    tier,
    competencyMatchPct,
    competencyBreakdown,
    ipcrScore: input.ipcrScore,
    adjectival: input.adjectival,
    ratedPeriod: input.ratedPeriod,
    educationLabel: input.empEducation,
    eligibilityLabel: input.empEligibility,
    relevantTrainings: input.relevantTrainings,
    relevantTrainingHours: input.relevantTrainingHours,
    mostRecentTrainingDate: input.mostRecentTrainingDate,
    mostRecentTrainingTitle: input.mostRecentTrainingTitle,
    categoryFitTrainings: input.categoryFitTrainings,
    trainingHoursRequired: input.requiredTrainingHours,
    trainingMeetsRequirement,
    matchedKeyword: input.matchedKeyword,
    dataComplete,
    incompleteReason: dataComplete ? null : 'No current IPCR record',
  };
}

/** Years since date_hired until today, floored at 0. (Kept for reference; no longer scored.) */
function yearsFromHireDate(dateHired: string | null): number {
  if (!dateHired) return 0;
  const d = new Date(dateHired);
  if (Number.isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Number((ms / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1)));
}

// ─────────────────────────────────────────────────────────────────────────────
// IPCR adjectival rank (for minimum-IPCR gate comparison)
// ─────────────────────────────────────────────────────────────────────────────

const IPCR_RANK: Record<string, number> = {
  Poor: 1,
  Unsatisfactory: 2,
  Satisfactory: 3,
  'Very Satisfactory': 4,
  Outstanding: 5,
};

function ipcrRank(adjectival: string | null): number {
  return IPCR_RANK[String(adjectival ?? '').trim()] ?? 0;
}

/**
 * Auto-discover, score, and rank successors for a critical position.
 *
 * Two-stage model (per 2026-07-26 succession-gate spec):
 *
 *   Stage 1 — Eligibility Gate (pass/fail):
 *     An employee must pass ALL of the following to enter the ranked list:
 *       1. Employment Status: Regular/Permanent, Active, not Probationary
 *       2. Position Match: position-field keyword match with the critical role
 *       3. Minimum Education: meets or exceeds the position's education floor
 *       4. Eligibility Match: CSC level meets or exceeds the position's requirement
 *       5. Minimum IPCR: has a finalized IPCR at or above the position's min rating
 *       6. Minimum Training: meets the position's required hours and/or categories
 *     Employees failing even one gate go to notQualified (not shown inline).
 *
 *   Stage 2 — Weighted Scoring (gate-passers only):
 *     IPCR 35 + Training 30 + Education 20 + Eligibility 15 = 100 pts.
 *     Per-position weight overrides from critical_positions.succession_weights
 *     are applied when present.
 *
 *   Manually-added succession_candidates bypass Stage 1 gates (they are
 *   deliberate HR decisions) and are always placed in the ranked list,
 *   with gatesBypassed = true.
 */
export async function listAutoSuccessors(
  criticalPositionId: string,
): Promise<Result<AutoSuccessorsResult>> {
  try {
    // ── Fetch the critical position + all gate/scoring configuration ───────────
    const { data: posRow, error: posErr } = await supabase
      .from('critical_positions')
      .select('id, title, required_education, required_eligibility, min_ipcr_rating, required_training_hours, required_training_categories, succession_weights')
      .eq('id', criticalPositionId)
      .maybeSingle();
    if (posErr) return { ok: false, error: posErr.message };
    if (!posRow) return { ok: false, error: 'Critical position not found.' };

    const positionTitle = String(posRow.title ?? '');
    const requiredEducation: string | null = posRow.required_education ?? null;
    const requiredEligibility: string | null = posRow.required_eligibility ?? null;
    const minIpcrRating: string | null = posRow.min_ipcr_rating ?? null;
    const requiredTrainingHours: number | null = posRow.required_training_hours != null ? Number(posRow.required_training_hours) : null;
    const requiredTrainingCategories: string[] = Array.isArray(posRow.required_training_categories) ? posRow.required_training_categories : [];
    const W: SuccessionWeights = posRow.succession_weights ?? SUCCESSION_WEIGHTS;

    // ── Load all Regular/Permanent, Active employees ───────────────────────
    const { data: empRows, error: empErr } = await supabase
      .from('employees')
      .select('id, first_name, middle_name, last_name, position, department, employment_status, status, highest_educational_attainment, eligibility')
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

    // Gate 1+2: Status + position-field keyword match (pre-filter)
    const positioned = ((empRows ?? []) as any[])
      .filter((e) => String(e.employment_status ?? '').toLowerCase() !== 'probationary')
      .map((e) => ({ e, keyword: sharedFieldKeyword(String(e.position ?? ''), positionTitle) }))
      .filter(({ keyword }) => !!keyword);

    const positionedIds = positioned.map(({ e }) => String(e.id));

    // ── Bulk-fetch IPCR scores + training history for the positioned pool ────
    const [scores, { data: trainingRows }] = await Promise.all([
      getLatestOverallScores(positionedIds),
      positionedIds.length
        ? supabase
            .from('employee_training')
            .select('id, employee_id, training_title, training_type, number_of_hours, from_date')
            .in('employee_id', positionedIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    type Agg = { count: number; hours: number; latest: string | null; latestTitle: string | null; fit: number; categories: string[]; titles: string[] };
    const emptyAgg = (): Agg => ({ count: 0, hours: 0, latest: null, latestTitle: null, fit: 0, categories: [], titles: [] });
    const addTraining = (agg: Agg, t: any) => {
      agg.count += 1;
      agg.hours += Number(t.number_of_hours ?? 0);
      if (t.training_title) agg.titles.push(String(t.training_title));
      if (t.from_date && (!agg.latest || t.from_date > agg.latest)) {
        agg.latest = t.from_date;
        agg.latestTitle = t.training_title ?? null;
      }
      const cat = String(t.training_type ?? '').trim();
      if (cat && !agg.categories.includes(cat)) agg.categories.push(cat);
      if (cat === 'Leadership' || isRelevantTraining(t.training_title)) agg.fit += 1;
    };
    const trainAgg = new Map<string, Agg>();
    for (const t of (trainingRows ?? []) as any[]) {
      const id = String(t.employee_id);
      const cur = trainAgg.get(id) ?? emptyAgg();
      addTraining(cur, t);
      trainAgg.set(id, cur);
    }

    // Stage-2 required competencies for this position (drives competency match %).
    const compReqRes = await listCompetencyRequirements(criticalPositionId);
    const requiredCompetencies = compReqRes.ok
      ? compReqRes.data.map((c) => ({ id: c.competencyId, name: c.competencyName }))
      : [];

    // Real competency tags from employee_training_competencies (migration 20260828),
    // replacing the title/keyword heuristic. Map each employee → (competency_id →
    // a satisfying training title), for the whole positioned pool in one query.
    const trainingById = new Map<string, { empId: string; title: string }>();
    for (const t of (trainingRows ?? []) as any[]) {
      trainingById.set(String(t.id), { empId: String(t.employee_id), title: String(t.training_title ?? '') });
    }
    const taggedByEmp = new Map<string, Map<string, string>>();
    const allTrainingIds = [...trainingById.keys()];
    if (allTrainingIds.length) {
      const { data: tagRows } = await supabase
        .from('employee_training_competencies')
        .select('employee_training_id, competency_id')
        .in('employee_training_id', allTrainingIds);
      for (const g of (tagRows ?? []) as any[]) {
        const tr = trainingById.get(String(g.employee_training_id));
        if (!tr) continue;
        if (!taggedByEmp.has(tr.empId)) taggedByEmp.set(tr.empId, new Map());
        const m = taggedByEmp.get(tr.empId)!;
        if (!m.has(String(g.competency_id))) m.set(String(g.competency_id), tr.title);
      }
    }
    const emptyTagMap = new Map<string, string>();

    // Gap analysis / required actions / timeline from a gate-passer's missing competencies.
    const buildQualifiedGaps = (readiness: ReadinessScore) => {
      const missing = readiness.competencyBreakdown.filter((c) => !c.met);
      return {
        gapAnalysis: missing.map((c) => `Lacking training in ${c.name}`),
        requiredActions: missing.map((c) => `Attend training relevant to ${c.name}`),
        timeline: missing.length ? `${missing.length * DEFAULT_MONTHS_PER_MISSING_COMPETENCY} months` : null,
      };
    };

    // ── Stage 1: Evaluate all gates; split into passers and failures ─────────
    const qualifiedMap = new Map<string, AutoSuccessor>();
    const notQualified: GateFailure[] = [];

    for (const { e, keyword } of positioned) {
      const empId = String(e.id);
      const score = scores.get(empId);
      const agg = trainAgg.get(empId) ?? emptyAgg();
      const failedGates: string[] = [];

      // Gate 3: Education — course/field match (not a generic attainment ladder).
      if (requiredEducation) {
        const empEdu = e.highest_educational_attainment ?? null;
        if (!empEdu) {
          failedGates.push(`No education record on file — requires ${requiredEducation}`);
        } else if (!educationFieldMatches(empEdu, requiredEducation)) {
          failedGates.push(`Course mismatch — position requires ${requiredEducation}, candidate holds ${empEdu}`);
        }
      }

      // Gate 4: Eligibility Match (strict Professional vs Sub-Professional)
      if (requiredEligibility) {
        const reqLevel = requiredEligibilityLevel(requiredEligibility);
        const empLevel = eligibilityLevel(e.eligibility ?? null);
        if (reqLevel > 0 && empLevel < reqLevel) {
          const empEligLabel = e.eligibility ? `Eligibility: ${e.eligibility}` : 'No eligibility on file';
          const reqLabel = reqLevel === 2 ? 'Professional' : 'Sub-Professional';
          failedGates.push(`${empEligLabel} — requires ${reqLabel}`);
        }
      }

      // Gate 5: Minimum IPCR Rating
      if (!score) {
        failedGates.push('Missing finalized IPCR');
      } else if (minIpcrRating && ipcrRank(score.adjectival) < ipcrRank(minIpcrRating)) {
        failedGates.push(`IPCR: ${score.adjectival ?? 'Unknown'} — requires ${minIpcrRating} or higher`);
      }

      // Gate 6: Minimum Training (hours floor + category requirements)
      if (requiredTrainingHours != null && agg.hours < requiredTrainingHours) {
        failedGates.push(`Training: ${agg.hours.toFixed(0)}/${requiredTrainingHours.toFixed(0)} required hours`);
      }
      if (requiredTrainingCategories.length > 0) {
        const empCatNorm = agg.categories.map((c) => c.trim().toLowerCase());
        const missingCats = requiredTrainingCategories.filter(
          (rc) => !empCatNorm.some((ec) => ec.includes(rc.toLowerCase()) || rc.toLowerCase().includes(ec)),
        );
        if (missingCats.length > 0) {
          failedGates.push(
            `Training: missing required categor${missingCats.length === 1 ? 'y' : 'ies'}: ${missingCats.join(', ')}`,
          );
        }
      }

      if (failedGates.length > 0) {
        notQualified.push({
          employeeId: empId,
          employeeName: fullName(e),
          currentPosition: String(e.position ?? '') || null,
          department: e.department ?? null,
          failedGates,
          gapAnalysis: failedGates,
          requiredActions: [...new Set(failedGates.map(actionForGate))],
          // "Incomplete — Pending Evaluation" is distinct from "Not Qualified":
          // it means the ONLY blocker is a missing finalized IPCR (a data gap).
          pendingEvaluation: failedGates.length === 1 && failedGates[0] === 'Missing finalized IPCR',
          candidateId: null,
        });
        continue;
      }

      // ── Stage 2: Score gate-passers ─────────────────────────────────────
      const readiness = computeReadinessScore({
        ipcrScore: score?.overallScore ?? null,
        adjectival: score?.adjectival ?? null,
        ratedPeriod: score?.period ?? null,
        matchedKeyword: keyword,
        empEducation: e.highest_educational_attainment ?? null,
        requiredEducation,
        empEligibility: e.eligibility ?? null,
        requiredEligibility,
        relevantTrainings: agg.count,
        relevantTrainingHours: agg.hours,
        mostRecentTrainingDate: agg.latest,
        mostRecentTrainingTitle: agg.latestTitle,
        categoryFitTrainings: agg.fit,
        empTrainingCategories: agg.categories,
        requiredTrainingHours,
        requiredTrainingCategories,
        requiredCompetencies,
        taggedCompetencies: taggedByEmp.get(empId) ?? emptyTagMap,
        W,
      });
      qualifiedMap.set(empId, {
        employeeId: empId,
        employeeName: fullName(e),
        currentPosition: String(e.position ?? '') || null,
        department: e.department ?? null,
        readiness,
        isManuallyAdded: false,
        manualNote: null,
        candidateId: null,
        gatesBypassed: false,
        ...buildQualifiedGaps(readiness),
      });
    }

    // ── Merge manually-added candidates (bypass Stage 1 gates) ────────────
    const { data: manualRows } = await supabase
      .from('succession_candidates')
      .select('*')
      .eq('critical_position_id', criticalPositionId);

    const failureByEmpId = new Map(notQualified.map((f) => [f.employeeId, f]));

    for (const mc of (manualRows ?? []) as any[]) {
      const mcId = String(mc.employee_id);

      if (qualifiedMap.has(mcId)) {
        const existing = qualifiedMap.get(mcId)!;
        existing.candidateId = String(mc.id);
        existing.manualNote = mc.note ?? null;
        continue;
      }

      if (failureByEmpId.has(mcId)) {
        failureByEmpId.get(mcId)!.candidateId = String(mc.id);
        continue;
      }

      // Employee is outside the position-matched pool — fetch + score, bypassing gates
      const { data: mcEmp } = await supabase
        .from('employees')
        .select('id, first_name, middle_name, last_name, position, department, highest_educational_attainment, eligibility')
        .eq('id', mcId)
        .maybeSingle();
      const mcScore = scores.get(mcId) ?? (await getLatestOverallScores([mcId])).get(mcId);
      const { data: mcTrain } = await supabase
        .from('employee_training')
        .select('id, training_title, training_type, number_of_hours, from_date')
        .eq('employee_id', mcId);
      const mcAgg = emptyAgg();
      const mcTitleById = new Map<string, string>();
      for (const t of (mcTrain ?? []) as any[]) {
        addTraining(mcAgg, t);
        mcTitleById.set(String(t.id), String(t.training_title ?? ''));
      }
      const mcTagged = new Map<string, string>();
      const mcTrIds = [...mcTitleById.keys()];
      if (mcTrIds.length) {
        const { data: mcTagRows } = await supabase
          .from('employee_training_competencies')
          .select('employee_training_id, competency_id')
          .in('employee_training_id', mcTrIds);
        for (const g of (mcTagRows ?? []) as any[]) {
          if (!mcTagged.has(String(g.competency_id))) {
            mcTagged.set(String(g.competency_id), mcTitleById.get(String(g.employee_training_id)) ?? '');
          }
        }
      }

      const readiness = computeReadinessScore({
        ipcrScore: mcScore?.overallScore ?? null,
        adjectival: mcScore?.adjectival ?? null,
        ratedPeriod: mcScore?.period ?? null,
        matchedKeyword: sharedFieldKeyword(String(mcEmp?.position ?? ''), positionTitle),
        empEducation: mcEmp?.highest_educational_attainment ?? null,
        requiredEducation,
        empEligibility: mcEmp?.eligibility ?? null,
        requiredEligibility,
        relevantTrainings: mcAgg.count,
        relevantTrainingHours: mcAgg.hours,
        mostRecentTrainingDate: mcAgg.latest,
        mostRecentTrainingTitle: mcAgg.latestTitle,
        categoryFitTrainings: mcAgg.fit,
        empTrainingCategories: mcAgg.categories,
        requiredTrainingHours,
        requiredTrainingCategories,
        requiredCompetencies,
        taggedCompetencies: mcTagged,
        W,
      });
      qualifiedMap.set(mcId, {
        employeeId: mcId,
        employeeName: mcEmp ? fullName(mcEmp) : '(unknown)',
        currentPosition: String(mcEmp?.position ?? '') || null,
        department: mcEmp?.department ?? null,
        readiness,
        isManuallyAdded: true,
        manualNote: mc.note ?? null,
        candidateId: String(mc.id),
        gatesBypassed: true,
        ...buildQualifiedGaps(readiness),
      });
    }

    const qualifiedList = [...qualifiedMap.values()].sort((a, b) => {
      // Rank by competency match % (Part 5); IPCR numeric is the tiebreaker.
      const am = a.readiness.competencyMatchPct;
      const bm = b.readiness.competencyMatchPct;
      if (am != null && bm != null && bm !== am) return bm - am;
      if (b.readiness.total !== a.readiness.total) return b.readiness.total - a.readiness.total;
      if (b.readiness.ipcr !== a.readiness.ipcr) return b.readiness.ipcr - a.readiness.ipcr;
      return a.employeeName.localeCompare(b.employeeName);
    });

    notQualified.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    return { ok: true, data: { qualified: qualifiedList, notQualified } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load auto-successors.' };
  }
}
