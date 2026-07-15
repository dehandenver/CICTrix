import { supabase as supabaseClient } from '../supabase';
import type { TrainingCategory } from '../../modules/admin/trainingCategories';
import { COMPETENCIES } from '../../constants/positions';

const supabase = supabaseClient as any;

const COMPETENCY_SET = new Set<string>(COMPETENCIES as readonly string[]);

/**
 * A course's competency lives inside the `objectives` text[] as a
 * "Competency: <name>" line (there is no competency column — see the seeders).
 * Parse it and validate against the 12 canonical competencies. Returns null when
 * absent or not one of the 12.
 */
export const competencyFromObjectives = (objectives: string[] | null | undefined): string | null => {
  for (const line of objectives ?? []) {
    if (typeof line === 'string' && line.startsWith('Competency: ')) {
      const value = line.slice('Competency: '.length).trim();
      if (COMPETENCY_SET.has(value)) return value;
    }
  }
  return null;
};

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
  /** One of the 12 canonical competencies (the recommendation join key), or null. */
  competency: string | null;
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
};

/** Resolved identity, keyed by employee_id, from employees_with_department. */
type EmployeeIdentity = { name: string; position: string; department: string };

// The base `employees` table blocks anon SELECT (RLS gated on a role claim no
// anon user carries) and has column-name drift, so a PostgREST embed of it comes
// back null — which is why every attendee used to render "Unknown employee".
// Identity is resolved separately against the anon-readable, normalised
// `employees_with_department` view instead (the same pattern succession.ts uses).
// competency is NOT a column — it's derived from the objectives text[] (see
// competencyFromObjectives), so the select never has to know about it.
const EVENT_SELECT = `
  id, title, category, scheduled_date, end_date, instructor_name, location,
  objectives, status, capacity, roster_finalized_at,
  training_enrollments (
    id, employee_id, enrollment_status, attendance_status
  )
`;

const mapAttendee = (
  row: EnrollmentRow,
  identities: Map<string, EmployeeIdentity>,
): CalendarAttendee => {
  const identity = identities.get(String(row.employee_id));
  return {
    enrollmentId: row.id,
    employeeId: row.employee_id,
    name: identity?.name || 'Unknown employee',
    position: identity?.position || '—',
    department: identity?.department || '—',
    enrollmentStatus: row.enrollment_status,
    attendanceStatus: row.attendance_status,
  };
};

const mapEvent = (row: EventRow, identities: Map<string, EmployeeIdentity>): CalendarEvent => ({
  id: row.id,
  title: row.title,
  category: row.category,
  competency: competencyFromObjectives(row.objectives),
  startDate: row.scheduled_date,
  endDate: row.end_date,
  speaker: row.instructor_name,
  location: row.location,
  objectives: row.objectives ?? [],
  status: row.status,
  capacity: row.capacity ?? 0,
  rosterFinalizedAt: row.roster_finalized_at,
  attendees: (row.training_enrollments ?? [])
    .map((e) => mapAttendee(e, identities))
    .sort((a, b) => a.name.localeCompare(b.name)),
});

/** Resolve enrolled employees' names/positions/departments in one round-trip. */
async function resolveIdentities(rows: EventRow[]): Promise<Map<string, EmployeeIdentity>> {
  const ids = [
    ...new Set(
      rows
        .flatMap((r) => r.training_enrollments ?? [])
        .map((e) => String(e.employee_id))
        .filter(Boolean),
    ),
  ];
  const map = new Map<string, EmployeeIdentity>();
  if (!ids.length) return map;

  const { data, error } = await supabase
    .from('employees_with_department')
    .select('id, full_name, current_position, department')
    .in('id', ids);
  if (error) {
    console.error('Error resolving attendee identities:', error);
    return map;
  }
  for (const e of (data ?? []) as any[]) {
    map.set(String(e.id), {
      name: String(e.full_name ?? '').trim(),
      position: e.current_position ?? '—',
      department: e.department ?? '—',
    });
  }
  return map;
}

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

  const rows = (data ?? []) as EventRow[];
  const identities = await resolveIdentities(rows);
  return rows.map((row) => mapEvent(row, identities));
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
