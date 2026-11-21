import { supabase as supabaseClient } from '../supabase';
import type { TrainingCategory } from '../../modules/admin/trainingCategories';
import { COMPETENCIES } from '../../constants/positions';
// Type-only: trainingCompetencies imports this module at runtime (it routes
// tag-only saves through saveCalendarEventTransaction), so a runtime import
// back would be a cycle.
import type { CompetencyTag } from './trainingCompetencies';

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
   * IDs from training_competency_tags for this session, saved in the same
   * transaction as the content. `undefined` leaves the session's tags untouched
   * (an Office Account status update), an empty array clears them.
   */
  competencyIds?: string[];
};

/** Why a save did not complete. `uncertain` means the write may have committed. */
export type TrainingSaveFailureKind =
  | 'validation'
  | 'conflict'
  | 'locked'
  | 'not_authorized'
  | 'uncertain'
  | 'unavailable';

/** The mutation result extended with the saved session's identity and revision. */
export type CalendarSaveResult = MutationResult & {
  id?: string;
  revision?: string;
  kind?: TrainingSaveFailureKind;
};

const SAVE_RPC = 'save_training_calendar_event';
const READ_RPC = 'read_training_calendar_event';

/** Whitelisted session content for save_training_calendar_event. */
const toEventPayload = (input: CalendarEventInput) => ({
  title: input.title.trim(),
  category: input.category,
  scheduled_date: input.startDate,
  end_date: input.endDate,
  instructor_name: input.speaker?.trim() || null,
  location: input.location?.trim() || null,
  // Drop blank bullets so an empty textarea line never becomes an objective.
  objectives: input.objectives.map((o) => o.trim()).filter(Boolean),
  description: input.description?.trim() || null,
  materials: input.materials?.trim() || null,
  prerequisites: input.prerequisites?.trim() || null,
  status: input.status,
  capacity: input.capacity ?? 0,
});

const TRANSPORT_MESSAGE = /fetch|network|timeout|timed out|abort|connection|econn|etimedout|socket/i;

const FAILURE_COPY: Record<
  TrainingSaveFailureKind,
  { create: string; update: string }
> = {
  validation: {
    create: 'Some training details are not valid, so nothing was saved. Check the fields and try again.',
    update: 'Some training details are not valid, so nothing was saved. Check the fields and try again.',
  },
  conflict: {
    create: 'This training changed while you were editing, so nothing was saved. Reload the latest version.',
    update: 'This training changed while you were editing, so nothing was saved. Reload the latest version.',
  },
  locked: {
    create: 'This training is locked, so nothing was saved.',
    update:
      "This training is locked: content and competencies can't change within 3 days of the start, so nothing was saved. Its status can still be changed.",
  },
  not_authorized: {
    create: 'Only active L&D or Admin users can save trainings, so nothing was saved. Sign in again or contact an administrator.',
    update: 'Only active L&D or Admin users can save trainings, so nothing was saved. Sign in again or contact an administrator.',
  },
  uncertain: {
    create:
      "We couldn't confirm the training was created. Press Create Training again: it checks the earlier attempt first and will not create a duplicate.",
    update:
      "We couldn't confirm your changes were saved. Reload the latest version to check what was saved before saving again.",
  },
  unavailable: {
    create: 'The training service is unavailable, so nothing was saved. Your entries are kept: try again in a moment.',
    update: 'The training service is unavailable, so nothing was saved. Your entries are kept: try again in a moment.',
  },
};

const VALIDATION_HINTS = new Set(['invalid_competency', 'invalid_event', 'missing_revision', 'missing_request_id']);
const SESSION_ERROR_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

const failure = (
  kind: TrainingSaveFailureKind,
  isCreate: boolean,
  dbMessage?: string,
): CalendarSaveResult => ({
  ok: false,
  kind,
  // A validation message raised by our own RPC is written for the user; every
  // other kind uses fixed copy so no database detail reaches the screen.
  error:
    kind === 'validation' && dbMessage
      ? `${dbMessage.replace(/\.?$/, '.')} Nothing was saved.`
      : FAILURE_COPY[kind][isCreate ? 'create' : 'update'],
});

