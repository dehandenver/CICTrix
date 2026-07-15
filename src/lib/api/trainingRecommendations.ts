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
 * Authoritative source is ipcr_competency_matches (the AI matcher output). When
 * that table is empty/undeployed, fall back to the job-title keyword heuristic
 * above — the SAME logic the seeder uses — so live regeneration never silently
 * no-ops just because the AI matcher hasn't run. Matches always win when present.
 */
async function loadCompetenciesByEmployee(): Promise<Map<string, Set<string>>> {
  const byEmployee = new Map<string, Set<string>>();

  // Authoritative: AI matcher output.
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
  if (byEmployee.size) return byEmployee; // matcher present → authoritative

  // Fallback: job-title heuristic against active employees (anon-readable view).
  const { data: emps } = await supabase
    .from('employees_with_department')
    .select('id, current_position, status')
    .eq('status', 'Active');
  for (const e of (emps ?? []) as any[]) {
    const pos = String(e.current_position ?? '').toLowerCase();
    const set = new Set<string>();
    for (const competency of COMPETENCIES as readonly string[]) {
      const kws = ROLE_KEYWORDS[competency];
      if (kws === null || kws.some((k) => pos.includes(k))) set.add(competency);
    }
    if (set.size) byEmployee.set(String(e.id), set);
  }
  return byEmployee;
}

// Flat result shape — discriminated unions don't narrow under this project's
// strict:false config (see other api/ modules).
export type MutationResult = { ok: boolean; error?: string };

export type GapType = 'LOW_SCORE' | 'DECLINING_TREND' | 'KRA_ALIGNED';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type RecommendationStatus = 'SUGGESTED' | 'ACCEPTED' | 'ENROLLED' | 'DISMISSED';

/** The gap threshold: an overall IPCR score at or below this flags a development need. */
const GAP_THRESHOLD = 3.5;
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
export async function generateRecommendations(): Promise<GenerateResult> {
  try {
    // 1. Active courses, grouped by competency. Competency is parsed from the
    // objectives text[] (there is no competency column) and validated against
    // the 12 canonical competencies.
    const { data: sessions, error: sErr } = await supabase
      .from('training_sessions')
      .select('id, objectives, status, capacity')
      .in('status', ['Scheduled', 'Ongoing']);
    if (sErr) return { ok: false, error: sErr.message };

    const coursesByCompetency = new Map<string, string[]>();
    for (const s of (sessions ?? []) as any[]) {
      const competency = competencyFromObjectives(s.objectives);
      if (!competency) continue;
      const list = coursesByCompetency.get(competency) ?? [];
      list.push(String(s.id));
      coursesByCompetency.set(competency, list);
    }
    if (!coursesByCompetency.size) return { ok: true, upserted: 0, employeesConsidered: 0 };

    // 2. Employee → competencies. Authoritative source is ipcr_competency_matches
    //    (AI matcher); falls back to the job-title heuristic (identical to the
    //    seeder) so live regeneration works even before the matcher has run.
    const competenciesByEmployee = await loadCompetenciesByEmployee();
    if (!competenciesByEmployee.size) return { ok: true, upserted: 0, employeesConsidered: 0 };

    // 3. Latest finalized overall score per employee (live roll-up).
    const employeeIds = [...competenciesByEmployee.keys()];
    const scores = await getLatestOverallScores(employeeIds);

    // 4. Build gap rows.
    const now = new Date().toISOString();
    const rows: any[] = [];
    let considered = 0;

    for (const employeeId of employeeIds) {
      const score = scores.get(employeeId);
      if (!score || score.overallScore == null) continue; // never finalized → skip
      if (score.overallScore > GAP_THRESHOLD) continue; // performing well → no gap
      considered += 1;

      const priority = scoreToPriority(score.overallScore);
      // Only competencies this employee's targets actually map to, that also have
      // at least one active course. Cap to the top N by relevance (all share the
      // same overall score here, so order is stable/alphabetical).
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

    if (!rows.length) return { ok: true, upserted: 0, employeesConsidered: considered };

    // 5. Upsert. onConflict keeps the row identity stable; status/admin_remark are
    // NOT in the payload, so an already ENROLLED/DISMISSED row keeps its decision.
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
