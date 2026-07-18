/**
 * Employee Portal — "My trainings" read model (§8).
 *
 * Reads the SAME training_enrollments rows that "Enroll final attendees" writes
 * (enrollFinalAttendees) — one source, so the employee's list reflects the
 * enrollment the instant it's created; there is no separate read table to drift.
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export type MyTrainingStatus = 'Upcoming' | 'Completed' | 'Cancelled';

export type MyTraining = {
  enrollmentId: string;
  sessionId: string;
  title: string;
  category: string | null;
  startDate: string;
  endDate: string | null;
  location: string | null;
  speaker: string | null;
  objectives: string[];
  enrollmentStatus: string | null;
  status: MyTrainingStatus;
};

const isActive = (e: any): boolean => e?.is_active !== false;

const deriveStatus = (sessionStatus: string | null, startDate: string): MyTrainingStatus => {
  if (sessionStatus === 'Cancelled') return 'Cancelled';
  if (sessionStatus === 'Completed') return 'Completed';
  return new Date(startDate).getTime() > Date.now() ? 'Upcoming' : 'Completed';
};

export async function listMyTrainings(employeeId: string): Promise<MyTraining[]> {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from('training_enrollments')
    .select(
      'id, enrollment_status, is_active, training_sessions ( id, title, category, scheduled_date, end_date, location, instructor_name, objectives, status )'
    )
    .eq('employee_id', employeeId);

  if (error) {
    console.error('Error loading my trainings:', error);
    return [];
  }

  return (data ?? [])
    .filter((e: any) => isActive(e) && e.training_sessions)
    .map((e: any): MyTraining => {
      const s = e.training_sessions;
      return {
        enrollmentId: e.id,
        sessionId: s.id,
        title: s.title,
        category: s.category,
        startDate: s.scheduled_date,
        endDate: s.end_date,
        location: s.location,
        speaker: s.instructor_name,
        objectives: s.objectives ?? [],
        enrollmentStatus: e.enrollment_status ?? null,
        status: deriveStatus(s.status, s.scheduled_date),
      };
    })
    .sort((a: MyTraining, b: MyTraining) => b.startDate.localeCompare(a.startDate));
}
