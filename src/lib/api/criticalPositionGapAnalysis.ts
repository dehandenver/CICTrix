// ============================================================================
// Qualification Gap Analysis (Critical Position, Submodule 2).
// ============================================================================
// Compares one employee's on-file qualifications against one critical
// position's configured requirements. Every comparison degrades to "not on
// record" rather than inventing data — a requirement the office never
// configured is simply absent from the comparison, never counted as a gap.
//
// Reuses existing readers rather than re-deriving anything:
//   - getEmployeeById (employees.ts)      — education/experience/eligibility/training/documents in one call
//   - getLatestOverallScores (succession.ts) — the same live IPCR roll-up the Succession Planning page uses
//   - educationRank (qualificationMatch.ts)  — the existing education ladder
// ============================================================================

import { supabase as supabaseClient } from '../supabase';
import { getEmployeeById } from './employees';
import {
  getLatestOverallScores,
  listCompetencyRequirements,
  listTrainingRequirements,
  type CriticalPosition,
  type CompetencyRequirement,
  type TrainingRequirement,
} from './succession';
import { educationRank } from '../qualificationMatch';

const supabase = supabaseClient as any;

const IPCR_RANK: Record<string, number> = {
  Poor: 1,
  Unsatisfactory: 2,
  Satisfactory: 3,
  'Very Satisfactory': 4,
  Outstanding: 5,
};

export interface EmployeeQualificationProfile {
  employeeId: string;
  fullName: string;
  currentPosition: string | null;
  department: string | null;
  educationAttainment: string | null;
  educationRank: number;
  eligibility: string | null;
  yearsOfExperience: number;
  overallScore: number | null;
  adjectival: string | null;
  ratedPeriod: string | null;
  completedTrainings: { title: string; type: string | null; hours: number | null; fromDate: string | null }[];
  assessedCompetencies: { competencyId: string; name: string; proficiencyLevel: number }[];
  certificationDocuments: { documentType: string; fileUrl: string | null; uploadedAt: string | null }[];
}

export interface PositionRequirements {
  position: CriticalPosition;
  competencyRequirements: CompetencyRequirement[];
  trainingRequirements: TrainingRequirement[];
}

export type GapKind = 'education' | 'eligibility' | 'experience' | 'ipcr' | 'competency' | 'training' | 'certification';

export interface RequirementRow {
  kind: GapKind;
  label: string;
  /** What the position requires, human-readable. */
  requirement: string;
  /** What the employee currently has, in the same terms. */
  employeeHas: string;
  /** null = informational only (certifications: no automated name-matching). */
  satisfied: boolean | null;
}

export interface GapAnalysisResult {
  rows: RequirementRow[];
  gaps: RequirementRow[];
  met: RequirementRow[];
  informational: RequirementRow[];
  recommendations: string[];
}

/** Whole months between two dates, floored at 0 — mirrors employeeApplicationProfile.ts's monthsBetween. */
function monthsBetween(from: string, to: string | null, isPresent: boolean): number {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return 0;
  const end = isPresent || !to ? new Date() : new Date(to);
  if (Number.isNaN(end.getTime())) return 0;
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(0, months);
}

/**
 * Years of relevant experience, computed live from employee_work_experience
 * (summed durations). Falls back to tenure since date_hired when no work
 * experience rows are on file — no stored value exists for this today.
 */
function computeYearsOfExperience(experienceRows: any[], hireDate: string | null): number {
  let totalMonths = (experienceRows ?? []).reduce(
    (sum, row) =>
      sum + monthsBetween(String(row?.from_date ?? ''), row?.to_date ? String(row.to_date) : null, Boolean(row?.is_present)),
    0,
  );
  if (totalMonths === 0 && hireDate) {
    totalMonths = monthsBetween(String(hireDate), null, true);
  }
  return Number((totalMonths / 12).toFixed(1));
}

/**
 * Full qualification profile for one employee. Reads employees.
 * highest_educational_attainment / eligibility from the base `employees`
 * table directly (not the employees_with_department view) — the view's
 * exact column set has drifted across the two historical employee schemas
 * in this codebase, but the base table is guaranteed to have both columns
 * (added by backend migration 022), matching the same base-table read
 * src/lib/api/employeeApplicationProfile.ts already relies on.
 */
