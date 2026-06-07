// Helpers for the Qualified Applicants "Pending Assignment" subtab:
//  - persisting an applicant's exam/interview schedule + assigned interviewer
//  - fetching the list of active raters to pick from
//
// Schema columns added by migration 007_applicant_schedule_columns.sql:
//   exam_date, exam_time, interview_date, interview_time,
//   assigned_interviewer_email

import { supabase } from './supabase';

export interface ApplicantAssignmentFields {
  exam_date: string | null;
  exam_time: string | null;
  interview_date: string | null;
  interview_time: string | null;
  assigned_interviewer_email: string | null;
}

export interface InterviewerOption {
  email: string;
  name: string;
  designation: string;
}

const ASSIGNMENT_KEYS: (keyof ApplicantAssignmentFields)[] = [
  'exam_date',
  'exam_time',
  'interview_date',
  'interview_time',
  'assigned_interviewer_email',
];

/** True iff every assignment field is set — drives the progression rule
 *  from subtab 2 (Pending) to subtab 3 (Scheduled / For Interview). */
export const isApplicantFullyAssigned = (a: Partial<ApplicantAssignmentFields>): boolean =>
  ASSIGNMENT_KEYS.every((k) => {
    const v = a[k];
    return typeof v === 'string' && v.trim().length > 0;
  });

export async function saveApplicantAssignment(
  applicantId: string,
  fields: ApplicantAssignmentFields,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!applicantId) {
    return { success: false, error: 'Missing applicant id.' };
  }

  const payload = {
    exam_date: fields.exam_date || null,
    exam_time: fields.exam_time || null,
    interview_date: fields.interview_date || null,
    interview_time: fields.interview_time || null,
    assigned_interviewer_email: fields.assigned_interviewer_email || null,
  };

  const { error } = await (supabase as any)
    .from('applicants')
    .update(payload)
    .eq('id', applicantId);

  if (error) {
    console.error('[saveApplicantAssignment] update failed:', error);
    return { success: false, error: error.message ?? 'Could not save assignment.' };
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
  }

  return { success: true };
}

export async function fetchActiveInterviewers(): Promise<InterviewerOption[]> {
  const { data, error } = await (supabase as any)
    .from('raters')
    .select('name, email, designation, is_active')
    .order('name', { ascending: true });

  if (error) {
    console.error('[fetchActiveInterviewers] fetch failed:', error);
    return [];
  }

  const rows = Array.isArray(data) ? data : [];
  return rows
    .filter((r: any) => Boolean(r?.is_active) && typeof r?.email === 'string' && r.email.trim())
    .map((r: any) => ({
      email: String(r.email).trim(),
      name: String(r.name ?? r.email ?? 'Interviewer').trim(),
      designation: String(r.designation ?? '').trim(),
    }));
}
