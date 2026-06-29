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

export interface IPCRRowDraft {
  id?: number;
  function_type: 'CORE' | 'SUPPORT';
  target_text: string;
  accomplishment_text: string;
  q_rating: number | null;
  e_rating: number | null;
  t_rating: number | null;
  ave_rating: number;
  competency_id: number;
  mapped_competency_standard: string;
  remarks: string;
  weight?: number;
}

export interface IPCRDetails {
  evaluation: PerformanceEvaluation | null;
  rows: IPCRRowDraft[];
}

export async function getActivePerformanceCycle() {
  try {
    const { data, error } = await supabase
      .from('performance_cycles')
      .select('*')
      .eq('status', 'Active')
      .maybeSingle();

    if (error) throw error;
    if (data) return { success: true, data };

    // Fallback to latest cycle if no active cycle exists
    const { data: latest, error: latestError } = await supabase
      .from('performance_cycles')
      .select('*')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) throw latestError;
    return { success: true, data: latest || null };
  } catch (error) {
    console.error('Error fetching active performance cycle:', error);
    return { success: false, error: String(error), data: null };
  }
}

export async function getCompetenciesList() {
  try {
    const { data, error } = await supabase
      .from('competency_dictionary')
      .select('competency_id, competency_standard')
      .order('competency_standard', { ascending: true });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching competencies list:', error);
    return { success: false, error: String(error), data: [] };
  }
}

export async function getEmployeeRawDetails(employeeUuid: string) {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('id, employee_number, first_name, last_name, department, position, position_id, plantilla_num, reports_to')
      .eq('id', employeeUuid)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching raw employee details:', error);
    return { success: false, error: String(error), data: null };
  }
}

export async function getEmployeeIPCR(
  employeeNum: string,
  ratingPeriod: string,
  employeeUuid: string,
  cycleId: number | null
): Promise<{ success: boolean; data: IPCRDetails; error?: string }> {
  try {
    // 1. Fetch ipcr_performance rows
    const { data: rows, error: rowsError } = await supabase
      .from('ipcr_performance')
      .select('*')
      .eq('employee_num', employeeNum)
      .eq('rating_period', ratingPeriod)
      .order('id', { ascending: true });

    if (rowsError) throw rowsError;

    // 2. Fetch performance_evaluations row
    let evaluation: PerformanceEvaluation | null = null;
    let evalQuery = supabase
      .from('performance_evaluations')
      .select('*')
      .eq('employee_id', employeeUuid);
      
    if (cycleId) {
      evalQuery = evalQuery.eq('cycle_id', cycleId);
    } else {
      evalQuery = evalQuery.eq('period', ratingPeriod);
    }
    
    const { data: evalData, error: evalError } = await evalQuery.maybeSingle();
    if (evalError) throw evalError;
    evaluation = evalData;

    return {
      success: true,
      data: {
        evaluation,
        rows: (rows || []).map((row: any) => ({
          id: row.id,
          function_type: row.function_type as 'CORE' | 'SUPPORT',
          target_text: row.target_text || '',
          accomplishment_text: row.accomplishment_text || '',
          q_rating: row.q_rating ? Number(row.q_rating) : null,
          e_rating: row.e_rating ? Number(row.e_rating) : null,
          t_rating: row.t_rating ? Number(row.t_rating) : null,
          ave_rating: row.ave_rating ? Number(row.ave_rating) : 0,
          competency_id: row.competency_id ? Number(row.competency_id) : 0,
          mapped_competency_standard: row.mapped_competency_standard || '',
          remarks: row.remarks || ''
        }))
      }
    };
  } catch (error) {
    console.error('Error fetching employee IPCR details:', error);
    return {
      success: false,
      error: String(error),
      data: { evaluation: null, rows: [] }
    };
  }
}