export async function getEmployeeQualificationProfile(
  employeeId: string,
): Promise<EmployeeQualificationProfile | null> {
  const res = await getEmployeeById(employeeId);
  if (!res.success || !res.data) return null;
  const e = res.data as any;

  const [{ data: baseRow }, { data: assessed }, scores] = await Promise.all([
    supabase.from('employees').select('highest_educational_attainment, eligibility, date_hired').eq('id', employeeId).maybeSingle(),
    supabase.from('employee_competencies').select('competency_id, proficiency_level, competencies ( name )').eq('employee_id', employeeId),
    getLatestOverallScores([employeeId]),
  ]);
  const score = scores.get(employeeId);

  const educationAttainment = String(baseRow?.highest_educational_attainment ?? '').trim() || null;
  const eligibility = String(baseRow?.eligibility ?? '').trim() || null;
  const hireDate = baseRow?.date_hired ?? e.hire_date ?? null;

  return {
    employeeId,
    fullName: String(e.full_name ?? '').trim(),
    currentPosition: e.current_position ?? null,
    department: e.department ?? null,
    educationAttainment,
    educationRank: educationRank(educationAttainment),
    eligibility,
    yearsOfExperience: computeYearsOfExperience(e.experience ?? [], hireDate),
    overallScore: score?.overallScore ?? null,
    adjectival: score?.adjectival ?? null,
    ratedPeriod: score?.period ?? null,
    completedTrainings: (e.training ?? []).map((t: any) => ({
      title: String(t.training_title ?? ''),
      type: t.training_type ?? null,
      hours: t.number_of_hours ?? null,
      fromDate: t.from_date ?? null,
    })),
    assessedCompetencies: (assessed ?? []).map((a: any) => ({
      competencyId: String(a.competency_id),
      name: a.competencies?.name ?? 'Unknown',
      proficiencyLevel: Number(a.proficiency_level),
    })),
    certificationDocuments: (e.documents ?? [])
      .filter((d: any) => d.document_type === 'License' || d.document_type === 'Certificate of Training')
      .map((d: any) => ({
        documentType: String(d.document_type),
        fileUrl: d.file_url ?? null,
        uploadedAt: d.uploaded_at ?? null,
      })),
  };
}

export interface QualificationSummary {
  educationAttainment: string | null;
  eligibility: string | null;
  yearsOfExperience: number;
  adjectival: string | null;
}

/**
 * Bulk qualification summary for the Gap Analysis filter bar (department,
 * education, eligibility, experience, IPCR rating) — three bulk round trips
 * instead of one profile fetch per employee, so filtering a whole roster
 * stays cheap at the office-sized volumes this module targets.
 */
export async function getQualificationSummaries(employeeIds: string[]): Promise<Map<string, QualificationSummary>> {
  const ids = [...new Set(employeeIds)].filter(Boolean);
  const result = new Map<string, QualificationSummary>();
  if (!ids.length) return result;

  const [{ data: baseRows }, { data: experienceRows }, scores] = await Promise.all([
    supabase.from('employees').select('id, highest_educational_attainment, eligibility, date_hired').in('id', ids),
    supabase.from('employee_work_experience').select('employee_id, from_date, to_date, is_present').in('employee_id', ids),
    getLatestOverallScores(ids),
  ]);

  const experienceByEmployee = new Map<string, any[]>();
  for (const row of (experienceRows ?? []) as any[]) {
    const key = String(row.employee_id);
    const list = experienceByEmployee.get(key) ?? [];
    list.push(row);
    experienceByEmployee.set(key, list);
  }

  for (const row of (baseRows ?? []) as any[]) {
    const id = String(row.id);
    result.set(id, {
      educationAttainment: String(row.highest_educational_attainment ?? '').trim() || null,
      eligibility: String(row.eligibility ?? '').trim() || null,
      yearsOfExperience: computeYearsOfExperience(experienceByEmployee.get(id) ?? [], row.date_hired ?? null),
      adjectival: scores.get(id)?.adjectival ?? null,
    });
  }
  return result;
}

/** A critical position's full requirements: scalars + competency/training rows. */
export async function getPositionRequirements(
  criticalPositionId: string,
  position: CriticalPosition,
): Promise<PositionRequirements> {
  const [compRes, trainRes] = await Promise.all([
    listCompetencyRequirements(criticalPositionId),
    listTrainingRequirements(criticalPositionId),
  ]);
  return {
    position,
    competencyRequirements: compRes.ok ? compRes.data : [],
    trainingRequirements: trainRes.ok ? trainRes.data : [],
  };
}

