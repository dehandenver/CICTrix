/**
 * Performance Evaluations API
 *
 * Backs the PM dashboard (PMDashboard.tsx). One row per (employee, cycle) in
 * the performance_evaluations table; rows are enriched with employee name +
 * department by a separate read of employees_with_department (PostgREST
 * embedded joins through views are unreliable, so we merge in JS).
 *
 * See migration: supabase/migrations/20260518_pm_performance_evaluations_and_competencies.sql
 */

import { supabase as supabaseClient } from '../../lib/supabase';

const supabase = supabaseClient as any;

export type EvaluationStatus =
  | 'Planning'
  | 'Self Evaluation'
  | 'Supervisor Review'
  | 'Approved'
  | 'Rejected';

export interface PerformanceEvaluation {
  id: string;
  employee_id: string;
  cycle_id: number | null;
  status: EvaluationStatus;
  final_score: number | null;
  period: string | null;
  supervisor_id: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  // Hydrated client-side:
  employee_name?: string | null;
  employee_position?: string | null;
  department?: string | null;
}

/**
 * Fetch evaluations and hydrate each with employee name / position / department.
 */
export async function getEvaluationsWithEmployee(opts?: {
  cycleId?: number;
  status?: EvaluationStatus | EvaluationStatus[];
}) {
  try {
    let query = supabase.from('performance_evaluations').select('*');

    if (opts?.cycleId !== undefined) query = query.eq('cycle_id', opts.cycleId);
    if (opts?.status) {
      if (Array.isArray(opts.status)) query = query.in('status', opts.status);
      else query = query.eq('status', opts.status);
    }

    const { data: evals, error } = await query.order('updated_at', { ascending: false });
    if (error) throw error;

    const evalRows = (Array.isArray(evals) ? evals : []) as PerformanceEvaluation[];
    if (evalRows.length === 0) return { success: true, data: [] as PerformanceEvaluation[] };

    const ids = Array.from(new Set(evalRows.map(e => e.employee_id))).filter(Boolean);
    const { data: employees } = await supabase
      .from('employees_with_department')
      .select('id, full_name, current_position, department')
      .in('id', ids);

    const empById = new Map<string, any>();
    for (const e of (employees ?? []) as any[]) empById.set(e.id, e);

    const hydrated = evalRows.map(row => {
      const e = empById.get(row.employee_id);
      return {
        ...row,
        employee_name: e?.full_name ?? null,
        employee_position: e?.current_position ?? null,
        department: e?.department ?? null,
      };
    });

    return { success: true, data: hydrated };
  } catch (error) {
    console.error('Error fetching performance evaluations:', error);
    return { success: false, error: String(error), data: [] as PerformanceEvaluation[] };
  }
}

/** Count evaluations grouped by status. */
export async function getEvaluationStatusCounts(cycleId?: number) {
  const result = await getEvaluationsWithEmployee(cycleId !== undefined ? { cycleId } : undefined);
  const counts: Record<EvaluationStatus, number> = {
    'Planning': 0,
    'Self Evaluation': 0,
    'Supervisor Review': 0,
    'Approved': 0,
    'Rejected': 0,
  };
  for (const row of result.data) {
    if (row.status in counts) counts[row.status]++;
  }
  return { success: result.success, counts, total: result.data.length };
}

/**
 * Performance Distribution buckets matching getAdjectival() in SummaryOfRatings.tsx
 * (4.75 / 4.0 / 3.0 / 2.0 / 1.0).
 */
export type DistributionBucket = 'Outstanding' | 'Very Satisfactory' | 'Satisfactory' | 'Unsatisfactory' | 'Poor';

export function bucketForScore(score: number): DistributionBucket {
  if (score >= 4.75) return 'Outstanding';
  if (score >= 4.0) return 'Very Satisfactory';
  if (score >= 3.0) return 'Satisfactory';
  if (score >= 2.0) return 'Unsatisfactory';
  return 'Poor';
}

export async function getPerformanceDistribution(cycleId?: number) {
  const result = await getEvaluationsWithEmployee(cycleId !== undefined ? { cycleId } : undefined);
  const distribution: Record<DistributionBucket, number> = {
    'Outstanding': 0,
    'Very Satisfactory': 0,
    'Satisfactory': 0,
    'Unsatisfactory': 0,
    'Poor': 0,
  };
  let evaluated = 0;
  for (const row of result.data) {
    if (typeof row.final_score === 'number') {
      distribution[bucketForScore(row.final_score)]++;
      evaluated++;
    }
  }
  return { success: result.success, distribution, evaluated };
}
