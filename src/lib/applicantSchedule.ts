// Helpers for the Qualified Applicants "Pending Assignment" subtab:
//  - persisting an applicant's exam/interview schedule + assigned interviewer
//  - fetching the list of active raters to pick from
//
// Schema columns added by migration 007_applicant_schedule_columns.sql:
//   exam_date, exam_time, interview_date, interview_time,
//   assigned_interviewer_email

import { supabase } from './supabase';

const SCHEDULE_CACHE_KEY = 'cictrix_applicant_schedules';

type ScheduleCache = Record<string, ApplicantAssignmentFields>;

const loadScheduleCache = (): ScheduleCache => {
  try { return JSON.parse(localStorage.getItem(SCHEDULE_CACHE_KEY) ?? '{}'); } catch { return {}; }
};

const writeScheduleCache = (cache: ScheduleCache) => {
  try { localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(cache)); } catch { /* best-effort */ }
};

/** Returns the locally cached schedule for a given applicant id, or null. */
export const getLocalSchedule = (applicantId: string): ApplicantAssignmentFields | null =>
  loadScheduleCache()[applicantId] ?? null;

/** Merges all locally cached schedules into an applicant list, filling null
 *  schedule fields that Supabase did not return (e.g. migration not yet run). */
export const mergeLocalSchedules = <T extends { id: string } & Partial<ApplicantAssignmentFields>>(
  applicants: T[],
): T[] => {
  const cache = loadScheduleCache();
  return applicants.map((a) => {
    const cached = cache[a.id];
    if (!cached) return a;
    return {
      ...a,
      exam_date:                  a.exam_date                  ?? cached.exam_date,
      exam_time:                  a.exam_time                  ?? cached.exam_time,
      interview_date:             a.interview_date             ?? cached.interview_date,
      interview_time:             a.interview_time             ?? cached.interview_time,
      assigned_interviewer_email: a.assigned_interviewer_email ?? cached.assigned_interviewer_email,
      oral_exam_date:             (a as any).oral_exam_date    ?? cached.oral_exam_date,
      oral_exam_time:             (a as any).oral_exam_time    ?? cached.oral_exam_time,
      venue:                      (a as any).venue             ?? cached.venue,
      schedule_instructions:      (a as any).schedule_instructions ?? cached.schedule_instructions,
    };
  });
};

export interface ApplicantAssignmentFields {
  exam_date: string | null;
  exam_time: string | null;
  interview_date: string | null;
  interview_time: string | null;
  assigned_interviewer_email: string | null;
  // Spec §7 additions (migration adds the four columns below).
  oral_exam_date?: string | null;
  oral_exam_time?: string | null;
  venue?: string | null;
  schedule_instructions?: string | null;
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
    oral_exam_date: fields.oral_exam_date || null,
    oral_exam_time: fields.oral_exam_time || null,
    venue: fields.venue || null,
    schedule_instructions: fields.schedule_instructions || null,
  };

  const { error } = await (supabase as any)
    .from('applicants')
    .update(payload)
    .eq('id', applicantId);

  if (error) {
    console.error('[saveApplicantAssignment] update failed:', error);
    return { success: false, error: error.message ?? 'Could not save assignment.' };
  }

  // Mirror to localStorage so Applicant Score can read schedule data even if
  // the Supabase columns aren't yet in the DB (migration pending).
  const cache = loadScheduleCache();
  cache[applicantId] = {
    exam_date: payload.exam_date,
    exam_time: payload.exam_time,
    interview_date: payload.interview_date,
    interview_time: payload.interview_time,
    assigned_interviewer_email: payload.assigned_interviewer_email,
    oral_exam_date: payload.oral_exam_date,
    oral_exam_time: payload.oral_exam_time,
    venue: payload.venue,
    schedule_instructions: payload.schedule_instructions,
  };
  writeScheduleCache(cache);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
  }

  return { success: true };
}

export async function fetchActiveInterviewers(): Promise<InterviewerOption[]> {
  const { data, error } = await (supabase as any)
    .from('raters')
    .select('name, email, is_active')
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
