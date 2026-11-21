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
export type EvalMutationResult = MutationResult & {
  updatedAt?: string;
  conflict?: boolean;
  partialFailure?: boolean;
};

export type AssessmentMode = 'test' | 'output';
export type ReviewStatus = 'Pending' | 'Reviewed' | 'Verified';
export type CompletionStatus = 'Not started' | 'Pre-test done' | 'Post-test done' | 'Complete';

const nowIso = () => new Date().toISOString();

const nextUpdatedAt = (expectedUpdatedAt: string | null): string => {
  if (!expectedUpdatedAt) return nowIso();
  const parsed = Date.parse(expectedUpdatedAt);
  const targetMs = Number.isFinite(parsed) ? Math.max(Date.now(), parsed + 2) : Date.now();
  return new Date(targetMs).toISOString();
};

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
  /** Raw updated_at token from Postgres, or null when no evaluation row exists yet. */
  updatedAt: string | null;
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
    throw new Error(error.message || 'Could not load evaluable trainings.');
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
    throw new Error(error.message || 'Could not load attendee identities.');
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

  if (sErr) {
    console.error('Error loading training:', sErr);
    throw new Error(sErr.message || 'Could not load training.');
  }
  if (!session) return null;

  const { data: enrollments, error: eErr } = await supabase
    .from('training_enrollments')
    .select('id, employee_id, enrollment_status, attendance_status, is_active')
    .eq('session_id', sessionId);
  if (eErr) {
    console.error('Error loading enrollments:', eErr);
    throw new Error(eErr.message || 'Could not load training enrollments.');
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
    if (evErr) {
      console.error('Error loading evaluations:', evErr);
      throw new Error(evErr.message || 'Could not load evaluations.');
    }
    for (const ev of (evals ?? []) as any[]) evalByEnrollment.set(String(ev.enrollment_id), ev);
  }

  const { data: notes, error: nErr } = await supabase
    .from('training_report_notes')
    .select('recommendations')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (nErr) {
    console.error('Error loading training report notes:', nErr);
    throw new Error(nErr.message || 'Could not load report notes.');
  }

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
        updatedAt: ev?.updated_at != null ? String(ev.updated_at) : null,
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
 * Apply a partial evaluation patch guarded by optimistic concurrency:
 * - expectedUpdatedAt === null inserts a brand-new row and treats a 23505
 *   duplicate race as a conflict without overwriting concurrent changes.
 * - expectedUpdatedAt !== null updates only when updated_at matches verbatim,
 *   returning a conflict when zero rows matched.
 */
async function patchEvaluation(
  enrollmentId: string,
  patch: Record<string, unknown>,
  actor: string,
  expectedUpdatedAt: string | null,
): Promise<EvalMutationResult> {
  if (!Object.keys(patch).length) {
    return { ok: false, error: 'No evaluation changes to save.' };
  }
  for (const key of ['pre_test_score', 'post_test_score'] as const) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100)) {
      return { ok: false, error: 'Scores must be a number between 0 and 100.' };
    }
  }

  if (expectedUpdatedAt === null) {
    const { data, error } = await supabase
      .from('training_evaluations')
      .insert([{ enrollment_id: enrollmentId, ...patch, updated_by: actor, updated_at: nextUpdatedAt(null) }])
      .select('updated_at');

    if (error) {
      if (error.code === '23505' || /duplicate key|unique constraint/i.test(error.message ?? '')) {
        await supabase
          .from('training_evaluations')
          .select('updated_at')
          .eq('enrollment_id', enrollmentId)
          .maybeSingle();
        return {
          ok: false,
          conflict: true,
          error: 'This evaluation already exists or was updated elsewhere. Refresh to reconcile before saving again.',
        };
      }
      return { ok: false, error: error.message };
    }
    if (!data?.length || data[0]?.updated_at == null) {
      return { ok: false, error: 'Evaluation save affected no rows.' };
    }
    return { ok: true, updatedAt: String(data[0].updated_at) };
  }

  const { data, error } = await supabase
    .from('training_evaluations')
    .update({ ...patch, updated_by: actor, updated_at: nextUpdatedAt(expectedUpdatedAt) })
    .eq('enrollment_id', enrollmentId)
    .eq('updated_at', expectedUpdatedAt)
    .select('updated_at');

  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return {
      ok: false,
      conflict: true,
      error: 'This evaluation changed since you loaded it. Refresh to see the latest record before saving again.',
    };
  }
  if (data[0]?.updated_at == null) {
    return { ok: false, error: 'Evaluation save affected no rows.' };
  }
  return { ok: true, updatedAt: String(data[0].updated_at) };
}

export const saveScores = (
  enrollmentId: string,
  scores: Partial<{ pre: number | null; post: number | null }>,
  expectedUpdatedAt: string | null,
  actor = 'LND Admin',
): Promise<EvalMutationResult> => {
  const patch: Record<string, unknown> = {};
  if ('pre' in scores && scores.pre !== undefined) patch.pre_test_score = scores.pre;
  if ('post' in scores && scores.post !== undefined) patch.post_test_score = scores.post;
  return patchEvaluation(enrollmentId, patch, actor, expectedUpdatedAt);
};

export const setAssessmentMode = (
  enrollmentId: string,
  mode: AssessmentMode,
  expectedUpdatedAt: string | null,
  actor = 'LND Admin',
): Promise<EvalMutationResult> => patchEvaluation(enrollmentId, { assessment_mode: mode }, actor, expectedUpdatedAt);

export const setReviewStatus = (
  enrollmentId: string,
  status: ReviewStatus,
  expectedUpdatedAt: string | null,
  actor = 'LND Admin',
): Promise<EvalMutationResult> => patchEvaluation(enrollmentId, { review_status: status }, actor, expectedUpdatedAt);

export const saveSubmission = (
  enrollmentId: string,
  submission: { url: string | null; name: string | null; notes?: string | null },
  expectedUpdatedAt: string | null,
  actor = 'LND Admin',
): Promise<EvalMutationResult> =>
  patchEvaluation(
    enrollmentId,
    { submission_url: submission.url, submission_name: submission.name, submission_notes: submission.notes ?? null },
    actor,
    expectedUpdatedAt,
  );

export async function saveReportNotes(
  sessionId: string,
  recommendations: string,
  actor = 'LND Admin',
): Promise<MutationResult> {
  const { data, error } = await supabase
    .from('training_report_notes')
    .upsert(
      [{ session_id: sessionId, recommendations, prepared_by: actor, updated_at: nowIso() }],
      { onConflict: 'session_id' },
    )
    .select('session_id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'Report notes save affected no rows.' };
  return { ok: true };
}

const sanitizeKey = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'output';

/** Upload an attendee's output file and record it against the evaluation. */
export async function uploadOutput(
  sessionId: string,
  enrollmentId: string,
  file: File,
  expectedUpdatedAt: string | null,
  actor = 'LND Admin',
): Promise<EvalMutationResult & { url?: string; name?: string }> {
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
    actor,
    expectedUpdatedAt,
  );
  if (res.ok !== true) {
    return {
      ok: false,
      partialFailure: true,
      conflict: res.conflict,
      url: publicUrl,
      name: file.name,
      error: res.error
        ? `File uploaded to storage, but updating the evaluation failed: ${res.error}`
        : 'File uploaded to storage, but updating the evaluation failed.',
    };
  }
  return { ok: true, url: publicUrl, name: file.name, updatedAt: res.updatedAt };
}
