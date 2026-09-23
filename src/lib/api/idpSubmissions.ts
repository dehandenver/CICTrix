/**
 * IDP submissions — reading and writing one employee's questionnaire.
 *
 * The form runs once a year, so a submission is keyed by (employee, cycle year)
 * rather than by date. Re-opening a window lets an employee revise the row they
 * already filed instead of creating a second one for the same cycle.
 */

import { supabase as supabaseClient } from '../supabase';
import type { CareerNeed, PersonalGoal } from '../idpQuestionnaire';

const supabase = supabaseClient as any;

export interface IdpSubmission {
  id?: string;
  employeeId: string;
  cycleYear: number;

  // Personal data
  fullName: string;
  office: string;
  division: string;
  position: string;
  salaryGrade: string;
  yearsInPosition: string;
  yearsGovernmentService: string;
  eligibility: string;
  educationalAttainment: string;
  age: string;
  gender: string;
  email: string;

  // Self-evaluation
  skillsToDevelop: string;
  strengthsToUtilize: string;
  /** null until answered — the Part III question hangs off this. */
  worksOutsideJobDescription: boolean | null;
  outsideTasks: string;

  // Career development
  careerNeeds: CareerNeed[] | string[];
  careerOther: string;
  careerSpecifics: string;

  // Personal development
  personalGoals: PersonalGoal[] | string[];
  personalOther: string;
  personalSpecifics: string;

  // Recommendation
  otherTopics: string;

  submittedAt?: string | null;
}

export type IdpSubmissionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** The cycle a given date falls in. Extracted so the rule has one home. */
export const cycleYearFor = (on: Date = new Date()): number => on.getFullYear();

export const emptySubmission = (employeeId: string, cycleYear: number): IdpSubmission => ({
  employeeId,
  cycleYear,
  fullName: '',
  office: '',
  division: '',
  position: '',
  salaryGrade: '',
  yearsInPosition: '',
  yearsGovernmentService: '',
  eligibility: '',
  educationalAttainment: '',
  age: '',
  gender: '',
  email: '',
  skillsToDevelop: '',
  strengthsToUtilize: '',
  worksOutsideJobDescription: null,
  outsideTasks: '',
  careerNeeds: [],
  careerOther: '',
  careerSpecifics: '',
  personalGoals: [],
  personalOther: '',
  personalSpecifics: '',
  otherTopics: '',
  submittedAt: null,
});

function mapRow(row: any): IdpSubmission {
  return {
    id: row.id,
    employeeId: row.employee_id ?? '',
    cycleYear: row.cycle_year,
    fullName: row.full_name ?? '',
    office: row.office ?? '',
    division: row.division ?? '',
    position: row.position ?? '',
    salaryGrade: row.salary_grade ?? '',
    yearsInPosition: row.years_in_position ?? '',
    yearsGovernmentService: row.years_government_service ?? '',
    eligibility: row.eligibility ?? '',
    educationalAttainment: row.educational_attainment ?? '',
    age: row.age ?? '',
    gender: row.gender ?? '',
    email: row.email ?? '',
    skillsToDevelop: row.skills_to_develop ?? '',
    strengthsToUtilize: row.strengths_to_utilize ?? '',
    worksOutsideJobDescription:
      row.works_outside_job_description === null || row.works_outside_job_description === undefined
        ? null
        : Boolean(row.works_outside_job_description),
    outsideTasks: row.outside_tasks ?? '',
    careerNeeds: row.career_needs ?? [],
    careerOther: row.career_other ?? '',
    careerSpecifics: row.career_specifics ?? '',
    personalGoals: row.personal_goals ?? [],
    personalOther: row.personal_other ?? '',
    personalSpecifics: row.personal_specifics ?? '',
    otherTopics: row.other_topics ?? '',
    submittedAt: row.submitted_at ?? null,
  };
}