export async function saveOrSubmitEmployeeIPCR(params: {
  employeeUuid: string;
  employeeNum: string;
  positionId: number | null;
  position: string | null;
  plantillaNum: string | null;
  ratingPeriod: string;
  cycleId: number | null;
  status: 'Self Evaluation' | 'Supervisor Review' | 'Approved' | 'Rejected';
  rows: IPCRRowDraft[];
  rejectionReason?: string | null;
}) {
  try {
    const {
      employeeUuid,
      employeeNum,
      positionId,
      position,
      plantillaNum,
      ratingPeriod,
      cycleId,
      status,
      rows,
      rejectionReason
    } = params;

    // 1. Fetch raw employee details to get reports_to (supervisor) if not provided,
    // or just to confirm we have the latest supervisor ID.
    const empResult = await getEmployeeRawDetails(employeeUuid);
    const supervisorId = empResult.success ? empResult.data?.reports_to : null;

    // 2. Compute final score (average of row ave_ratings)
    let finalScore: number | null = null;
    const activeRatings = rows.map(r => r.ave_rating).filter(Boolean);
    if (activeRatings.length > 0) {
      const sum = activeRatings.reduce((acc, score) => acc + score, 0);
      finalScore = Number((sum / activeRatings.length).toFixed(2));
    }

    // 3. Delete existing ipcr_performance rows for this employee and period
    const { error: deleteError } = await supabase
      .from('ipcr_performance')
      .delete()
      .eq('employee_num', employeeNum)
      .eq('rating_period', ratingPeriod);

    if (deleteError) throw deleteError;

    // 4. Insert new ipcr_performance rows
    if (rows.length > 0) {
      const insertPayloads = rows.map((row, index) => {
        // Calculate average for the row defensively
        const ratings = [row.q_rating, row.e_rating, row.t_rating].filter(r => typeof r === 'number' && r !== null) as number[];
        const aveRating = ratings.length > 0
          ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
          : 0;

        return {
          ipcr_id: `IPCR-${ratingPeriod.replace(/\s+/g, '-')}-${employeeNum}`,
          ipcr_row_id: `ROW-${String(index + 1).padStart(4, '0')}`,
          employee_num: employeeNum,
          position_id: positionId ? Number(positionId) : null,
          position: position,
          plantilla_num: plantillaNum ? Number(plantillaNum) : null,
          rating_period: ratingPeriod,
          function_type: row.function_type,
          target_text: row.target_text,
          accomplishment_text: row.accomplishment_text,
          q_rating: row.q_rating,
          e_rating: row.e_rating,
          t_rating: row.t_rating,
          ave_rating: aveRating,
          competency_id: row.competency_id || null,
          mapped_competency_standard: row.mapped_competency_standard || null,
          remarks: row.remarks || null
        };
      });

      const { error: insertError } = await supabase
        .from('ipcr_performance')
        .insert(insertPayloads);

      if (insertError) throw insertError;
    }

    // 5. Update or insert performance_evaluations row
    let existingEvalQuery = supabase
      .from('performance_evaluations')
      .select('id')
      .eq('employee_id', employeeUuid);

    if (cycleId) {
      existingEvalQuery = existingEvalQuery.eq('cycle_id', cycleId);
    } else {
      existingEvalQuery = existingEvalQuery.eq('period', ratingPeriod);
    }

    const { data: existingEval } = await existingEvalQuery.maybeSingle();

    const timestampFields: Record<string, any> = {
      updated_at: new Date().toISOString()
    };
    if (status === 'Supervisor Review') {
      timestampFields.submitted_at = new Date().toISOString();
    } else if (status === 'Approved') {
      timestampFields.approved_at = new Date().toISOString();
    }

    const extraFields: Record<string, any> = {};
    if (status === 'Rejected') {
      extraFields.rejection_reason = rejectionReason || null;
    } else if (status === 'Approved') {
      extraFields.rejection_reason = null;
    }

    if (existingEval) {
      const { error: updateError } = await supabase
        .from('performance_evaluations')
        .update({
          status,
          final_score: finalScore,
          supervisor_id: supervisorId,
          ...timestampFields,
          ...extraFields
        })
        .eq('id', existingEval.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('performance_evaluations')
        .insert({
          employee_id: employeeUuid,
          cycle_id: cycleId || null,
          status,
          final_score: finalScore,
          period: ratingPeriod,
          supervisor_id: supervisorId,
          ...timestampFields,
          ...extraFields
        });

      if (insertError) throw insertError;
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving or submitting employee IPCR:', error);
    return { success: false, error: String(error) };
  }
}

export async function getLatestEmployeeIPCR(
  employeeUuid: string,
  employeeNum: string,
  activeCycleId: number | null
): Promise<{
  success: boolean;
  data: {
    evaluation: PerformanceEvaluation | null;
    rows: IPCRRowDraft[];
    ratingPeriod: string;
    cycleId: number | null;
  };
  error?: string;
}> {
  try {
    let evaluation: any = null;
    let period = '';
    let cycleId = activeCycleId;

    // 1. Try to find by active cycle first if present
    if (activeCycleId) {
      const { data: evalData, error: evalError } = await supabase
        .from('performance_evaluations')
        .select('*')
        .eq('employee_id', employeeUuid)
        .eq('cycle_id', activeCycleId)
        .maybeSingle();

      if (evalError) throw evalError;
      evaluation = evalData;
    }

    // 2. If not found or no active cycle, look for the most recent evaluation
    if (!evaluation) {
      const { data: recentEvals, error: recentError } = await supabase
        .from('performance_evaluations')
        .select('*')
        .eq('employee_id', employeeUuid)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (recentError) throw recentError;
      if (recentEvals && recentEvals.length > 0) {
        evaluation = recentEvals[0];
        cycleId = evaluation.cycle_id;
      }
    }

    // 3. Determine the rating period
    if (evaluation) {
      period = evaluation.period || '';
    } else {
      // Fallback: default period
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      period = month < 6 ? `January–June ${year}` : `July–December ${year}`;
    }

    // 4. Fetch ipcr_performance rows
    const { data: rows, error: rowsError } = await supabase
      .from('ipcr_performance')
      .select('*')
      .eq('employee_num', employeeNum)
      .eq('rating_period', period)
      .order('id', { ascending: true });

    if (rowsError) throw rowsError;

    return {
      success: true,
      data: {
        evaluation,
        rows: (rows || []).map((row: any) => ({
          id: row.id,
          function_type: row.function_type as 'CORE' | 'SUPPORT',
          target_text: row.target_text || '',
          accomplishment_text: row.accomplishment_text || '',
          q_rating: row.q_rating ? Number(row.q_rating) : null,
          e_rating: row.e_rating ? Number(row.e_rating) : null,
          t_rating: row.t_rating ? Number(row.t_rating) : null,
          ave_rating: row.ave_rating ? Number(row.ave_rating) : 0,
          competency_id: row.competency_id ? Number(row.competency_id) : 0,
          mapped_competency_standard: row.mapped_competency_standard || '',
          remarks: row.remarks || ''
        })),
        ratingPeriod: period,
        cycleId
      }
    };
  } catch (error) {
    console.error('Error fetching latest employee IPCR:', error);
    // Fallback to default period
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const fallbackPeriod = month < 6 ? `January–June ${year}` : `July–December ${year}`;
    
    return {
      success: false,
      error: String(error),
      data: {
        evaluation: null,
        rows: [],
        ratingPeriod: fallbackPeriod,
        cycleId: activeCycleId
      }
    };
  }
}

export async function getEmployeeEvaluations(employeeUuid: string): Promise<{ success: boolean; data: PerformanceEvaluation[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('performance_evaluations')
      .select('*')
      .eq('employee_id', employeeUuid)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching employee evaluations:', error);
    return { success: false, error: String(error), data: [] };
  }
}

export async function getSubordinatesEvaluations(supervisorUuid: string, cycleId: number | null): Promise<{
  success: boolean;
  data: {
    subordinates: any[];
    evaluations: any[];
    isFullyValidated: boolean;
    missingCount: number;
  };
  error?: string;
}> {
  try {
    const { data: subordinates, error: subError } = await supabase
      .from('employees')
      .select('id, employee_number, first_name, last_name, position, department')
      .eq('reports_to', supervisorUuid);

    if (subError) throw subError;
    if (!subordinates || subordinates.length === 0) {
      return {
        success: true,
        data: { subordinates: [], evaluations: [], isFullyValidated: true, missingCount: 0 }
      };
    }

    const subIds = subordinates.map(s => s.id);

    let query = supabase
      .from('performance_evaluations')
      .select('*')
      .in('employee_id', subIds);

    if (cycleId !== null) {
      query = query.eq('cycle_id', cycleId);
    }

    const { data: evals, error: evalError } = await query;
    if (evalError) throw evalError;

    const hydratedEvals = (evals || []).map(ev => {
      const sub = subordinates.find(s => s.id === ev.employee_id);
      return {
        ...ev,
        employee_name: sub ? `${sub.first_name} ${sub.last_name}` : 'Unknown Subordinate',
        employee_position: sub ? sub.position : '—',
        department: sub ? sub.department : '—',
        employee_number: sub ? sub.employee_number : ''
      };
    });

    const approvedCount = hydratedEvals.filter(e => e.status === 'Approved').length;
    const isFullyValidated = approvedCount === subordinates.length;
    const missingCount = subordinates.length - approvedCount;

    return {
      success: true,
      data: {
        subordinates,
        evaluations: hydratedEvals,
        isFullyValidated,
        missingCount
      }
    };
  } catch (err: any) {
    console.error('Error fetching subordinates evaluations:', err);
    return {
      success: false,
      error: String(err),
      data: { subordinates: [], evaluations: [], isFullyValidated: false, missingCount: 0 }
    };
  }
}

export async function consolidateSubordinatesIPCR(
  supervisorUuid: string,
  supervisorEmpNum: string,
  supervisorPosition: string,
  ratingPeriod: string,
  cycleId: number | null
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const subsRes = await getSubordinatesEvaluations(supervisorUuid, cycleId);
    if (!subsRes.success) throw new Error(subsRes.error || 'Failed to fetch subordinate evaluations');
    const { evaluations: subEvals, isFullyValidated } = subsRes.data;

    if (!isFullyValidated) {
      return {
        success: false,
        error: 'Cannot consolidate. Not all subordinate forms are approved by the office.'
      };
    }

    const subEmpNums = subEvals.map(e => e.employee_number).filter(Boolean);
    if (subEmpNums.length === 0) {
      return { success: false, error: 'No subordinates have employee numbers.' };
    }

    const { data: rawRows, error: rowsError } = await supabase
      .from('ipcr_performance')
      .select('*')
      .in('employee_num', subEmpNums)
      .eq('rating_period', ratingPeriod);

    if (rowsError) throw rowsError;

    const groups: Record<string, {
      function_type: string;
      competency_id: number;
      mapped_competency_standard: string;
      targets: string[];
      accomplishments: string[];
      weights: number[];
      q_ratings: number[];
      e_ratings: number[];
      t_ratings: number[];
      ave_ratings: number[];
    }> = {};

    (rawRows || []).forEach(row => {
      const key = `${row.function_type}-${row.competency_id || 'no-comp'}`;
      if (!groups[key]) {
        groups[key] = {
          function_type: row.function_type,
          competency_id: row.competency_id,
          mapped_competency_standard: row.mapped_competency_standard || '',
          targets: [],
          accomplishments: [],
          weights: [],
          q_ratings: [],
          e_ratings: [],
          t_ratings: [],
          ave_ratings: []
        };
      }
      const g = groups[key];
      if (row.target_text) g.targets.push(row.target_text.trim());
      if (row.accomplishment_text) g.accomplishments.push(row.accomplishment_text.trim());
      
      const { remarks } = row;
      const weightMatch = (remarks || '').match(/\[Weight:\s*(\d+)%\]/);
      const weight = weightMatch ? Number(weightMatch[1]) : 0;
      g.weights.push(weight);

      if (row.q_rating) g.q_ratings.push(row.q_rating);
      if (row.e_rating) g.e_ratings.push(row.e_rating);
      if (row.t_rating) g.t_ratings.push(row.t_rating);
      if (row.ave_rating) g.ave_ratings.push(row.ave_rating);
    });

    const consolidatedRows: IPCRRowDraft[] = Object.values(groups).map((g) => {
      const uniqTargets = Array.from(new Set(g.targets));
      const uniqAccs = Array.from(new Set(g.accomplishments));

      const avgWeight = g.weights.length > 0 ? g.weights.reduce((s, w) => s + w, 0) / g.weights.length : 0;
      const avgQ = g.q_ratings.length > 0 ? g.q_ratings.reduce((s, r) => s + r, 0) / g.q_ratings.length : null;
      const avgE = g.e_ratings.length > 0 ? g.e_ratings.reduce((s, r) => s + r, 0) / g.e_ratings.length : null;
      const avgT = g.t_ratings.length > 0 ? g.t_ratings.reduce((s, r) => s + r, 0) / g.t_ratings.length : null;
      const avgAve = g.ave_ratings.length > 0 ? g.ave_ratings.reduce((s, r) => s + r, 0) / g.ave_ratings.length : 0;

      return {
        function_type: g.function_type as 'CORE' | 'SUPPORT',
        target_text: uniqTargets.map(t => `• ${t}`).join('\n'),
        accomplishment_text: uniqAccs.map(a => `• ${a}`).join('\n'),
        q_rating: avgQ ? Math.round(avgQ) : null,
        e_rating: avgE ? Math.round(avgE) : null,
        t_rating: avgT ? Math.round(avgT) : null,
        ave_rating: Number(avgAve.toFixed(2)),
        competency_id: g.competency_id,
        mapped_competency_standard: g.mapped_competency_standard,
        weight: Math.round(avgWeight) || 10,
        remarks: ''
      };
    });

    const totalWeight = consolidatedRows.reduce((sum, r) => sum + r.weight, 0);
    if (totalWeight > 0 && totalWeight !== 100) {
      consolidatedRows.forEach(r => {
        r.weight = Math.round((r.weight / totalWeight) * 100);
      });
      const newTotal = consolidatedRows.reduce((sum, r) => sum + r.weight, 0);
      if (newTotal !== 100 && consolidatedRows.length > 0) {
        consolidatedRows[consolidatedRows.length - 1].weight += (100 - newTotal);
      }
    }

    let { data: supervisorEval } = await supabase
      .from('performance_evaluations')
      .select('*')
      .eq('employee_id', supervisorUuid)
      .eq('cycle_id', cycleId)
      .maybeSingle();

    if (!supervisorEval) {
      const { data: newEval, error: createError } = await supabase
        .from('performance_evaluations')
        .insert([{
          employee_id: supervisorUuid,
          cycle_id: cycleId,
          status: 'Self Evaluation',
          period: ratingPeriod
        }])
        .select()
        .single();
      if (createError) throw createError;
      supervisorEval = newEval;
    }

    const serializedRows = consolidatedRows.map(row => {
      const cleanRemarks = `[Weight: ${row.weight}%] Consolidated DPCR`;
      return {
        ...row,
        remarks: cleanRemarks
      };
    });

    const saveRes = await saveOrSubmitEmployeeIPCR({
      employeeUuid: supervisorUuid,
      employeeNum: supervisorEmpNum,
      positionId: null,
      position: supervisorPosition,
      plantillaNum: null,
      ratingPeriod,
      cycleId,
      status: 'Self Evaluation',
      rows: serializedRows
    });

    return saveRes;
  } catch (err: any) {
    console.error('Error consolidating subordinates IPCR to DPCR:', err);
    return { success: false, error: String(err) };
  }
}