/** Turns an RPC error (or a thrown transport failure) into a typed, honest result. */
const classifySaveFailure = (err: unknown, isCreate: boolean): CalendarSaveResult => {
  const e = (err ?? {}) as { code?: unknown; hint?: unknown; message?: unknown };
  const code = String(e.code ?? '').trim();
  const hint = String(e.hint ?? '').trim();
  const message = String(e.message ?? '');

  if (hint === 'revision_conflict' || code === '40001') return failure('conflict', isCreate);
  if (hint === 'session_not_found' || code === 'P0002') return failure('conflict', isCreate);
  if (hint === 'training_locked' || (code === '23514' && /lock/i.test(message))) {
    return failure('locked', isCreate);
  }
  if (code === '42501' || hint === 'not_authorized' || SESSION_ERROR_CODES.has(code)) {
    return failure('not_authorized', isCreate);
  }
  if (VALIDATION_HINTS.has(hint) || code === '23503' || code === '23514' || code.startsWith('22')) {
    return failure('validation', isCreate, VALIDATION_HINTS.has(hint) ? message : undefined);
  }
  if (MISSING_FUNCTION_CODES.has(code)) return failure('unavailable', isCreate);
  // No SQLSTATE and a transport-shaped message: the request may have reached the
  // database and committed before the response was lost.
  if (!code && TRANSPORT_MESSAGE.test(message)) return failure('uncertain', isCreate);
  return failure('unavailable', isCreate);
};

type SaveArgs = {
  sessionId: string | null;
  event: ReturnType<typeof toEventPayload> | null;
  /** null leaves tags untouched; an empty array clears them. */
  competencyIds: string[] | null;
  expectedRevision: string | null;
  requestId: string | null;
};

/**
 * The only write path for a calendar event's content and competency tags: one
 * call to save_training_calendar_event, which validates and writes both in a
 * single transaction. There is deliberately no split-write fallback, so a missing
 * function is reported as unavailable instead of falling back to table writes.
 */
export async function saveCalendarEventTransaction(args: SaveArgs): Promise<CalendarSaveResult> {
  const isCreate = args.sessionId === null;
  try {
    const { data, error } = await supabase.rpc(SAVE_RPC, {
      p_session_id: args.sessionId,
      p_event: args.event,
      p_competency_ids: args.competencyIds,
      p_expected_revision: args.expectedRevision,
      p_request_id: args.requestId,
    });
    if (error) {
      console.warn('[trainingCalendar] save failed:', { code: error.code ?? null, hint: error.hint ?? null });
      return classifySaveFailure(error, isCreate);
    }

    const id = typeof data?.id === 'string' ? data.id.trim() : '';
    const revision = typeof data?.revision === 'string' ? data.revision.trim() : '';
    if (!id || !revision || (!isCreate && id !== args.sessionId)) {
      // The database answered without the saved identity: do not claim success.
      return failure('uncertain', isCreate);
    }
    return { ok: true, id, revision };
  } catch (err) {
    console.warn('[trainingCalendar] save request failed:', (err as { message?: unknown })?.message ?? 'unknown');
    return classifySaveFailure(err, isCreate);
  }
}

/**
 * Create a training directly on the calendar. Used for events that don't need
 * enrollment (e.g. a mandatory all-staff session), so program_id stays null.
 *
 * `requestId` is the stable identity of this create attempt: retrying after a
 * lost response with the SAME id returns the original session instead of making
 * a second one. Generate it once per dialog open and keep it across retries.
 */
export async function createCalendarEvent(
  input: CalendarEventInput,
  requestId: string,
): Promise<CalendarSaveResult> {
  if (!requestId || !requestId.trim()) {
    return {
      ok: false,
      kind: 'validation',
      error: 'This training could not be created because the request has no identity. Reopen the form and try again.',
    };
  }
  return saveCalendarEventTransaction({
    sessionId: null,
    event: toEventPayload(input),
    competencyIds: input.competencyIds ?? null,
    expectedRevision: null,
    requestId,
  });
}

