/**
 * Training Evaluation (Page 6) — pre-test / post-test learning verification.
 *
 * A "training" is a training_sessions row; its attendees are the active
 * training_enrollments for that session. Each attendee gets at most one
 * training_evaluations row (keyed by enrollment_id). The improvement delta and
 * the completion status are computed here, never stored, so they can't drift.
 *
 * Identity (name/position/department) is resolved against employees_with_department,
 * not an embed of the base employees table, which anon SELECT can't read — the
 * same pattern trainingCalendar.ts uses.
 *
 * Results use the flat `{ ok, error? }` shape: the project compiles with
 * `strict: false`, where discriminated unions do not narrow.
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

// Output submissions reuse the existing, working employee-documents bucket under
// a training-outputs/ prefix, so Page 6 needs no new Storage bucket or policy.
const OUTPUT_BUCKET = 'employee-documents';

export type MutationResult = { ok: boolean; error?: string };

export type AssessmentMode = 'test' | 'output';
export type ReviewStatus = 'Pending' | 'Reviewed' | 'Verified';
export type CompletionStatus = 'Not started' | 'Pre-test done' | 'Post-test done' | 'Complete';

const nowIso = () => new Date().toISOString();

export type EvalTraining = {
  id: string;
  title: string;
  category: string | null;
  startDate: string;
  endDate: string | null;
  location: string | null;
  instructorName: string | null;
  status: string;
  attendeeCount: number;
};

export type EvalRow = {
  enrollmentId: string;
  employeeId: string;
  name: string;
  position: string;
  department: string;
  enrollmentStatus: string | null;
  attendanceStatus: string | null;
  mode: AssessmentMode;
  pre: number | null;
  post: number | null;
  submissionUrl: string | null;
  submissionName: string | null;
  submissionNotes: string | null;
  reviewStatus: ReviewStatus;
  lndNotes: string | null;
};

export type EvalBoard = {
  training: EvalTraining;
  rows: EvalRow[];
  reportNotes: string;
};

// ── Derived helpers ──────────────────────────────────────────────────────────

/** Improvement is only meaningful for a test-mode attendee with both scores. */
export const deltaOf = (row: Pick<EvalRow, 'mode' | 'pre' | 'post'>): number | null =>
  row.mode === 'test' && row.pre != null && row.post != null ? row.post - row.pre : null;

export const completionOf = (row: EvalRow): CompletionStatus => {
  if (row.mode === 'output') {
    if (!row.submissionUrl && !row.submissionName) return 'Not started';
    return row.reviewStatus === 'Verified' ? 'Complete' : 'Post-test done';
  }
  const hasPre = row.pre != null;
  const hasPost = row.post != null;
  if (!hasPre && !hasPost) return 'Not started';
  if (hasPre && hasPost) return 'Complete';
  return hasPre ? 'Pre-test done' : 'Post-test done';
};

// ── Reads ────────────────────────────────────────────────────────────────────

const isActive = (e: any): boolean => e?.is_active !== false;

/** Trainings that have at least one active attendee — the ones worth evaluating. */
export async function listEvaluableTrainings(): Promise<EvalTraining[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select(
      'id, title, category, scheduled_date, end_date, location, instructor_name, status, training_enrollments ( id, is_active )'
    )
    .neq('status', 'Cancelled')
    .order('scheduled_date', { ascending: false });

  if (error) {
    console.error('Error listing evaluable trainings:', error);
    return [];
  }

  return (data ?? [])
    .map((row: any): EvalTraining => ({
      id: row.id,
      title: row.title,
      category: row.category,
      startDate: row.scheduled_date,
      endDate: row.end_date,
      location: row.location,
      instructorName: row.instructor_name,
      status: row.status,
      attendeeCount: (row.training_enrollments ?? []).filter(isActive).length,
    }))
    .filter((t: EvalTraining) => t.attendeeCount > 0);
}

type Identity = { name: string; position: string; department: string };

