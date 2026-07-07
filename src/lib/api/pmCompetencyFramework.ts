/**
 * PM Competency Framework API — backs PMCompetencyFramework.tsx (PM portal
 * "Competency Framework" tab: Gap Report + Position/Library Management).
 *
 * Tables: positions, position_competencies (new — see migration
 * 20260708_pm_competency_positions.sql), plus the existing competencies /
 * employee_competencies / performance_cycles tables from
 * 20260518_pm_performance_evaluations_and_competencies.sql.
 *
 * Position <-> employee linkage is text-matched against
 * employees_with_department.current_position / department (no FK — that
 * table's schema already drifted from its original migration).
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export interface Position {
  id: string;
  name: string;
  department: string;
  description: string | null;
  reqCount: number;
}

export interface Competency {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
}

export interface PositionCompetency {
  id: string;
  position_id: string;
  competency_id: string;
  competency_name: string;
  required_level: number;
}

export type OverallStatus = 'Meets Requirement' | 'Below Requirement' | 'Not Yet Assessed';

export interface EmployeeCompetencyComparison {
  competency_id: string;
  name: string;
  required: number;
  current: number | null;
  status: 'Met' | 'Gap' | 'Not Assessed';
}

export interface EmployeeAssessmentRow {
  employeeId: string;
  employeeNumber: string | null;
  name: string;
  department: string | null;
  position: string | null;
  positionId: string | null;
  overallStatus: OverallStatus;
  missingCount: number;
  dateAssessed: string | null;
  assessor: string | null;
  competencies: EmployeeCompetencyComparison[];
}

type Result<T> = { success: true; data: T } | { success: false; error: string; data: T };

// ── Positions ────────────────────────────────────────────────────────────────

export async function getPositions(): Promise<Result<Position[]>> {
  try {
    const { data: rows, error } = await supabase
      .from('positions')
      .select('id, name, department, description')
      .order('name', { ascending: true });
    if (error) throw error;

    const { data: reqRows, error: reqError } = await supabase
      .from('position_competencies')
      .select('position_id');
    if (reqError) throw reqError;

    const countByPosition = new Map<string, number>();
    for (const r of (reqRows ?? []) as { position_id: string }[]) {
      countByPosition.set(r.position_id, (countByPosition.get(r.position_id) ?? 0) + 1);
    }

    const positions: Position[] = (rows ?? []).map((p: any) => ({
      ...p,
      reqCount: countByPosition.get(p.id) ?? 0,
    }));
    return { success: true, data: positions };
  } catch (error) {
    console.error('[pmCompetencyFramework] getPositions failed:', error);
    return { success: false, error: String(error), data: [] };
  }
}

export async function createPosition(position: { name: string; department: string; description?: string | null }): Promise<Result<Position | null>> {
  try {
    const { data, error } = await supabase
      .from('positions')
      .insert([{ name: position.name, department: position.department, description: position.description ?? null }])
      .select('id, name, department, description')
      .single();
    if (error) throw error;
    return { success: true, data: { ...data, reqCount: 0 } };
  } catch (error) {
    console.error('[pmCompetencyFramework] createPosition failed:', error);
    return { success: false, error: String(error), data: null };
  }
}

export async function updatePosition(id: string, updates: { name?: string; department?: string; description?: string | null }): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('positions').update(updates).eq('id', id);
    if (error) throw error;
    return { success: true, data: null };
  } catch (error) {
    console.error('[pmCompetencyFramework] updatePosition failed:', error);
    return { success: false, error: String(error), data: null };
  }
}

export async function deletePosition(id: string): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('positions').delete().eq('id', id);
    if (error) throw error;
    return { success: true, data: null };
  } catch (error) {
    console.error('[pmCompetencyFramework] deletePosition failed:', error);
    return { success: false, error: String(error), data: null };
  }
}

// ── Position required competencies ──────────────────────────────────────────

export async function getPositionCompetencies(positionId: string): Promise<Result<PositionCompetency[]>> {
  try {
    const { data, error } = await supabase
      .from('position_competencies')
      .select('id, position_id, competency_id, required_level, competencies ( name )')
      .eq('position_id', positionId);
    if (error) throw error;
    const rows: PositionCompetency[] = (data ?? []).map((r: any) => ({
      id: r.id,
      position_id: r.position_id,
      competency_id: r.competency_id,
      competency_name: r.competencies?.name ?? 'Unknown',
      required_level: r.required_level,
    }));
    return { success: true, data: rows };
  } catch (error) {
    console.error('[pmCompetencyFramework] getPositionCompetencies failed:', error);
    return { success: false, error: String(error), data: [] };
  }
}

export async function addPositionCompetency(positionId: string, competencyId: string, requiredLevel: number): Promise<Result<null>> {
  try {
    const { error } = await supabase
      .from('position_competencies')
      .insert([{ position_id: positionId, competency_id: competencyId, required_level: requiredLevel }]);
    if (error) throw error;
    return { success: true, data: null };
  } catch (error) {
    console.error('[pmCompetencyFramework] addPositionCompetency failed:', error);
    return { success: false, error: String(error), data: null };
  }
}

export async function updatePositionCompetencyLevel(id: string, requiredLevel: number): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('position_competencies').update({ required_level: requiredLevel }).eq('id', id);
    if (error) throw error;
    return { success: true, data: null };
  } catch (error) {
    console.error('[pmCompetencyFramework] updatePositionCompetencyLevel failed:', error);
    return { success: false, error: String(error), data: null };
  }
}

export async function removePositionCompetency(id: string): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('position_competencies').delete().eq('id', id);
    if (error) throw error;
    return { success: true, data: null };
  } catch (error) {
    console.error('[pmCompetencyFramework] removePositionCompetency failed:', error);
    return { success: false, error: String(error), data: null };
  }
}

// ── Competency library ───────────────────────────────────────────────────────

export async function getCompetencyLibrary(): Promise<Result<Competency[]>> {
  try {
    const { data, error } = await supabase
      .from('competencies')
      .select('id, name, description, category')
      .order('name', { ascending: true });
    if (error) throw error;
    return { success: true, data: (data ?? []) as Competency[] };
  } catch (error) {
    console.error('[pmCompetencyFramework] getCompetencyLibrary failed:', error);
    return { success: false, error: String(error), data: [] };
  }
}

export async function createCompetency(competency: { name: string; description?: string | null; category?: string | null }): Promise<Result<Competency | null>> {
  try {
    const { data, error } = await supabase
      .from('competencies')
      .insert([{ name: competency.name, description: competency.description ?? null, category: competency.category ?? null }])
      .select('id, name, description, category')
      .single();
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('[pmCompetencyFramework] createCompetency failed:', error);
    return { success: false, error: String(error), data: null };
  }
}

export async function updateCompetency(id: string, updates: { name?: string; description?: string | null; category?: string | null }): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('competencies').update(updates).eq('id', id);
    if (error) throw error;
    return { success: true, data: null };
  } catch (error) {
    console.error('[pmCompetencyFramework] updateCompetency failed:', error);
    return { success: false, error: String(error), data: null };
  }
}

export async function deleteCompetency(id: string): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('competencies').delete().eq('id', id);
    if (error) throw error;
    return { success: true, data: null };
  } catch (error) {
    console.error('[pmCompetencyFramework] deleteCompetency failed:', error);
    return { success: false, error: String(error), data: null };
  }
}

// ── Employee assessments / gap report ───────────────────────────────────────

export interface EmployeeAssessmentFilters {
  department?: string;
  position?: string;
  employeeSearch?: string;
  cycleId?: number | null;
  status?: OverallStatus | '';
}

function computeOverallStatus(comparisons: EmployeeCompetencyComparison[]): OverallStatus {
  if (comparisons.length === 0) return 'Not Yet Assessed';
  if (comparisons.some((c) => c.status === 'Not Assessed')) return 'Not Yet Assessed';
  if (comparisons.some((c) => c.status === 'Gap')) return 'Below Requirement';
  return 'Meets Requirement';
}

export async function getEmployeeAssessments(filters: EmployeeAssessmentFilters = {}): Promise<Result<EmployeeAssessmentRow[]>> {
  try {
    const { data: employees, error: empError } = await supabase
      .from('employees_with_department')
      .select('id, employee_id, full_name, department, current_position');
    if (empError) throw empError;

    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('id, name, department');
    if (posError) throw posError;

    const { data: posComps, error: posCompError } = await supabase
      .from('position_competencies')
      .select('position_id, competency_id, required_level, competencies ( name )');
    if (posCompError) throw posCompError;

    const employeeIds = ((employees ?? []) as any[]).map((e) => e.id);
    let empComps: any[] = [];
    if (employeeIds.length > 0) {
      let query = supabase
        .from('employee_competencies')
        .select('employee_id, competency_id, proficiency_level, assessed_at, assessed_by, cycle_id')
        .in('employee_id', employeeIds);
      if (filters.cycleId) query = query.eq('cycle_id', filters.cycleId);
      const { data, error } = await query;
      if (error) throw error;
      empComps = data ?? [];
    }

    const positionByKey = new Map<string, any>();
    for (const p of (positions ?? []) as any[]) positionByKey.set(`${p.name}::${p.department}`, p);

    const posCompsByPosition = new Map<string, { competency_id: string; name: string; required_level: number }[]>();
    for (const pc of (posComps ?? []) as any[]) {
      const list = posCompsByPosition.get(pc.position_id) ?? [];
      list.push({ competency_id: pc.competency_id, name: pc.competencies?.name ?? 'Unknown', required_level: pc.required_level });
      posCompsByPosition.set(pc.position_id, list);
    }

    const empCompsByEmployee = new Map<string, any[]>();
    for (const ec of empComps) {
      const list = empCompsByEmployee.get(ec.employee_id) ?? [];
      list.push(ec);
      empCompsByEmployee.set(ec.employee_id, list);
    }

    let rows: EmployeeAssessmentRow[] = ((employees ?? []) as any[]).map((emp) => {
      const position = positionByKey.get(`${emp.current_position}::${emp.department}`);
      const requiredComps = position ? (posCompsByPosition.get(position.id) ?? []) : [];
      const employeeRatings = empCompsByEmployee.get(emp.id) ?? [];
      const ratingByCompetency = new Map<string, any>(employeeRatings.map((r) => [r.competency_id, r]));

      const comparisons: EmployeeCompetencyComparison[] = requiredComps.map((rc) => {
        const rating = ratingByCompetency.get(rc.competency_id);
        if (!rating) {
          return { competency_id: rc.competency_id, name: rc.name, required: rc.required_level, current: null, status: 'Not Assessed' };
        }
        const current = rating.proficiency_level as number;
        return {
          competency_id: rc.competency_id,
          name: rc.name,
          required: rc.required_level,
          current,
          status: current >= rc.required_level ? 'Met' : 'Gap',
        };
      });

      const dates = employeeRatings.map((r) => r.assessed_at).filter(Boolean).sort();
      const latest = employeeRatings.slice().sort((a, b) => String(a.assessed_at).localeCompare(String(b.assessed_at))).pop();

      return {
        employeeId: emp.id,
        employeeNumber: emp.employee_id ?? null,
        name: emp.full_name,
        department: emp.department ?? null,
        position: emp.current_position ?? null,
        positionId: position?.id ?? null,
        overallStatus: computeOverallStatus(comparisons),
        missingCount: comparisons.filter((c) => c.status === 'Gap').length,
        dateAssessed: dates.length > 0 ? dates[dates.length - 1] : null,
        assessor: latest?.assessed_by ?? null,
        competencies: comparisons,
      };
    });

    if (filters.department) rows = rows.filter((r) => r.department === filters.department);
    if (filters.position) rows = rows.filter((r) => r.position === filters.position);
    if (filters.status) rows = rows.filter((r) => r.overallStatus === filters.status);
    if (filters.employeeSearch) {
      const q = filters.employeeSearch.trim().toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }

    return { success: true, data: rows };
  } catch (error) {
    console.error('[pmCompetencyFramework] getEmployeeAssessments failed:', error);
    return { success: false, error: String(error), data: [] };
  }
}

export async function saveEmployeeAssessment(
  employeeId: string,
  ratings: { competencyId: string; requiredLevel: number; proficiencyLevel: number }[],
  assessedBy: string,
  cycleId?: number | null,
): Promise<Result<null>> {
  try {
    const now = new Date().toISOString();
    const rows = ratings.map((r) => ({
      employee_id: employeeId,
      competency_id: r.competencyId,
      proficiency_level: r.proficiencyLevel,
      required_level: r.requiredLevel,
      assessed_at: now,
      assessed_by: assessedBy,
      cycle_id: cycleId ?? null,
    }));
    const { error } = await supabase
      .from('employee_competencies')
      .upsert(rows, { onConflict: 'employee_id,competency_id' });
    if (error) throw error;
    return { success: true, data: null };
  } catch (error) {
    console.error('[pmCompetencyFramework] saveEmployeeAssessment failed:', error);
    return { success: false, error: String(error), data: null };
  }
}

// ── Assessment periods (reuses performance_cycles) ──────────────────────────

export async function getAssessmentPeriods(): Promise<Result<{ id: number; title: string }[]>> {
  try {
    const { data, error } = await supabase
      .from('performance_cycles')
      .select('id, title')
      .order('start_date', { ascending: false });
    if (error) throw error;
    return { success: true, data: (data ?? []) as { id: number; title: string }[] };
  } catch (error) {
    console.error('[pmCompetencyFramework] getAssessmentPeriods failed:', error);
    return { success: false, error: String(error), data: [] };
  }
}
