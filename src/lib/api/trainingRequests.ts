import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export type TrainingRequest = {
  id: string;
  employee_id: string;
  program_id: string | null;
  title: string;
  justification: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  employees?: { first_name: string | null; last_name: string | null; position: string | null; department: string | null };
  training_programs?: { name: string };
  
  // New Columns
  category?: 'Cultural Transformation' | 'Employee Development' | 'Leadership' | 'Technical' | null;
  competency?: string | null;
  rationales?: string[] | null;
  current_proficiency?: number | null;
  desired_proficiency?: number | null;
  after_training_metric?: string | null;
  post_training_proficiency?: number | null;
};

export async function getTrainingRequests() {
  const { data, error } = await supabase
    .from('training_requests')
    .select('*, employees(first_name, last_name, position, department), training_programs(name)')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching training requests:', error);
    return [];
  }

  return data.map((r: any) => {
    const fullName = [r.employees?.first_name, r.employees?.last_name].filter(Boolean).join(' ').trim();
    return {
      id: r.id,
      employee: fullName || 'Unknown',
      position: r.employees?.position ?? 'Unknown',
      department: r.employees?.department ?? 'Unknown',
      requestedTraining: r.training_programs?.name ?? r.title,
      dateRequested: new Date(r.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      status: r.status,
    };
  });
}

export function summarizeByStatus(rows: any[]) {
  const counts = { pending: 0, approved: 0, rejected: 0 };
  rows.forEach(r => {
    if (r.status === 'pending') counts.pending++;
    if (r.status === 'approved') counts.approved++;
    if (r.status === 'rejected') counts.rejected++;
  });
  return counts;
}

// New database-driven functions for Module 2 Office Account Console
export async function listTrainingRequestsDetailed(): Promise<TrainingRequest[]> {
  const { data, error } = await supabase
    .from('training_requests')
    .select('*, employees(first_name, last_name, position, department), training_programs(name)')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching detailed training requests:', error);
    return [];
  }

  return (data ?? []) as TrainingRequest[];
}

/**
 * Office Account submission. A request asks for a TOPIC, not for a person: the
 * office names a competency, a topic and the reasoning, and L&D decides whether
 * to run it. Who attends is settled later and separately, in the recommendation
 * pipeline — the system proposes attendees from IPCR data and the office reviews
 * them there. Naming an employee here would mean picking attendees before the
 * course exists.
 *
 * Everything the old form asked for beyond these three — proficiency sliders,
 * rationale tags, an after-training metric — was office-side guesswork that L&D
 * re-derives from IPCR, so those columns are left null. They stay on the table
 * for pre-existing rows.
 *
 * Requires migration 20260810 (employee_id nullable + requesting_office).
 */
export async function createTrainingRequest(input: {
  program_id?: string | null;
  topic: string;
  /** L&D assigns category during triage; office admins leave this null. */
  category?: 'Cultural Transformation' | 'Employee Development' | 'Leadership' | 'Technical' | null;
  /** L&D assigns competency during triage; office admins leave this null. */
  competency?: string | null;
  reasoning: string;
  requestingOffice: string | null;
  requestedBy: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('training_requests').insert([{
    employee_id: null,
    program_id: input.program_id ?? null,
    title: input.topic,
    justification: input.reasoning,
    category: input.category,
    competency: input.competency,
    requesting_office: input.requestingOffice,
    requested_by: input.requestedBy,
    status: 'pending',
    requested_at: new Date().toISOString(),
  }]);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/** What L&D did with a request after it left the office. */
export type RequestOutcome =
  | { kind: 'under_review' }
  | { kind: 'declined'; decidedAt: string | null }
  | { kind: 'approved'; decidedAt: string | null }
  | { kind: 'planned'; decidedAt: string | null; planYear: number; planStatus: string }
  | { kind: 'scheduled'; decidedAt: string | null; sessionTitle: string; scheduledDate: string };

export type OfficeTrainingRequest = TrainingRequest & {
  requestingOffice: string | null;
  requestedBy: string | null;
  outcome: RequestOutcome;
};

/**
 * The office's own requests, with L&D's response resolved.
 *
 * Scoped by `requesting_office`, the column the office writes on submit.
 * (`listTrainingRequestsDetailed` is deliberately left unscoped for the L&D-side
 * consumers that need every office.) Requests predating migration 20260810 were
 * backfilled from their employee's department, so legacy rows still scope.
 *
 * The outcome is more than the `status` column. A request L&D approved may then
 * have been promoted into next year's plan (`training_plan_entries`) or turned
 * into a real scheduled session (`training_sessions`); both link back via
 * `source_request_id`, and the office cares far more about "it is on the
 * calendar for Aug 14" than about "approved".
 */
export async function listOfficeTrainingRequests(
  officeName: string | null
): Promise<OfficeTrainingRequest[]> {
  const { data, error } = await supabase
    .from('training_requests')
    .select('*')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching office training requests:', error);
    return [];
  }

  const rows = (data ?? []) as any[];
  if (!rows.length) return [];

  const requestIds = rows.map((r) => String(r.id));

  const [{ data: planEntries }, { data: sessions }] = await Promise.all([
    supabase
      .from('training_plan_entries')
      .select('source_request_id, plan_year, plan_status')
      .in('source_request_id', requestIds),
    supabase
      .from('training_sessions')
      .select('source_request_id, title, scheduled_date')
      .in('source_request_id', requestIds),
  ]);

  const planByReq = new Map<string, any>(
    (planEntries ?? []).map((p: any) => [String(p.source_request_id), p])
  );
  const sessionByReq = new Map<string, any>(
    (sessions ?? []).map((s: any) => [String(s.source_request_id), s])
  );

  const want = norm(officeName);

  return rows
    .map((r): OfficeTrainingRequest => ({
      ...(r as TrainingRequest),
      requestingOffice: r.requesting_office ?? null,
      requestedBy: r.requested_by ?? null,
      outcome: resolveOutcome(r, planByReq.get(String(r.id)), sessionByReq.get(String(r.id))),
    }))
    // No resolved office role means show everything — a console that cannot
    // identify its office is better off seeing the data than seeing nothing.
    .filter((r) => !want || norm(r.requestingOffice) === want);
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

function resolveOutcome(r: TrainingRequest, plan: any, session: any): RequestOutcome {
  if (r.status === 'rejected') return { kind: 'declined', decidedAt: r.decided_at };
  if (session) {
    return {
      kind: 'scheduled',
      decidedAt: r.decided_at,
      sessionTitle: session.title,
      scheduledDate: session.scheduled_date,
    };
  }
  if (plan) {
    return {
      kind: 'planned',
      decidedAt: r.decided_at,
      planYear: Number(plan.plan_year),
      planStatus: String(plan.plan_status ?? 'Proposed'),
    };
  }
  if (r.status === 'approved') return { kind: 'approved', decidedAt: r.decided_at };
  return { kind: 'under_review' };
}

/**
 * LND admin decision on a submitted request. The DB status vocabulary is the
 * three-value {pending, approved, rejected}; the Page 5 UI labels `pending` as
 * "Under review" and `rejected` as "Declined". `decided_at` stamps the audit
 * trail; `decided_by` is left null because the anon-open app has no auth.users
 * id to reference.
 */
export async function updateTrainingRequestStatus(
  id: string,
  status: 'approved' | 'rejected'
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('training_requests')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', id);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function logPostTrainingProficiency(
  id: string,
  score: number
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('training_requests')
    .update({ post_training_proficiency: score })
    .eq('id', id);

  return error ? { ok: false, error: error.message } : { ok: true };
}
