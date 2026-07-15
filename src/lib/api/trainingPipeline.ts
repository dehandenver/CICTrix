/**
 * The Training Courses -> Seminar Enrollment -> Training Calendar pipeline.
 *
 *   Training Courses   drafts a training + a recommended employee list. Every
 *                      add/remove needs a reason. Draft -> Sent to Dept Head ->
 *                      Returned -> Finalized. Finalizing materializes a
 *                      training_sessions row and seeds its enrollments.
 *
 *   Seminar Enrollment works that roster: Draft -> Sent to Dept Head ->
 *                      Dept Head Confirmed -> Pending Final Approval ->
 *                      Approved. Approval stamps roster_finalized_at, which is
 *                      what makes the roster visible on the Training Calendar.
 *
 * Results use the flat `{ ok, error? }` shape because the project compiles with
 * `strict: false`, where discriminated unions do not narrow.
 */

import { supabase as supabaseClient } from '../supabase';
import type { TrainingCategory } from '../../modules/admin/trainingCategories';

const supabase = supabaseClient as any;

export type MutationResult = { ok: boolean; error?: string };

export type ActorRole = 'LND' | 'DeptHead';
export type DraftStatus = 'Draft' | 'Sent to Dept Head' | 'Returned' | 'Finalized';
export type RosterStatus =
  | 'Draft'
  | 'Sent to Dept Head'
  | 'Dept Head Confirmed'
  | 'Pending Final Approval'
  | 'Approved';

const nowIso = () => new Date().toISOString();

const employeeName = (e: any): string =>
  [e?.first_name, e?.last_name].filter(Boolean).join(' ').trim() || 'Unknown employee';

// ── Training Courses ─────────────────────────────────────────────────────────

export type DraftMember = {
  id: string;
  employeeId: string;
  name: string;
  position: string;
  department: string;
  /** 'Excluded' rows are removed-but-remembered; they carry the removal reason. */
  state: 'Included' | 'Excluded';
  reason: string;
  actorRole: ActorRole;
  actorName: string | null;
};

export type DraftAuditEvent = {
  id: string;
  employeeId: string;
  action: 'Added' | 'Removed';
  reason: string;
  actorRole: ActorRole;
  actorName: string | null;
  createdAt: string;
};

export type CourseDraft = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  objectives: string[];
  instructorName: string | null;
  instructorTitle: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  capacity: number;
  /** uuid FK to departments(id) — the office whose Dept Head reviews this draft. */
  targetDepartmentId: string;
  /** Display-only, joined from departments. Never match offices on this. */
  targetDepartmentName: string | null;
  status: DraftStatus;
  returnNote: string | null;
  sessionId: string | null;
  members: DraftMember[];
};

const DRAFT_SELECT = `
  id, title, category, description, objectives, instructor_name, instructor_title,
  start_date, end_date, location, capacity, target_department_id, status, return_note,
  session_id,
  departments ( name ),
  training_course_draft_members (
    id, employee_id, state, reason, actor_role, actor_name,
    employees ( first_name, last_name, position, department )
  )
`;

const mapDraft = (row: any): CourseDraft => ({
  id: row.id,
  title: row.title,
  category: row.category,
  description: row.description,
  objectives: row.objectives ?? [],
  instructorName: row.instructor_name,
  instructorTitle: row.instructor_title,
  startDate: row.start_date,
  endDate: row.end_date,
  location: row.location,
  capacity: row.capacity ?? 0,
  targetDepartmentId: row.target_department_id,
  targetDepartmentName: row.departments?.name ?? null,
  status: row.status,
  returnNote: row.return_note,
  sessionId: row.session_id,
  members: (row.training_course_draft_members ?? [])
    .map(
      (m: any): DraftMember => ({
        id: m.id,
        employeeId: m.employee_id,
        name: employeeName(m.employees),
        position: m.employees?.position ?? '—',
        department: m.employees?.department ?? '—',
        state: m.state,
        reason: m.reason,
        actorRole: m.actor_role,
        actorName: m.actor_name,
      })
    )
    .sort((a: DraftMember, b: DraftMember) => a.name.localeCompare(b.name)),
});

export async function listCourseDrafts(): Promise<CourseDraft[]> {
  const { data, error } = await supabase
    .from('training_course_drafts')
    .select(DRAFT_SELECT)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching course drafts:', error);
    return [];
  }
  return (data ?? []).map(mapDraft);
}

export type CourseDraftInput = {
  title: string;
  category: TrainingCategory;
  description: string;
  objectives: string[];
  instructorName: string;
  instructorTitle: string;
  startDate: string | null;
  endDate: string | null;
  location: string;
  capacity: number;
  /** uuid from departments(id). Required — a draft with no office has no reviewer. */
  targetDepartmentId: string;
};

const draftToRow = (input: CourseDraftInput) => ({
  title: input.title,
  category: input.category,
  description: input.description || null,
  objectives: input.objectives.map((o) => o.trim()).filter(Boolean),
  instructor_name: input.instructorName || null,
  instructor_title: input.instructorTitle || null,
  start_date: input.startDate,
  end_date: input.endDate,
  location: input.location || null,
  capacity: input.capacity,
  target_department_id: input.targetDepartmentId,
});

