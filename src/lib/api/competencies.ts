/**
 * Competencies API — backs the PM dashboard "Skill Gap Alerts by Department"
 * widget. Gap = required_level - proficiency_level (clamped at 0), expressed
 * as a percentage of the max gap (4).
 *
 * See migration: supabase/migrations/20260518_pm_performance_evaluations_and_competencies.sql
 */

import { supabase as supabaseClient } from '../../lib/supabase';

const supabase = supabaseClient as any;

export interface EmployeeCompetencyRow {
  id: string;
  employee_id: string;
  competency_id: string;
  proficiency_level: number;
  required_level: number;
  assessed_at: string;
  department?: string | null;
}

/** Returns one row per employee_competency, enriched with department. */
export async function getEmployeeCompetencies() {
  try {
    const { data: rows, error } = await supabase
      .from('employee_competencies')
      .select('id, employee_id, competency_id, proficiency_level, required_level, assessed_at');

    if (error) throw error;

    const compRows = (Array.isArray(rows) ? rows : []) as EmployeeCompetencyRow[];
    if (compRows.length === 0) return { success: true, data: [] as EmployeeCompetencyRow[] };

    const ids = Array.from(new Set(compRows.map(r => r.employee_id))).filter(Boolean);
    const { data: employees } = await supabase
      .from('employees_with_department')
      .select('id, department')
      .in('id', ids);

    const empById = new Map<string, any>();
    for (const e of (employees ?? []) as any[]) empById.set(e.id, e);

    return {
      success: true,
      data: compRows.map(r => ({ ...r, department: empById.get(r.employee_id)?.department ?? null })),
    };
  } catch (error) {
    console.error('Error fetching employee competencies:', error);
    return { success: false, error: String(error), data: [] as EmployeeCompetencyRow[] };
  }
}

/** Average skill-gap percentage per department. */
export function computeSkillGapByDepartment(rows: EmployeeCompetencyRow[]) {
  const byDept = new Map<string, { gapSum: number; count: number }>();
  for (const r of rows) {
    const dept = r.department ?? 'Unassigned';
    const gap = Math.max(r.required_level - r.proficiency_level, 0);
    const entry = byDept.get(dept) ?? { gapSum: 0, count: 0 };
    entry.gapSum += gap;
    entry.count += 1;
    byDept.set(dept, entry);
  }
  return Array.from(byDept.entries())
    .map(([dept, { gapSum, count }]) => ({
      dept,
      value: count === 0 ? 0 : Math.round((gapSum / count / 4) * 100),
    }))
    .sort((a, b) => b.value - a.value);
}

export function computeLNDSkillGaps(rows: EmployeeCompetencyRow[]) {
  const byDept = new Map<string, { currentSum: number; reqSum: number; count: number }>();
  for (const r of rows) {
    const dept = r.department ?? 'Unassigned';
    const entry = byDept.get(dept) ?? { currentSum: 0, reqSum: 0, count: 0 };
    entry.currentSum += r.proficiency_level;
    entry.reqSum += r.required_level;
    entry.count += 1;
    byDept.set(dept, entry);
  }
  
  return Array.from(byDept.entries())
    .map(([dept, { currentSum, reqSum, count }]) => {
      if (count === 0) return { skill: dept, currentLevel: 0, targetLevel: 0, gap: 0, priority: 'low' as const };
      
      const avgCurrent = currentSum / count;
      const avgReq = reqSum / count;
      // Assuming max level is 4 or 5. Let's use 5 as max for percentage calculation.
      const currentLevel = Math.round((avgCurrent / 5) * 100);
      const targetLevel = Math.round((avgReq / 5) * 100);
      
      const gap = Math.max(targetLevel - currentLevel, 0);
      const priority = gap >= 60 ? 'high' : gap >= 30 ? 'medium' : 'low';
      
      return {
        skill: dept,
        currentLevel,
        targetLevel,
        gap,
        priority: priority as 'high' | 'medium' | 'low'
      };
    })
    .sort((a, b) => b.gap - a.gap);
}

/**
 * Fetch unique training streams (categories) from the Competency Dictionary Table.
 * Used for populating training category dropdowns in Training Courses and Seminar Enrollment.
 */
export async function getTrainingStreams(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('competency_dictionary')
      .select('training_stream')
      .not('training_stream', 'is', null)
      .order('training_stream', { ascending: true });

    if (error) {
      console.error('Error fetching training streams:', error);
      return [];
    }

    // Extract unique training_stream values
    const streams = new Set<string>();
    (data ?? []).forEach((row: any) => {
      if (row.training_stream && typeof row.training_stream === 'string') {
        streams.add(row.training_stream.trim());
      }
    });

    return Array.from(streams).sort();
  } catch (error) {
    console.error('Error fetching training streams:', error);
    return [];
  }
}
