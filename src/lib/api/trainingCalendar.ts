import { supabase as supabaseClient } from '../supabase';
import type { TrainingCategory } from '../../modules/admin/trainingCategories';
import { COMPETENCIES } from '../../constants/positions';
import { setSessionCompetencies } from './trainingCompetencies';

const supabase = supabaseClient as any;

/**
 * Normalise a competency string for comparison: lower-case, collapse the spaces
 * around a slash and any run of whitespace. This absorbs the real-world variants
 * that drift into the data — e.g. "Fiscal Management/Budgeting for LGU" (as
 * stored in ipcr_competency_matches) vs. the canonical "Fiscal Management /
 * Budgeting for LGU" (positions.ts) — so a course tagged one way still matches
 * an employee mapped the other way.
 */
const normalizeCompetencyKey = (s: string): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();

const CANON_BY_KEY = new Map<string, string>(
  (COMPETENCIES as readonly string[]).map((c) => [normalizeCompetencyKey(c), c]),
);

/**
 * Resolve any competency spelling to its canonical form (one of the 12 in
 * positions.ts), or null if it isn't a recognised competency. Use this on BOTH
 * sides of a match — course tags and employee competencies — so string drift
 * never silently drops a genuine match.
 */
export const canonicalizeCompetency = (raw: string | null | undefined): string | null =>
  raw == null ? null : CANON_BY_KEY.get(normalizeCompetencyKey(raw)) ?? null;

/**
 * ALL competencies a course develops, parsed from the `objectives` text[] where
 * each is a "Competency: <name>" line (there is no competency column — see the
 * seeders). A course may carry several such lines; each is canonicalised and
 * validated, unknowns dropped, order preserved, duplicates removed. Returns an
 * empty array when none are present.
 */
export const competenciesFromObjectives = (objectives: string[] | null | undefined): string[] => {
  const out: string[] = [];
  for (const line of objectives ?? []) {
    if (typeof line === 'string' && line.startsWith('Competency: ')) {
      const canon = canonicalizeCompetency(line.slice('Competency: '.length));
      if (canon && !out.includes(canon)) out.push(canon);
    }
  }
  return out;
};

/**
 * A course's PRIMARY competency — the first tag — or null. Kept for callers that
 * only need one (e.g. a display label). Prefer competenciesFromObjectives for
 * matching, which honours every tag.
 */
export const competencyFromObjectives = (objectives: string[] | null | undefined): string | null =>
  competenciesFromObjectives(objectives)[0] ?? null;

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
  /**
   * Structured competency tags from the training_competencies join table.
   * Preferred by the AI Matcher over the objectives-parsing fallback.
   * Empty array for trainings not yet tagged via the new form.
   */
  competencies: string[];
  /**
   * @deprecated Use competencies[]. Single primary competency kept for backward
   * compat with callers not yet updated. Derived from join table when available,
   * otherwise from objectives parsing.
   */
  competency: string | null;
  /** ISO timestamp of the first day. */
  startDate: string;
  /** ISO timestamp of the last day; null for single-day events. */
  endDate: string | null;
  speaker: string | null;
  location: string | null;
  objectives: string[];
  /** Detail fields — filled state drives planning → published (see trainingLifecycle). */
  description: string | null;
  materials: string | null;
  prerequisites: string | null;
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
  description: string | null;
  materials: string | null;
  prerequisites: string | null;
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
  objectives, description, materials, prerequisites, status, capacity, roster_finalized_at,
  training_enrollments (
    id, employee_id, enrollment_status, attendance_status
  ),
  training_competencies (
    competency_id,
    training_competency_tags ( id, name )
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

const mapEvent = (row: EventRow, identities: Map<string, EmployeeIdentity>): CalendarEvent => {
  // Prefer structured join-table tags; fall back to objectives parsing for
  // trainings created before this feature was introduced.
  const joinTags: string[] = ((row as any).training_competencies ?? [])
    .map((tc: any) => tc.training_competency_tags?.name as string | undefined)
    .filter((n: string | undefined): n is string => typeof n === 'string' && n.length > 0);
  const competenciesResolved =
    joinTags.length > 0 ? joinTags : competenciesFromObjectives(row.objectives);

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    competencies: competenciesResolved,
    competency: competenciesResolved[0] ?? null,
    startDate: row.scheduled_date,
    endDate: row.end_date,
    speaker: row.instructor_name,
    location: row.location,
    objectives: row.objectives ?? [],
    description: row.description ?? null,
    materials: row.materials ?? null,
    prerequisites: row.prerequisites ?? null,
    status: row.status,
    capacity: row.capacity ?? 0,
    rosterFinalizedAt: row.roster_finalized_at,
    attendees: (row.training_enrollments ?? [])
      .map((e) => mapAttendee(e, identities))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
};

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
  description?: string;
  materials?: string;
  prerequisites?: string;
  status: CalendarEventStatus;
  capacity?: number;
  /**
   * IDs from training_competency_tags to associate with this session.
   * When provided, setSessionCompetencies is called after the session upsert
   * to atomically replace the session's tag set.
   */
  competencyIds?: string[];
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
  description: input.description?.trim() || null,
  materials: input.materials?.trim() || null,
  prerequisites: input.prerequisites?.trim() || null,
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

  // Sync competency tags if any were provided.
  if (input.competencyIds?.length) {
    await setSessionCompetencies(data.id, input.competencyIds);
  }

  return { ok: true, id: data.id };
}

export async function updateCalendarEvent(
  id: string,
  input: CalendarEventInput
): Promise<MutationResult> {
  // Stamp updated_at so the Office Account view can flag "Updated by L&D". Only
  // this genuine-edit path bumps it — roster/attendance churn does not.
  const { error } = await supabase
    .from('training_sessions')
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  // Sync competency tags. competencyIds===undefined means the caller didn't
  // touch the field (e.g. an Office Account status update); skip in that case.
  if (input.competencyIds !== undefined) {
    const tagResult = await setSessionCompetencies(id, input.competencyIds);
    if (!tagResult.ok) return { ok: false, error: tagResult.error };
  }

  return { ok: true };
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