function toRow(s: IdpSubmission, submitting: boolean) {
  return {
    employee_id: s.employeeId,
    cycle_year: s.cycleYear,
    full_name: s.fullName?.trim() || null,
    office: s.office?.trim() || null,
    division: s.division?.trim() || null,
    position: s.position?.trim() || null,
    salary_grade: s.salaryGrade?.trim() || null,
    years_in_position: s.yearsInPosition?.trim() || null,
    years_government_service: s.yearsGovernmentService?.trim() || null,
    eligibility: s.eligibility?.trim() || null,
    educational_attainment: s.educationalAttainment?.trim() || null,
    age: s.age?.trim() || null,
    gender: s.gender?.trim() || null,
    email: s.email?.trim() || null,
    skills_to_develop: s.skillsToDevelop?.trim() || null,
    strengths_to_utilize: s.strengthsToUtilize?.trim() || null,
    works_outside_job_description: s.worksOutsideJobDescription,
    // Part III only applies when the answer above is YES; clearing it otherwise
    // stops a stale answer surviving a change of mind.
    outside_tasks: s.worksOutsideJobDescription ? s.outsideTasks?.trim() || null : null,
    career_needs: s.careerNeeds ?? [],
    career_other: s.careerOther?.trim() || null,
    career_specifics: s.careerSpecifics?.trim() || null,
    personal_goals: s.personalGoals ?? [],
    personal_other: s.personalOther?.trim() || null,
    personal_specifics: s.personalSpecifics?.trim() || null,
    other_topics: s.otherTopics?.trim() || null,
    // A draft keeps submitted_at null so the report and the tracker count only
    // what was actually filed.
    submitted_at: submitting ? new Date().toISOString() : s.submittedAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

/** This employee's submission for a cycle, or null when they have not started. */
export async function getMySubmission(
  employeeId: string,
  cycleYear: number,
): Promise<IdpSubmissionResult<IdpSubmission | null>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('idp_submissions')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('cycle_year', cycleYear)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, data: data ? mapRow(data) : null };
  } catch (err: any) {
    console.error('[idpSubmissions] getMySubmission error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load your IDP.' };
  }
}

/**
 * Save a draft (`submitting: false`) or file the form (`submitting: true`).
 *
 * Upsert on (employee_id, cycle_year) so a revision during an open window
 * replaces the row rather than adding another for the same cycle.
 */
export async function saveSubmission(
  submission: IdpSubmission,
  submitting: boolean,
): Promise<IdpSubmissionResult<IdpSubmission>> {
  if (!submission.employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('idp_submissions')
      .upsert(toRow(submission, submitting), { onConflict: 'employee_id,cycle_year' })
      .select()
      .single();
    if (error) throw error;
    return { ok: true, data: mapRow(data) };
  } catch (err: any) {
    console.error('[idpSubmissions] saveSubmission error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save your IDP.' };
  }
}

/** Every filed submission for a cycle — the L&D tracker and report read this. */
export async function listSubmissions(
  cycleYear: number,
): Promise<IdpSubmissionResult<IdpSubmission[]>> {
  try {
    const { data, error } = await supabase
      .from('idp_submissions')
      .select('*')
      .eq('cycle_year', cycleYear)
      .not('submitted_at', 'is', null)
      .order('office', { ascending: true });
    if (error) throw error;
    return { ok: true, data: (data ?? []).map(mapRow) };
  } catch (err: any) {
    console.error('[idpSubmissions] listSubmissions error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load IDP submissions.' };
  }
}

/**
 * Which required questions are still unanswered.
 *
 * Returned as a list rather than a boolean so the page can point at the fields
 * instead of refusing to submit without saying why. Mirrors the asterisks on
 * the printed form; Part III counts only when the preceding answer is YES.
 */
export function missingRequired(s: IdpSubmission): string[] {
  const missing: string[] = [];
  const need = (value: string, label: string) => {
    if (!value?.trim()) missing.push(label);
  };

  need(s.fullName, 'Full Name');
  need(s.office, 'Office');
  need(s.division, 'Division');
  need(s.position, 'Position');
  need(s.salaryGrade, 'Salary Grade');
  need(s.yearsInPosition, 'Years in Position');
  need(s.yearsGovernmentService, "Year's Gov't Service");
  need(s.eligibility, 'Eligibility');
  need(s.educationalAttainment, 'Educational Attainment');
  need(s.age, 'Age');
  need(s.gender, 'Gender');
  need(s.email, 'Email Address');
  need(s.skillsToDevelop, 'Skills or knowledge to develop');
  need(s.strengthsToUtilize, 'Strengths you would like to utilise');

  if (s.worksOutsideJobDescription === null) {
    missing.push('Are you performing work tasks outside your job description?');
  } else if (s.worksOutsideJobDescription) {
    need(s.outsideTasks, 'If yes, what are those tasks?');
  }

  return missing;
}
