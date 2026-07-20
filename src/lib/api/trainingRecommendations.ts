/**
 * IPCR → L&D Training Recommendation engine + admin API.
 *
 * Connects finalized IPCR performance data to the Training Calendar. It answers
 * two questions:
 *   - For a course, WHO is recommended and WHY? (the L&D admin view, §3)
 *   - For the calendar, how many employees are recommended per course? (badge)
 *
 * The "gap" definition intentionally matches the roster seeder's development-gap
 * model (scripts/seed-lnd-training-rosters-july2026.mjs), because the live
 * relational IPCR model does NOT carry per-competency 1–5 scores — only an
 * overall roll-up (getLatestOverallScores in ./succession) plus per-function
 * Q/E/T. So a gap = a low LATEST FINALIZED overall IPCR score among employees
 * whose IPCR targets map to competency C (via ipcr_competency_matches). This
 * keeps recommendations grounded in real data and consistent with the rosters.
 *
 * Nothing here touches current-cycle target editing: it reads only finalized
 * (approved + phase2 completed) IPCR records.
 */

import { supabase as supabaseClient } from '../supabase';
import { getLatestOverallScores } from './succession';
import { competencyFromObjectives } from './trainingCalendar';
import { COMPETENCIES } from '../../constants/positions';

const supabase = supabaseClient as any;

// Job-title → competency relevance, used ONLY as a fallback when the AI matcher
// (ipcr_competency_matches) has produced nothing yet. Kept identical to
// scripts/seed-training-recommendations.mjs so the in-app Regenerate button and
// the seeder produce the same results. `null` = the competency applies to
// everyone (foundational governance/ethics). Keyed by the 12 canonical strings
// in src/constants/positions.ts.
const ROLE_KEYWORDS: Record<string, string[] | null> = {
  'Knowledge of Local Governance': null,
  'Public Administration Principles': ['admin', 'officer', 'supervis', 'head', 'manager'],
  'Community Engagement Skills': ['health', 'midwife', 'dentist', 'social', 'admin', 'security'],
  'Project Management in a Public Setting': ['project', 'manager', 'engineer', 'coordinat'],
  'Fiscal Management / Budgeting for LGU': ['account', 'budget', 'treasur', 'finance'],
  'Transparency and Accountability Practices': ['account', 'admin', 'legal', 'officer', 'budget'],
  'Disaster Risk Reduction and Management': ['engineer', 'security', 'health', 'midwife', 'guard'],
  'Digital Literacy for Government Services': ['it ', 'information technology', 'computer', 'data', 'analyst', 'admin'],
  'Ethical Conduct and Public Service Standards': null,
  'Technical Writing for Government Documents': ['admin', 'officer', 'legal', 'human resource', 'account'],
  'Data and Records Management and Organization': ['it ', 'information technology', 'computer', 'data', 'admin', 'record', 'officer'],
  'Public Communication Skills': ['admin', 'human resource', 'information', 'officer', 'supervis'],
};

/**
 * Employee → the competencies their development should target.
 *
 * Resolved PER EMPLOYEE, so authoritative and fallback data coexist:
 *   - An employee WITH rows in ipcr_competency_matches (the AI matcher output)
 *     always uses those — the heuristic never overrides real matcher data.
 *   - An employee the matcher has NO rows for falls back to the job-title
 *     keyword heuristic (same logic as the seeder).
 * So during a partial matcher rollout, matched employees use real data while the
 * rest still get heuristic coverage; once every employee is matched, the
 * heuristic stops firing entirely. This never silently no-ops.
 */
async function loadCompetenciesByEmployee(): Promise<Map<string, Set<string>>> {
  const byEmployee = new Map<string, Set<string>>();

  // 1. Authoritative: AI matcher output. Keyed per employee.
  const { data: matches } = await supabase
    .from('ipcr_competency_matches')
    .select('employee_id, competency')
    .not('employee_id', 'is', null)
    .not('competency', 'is', null);
  for (const r of (matches ?? []) as any[]) {
    const key = String(r.employee_id);
    const set = byEmployee.get(key) ?? new Set<string>();
    set.add(r.competency);
    byEmployee.set(key, set);
  }

  // 2. Fallback: job-title heuristic, applied ONLY to employees the matcher has
  //    no rows for. Employees already covered above are skipped, so better data
  //    always wins and the heuristic only fills genuine gaps.
  const { data: emps } = await supabase
    .from('employees_with_department')
    .select('id, current_position, status')
    .eq('status', 'Active');
  for (const e of (emps ?? []) as any[]) {
    const id = String(e.id);
    if (byEmployee.has(id)) continue; // matcher already covers this employee
    const pos = String(e.current_position ?? '').toLowerCase();
    const set = new Set<string>();
    for (const competency of COMPETENCIES as readonly string[]) {
      const kws = ROLE_KEYWORDS[competency];
      if (kws === null || kws.some((k) => pos.includes(k))) set.add(competency);
    }
    if (set.size) byEmployee.set(id, set);
  }
  return byEmployee;
}

