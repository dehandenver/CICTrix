/**
 * Training lifecycle status — planning / published / locked.
 *
 * Status is DERIVED, never stored, so it can't drift (see migration
 * 20260729_training_lifecycle.sql):
 *   - locked    : within LOCK_LEAD_DAYS of the start date (or already started).
 *                 The DB trigger enforces that a locked training's content
 *                 fields cannot be edited; this module just computes the label.
 *   - published : every detail field is filled.
 *   - planning  : only the core fields are present; some detail field is blank.
 *
 * Shared by the calendar (§1), the Office Account Training Courses page (§3),
 * and the L&D dashboard "went live incomplete" warning (§2).
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export type LifecycleStatus = 'planning' | 'published' | 'locked';

/** Editing closes this many days before a training starts. */
export const LOCK_LEAD_DAYS = 3;

/** The fields the lifecycle status is computed from. */
export type LifecycleFields = {
  /** ISO start timestamp (training_sessions.scheduled_date). */
  startDate: string;
  objectives?: string[] | null;
  instructorName?: string | null;
  location?: string | null;
  description?: string | null;
  materials?: string | null;
  prerequisites?: string | null;
};

const filled = (v?: string | null): boolean => !!(v && v.trim());

export function isLocked(startDate: string, now: Date = new Date()): boolean {
  const lockAt = new Date(startDate);
  lockAt.setDate(lockAt.getDate() - LOCK_LEAD_DAYS);
  return now.getTime() >= lockAt.getTime();
}

/** True once all detail fields (facilitator, venue, description, materials, prerequisites, ≥1 objective) are filled. */
export function isPublishable(t: LifecycleFields): boolean {
  return (
    filled(t.instructorName) &&
    filled(t.location) &&
    filled(t.description) &&
    filled(t.materials) &&
    filled(t.prerequisites) &&
    (t.objectives?.length ?? 0) > 0
  );
}

export function lifecycleStatus(t: LifecycleFields, now: Date = new Date()): LifecycleStatus {
  if (isLocked(t.startDate, now)) return 'locked';
  return isPublishable(t) ? 'published' : 'planning';
}

/** A training that hit the 3-day lock while still incomplete — the dashboard warns on these. */
export function wentLiveIncomplete(t: LifecycleFields, now: Date = new Date()): boolean {
  return isLocked(t.startDate, now) && !isPublishable(t);
}

/** Map a training_sessions row (snake_case) into the fields the helpers need. */
export const lifecycleFieldsFromRow = (r: any): LifecycleFields => ({
  startDate: r.scheduled_date,
  objectives: r.objectives,
  instructorName: r.instructor_name,
  location: r.location,
  description: r.description,
  materials: r.materials,
  prerequisites: r.prerequisites,
});

export type IncompleteLockedTraining = {
  id: string;
  title: string;
  startDate: string;
  category: string | null;
};

/**
 * Trainings that locked (within 3 days of start) while still in planning — i.e.
 * they went live without their detail fields filled in. Feeds the L&D dashboard
 * warning so admins catch the gap before the cutoff in future months.
 */
export async function listIncompleteLockedTrainings(): Promise<IncompleteLockedTraining[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select(
      'id, title, category, scheduled_date, objectives, instructor_name, location, description, materials, prerequisites, status'
    )
    .neq('status', 'Cancelled');

  if (error) {
    console.error('Error loading trainings for lock warning:', error);
    return [];
  }

  const now = new Date();
  return (data ?? [])
    .filter((r: any) => wentLiveIncomplete(lifecycleFieldsFromRow(r), now))
    .map((r: any) => ({ id: r.id, title: r.title, startDate: r.scheduled_date, category: r.category }))
    .sort((a: IncompleteLockedTraining, b: IncompleteLockedTraining) => a.startDate.localeCompare(b.startDate));
}

export type LockingSoonTraining = { id: string; title: string; startDate: string; category: string | null };

const DAY_MS = 86_400_000;

/**
 * Trainings that will hit the 3-day lock within the next 3 days but still have
 * NO finalized roster (no roster_finalized_at and no active enrollments). The
 * dashboard warns on these so an admin can finalize the roster before it locks —
 * the safeguard against a training going live with nobody on it.
 */
export async function listLockingSoonWithoutRoster(): Promise<LockingSoonTraining[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('id, title, category, scheduled_date, roster_finalized_at, status, training_enrollments ( id, is_active )')
    .neq('status', 'Cancelled');

  if (error) {
    console.error('Error loading trainings for lock-safeguard warning:', error);
    return [];
  }

  const now = Date.now();
  return (data ?? [])
    .filter((r: any) => {
      const lockAt = new Date(r.scheduled_date).getTime() - LOCK_LEAD_DAYS * DAY_MS;
      const notLockedYet = now < lockAt;
      const locksWithin3Days = lockAt <= now + LOCK_LEAD_DAYS * DAY_MS;
      const activeEnrollments = (r.training_enrollments ?? []).filter((e: any) => e.is_active !== false).length;
      const noRoster = !r.roster_finalized_at && activeEnrollments === 0;
      return notLockedYet && locksWithin3Days && noRoster;
    })
    .map((r: any) => ({ id: r.id, title: r.title, startDate: r.scheduled_date, category: r.category }))
    .sort((a: LockingSoonTraining, b: LockingSoonTraining) => a.startDate.localeCompare(b.startDate));
}