export async function createCourseDraft(
  input: CourseDraftInput,
  actorName: string
): Promise<MutationResult & { id?: string }> {
  const { data, error } = await supabase
    .from('training_course_drafts')
    .insert([{ ...draftToRow(input), status: 'Draft', created_by: actorName }])
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function updateCourseDraft(id: string, input: CourseDraftInput): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_course_drafts')
    .update({ ...draftToRow(input), updated_at: nowIso() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Add an employee to a draft's recommended list. The reason is mandatory and is
 * written both to the member row and to the append-only event log.
 *
 * Re-adding a previously excluded employee flips the row back to 'Included' with
 * the new reason, rather than creating a duplicate.
 */
export async function addDraftMember(input: {
  draftId: string;
  employeeId: string;
  reason: string;
  actorRole: ActorRole;
  actorName: string;
}): Promise<MutationResult> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: 'A reason is required to add an employee.' };

  const { error } = await supabase.from('training_course_draft_members').upsert(
    [
      {
        draft_id: input.draftId,
        employee_id: input.employeeId,
        state: 'Included',
        reason,
        actor_role: input.actorRole,
        actor_name: input.actorName,
        updated_at: nowIso(),
      },
    ],
    { onConflict: 'draft_id,employee_id' }
  );
  if (error) return { ok: false, error: error.message };

  return logDraftEvent({ ...input, reason, action: 'Added' });
}

/** Remove an employee from a draft. The row is kept as 'Excluded' for the audit trail. */
export async function removeDraftMember(input: {
  draftId: string;
  employeeId: string;
  reason: string;
  actorRole: ActorRole;
  actorName: string;
}): Promise<MutationResult> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: 'A reason is required to remove an employee.' };

  const { error } = await supabase
    .from('training_course_draft_members')
    .update({
      state: 'Excluded',
      reason,
      actor_role: input.actorRole,
      actor_name: input.actorName,
      updated_at: nowIso(),
    })
    .eq('draft_id', input.draftId)
    .eq('employee_id', input.employeeId);
  if (error) return { ok: false, error: error.message };

  return logDraftEvent({ ...input, reason, action: 'Removed' });
}