async function resolveIdentities(employeeIds: string[]): Promise<Map<string, Identity>> {
  const map = new Map<string, Identity>();
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

export async function getEvaluationBoard(sessionId: string): Promise<EvalBoard | null> {
  const { data: session, error: sErr } = await supabase
    .from('training_sessions')
    .select('id, title, category, scheduled_date, end_date, location, instructor_name, status')
    .eq('id', sessionId)
    .maybeSingle();

  if (sErr || !session) {
    if (sErr) console.error('Error loading training:', sErr);
    return null;
  }

  const { data: enrollments, error: eErr } = await supabase
    .from('training_enrollments')
    .select('id, employee_id, enrollment_status, attendance_status, is_active')
    .eq('session_id', sessionId);
  if (eErr) {
    console.error('Error loading enrollments:', eErr);
    return null;
  }

  const active = (enrollments ?? []).filter(isActive);
  const identities = await resolveIdentities(active.map((e: any) => e.employee_id));

  const enrollmentIds = active.map((e: any) => e.id);
  const evalByEnrollment = new Map<string, any>();
  if (enrollmentIds.length) {
    const { data: evals, error: evErr } = await supabase
      .from('training_evaluations')
      .select('*')
      .in('enrollment_id', enrollmentIds);
    if (evErr) console.error('Error loading evaluations:', evErr);
    for (const ev of (evals ?? []) as any[]) evalByEnrollment.set(String(ev.enrollment_id), ev);
  }

  const { data: notes } = await supabase
    .from('training_report_notes')
    .select('recommendations')
    .eq('session_id', sessionId)
    .maybeSingle();

  const rows: EvalRow[] = active
    .map((e: any): EvalRow => {
      const identity = identities.get(String(e.employee_id));
      const ev = evalByEnrollment.get(String(e.id));
      return {
        enrollmentId: e.id,
        employeeId: e.employee_id,
        name: identity?.name ?? 'Unknown employee',
        position: identity?.position ?? '—',
        department: identity?.department ?? '—',
        enrollmentStatus: e.enrollment_status ?? null,
        attendanceStatus: e.attendance_status ?? null,
        mode: (ev?.assessment_mode as AssessmentMode) ?? 'test',
        pre: ev?.pre_test_score != null ? Number(ev.pre_test_score) : null,
        post: ev?.post_test_score != null ? Number(ev.post_test_score) : null,
        submissionUrl: ev?.submission_url ?? null,
        submissionName: ev?.submission_name ?? null,
        submissionNotes: ev?.submission_notes ?? null,
        reviewStatus: (ev?.review_status as ReviewStatus) ?? 'Pending',
        lndNotes: ev?.lnd_notes ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    training: {
      id: session.id,
      title: session.title,
      category: session.category,
      startDate: session.scheduled_date,
      endDate: session.end_date,
      location: session.location,
      instructorName: session.instructor_name,
      status: session.status,
      attendeeCount: rows.length,
    },
    rows,
    reportNotes: notes?.recommendations ?? '',
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Ensure a training_evaluations row exists for the enrollment, then apply a
 * partial patch. The insert ignores conflicts so it never clobbers columns the
 * patch isn't touching — the update carries the actual change.
 */
async function patchEvaluation(
  enrollmentId: string,
  patch: Record<string, unknown>,
  actor: string
): Promise<MutationResult> {
  const { error: insErr } = await supabase
    .from('training_evaluations')
    .upsert([{ enrollment_id: enrollmentId }], { onConflict: 'enrollment_id', ignoreDuplicates: true });
  if (insErr) return { ok: false, error: insErr.message };

  const { error } = await supabase
    .from('training_evaluations')
    .update({ ...patch, updated_by: actor, updated_at: nowIso() })
    .eq('enrollment_id', enrollmentId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export const saveScores = (
  enrollmentId: string,
  scores: { pre: number | null; post: number | null },
  actor = 'LND Admin'
): Promise<MutationResult> =>
  patchEvaluation(enrollmentId, { pre_test_score: scores.pre, post_test_score: scores.post }, actor);

export const setAssessmentMode = (
  enrollmentId: string,
  mode: AssessmentMode,
  actor = 'LND Admin'
): Promise<MutationResult> => patchEvaluation(enrollmentId, { assessment_mode: mode }, actor);

export const setReviewStatus = (
  enrollmentId: string,
  status: ReviewStatus,
  actor = 'LND Admin'
): Promise<MutationResult> => patchEvaluation(enrollmentId, { review_status: status }, actor);

export const saveSubmission = (
  enrollmentId: string,
  submission: { url: string | null; name: string | null; notes?: string | null },
  actor = 'LND Admin'
): Promise<MutationResult> =>
  patchEvaluation(
    enrollmentId,
    { submission_url: submission.url, submission_name: submission.name, submission_notes: submission.notes ?? null },
    actor
  );

export async function saveReportNotes(
  sessionId: string,
  recommendations: string,
  actor = 'LND Admin'
): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_report_notes')
    .upsert(
      [{ session_id: sessionId, recommendations, prepared_by: actor, updated_at: nowIso() }],
      { onConflict: 'session_id' }
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

const sanitizeKey = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'output';

/** Upload an attendee's output file and record it against the evaluation. */
export async function uploadOutput(
  sessionId: string,
  enrollmentId: string,
  file: File,
  actor = 'LND Admin'
): Promise<MutationResult & { url?: string; name?: string }> {
  const objectKey = `training-outputs/${sessionId}/${enrollmentId}/${Date.now()}-${sanitizeKey(file.name)}`;

  const uploadResult = await supabase.storage
    .from(OUTPUT_BUCKET)
    .upload(objectKey, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
  if (uploadResult.error) {
    return { ok: false, error: uploadResult.error.message || 'Storage upload failed.' };
  }

  const publicUrl = supabase.storage.from(OUTPUT_BUCKET).getPublicUrl(objectKey)?.data?.publicUrl ?? objectKey;

  const res = await patchEvaluation(
    enrollmentId,
    { assessment_mode: 'output', submission_url: publicUrl, submission_name: file.name },
    actor
  );
  if (!res.ok) return res;
  return { ok: true, url: publicUrl, name: file.name };
}