// Flat result shape — discriminated unions don't narrow under this project's
// strict:false config (see other api/ modules).
export type MutationResult = { ok: boolean; error?: string };

export type GapType = 'LOW_SCORE' | 'DECLINING_TREND' | 'KRA_ALIGNED' | 'COMPETENCY_GAP';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type RecommendationStatus =
  | 'SUGGESTED'
  | 'LND_APPROVED'
  | 'OFFICE_ADDED'
  | 'OFFICE_FINALIZED'
  | 'ENROLLED'
  | 'FINALIZED' // roster locked; no further adds or removals
  | 'PUBLISHED' // visible to employees; one-way, the DB blocks reopening
  | 'DISMISSED'
  | 'ACCEPTED'; // legacy, no longer produced

/**
 * The gap threshold: an overall IPCR score at or below this flags a development
 * need. Set to 4.0 so "Satisfactory" performers are caught as development
 * candidates (realistic training-needs identification), not just near-failing
 * ones. Keep in sync with scripts/seed-training-recommendations.mjs.
 */
const GAP_THRESHOLD = 4.0;
/** Cap recommendations per employee (spec §2.3 TOP_N). */
const MAX_GAPS_PER_EMPLOYEE = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RecommendedEmployee {
  recommendationId: string;
  employeeId: string;
  employeeName: string;
  position: string | null;
  department: string | null;
  competency: string;
  triggerScore: number | null;
  /** e.g. "2.5/5" for display. */
  triggerScoreLabel: string;
  gapType: GapType;
  gapDetail: string | null;
  sourceCycle: string | null;
  priority: Priority;
  status: RecommendationStatus;
  adminRemark: string | null;
}

export interface RecommendedEmployeesFilters {
  priority?: Priority;
  department?: string;
  status?: RecommendationStatus;
  /** 'trigger_score' (asc) | 'priority' (HIGH→LOW, default). */
  sort?: 'trigger_score' | 'priority';
}

export interface GenerateResult extends MutationResult {
  upserted?: number;
  employeesConsidered?: number;
}

const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const scoreToPriority = (score: number): Priority =>
  score <= 2 ? 'HIGH' : score <= 3 ? 'MEDIUM' : 'LOW';

const scoreLabel = (score: number | null): string =>
  score == null ? '—' : `${Number(score).toFixed(score % 1 === 0 ? 0 : 1)}/5`;