/** Pure comparison — no fetching. Recommendations are derived only from `gaps`. */
export function compareQualifications(
  profile: EmployeeQualificationProfile,
  reqs: PositionRequirements,
): GapAnalysisResult {
  const rows: RequirementRow[] = [];
  const { position } = reqs;

  if (position.requiredEducation) {
    const reqRank = educationRank(position.requiredEducation);
    rows.push({
      kind: 'education',
      label: 'Educational attainment',
      requirement: position.requiredEducation,
      employeeHas: profile.educationAttainment ?? 'Not on record',
      satisfied: profile.educationRank > 0 && profile.educationRank >= reqRank,
    });
  }

  if (position.requiredEligibility) {
    rows.push({
      kind: 'eligibility',
      label: 'Eligibility',
      requirement: position.requiredEligibility,
      employeeHas: profile.eligibility ?? 'Not on record',
      satisfied:
        !!profile.eligibility &&
        profile.eligibility.trim().toLowerCase() === position.requiredEligibility.trim().toLowerCase(),
    });
  }

  if (position.minYearsExperience != null) {
    rows.push({
      kind: 'experience',
      label: 'Years of relevant experience',
      requirement: `${position.minYearsExperience} year(s)`,
      employeeHas: `${profile.yearsOfExperience} year(s)`,
      satisfied: profile.yearsOfExperience >= position.minYearsExperience,
    });
  }

  if (position.minIpcrRating) {
    rows.push({
      kind: 'ipcr',
      label: 'IPCR performance rating',
      requirement: position.minIpcrRating,
      employeeHas: profile.adjectival ?? 'Not yet rated',
      satisfied: !!profile.adjectival && IPCR_RANK[profile.adjectival] >= IPCR_RANK[position.minIpcrRating],
    });
  }

  for (const cr of reqs.competencyRequirements) {
    const have = profile.assessedCompetencies.find((a) => a.competencyId === cr.competencyId);
    rows.push({
      kind: 'competency',
      label: cr.competencyName,
      requirement: `Level ${cr.requiredLevel}`,
      employeeHas: have ? `Level ${have.proficiencyLevel}` : 'Not assessed',
      satisfied: !!have && have.proficiencyLevel >= cr.requiredLevel,
    });
  }

  for (const tr of reqs.trainingRequirements) {
    const have = profile.completedTrainings.some(
      (t) => t.title.trim().toLowerCase() === tr.trainingTitle.trim().toLowerCase(),
    );
    rows.push({
      kind: 'training',
      label: tr.trainingTitle,
      requirement: 'Completed',
      employeeHas: have ? 'Completed' : 'Not on record',
      satisfied: have,
    });
  }

  for (const cert of position.requiredCertifications) {
    rows.push({
      kind: 'certification',
      label: cert,
      requirement: cert,
      employeeHas: profile.certificationDocuments.length
        ? profile.certificationDocuments.map((d) => d.documentType).join(', ')
        : 'No certification documents on record',
      satisfied: null, // informational only — no structured cert name to match on
    });
  }

  const gaps = rows.filter((r) => r.satisfied === false);
  const met = rows.filter((r) => r.satisfied === true);
  const informational = rows.filter((r) => r.satisfied === null);

  const recommendations = gaps.map((g) => {
    switch (g.kind) {
      case 'education':
        return `Pursue further education to reach "${g.requirement}" (currently: ${g.employeeHas}).`;
      case 'eligibility':
        return `Obtain eligibility: ${g.requirement}.`;
      case 'experience':
        return `Needs ${g.requirement} of relevant experience (currently ${g.employeeHas}).`;
      case 'ipcr':
        return `Needs to sustain an IPCR rating of at least ${g.requirement} (currently ${g.employeeHas}).`;
      case 'competency':
        return `Improve "${g.label}" from ${g.employeeHas} to ${g.requirement}.`;
      case 'training':
        return `Complete required training: ${g.label}.`;
      default:
        return `Address gap: ${g.label}.`;
    }
  });

  return { rows, gaps, met, informational, recommendations };
}
