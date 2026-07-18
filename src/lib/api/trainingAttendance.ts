/**
 * Per-day training attendance (§5).
 *
 * Present / Absent / Excused per attendee per training day. Keyed by
 * (enrollment_id, day_date) where day_date is a local "YYYY-MM-DD" calendar key.
 * An excused day carries a required note (enforced by a DB check).
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export type MutationResult = { ok: boolean; error?: string };
export type DayStatus = 'Present' | 'Absent' | 'Excused';
export type AttendanceCell = { status: DayStatus | null; note: string | null };

/** enrollmentId -> dayKey("YYYY-MM-DD") -> cell */
export type AttendanceMap = Map<string, Map<string, AttendanceCell>>;

export async function listAttendance(enrollmentIds: string[]): Promise<AttendanceMap> {
  const map: AttendanceMap = new Map();
  const ids = [...new Set(enrollmentIds.filter(Boolean))];
  if (!ids.length) return map;

  const { data, error } = await supabase
    .from('training_attendance_days')
    .select('enrollment_id, day_date, status, excuse_note')
    .in('enrollment_id', ids);

  if (error) {
    console.error('Error loading attendance:', error);
    return map;
  }
  for (const r of (data ?? []) as any[]) {
    const key = String(r.day_date); // date comes back as "YYYY-MM-DD"
    if (!map.has(r.enrollment_id)) map.set(r.enrollment_id, new Map());
    map.get(r.enrollment_id)!.set(key, { status: r.status ?? null, note: r.excuse_note ?? null });
  }
  return map;
}

/**
 * Set (or clear) one attendee's status for one training day. Pass status=null to
 * clear the mark. An 'Excused' status requires a non-blank note.
 */
export async function setDayAttendance(input: {
  enrollmentId: string;
  dayKey: string; // "YYYY-MM-DD"
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
          status: input.status,
          excuse_note: input.status === 'Excused' ? (input.note ?? '').trim() : null,
          updated_by: input.actor ?? 'LND Admin',
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'enrollment_id,day_date' }
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}
