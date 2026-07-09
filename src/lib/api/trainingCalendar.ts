import { supabase as supabaseClient } from '../supabase';
import type { TrainingCategory } from '../../modules/admin/trainingCategories';

const supabase = supabaseClient as any;

export type CalendarEventStatus = 'Scheduled' | 'Ongoing' | 'Completed' | 'Cancelled';
export type AttendanceStatus = 'Present' | 'Absent' | 'Excused';
export type EnrollmentStatus = 'Confirmed' | 'Pending';

export type CalendarAttendee = {
  enrollmentId: string;
  employeeId: string;
  name: string;
  position: string;
  department: string;
  enrollmentStatus: EnrollmentStatus;
  attendanceStatus: AttendanceStatus | null;
};

export type CalendarEvent = {
  id: string;
  title: string;
  category: string | null;
  /** ISO timestamp of the first day. */
  startDate: string;
  /** ISO timestamp of the last day; null for single-day events. */
  endDate: string | null;
  speaker: string | null;
  location: string | null;
  objectives: string[];
  status: CalendarEventStatus;
  capacity: number;
  /**
   * Null until Seminar Enrollment finalizes the roster. The calendar uses this
   * to distinguish "no attendees yet" from "enrollment hasn't happened".
   */
  rosterFinalizedAt: string | null;
  attendees: CalendarAttendee[];
};

type EventRow = {
  id: string;
  title: string;
  category: string | null;
  scheduled_date: string;
  end_date: string | null;
  instructor_name: string | null;
  location: string | null;
  objectives: string[] | null;
  status: CalendarEventStatus;
  capacity: number | null;
  roster_finalized_at: string | null;
  training_enrollments?: EnrollmentRow[];
};

type EnrollmentRow = {
  id: string;
  employee_id: string;
  enrollment_status: EnrollmentStatus;
  attendance_status: AttendanceStatus | null;
  employees?: {
    first_name: string | null;
    last_name: string | null;
    position: string | null;
    department: string | null;
  } | null;
};

const EVENT_SELECT = `
  id, title, category, scheduled_date, end_date, instructor_name, location,
  objectives, status, capacity, roster_finalized_at,
  training_enrollments (
    id, employee_id, enrollment_status, attendance_status,
    employees ( first_name, last_name, position, department )
  )
`;

const mapAttendee = (row: EnrollmentRow): CalendarAttendee => {
  const name = [row.employees?.first_name, row.employees?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    enrollmentId: row.id,
    employeeId: row.employee_id,
    name: name || 'Unknown employee',
    position: row.employees?.position ?? '—',
    department: row.employees?.department ?? '—',
    enrollmentStatus: row.enrollment_status,
    attendanceStatus: row.attendance_status,
  };
};

const mapEvent = (row: EventRow): CalendarEvent => ({
  id: row.id,
  title: row.title,
  category: row.category,
  startDate: row.scheduled_date,
  endDate: row.end_date,
  speaker: row.instructor_name,
  location: row.location,
  objectives: row.objectives ?? [],
  status: row.status,
  capacity: row.capacity ?? 0,
  rosterFinalizedAt: row.roster_finalized_at,
  attendees: (row.training_enrollments ?? [])
    .map(mapAttendee)
    .sort((a, b) => a.name.localeCompare(b.name)),
});

/**
 * All training events overlapping the given calendar year, with their rosters.
 *
 * An event counts as in-year if any part of it falls inside the year, so a
 * training running Dec 30 – Jan 2 appears on both years' calendars.
 */
export async function listCalendarEvents(year: number): Promise<CalendarEvent[]> {
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const { data, error } = await supabase
    .from('training_sessions')
    .select(EVENT_SELECT)
    // Starts before the year ends, AND (ends after the year starts OR is a
    // single-day event that starts within the year).
    .lt('scheduled_date', yearEnd)
    .or(`end_date.gte.${yearStart},and(end_date.is.null,scheduled_date.gte.${yearStart})`)
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('Error fetching calendar events:', error);
    return [];
  }

  return (data ?? []).map(mapEvent);
}

/**
 * Flat rather than a discriminated union: the project compiles with
 * `strict: false`, so TS cannot narrow `{ok:true} | {ok:false;error}` on `!ok`.
 * Matches the shape used by the other api/ modules.
 */
export type MutationResult = { ok: boolean; error?: string };

export type CalendarEventInput = {
  title: string;
  category: TrainingCategory;
  /** ISO timestamp. */
  startDate: string;
  /** ISO timestamp, or null for a single-day event. */
  endDate: string | null;
  speaker: string;
  location: string;
  objectives: string[];
  status: CalendarEventStatus;
  capacity?: number;
};

const toRow = (input: CalendarEventInput) => ({
  title: input.title,
  category: input.category,
  scheduled_date: input.startDate,
  end_date: input.endDate,
  instructor_name: input.speaker || null,
  location: input.location || null,
  // Drop blank bullets so an empty textarea line never becomes an objective.
  objectives: input.objectives.map((o) => o.trim()).filter(Boolean),
  status: input.status,
  capacity: input.capacity ?? 0,
});

/**
 * Create a training directly on the calendar. Used for events that don't need
 * enrollment (e.g. a mandatory all-staff session), so program_id stays null.
 */
export async function createCalendarEvent(
  input: CalendarEventInput
): Promise<MutationResult & { id?: string }> {
  const { data, error } = await supabase
    .from('training_sessions')
    .insert([{ ...toRow(input), program_id: null }])
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function updateCalendarEvent(
  id: string,
  input: CalendarEventInput
): Promise<MutationResult> {
  const { error } = await supabase.from('training_sessions').update(toRow(input)).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Cancelling preserves the event and its roster; it is not a delete. */
export async function cancelCalendarEvent(id: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_sessions')
    .update({ status: 'Cancelled' })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Mark one attendee present/absent/excused. This is the only roster mutation the
 * calendar is allowed to make — adding and removing attendees happens upstream in
 * Seminar Enrollment, so there is exactly one place attendee lists get edited.
 */
export async function setAttendance(
  enrollmentId: string,
  attendance: AttendanceStatus | null
): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_enrollments')
    .update({ attendance_status: attendance })
    .eq('id', enrollmentId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