// ─────────────────────────────────────────────────────────────────────────────
// Generation (upsert, idempotent by employee+session+source_cycle)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * (Re)generate training recommendations from the latest finalized IPCR data.
 * Idempotent — upserts on (employee_id, session_id, source_cycle_id), so
 * re-running never duplicates rows. Employees who already have an ENROLLED or
 * DISMISSED recommendation keep that status (we don't clobber admin decisions).
 */
export async function generateRecommendations(
  specificEmployeeId?: string | null,
  specificGaps?: { competency: string; gap: number }[] | null
): Promise<GenerateResult> {
  try {
    // 1. Active courses in NEXT calendar month, grouped by competency.
    const today = new Date();
    const targetStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const targetEnd = new Date(today.getFullYear(), today.getMonth() + 2, 1);
    const { data: sessions, error: sErr } = await supabase
      .from('training_sessions')
      .select('id, title, category, objectives, status, capacity, scheduled_date')
      .in('status', ['Scheduled', 'Ongoing'])
      .gte('scheduled_date', targetStart.toISOString())
      .lt('scheduled_date', targetEnd.toISOString());
    if (sErr) return { ok: false, error: sErr.message };

    const coursesByCompetency = new Map<string, string[]>();
    for (const s of (sessions ?? []) as any[]) {
      if (!s.title || !s.category || !s.capacity || !(s.objectives?.length)) continue;
      const competency = competencyFromObjectives(s.objectives);
      if (!competency) continue;
      const list = coursesByCompetency.get(competency) ?? [];
      list.push(String(s.id));
      coursesByCompetency.set(competency, list);
    }
    if (!coursesByCompetency.size) return { ok: true, upserted: 0, employeesConsidered: 0 };

    const now = new Date().toISOString();
    const rows: any[] = [];
    let considered = 0;

    if (specificEmployeeId && specificGaps) {
      considered = 1;
      for (const g of specificGaps) {
        const competency = g.competency;
        if (!coursesByCompetency.has(competency)) continue;
        const priority = g.gap >= 1.5 ? 'HIGH' : 'MEDIUM';
        const detail = `Demonstrated competency gap identified by AI assessment: required level was higher by ${g.gap}`;
        for (const sessionId of coursesByCompetency.get(competency) ?? []) {
          rows.push({
            employee_id: specificEmployeeId,
            session_id: sessionId,
            competency,
            source_cycle_id: null,
            trigger_score: null,
            gap_type: 'COMPETENCY_GAP' as GapType,
            gap_detail: detail,
            priority,
            generated_at: now,
            updated_at: now,
          });
        }
      }
    } else {
      // 2. Employee → competencies. Authoritative source is ipcr_competency_matches; falls back to heuristic.
      const competenciesByEmployee = await loadCompetenciesByEmployee();
      if (!competenciesByEmployee.size) return { ok: true, upserted: 0, employeesConsidered: 0 };

      // Filter to specific employee if full run isn't requested but specific gaps weren't passed
      const employeeIds = specificEmployeeId && competenciesByEmployee.has(specificEmployeeId)
        ? [specificEmployeeId]
        : [...competenciesByEmployee.keys()];
      
      // 3. Latest finalized overall score per employee (live roll-up).
      const scores = await getLatestOverallScores(employeeIds);

      // 4. Build gap rows.
      for (const employeeId of employeeIds) {
        const score = scores.get(employeeId);
        if (!score || score.overallScore == null) continue; // never finalized → skip
        if (score.overallScore > GAP_THRESHOLD) continue; // performing well → no gap
        considered += 1;

        const priority = scoreToPriority(score.overallScore);
        const gapCompetencies = [...(competenciesByEmployee.get(employeeId) ?? [])]
          .filter((c) => coursesByCompetency.has(c))
          .sort()
          .slice(0, MAX_GAPS_PER_EMPLOYEE);

        for (const competency of gapCompetencies) {
          const detail = buildGapDetail(competency, score.overallScore, score.adjectival, score.period);
          for (const sessionId of coursesByCompetency.get(competency) ?? []) {
            rows.push({
              employee_id: employeeId,
              session_id: sessionId,
              competency,
              source_cycle_id: score.cycleId,
              trigger_score: score.overallScore,
              gap_type: 'LOW_SCORE' as GapType,
              gap_detail: detail,
              priority,
              generated_at: now,
              updated_at: now,
            });
          }
        }
      }
    }

    if (!rows.length) return { ok: true, upserted: 0, employeesConsidered: considered };

    // 5. Upsert.
    const { error: uErr } = await supabase
      .from('training_recommendations')
      .upsert(rows, { onConflict: 'employee_id,session_id,source_cycle_id', ignoreDuplicates: false });
    if (uErr) return { ok: false, error: uErr.message };

    return { ok: true, upserted: rows.length, employeesConsidered: considered };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to generate recommendations.' };
  }
}

function buildGapDetail(
  competency: string,
  score: number,
  adjectival: string | null,
  period: string | null,
): string {
  const parts = [
    `Latest IPCR overall ${scoreLabel(score)}`,
    adjectival ? `(${adjectival}${period ? `, ${period}` : ''})` : period ? `(${period})` : '',
  ].filter(Boolean);
  return `${parts.join(' ')}; IPCR targets map to ${competency}, a development area.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin read: course → recommended employees (live join, §3.3)
// ─────────────────────────────────────────────────────────────────────────────

export async function listRecommendedEmployeesForCourse(
  sessionId: string,
  filters: RecommendedEmployeesFilters = {},
): Promise<{ ok: boolean; error?: string; data?: RecommendedEmployee[] }> {
  try {
    let query = supabase
      .from('training_recommendations')
      .select(
        'id, employee_id, competency, trigger_score, gap_type, gap_detail, source_cycle_id, priority, status, admin_remark',
      )
      .eq('session_id', sessionId);
    if (filters.priority) query = query.eq('priority', filters.priority);
    if (filters.status) query = query.eq('status', filters.status);

    const { data: recs, error } = await query;
    if (error) return { ok: false, error: error.message };
    const rows = (recs ?? []) as any[];
    if (!rows.length) return { ok: true, data: [] };

    // Enrich with employee identity (anon-readable view) and cycle titles.
    const employeeIds = [...new Set(rows.map((r) => String(r.employee_id)))];
    const cycleIds = [...new Set(rows.map((r) => r.source_cycle_id).filter((n) => n != null))];
    const [{ data: emps }, { data: cycles }] = await Promise.all([
      supabase
        .from('employees_with_department')
        .select('id, full_name, current_position, department')
        .in('id', employeeIds),
      cycleIds.length
        ? supabase.from('performance_cycles').select('id, title').in('id', cycleIds)
        : Promise.resolve({ data: [] }),
    ]);
    const empById = new Map<string, any>((emps ?? []).map((e: any) => [String(e.id), e]));
    const cycleTitle = new Map<number, string>((cycles ?? []).map((c: any) => [c.id, String(c.title)]));

    let data: RecommendedEmployee[] = rows.map((r) => {
      const e: any = empById.get(String(r.employee_id));
      const triggerScore = r.trigger_score != null ? Number(r.trigger_score) : null;
      return {
        recommendationId: String(r.id),
        employeeId: String(r.employee_id),
        employeeName: (e?.full_name ?? '(unknown employee)').trim(),
        position: e?.current_position ?? null,
        department: e?.department ?? null,
        competency: r.competency,
        triggerScore,
        triggerScoreLabel: scoreLabel(triggerScore),
        gapType: r.gap_type as GapType,
        gapDetail: r.gap_detail ?? null,
        sourceCycle: r.source_cycle_id != null ? cycleTitle.get(r.source_cycle_id) ?? null : null,
        priority: r.priority as Priority,
        status: r.status as RecommendationStatus,
        adminRemark: r.admin_remark ?? null,
      };
    });

    // Post-filter by department (identity isn't on the recommendation row).
    if (filters.department) data = data.filter((d) => d.department === filters.department);

    // Sort: by trigger score ascending (biggest gap first), or by priority.
    data.sort((a, b) => {
      if (filters.sort === 'trigger_score') {
        return (a.triggerScore ?? 99) - (b.triggerScore ?? 99);
      }
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (p !== 0) return p;
      return (a.triggerScore ?? 99) - (b.triggerScore ?? 99);
    });

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load recommended employees.' };
  }
}

/**
 * Recommended-employee count per course (for the calendar's "N recommended"
 * badge). Counts only actionable rows (SUGGESTED / ACCEPTED), not dismissed or
 * already-enrolled ones. Returns a Map keyed by session_id.
 */
export async function countRecommendedByCourse(
  sessionIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const ids = [...new Set(sessionIds)].filter(Boolean);
  if (!ids.length) return result;
  const { data, error } = await supabase
    .from('training_recommendations')
    .select('session_id, status')
    .in('session_id', ids)
    .in('status', ['SUGGESTED', 'ACCEPTED']);
  if (error) {
    console.error('Error counting recommendations:', error);
    return result;
  }
  for (const r of (data ?? []) as any[]) {
    const key = String(r.session_id);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin actions (§3.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Approve a recommendation and enroll the employee onto the course, respecting
 * capacity. Flips the recommendation to ENROLLED and upserts a confirmed
 * training_enrollments row (the calendar roster's source of truth).
 */
export async function approveAndEnroll(recommendationId: string): Promise<MutationResult> {
  try {
    const { data: rec, error: rErr } = await supabase
      .from('training_recommendations')
      .select('id, employee_id, session_id, status')
      .eq('id', recommendationId)
      .single();
    if (rErr) return { ok: false, error: rErr.message };
    if (!rec) return { ok: false, error: 'Recommendation not found.' };
    if (rec.status === 'ENROLLED') return { ok: true };

    // Capacity + already-enrolled check.
    const [{ data: session }, { data: existing }] = await Promise.all([
      supabase.from('training_sessions').select('capacity').eq('id', rec.session_id).single(),
      supabase
        .from('training_enrollments')
        .select('id, employee_id')
        .eq('session_id', rec.session_id),
    ]);
    const enrolled = (existing ?? []) as any[];
    const alreadyEnrolled = enrolled.some((e) => String(e.employee_id) === String(rec.employee_id));
    const capacity = session?.capacity ?? 0;
    if (!alreadyEnrolled && capacity > 0 && enrolled.length >= capacity) {
      return { ok: false, error: `Course is at capacity (${enrolled.length}/${capacity}).` };
    }

    if (!alreadyEnrolled) {
      const { error: eErr } = await supabase.from('training_enrollments').insert({
        employee_id: rec.employee_id,
        session_id: rec.session_id,
        status: 'Enrolled',
        enrollment_status: 'Confirmed',
        added_by: 'LND recommendation',
        added_by_role: 'LND',
        is_active: true,
      });
      if (eErr) return { ok: false, error: eErr.message };
    }

    const { error: uErr } = await supabase
      .from('training_recommendations')
      .update({ status: 'ENROLLED', updated_at: new Date().toISOString() })
      .eq('id', recommendationId);
    if (uErr) return { ok: false, error: uErr.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to enroll employee.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 pipeline — SUGGESTED → LND_APPROVED → OFFICE_FINALIZED → ENROLLED
// ─────────────────────────────────────────────────────────────────────────────

/** L&D approves a system suggestion; it becomes visible to the Office Account. */
export async function lndApproveRecommendation(recommendationId: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_recommendations')
    .update({ status: 'LND_APPROVED', updated_at: new Date().toISOString() })
    .eq('id', recommendationId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Department head adds a candidate L&D didn't suggest. Creates an OFFICE_ADDED
 * row (or re-activates a dismissed one) for the training. The competency is
 * derived from the training so the row stays consistent with the others.
 */
export async function officeAddCandidate(input: {
  sessionId: string;
  employeeId: string;
  actor: string;
}): Promise<MutationResult> {
  const { data: existing } = await supabase
    .from('training_recommendations')
    .select('id, status')
    .eq('session_id', input.sessionId)
    .eq('employee_id', input.employeeId)
    .limit(1);
  const row = (existing ?? [])[0];
  if (row) {
    // Already on this training's list — nothing to add unless it was dismissed.
    if (row.status === 'DISMISSED') {
      const { error } = await supabase
        .from('training_recommendations')
        .update({ status: 'OFFICE_ADDED', office_actor: input.actor, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    return { ok: true };
  }

  const { data: session } = await supabase
    .from('training_sessions')
    .select('objectives')
    .eq('id', input.sessionId)
    .single();
  const competency = competencyFromObjectives(session?.objectives) ?? 'Department Head Nomination';

  const { error } = await supabase.from('training_recommendations').insert({
    employee_id: input.employeeId,
    session_id: input.sessionId,
    competency,
    source_cycle_id: null,
    gap_type: 'KRA_ALIGNED',
    gap_detail: 'Added by department head.',
    priority: 'MEDIUM',
    status: 'OFFICE_ADDED',
    office_actor: input.actor,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Department head sends the training's list back to L&D — all pending rows finalize. */
export async function officeFinalizeTraining(sessionId: string, actor: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_recommendations')
    .update({ status: 'OFFICE_FINALIZED', office_actor: actor, updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .in('status', ['LND_APPROVED', 'OFFICE_ADDED']);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type EnrolledRecipient = { employeeId: string; name: string; email: string | null; department: string | null };

/**
 * L&D enrolls the office-finalized list for a training. Single pass: create the
 * confirmed enrollments (the calendar roster + attendance read from the same
 * training_enrollments rows), flip the recs to ENROLLED, and return the enrolled
 * employees (with emails) so the caller can open the §7 notify modal. The
 * employee portal's "My trainings" reads these same enrollment rows (§8).
 */
export async function enrollFinalAttendees(
  sessionId: string,
  actor: string,
): Promise<MutationResult & { enrolled?: EnrolledRecipient[] }> {
  const { data: recs, error: rErr } = await supabase
    .from('training_recommendations')
    .select('id, employee_id')
    .eq('session_id', sessionId)
    .eq('status', 'OFFICE_FINALIZED');
  if (rErr) return { ok: false, error: rErr.message };
  const finalized = (recs ?? []) as any[];
  if (!finalized.length) return { ok: true, enrolled: [] };

  // One confirmed enrollment per attendee (idempotent on the roster's unique key).
  const enrollRows = finalized.map((r) => ({
    employee_id: r.employee_id,
    session_id: sessionId,
    status: 'Enrolled',
    enrollment_status: 'Confirmed',
    added_by: actor,
    added_by_role: 'LND',
    is_active: true,
    removed_reason: null,
    removed_by_role: null,
    removed_at: null,
  }));
  const { error: eErr } = await supabase
    .from('training_enrollments')
    .upsert(enrollRows, { onConflict: 'employee_id,session_id' });
  if (eErr) return { ok: false, error: eErr.message };

  const { error: uErr } = await supabase
    .from('training_recommendations')
    .update({ status: 'ENROLLED', updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('status', 'OFFICE_FINALIZED');
  if (uErr) return { ok: false, error: uErr.message };

  // Resolve emails for the notify modal from the anon-readable view.
  const ids = finalized.map((r) => String(r.employee_id));
  const { data: emps } = await supabase
    .from('employees_with_department')
    .select('id, full_name, email, department')
    .in('id', ids);
  const byId = new Map<string, any>((emps ?? []).map((e: any) => [String(e.id), e]));
  const enrolled: EnrolledRecipient[] = ids.map((id) => {
    const e = byId.get(id);
    return {
      employeeId: id,
      name: (e?.full_name ?? 'Unknown employee').trim(),
      email: e?.email ?? null,
      department: e?.department ?? null,
    };
  });
  return { ok: true, enrolled };
}

export type PipelineRec = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  sessionId: string;
  sessionTitle: string;
  sessionCategory: string | null;
  sessionStart: string;
  sessionCapacity: number;
  competency: string;
  priority: Priority;
  status: RecommendationStatus;
  triggerScoreLabel: string;
  gapDetail: string | null;
  officeActor: string | null;
};

/**
 * All in-flight recommendations (not yet enrolled/dismissed), enriched with
 * employee identity and training info. Both the L&D Recommendations page and the
 * Office "L&D recommendations" subtab poll this and group it by session + status.
 */
export async function listPipeline(): Promise<PipelineRec[]> {
  const { data: recs, error } = await supabase
    .from('training_recommendations')
    .select('id, employee_id, session_id, competency, priority, status, trigger_score, gap_detail, office_actor')
    .in('status', ['SUGGESTED', 'LND_APPROVED', 'OFFICE_ADDED', 'OFFICE_FINALIZED']);
  if (error) {
    console.error('Error loading recommendation pipeline:', error);
    return [];
  }
  const rows = (recs ?? []) as any[];
  if (!rows.length) return [];

  const employeeIds = [...new Set(rows.map((r) => String(r.employee_id)))];
  const sessionIds = [...new Set(rows.map((r) => String(r.session_id)))];
  const [{ data: emps }, { data: sessions }] = await Promise.all([
    supabase.from('employees_with_department').select('id, full_name, current_position, department').in('id', employeeIds),
    supabase.from('training_sessions').select('id, title, category, scheduled_date, capacity').in('id', sessionIds),
  ]);
  const empById = new Map<string, any>((emps ?? []).map((e: any) => [String(e.id), e]));
  const sesById = new Map<string, any>((sessions ?? []).map((s: any) => [String(s.id), s]));

  return rows
    .map((r): PipelineRec | null => {
      const s = sesById.get(String(r.session_id));
      if (!s) return null;
      const e = empById.get(String(r.employee_id));
      const triggerScore = r.trigger_score != null ? Number(r.trigger_score) : null;
      return {
        id: String(r.id),
        employeeId: String(r.employee_id),
        employeeName: (e?.full_name ?? 'Unknown employee').trim(),
        department: e?.department ?? null,
        position: e?.current_position ?? null,
        sessionId: String(r.session_id),
        sessionTitle: s.title,
        sessionCategory: s.category,
        sessionStart: s.scheduled_date,
        sessionCapacity: s.capacity ?? 0,
        competency: r.competency,
        priority: r.priority as Priority,
        status: r.status as RecommendationStatus,
        triggerScoreLabel: scoreLabel(triggerScore),
        gapDetail: r.gap_detail ?? null,
        officeActor: r.office_actor ?? null,
      };
    })
    .filter((x): x is PipelineRec => x !== null);
}

/** Dismiss a recommendation with an optional admin remark. */
export async function dismissRecommendation(
  recommendationId: string,
  remark?: string | null,
): Promise<MutationResult> {
  try {
    const { error } = await supabase
      .from('training_recommendations')
      .update({
        status: 'DISMISSED',
        admin_remark: remark?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recommendationId);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to dismiss recommendation.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seminar Enrollment pipeline (migration 20260811)
//
// The five Seminar Enrollment subtabs are five reads of this one table:
//   Recommendation  SUGGESTED            (next month's courses only)
//   Sent to Office  LND_APPROVED / OFFICE_ADDED, batch_id set
//   Returned        OFFICE_FINALIZED
//   Enrolled        ENROLLED / FINALIZED
//   Published       PUBLISHED
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineRecFull = PipelineRec & { batchId: string | null; source: string };

/** First/last instant of the month `offset` months from today, as ISO strings. */
export function monthWindow(offset: number, now: Date = new Date()): { start: string; end: string } {
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Session ids scheduled within a given month offset (0 = this month, 1 = next). */
async function sessionIdsInMonth(offset: number): Promise<string[]> {
  const { start, end } = monthWindow(offset);
  const { data, error } = await supabase
    .from('training_sessions')
    .select('id')
    .gte('scheduled_date', start)
    .lt('scheduled_date', end);
  if (error) {
    console.error('Error loading sessions for month:', error);
    return [];
  }
  return (data ?? []).map((s: any) => String(s.id));
}

/**
 * Recommendations eligible for review: SUGGESTED rows against NEXT month's
 * courses. Next month is the month being planned — August's roster is built
 * during July, exactly as July's was built during June. Current and past months
 * are deliberately excluded; their rosters were settled before they began.
 */
export async function listRecommendationCandidates(): Promise<PipelineRecFull[]> {
  const ids = await sessionIdsInMonth(1);
  if (!ids.length) return [];
  const eligible = new Set(ids);
  const all = await listAllRecommendations();
  return all.filter((r) => r.status === 'SUGGESTED' && eligible.has(r.sessionId));
}

/**
 * L&D accepts a set of recommendations and hands them to the offices in one
 * action. A batch may span several courses — L&D sends everything that is ready
 * at once rather than one course at a time.
 */
export async function sendBatchToOffice(
  recommendationIds: string[],
  actor: string,
  note?: string | null,
): Promise<MutationResult & { batchId?: string }> {
  if (!recommendationIds.length) return { ok: false, error: 'Nothing selected to send.' };

  const { data: batch, error: bErr } = await supabase
    .from('seminar_batches')
    .insert({ sent_by: actor, note: note?.trim() || null })
    .select('id')
    .single();
  if (bErr) return { ok: false, error: bErr.message };

  const { error } = await supabase
    .from('training_recommendations')
    .update({ status: 'LND_APPROVED', batch_id: batch.id, updated_at: new Date().toISOString() })
    .in('id', recommendationIds);
  if (error) return { ok: false, error: error.message };

  return { ok: true, batchId: String(batch.id) };
}

/** Office adds someone the AI missed. Tagged office-sourced and audited. */
export async function officeAddCandidateAudited(input: {
  sessionId: string;
  employeeId: string;
  actor: string;
  actorDepartment: string | null;
  batchId?: string | null;
}): Promise<MutationResult> {
  const res = await officeAddCandidate({
    sessionId: input.sessionId,
    employeeId: input.employeeId,
    actor: input.actor,
  });
  if (!res.ok) return res;

  await supabase
    .from('training_recommendations')
    .update({ source: 'office_account_added', batch_id: input.batchId ?? null })
    .eq('session_id', input.sessionId)
    .eq('employee_id', input.employeeId);

  await supabase.from('seminar_recommendation_events').insert({
    session_id: input.sessionId,
    employee_id: input.employeeId,
    action: 'added',
    actor: input.actor,
    actor_department: input.actorDepartment,
  });

  return { ok: true };
}

/**
 * Office removes someone from a recommended list. A reason is mandatory — it is
 * the point of the audit trail, and the database rejects a blank one.
 */
export async function officeRemoveCandidate(input: {
  recommendationId: string;
  sessionId: string;
  employeeId: string;
  reason: string;
  actor: string;
  actorDepartment: string | null;
}): Promise<MutationResult> {
  if (!input.reason.trim()) return { ok: false, error: 'A reason is required to remove someone.' };

  const { error } = await supabase
    .from('training_recommendations')
    .update({
      status: 'DISMISSED',
      admin_remark: input.reason.trim(),
      office_actor: input.actor,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.recommendationId);
  if (error) return { ok: false, error: error.message };

  const { error: evErr } = await supabase.from('seminar_recommendation_events').insert({
    recommendation_id: input.recommendationId,
    session_id: input.sessionId,
    employee_id: input.employeeId,
    action: 'removed',
    reason: input.reason.trim(),
    actor: input.actor,
    actor_department: input.actorDepartment,
  });
  if (evErr) return { ok: false, error: evErr.message };

  return { ok: true };
}

/** Office hands a batch back to L&D once it has finished reviewing. */
export async function returnBatchToLnd(batchId: string, actor: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_recommendations')
    .update({ status: 'OFFICE_FINALIZED', office_actor: actor, updated_at: new Date().toISOString() })
    .eq('batch_id', batchId)
    .in('status', ['LND_APPROVED', 'OFFICE_ADDED']);
  if (error) return { ok: false, error: error.message };

  const { error: bErr } = await supabase
    .from('seminar_batches')
    .update({ returned_at: new Date().toISOString(), returned_by: actor })
    .eq('id', batchId);
  return bErr ? { ok: false, error: bErr.message } : { ok: true };
}

/** Lock a course's roster. No further adds or removals afterwards. */
export async function finalizeRoster(sessionId: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_recommendations')
    .update({ status: 'FINALIZED', finalized_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('status', 'ENROLLED');
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Publish a finalized roster to employees. One-way: the DB blocks reopening. */
export async function publishRoster(sessionId: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('training_recommendations')
    .update({ status: 'PUBLISHED', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('status', 'FINALIZED');
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Every recommendation across the pipeline, for the status-tabbed views. */
export async function listAllRecommendations(): Promise<PipelineRecFull[]> {
  const { data, error } = await supabase
    .from('training_recommendations')
    .select('id, employee_id, session_id, competency, priority, status, trigger_score, gap_detail, office_actor, batch_id, source')
    .in('status', ['SUGGESTED', 'LND_APPROVED', 'OFFICE_ADDED', 'OFFICE_FINALIZED', 'ENROLLED', 'FINALIZED', 'PUBLISHED']);
  if (error) {
    console.error('Error loading recommendations:', error);
    return [];
  }
  const rows = (data ?? []) as any[];
  if (!rows.length) return [];

  const employeeIds = [...new Set(rows.map((r) => String(r.employee_id)))];
  const sessionIds = [...new Set(rows.map((r) => String(r.session_id)))];
  const [{ data: emps }, { data: sessions }] = await Promise.all([
    supabase.from('employees_with_department').select('id, full_name, current_position, department').in('id', employeeIds),
    supabase.from('training_sessions').select('id, title, category, scheduled_date, capacity').in('id', sessionIds),
  ]);
  const empById = new Map<string, any>((emps ?? []).map((e: any) => [String(e.id), e]));
  const sesById = new Map<string, any>((sessions ?? []).map((s: any) => [String(s.id), s]));

  return rows
    .map((r): PipelineRecFull | null => {
      const s = sesById.get(String(r.session_id));
      if (!s) return null;
      const e = empById.get(String(r.employee_id));
      const triggerScore = r.trigger_score != null ? Number(r.trigger_score) : null;
      return {
        id: String(r.id),
        employeeId: String(r.employee_id),
        employeeName: (e?.full_name ?? 'Unknown employee').trim(),
        department: e?.department ?? null,
        position: e?.current_position ?? null,
        sessionId: String(r.session_id),
        sessionTitle: s.title,
        sessionCategory: s.category,
        sessionStart: s.scheduled_date,
        sessionCapacity: s.capacity ?? 0,
        competency: r.competency,
        priority: r.priority as Priority,
        status: r.status as RecommendationStatus,
        triggerScoreLabel: scoreLabel(triggerScore),
        gapDetail: r.gap_detail ?? null,
        officeActor: r.office_actor ?? null,
        batchId: r.batch_id ? String(r.batch_id) : null,
        source: r.source ?? 'ai_recommended',
      };
    })
    .filter((x): x is PipelineRecFull => x !== null);
}

export type RecommendationEvent = {
  id: string;
  sessionId: string;
  employeeId: string;
  action: 'added' | 'removed';
  reason: string | null;
  actor: string | null;
  actorDepartment: string | null;
  createdAt: string;
};

/** What the offices changed — shown to L&D on the Returned subtab. */
export async function listRecommendationEvents(sessionIds: string[]): Promise<RecommendationEvent[]> {
  if (!sessionIds.length) return [];
  const { data, error } = await supabase
    .from('seminar_recommendation_events')
    .select('id, session_id, employee_id, action, reason, actor, actor_department, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading recommendation events:', error);
    return [];
  }
  return (data ?? []).map((e: any) => ({
    id: String(e.id),
    sessionId: String(e.session_id),
    employeeId: String(e.employee_id),
    action: e.action,
    reason: e.reason ?? null,
    actor: e.actor ?? null,
    actorDepartment: e.actor_department ?? null,
    createdAt: e.created_at,
  }));
}