async function logDraftEvent(input: {
  draftId: string;
  employeeId: string;
  action: 'Added' | 'Removed';
  reason: string;
  actorRole: ActorRole;
  actorName: string;
}): Promise<MutationResult> {
  const { error } = await supabase.from('training_course_draft_member_events').insert([
    {
      draft_id: input.draftId,
      employee_id: input.employeeId,
      action: input.action,
      reason: input.reason,
      actor_role: input.actorRole,
      actor_name: input.actorName,
    },
  ]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function listDraftAuditTrail(draftId: string): Promise<DraftAuditEvent[]> {
  const { data, error } = await supabase
    .from('training_course_draft_member_events')
    .select('id, employee_id, action, reason, actor_role, actor_name, created_at')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching draft audit trail:', error);
    return [];
  }
  return (data ?? []).map((e: any) => ({
    id: e.id,
    employeeId: e.employee_id,
    action: e.action,
    reason: e.reason,
    actorRole: e.actor_role,
    actorName: e.actor_name,
    createdAt: e.created_at,
  }));
}

export async function sendDraftToDeptHead(id: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_course_drafts')
    .update({ status: 'Sent to Dept Head', sent_at: nowIso(), updated_at: nowIso() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Dept Head hands the draft back to L&D, optionally with a note. */
export async function returnDraftToLnd(id: string, note: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_course_drafts')
    .update({
      status: 'Returned',
      returned_at: nowIso(),
      return_note: note.trim() || null,
      updated_at: nowIso(),
    })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Finalize: creates the training_sessions row and seeds its enrollments in one
 * transaction. The status guard ("must be Returned first") lives in the SQL
 * function, so it holds no matter who calls it.
 */
export async function finalizeCourseDraft(
  id: string,
  actorName: string
): Promise<MutationResult & { sessionId?: string }> {
  const { data, error } = await supabase.rpc('finalize_training_course_draft', {
    p_draft_id: id,
    p_actor: actorName,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, sessionId: data as string };
}

// ── Seminar Enrollment ───────────────────────────────────────────────────────

export type RosterAttendee = {
  enrollmentId: string;
  employeeId: string;
  name: string;
  position: string;
  department: string;
  enrollmentStatus: 'Confirmed' | 'Pending';
  addedByRole: ActorRole | null;
  addedBy: string | null;
};

export type RosterSession = {
  id: string;
  title: string;
  category: string | null;
  startDate: string;
  endDate: string | null;
  location: string | null;
  instructorName: string | null;
  capacity: number;
  rosterStatus: RosterStatus;
  rosterFinalizedAt: string | null;
  /** Non-null => this roster came from a Training Courses draft. */
  sourceDraftId: string | null;
  attendees: RosterAttendee[];
};

const ROSTER_SELECT = `
  id, title, category, scheduled_date, end_date, location, instructor_name, capacity,
  roster_status, roster_finalized_at, source_draft_id,
  training_enrollments (
    id, employee_id, enrollment_status, added_by, added_by_role, is_active,
    employees ( first_name, last_name, position, department )
  )
`;

const mapRoster = (row: any): RosterSession => ({
  id: row.id,
  title: row.title,
  category: row.category,
  startDate: row.scheduled_date,
  endDate: row.end_date,
  location: row.location,
  instructorName: row.instructor_name,
  capacity: row.capacity ?? 0,
  rosterStatus: row.roster_status,
  rosterFinalizedAt: row.roster_finalized_at,
  sourceDraftId: row.source_draft_id,
  attendees: (row.training_enrollments ?? [])
    // Soft-removed rows stay in the table for the audit trail but are not roster members.
    .filter((e: any) => e.is_active)
    .map(
      (e: any): RosterAttendee => ({
        enrollmentId: e.id,
        employeeId: e.employee_id,
        name: employeeName(e.employees),
        position: e.employees?.position ?? '—',
        department: e.employees?.department ?? '—',
        enrollmentStatus: e.enrollment_status,
        addedByRole: e.added_by_role,
        addedBy: e.added_by,
      })
    )
    .sort((a: RosterAttendee, b: RosterAttendee) => a.name.localeCompare(b.name)),
});

export async function listRosterSessions(): Promise<RosterSession[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select(ROSTER_SELECT)
    .neq('status', 'Cancelled')
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('Error fetching roster sessions:', error);
    return [];
  }
  return (data ?? []).map(mapRoster);
}

/**
 * THE RULE. A roster that originated from a finalized Training Courses draft
 * carries a reasoned audit trail of who was recommended and why. The Dept Head
 * may add to such a roster, but a removal has to go back through Training
 * Courses, where a reason is mandatory — otherwise the trail silently loses a
 * person. A roster built directly in Seminar Enrollment has no such trail, so
 * the Dept Head may add and remove freely.
 *
 * L&D can always remove (with a reason). The database enforces this too, via
 * trg_enforce_roster_removal_origin; this function exists so the UI can disable
 * the control rather than let the user discover the rule through an error.
 */
export function canRemoveAttendee(session: RosterSession, actorRole: ActorRole): boolean {
  if (actorRole === 'LND') return true;
  return session.sourceDraftId === null;
}

export function removalBlockedReason(session: RosterSession, actorRole: ActorRole): string | null {
  if (canRemoveAttendee(session, actorRole)) return null;
  return 'This roster came from a Training Courses draft. Removals must go back through Training Courses so the reason for each change is recorded.';
}

export async function addRosterAttendee(input: {
  sessionId: string;
  employeeId: string;
  actorRole: ActorRole;
  actorName: string;
  enrollmentStatus?: 'Confirmed' | 'Pending';
}): Promise<MutationResult> {
  const { error } = await supabase.from('training_enrollments').upsert(
    [
      {
        session_id: input.sessionId,
        employee_id: input.employeeId,
        status: 'Enrolled',
        enrollment_status: input.enrollmentStatus ?? 'Confirmed',
        added_by: input.actorName,
        added_by_role: input.actorRole,
        is_active: true,
        removed_reason: null,
        removed_by_role: null,
        removed_at: null,
      },
    ],
    { onConflict: 'employee_id,session_id' }
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Soft removal, so "who removed whom, and why" survives. Guarded by canRemoveAttendee. */
export async function removeRosterAttendee(input: {
  session: RosterSession;
  enrollmentId: string;
  reason: string;
  actorRole: ActorRole;
}): Promise<MutationResult> {
  const blocked = removalBlockedReason(input.session, input.actorRole);
  if (blocked) return { ok: false, error: blocked };

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: 'A reason is required to remove an attendee.' };

  const { error } = await supabase
    .from('training_enrollments')
    .update({
      is_active: false,
      removed_reason: reason,
      removed_by_role: input.actorRole,
      removed_at: nowIso(),
    })
    .eq('id', input.enrollmentId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setRosterEnrollmentStatus(
  enrollmentId: string,
  status: 'Confirmed' | 'Pending'
): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_enrollments')
    .update({ enrollment_status: status })
    .eq('id', enrollmentId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Roster workflow transitions. Approval is the step Page 3 waits on. */
export async function advanceRosterStatus(
  sessionId: string,
  next: RosterStatus
): Promise<MutationResult> {
  const patch: Record<string, unknown> = { roster_status: next };
  if (next === 'Sent to Dept Head') patch.roster_sent_at = nowIso();
  if (next === 'Dept Head Confirmed') patch.roster_confirmed_at = nowIso();
  if (next === 'Approved') {
    patch.roster_approved_at = nowIso();
    // The single moment the Training Calendar starts showing this roster.
    patch.roster_finalized_at = nowIso();
  }

  const { error } = await supabase.from('training_sessions').update(patch).eq('id', sessionId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
