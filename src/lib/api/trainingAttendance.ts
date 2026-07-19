/**
 * Per-half-day training attendance (§5).
 *
 * Present / Absent / Excused per attendee, per training day, per session.
 * Attendance is taken twice a day, so the key is
 * (enrollment_id, day_date, session) where day_date is a local "YYYY-MM-DD"
 * calendar key and session is 'AM' or 'PM'. Recording only once a day made a
 * half-day absence unrepresentable.
 *
 * An excused half-day carries a required note (enforced by a DB check).
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export type MutationResult = { ok: boolean; error?: string };
export type DayStatus = 'Present' | 'Absent' | 'Excused';
export type SessionHalf = 'AM' | 'PM';
export type AttendanceCell = { status: DayStatus | null; note: string | null };

export const SESSION_HALVES: SessionHalf[] = ['AM', 'PM'];
export const SESSION_LABEL: Record<SessionHalf, string> = { AM: 'Morning', PM: 'Afternoon' };

/** The map key for one half-day: "YYYY-MM-DD|AM". */
export const cellKey = (dayKey: string, session: SessionHalf): string => `${dayKey}|${session}`;

/** enrollmentId -> "YYYY-MM-DD|AM" -> cell */
export type AttendanceMap = Map<string, Map<string, AttendanceCell>>;

export async function listAttendance(enrollmentIds: string[]): Promise<AttendanceMap> {
  const map: AttendanceMap = new Map();
  const ids = [...new Set(enrollmentIds.filter(Boolean))];
  if (!ids.length) return map;

  const { data, error } = await supabase
    .from('training_attendance_days')
    .select('enrollment_id, day_date, session, status, excuse_note')
    .in('enrollment_id', ids);

  if (error) {
    console.error('Error loading attendance:', error);
    return map;
  }
  for (const r of (data ?? []) as any[]) {
    // Rows predating the AM/PM split have no session; read them as morning so
    // historical attendance still renders rather than vanishing.
    const half = (r.session === 'PM' ? 'PM' : 'AM') as SessionHalf;
    const key = cellKey(String(r.day_date), half);
    if (!map.has(r.enrollment_id)) map.set(r.enrollment_id, new Map());
    map.get(r.enrollment_id)!.set(key, { status: r.status ?? null, note: r.excuse_note ?? null });
  }
  return map;
}

/**
 * Set (or clear) one attendee's status for one half-day. Pass status=null to
 * clear the mark. An 'Excused' status requires a non-blank note.
 */
export async function setDayAttendance(input: {
  enrollmentId: string;
  dayKey: string; // "YYYY-MM-DD"
  session: SessionHalf;
  status: DayStatus | null;
  note?: string | null;
  actor?: string;
}): Promise<MutationResult> {
  if (input.status === 'Excused' && !(input.note && input.note.trim())) {
    return { ok: false, error: 'An excuse note is required.' };
  }

  const { error } = await supabase
    .from('training_attendance_days')
    .upsert(
      [
        {
          enrollment_id: input.enrollmentId,
          day_date: input.dayKey,
          session: input.session,
          status: input.status,
          excuse_note: input.status === 'Excused' ? (input.note ?? '').trim() : null,
          updated_by: input.actor ?? 'LND Admin',
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'enrollment_id,day_date,session' }
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}
