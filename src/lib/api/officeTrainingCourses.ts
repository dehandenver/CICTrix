/**
 * Office Account — Training Courses (§3 / §4).
 *
 * A read-only, system-wide list of every training for department heads. Each
 * row carries the derived lifecycle status, an attendee count, and an
 * "updated by L&D" flag (updated_at > last_viewed_by_office). Opening a
 * training's drawer marks it viewed, clearing the flag.
 *
 * Identity is resolved against employees_with_department (base employees is
 * anon-blocked), same as the calendar.
 */

import { supabase as supabaseClient } from '../supabase';
import { lifecycleStatus, type LifecycleStatus } from './trainingLifecycle';

const supabase = supabaseClient as any;

export type MutationResult = { ok: boolean; error?: string };

export type OfficeAttendee = { name: string; department: string; position: string };

export type OfficeTraining = {
  id: string;
  title: string;
  category: string | null;
  startDate: string;
  endDate: string | null;
  /** planning / published / locked. */
  status: LifecycleStatus;
  /** Scheduled / Ongoing / Completed / Cancelled. */
  operationalStatus: string;
  attendeeCount: number;
  capacity: number;
  updatedByLnd: boolean;
  // Detail-drawer fields
  speaker: string | null;
  location: string | null;
  objectives: string[];
  description: string | null;
  materials: string | null;
  prerequisites: string | null;
  rosterFinalizedAt: string | null;
  attendees: OfficeAttendee[];
};

const isActive = (e: any): boolean => e?.is_active !== false;

async function resolveIdentities(employeeIds: string[]): Promise<Map<string, OfficeAttendee>> {
  const map = new Map<string, OfficeAttendee>();
  const ids = [...new Set(employeeIds.filter(Boolean).map(String))];
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
      name: String(e.full_name ?? '').trim() || 'Unknown employee',
      position: e.current_position ?? '—',
      department: e.department ?? '—',
    });
  }
  return map;
}

export async function listOfficeTrainings(): Promise<OfficeTraining[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select(
      'id, title, category, scheduled_date, end_date, capacity, status, instructor_name, location, objectives, description, materials, prerequisites, roster_finalized_at, updated_at, last_viewed_by_office, training_enrollments ( id, employee_id, is_active )'
    )
    .order('scheduled_date', { ascending: false });

  if (error) {
    console.error('Error listing office trainings:', error);
    return [];
  }

  const rows = (data ?? []) as any[];
  const allEmployeeIds = rows.flatMap((r) => (r.training_enrollments ?? []).filter(isActive).map((e: any) => e.employee_id));
  const identities = await resolveIdentities(allEmployeeIds);

  return rows.map((r): OfficeTraining => {
    const active = (r.training_enrollments ?? []).filter(isActive);
    const updatedAt: string | null = r.updated_at;
    const lastViewed: string | null = r.last_viewed_by_office;
    const updatedByLnd = !!updatedAt && (!lastViewed || updatedAt > lastViewed);
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      startDate: r.scheduled_date,
      endDate: r.end_date,
      status: lifecycleStatus({
        startDate: r.scheduled_date,
        objectives: r.objectives,
        instructorName: r.instructor_name,
        location: r.location,
        description: r.description,
        materials: r.materials,
        prerequisites: r.prerequisites,
      }),
      operationalStatus: r.status,
      attendeeCount: active.length,
      capacity: r.capacity ?? 0,
      updatedByLnd,
      speaker: r.instructor_name,
      location: r.location,
      objectives: r.objectives ?? [],
      description: r.description,
      materials: r.materials,
      prerequisites: r.prerequisites,
      rosterFinalizedAt: r.roster_finalized_at,
      attendees: active
        .map((e: any) => identities.get(String(e.employee_id)) ?? { name: 'Unknown employee', department: '—', position: '—' })
        .sort((a: OfficeAttendee, b: OfficeAttendee) => a.name.localeCompare(b.name)),
    };
  });
}

/** Opening the detail drawer as an office user clears the "Updated by L&D" tag. */
export async function markTrainingViewedByOffice(id: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_sessions')
    .update({ last_viewed_by_office: new Date().toISOString() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