/**
 * Save an edit of the loaded training. `expectedRevision` is the revision from
 * getCalendarEventSnapshot; a stale one is refused as a conflict.
 */
export async function updateCalendarEvent(
  id: string,
  input: CalendarEventInput,
  expectedRevision: string,
): Promise<CalendarSaveResult> {
  if (!expectedRevision || !expectedRevision.trim()) {
    return {
      ok: false,
      kind: 'validation',
      error: 'This training has not been loaded, so it cannot be saved. Reload it and try again.',
    };
  }
  return saveCalendarEventTransaction({
    sessionId: id,
    event: toEventPayload(input),
    competencyIds: input.competencyIds ?? null,
    expectedRevision,
    requestId: null,
  });
}

export type CalendarEventSnapshot = {
  /** The roster is not part of the editable snapshot, so `attendees` is empty. */
  event: CalendarEvent;
  competencyIds: string[];
  competencyTags: CompetencyTag[];
  revision: string;
};

/** A snapshot could not be read. Carries the database error's code/status for friendly messaging. */
export class CalendarSnapshotError extends Error {
  readonly code?: string;
  readonly status?: number;
  constructor(message: string, source?: unknown) {
    super(message);
    this.name = 'CalendarSnapshotError';
    const s = (source ?? {}) as { code?: unknown; status?: unknown };
    if (s.code) this.code = String(s.code);
    if (s.status) this.status = Number(s.status);
  }
}

/**
 * One consistent read of a training for the edit dialog: its content, its
 * competency tags, and the revision a later save must present. Throws when the
 * snapshot cannot be read: a revision is never guessed.
 */
export async function getCalendarEventSnapshot(id: string): Promise<CalendarEventSnapshot> {
  let response: { data?: any; error?: any };
  try {
    response = await supabase.rpc(READ_RPC, { p_session_id: id });
  } catch (err) {
    throw new CalendarSnapshotError(
      String((err as { message?: unknown })?.message ?? 'The training could not be loaded.'),
      err,
    );
  }
  if (response?.error) {
    throw new CalendarSnapshotError(
      String(response.error.message ?? 'The training could not be loaded.'),
      response.error,
    );
  }

  const data = response?.data;
  const ev = data?.event;
  const revision = typeof data?.revision === 'string' ? data.revision.trim() : '';
  if (!data || typeof ev !== 'object' || ev === null || !ev.id) {
    throw new CalendarSnapshotError('The training could not be loaded: the snapshot was incomplete.');
  }
  if (!revision) {
    throw new CalendarSnapshotError('The training could not be loaded: the snapshot had no revision.');
  }

  const tags: CompetencyTag[] = (Array.isArray(data.competencies) ? data.competencies : []).map((t: any) => ({
    id: String(t.id),
    name: String(t.name ?? ''),
    nameKey: String(t.name_key ?? ''),
    category: t.category ?? null,
  }));
  const objectives: string[] = Array.isArray(ev.objectives) ? ev.objectives.map(String) : [];
  const competencyNames = tags.map((t) => t.name).filter(Boolean);
  const names = competencyNames.length > 0 ? competencyNames : competenciesFromObjectives(objectives);

  return {
    event: {
      id: String(ev.id),
      title: String(ev.title ?? ''),
      category: ev.category ?? null,
      competencies: names,
      competency: names[0] ?? null,
      startDate: String(ev.scheduled_date ?? ''),
      endDate: ev.end_date ?? null,
      speaker: ev.instructor_name ?? null,
      location: ev.location ?? null,
      objectives,
      description: ev.description ?? null,
      materials: ev.materials ?? null,
      prerequisites: ev.prerequisites ?? null,
      status: ev.status,
      capacity: ev.capacity ?? 0,
      rosterFinalizedAt: ev.roster_finalized_at ?? null,
      attendees: [],
    },
    competencyIds: (Array.isArray(data.competency_ids) ? data.competency_ids : []).map(String),
    competencyTags: tags,
    revision,
  };
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
