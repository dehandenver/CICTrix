/**
 * Personal Data Sheet — the two repeating lists on CS Form 212 page 1.
 *
 * Item 23 (NAME of CHILDREN) and item 26 (EDUCATIONAL BACKGROUND) are lists,
 * so they live in their own tables rather than as columns on `employees`.
 * Everything else on page 1 is a scalar and goes through `employeePortal.ts`.
 *
 * Both lists use replace-all semantics: the form edits the whole list at once,
 * and rows carry no meaning outside their position in it, so reconciling
 * individual inserts/updates/deletes against what the user happens to have
 * typed would add a lot of matching logic for no behavioural difference.
 */

import { supabase as supabaseClient } from '../supabase';
import {
  EDUCATION_LEVELS,
  type EmployeeChild,
  type EmployeeEducation,
} from '../../types/employee.types';

const supabase = supabaseClient as any;

export type PdsResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// 23. Children
// ---------------------------------------------------------------------------

export async function listChildren(employeeId: string): Promise<PdsResult<EmployeeChild[]>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('employee_children')
      .select('id, full_name, date_of_birth, sort_order')
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        fullName: r.full_name ?? '',
        dateOfBirth: r.date_of_birth ?? undefined,
        sortOrder: r.sort_order ?? 0,
      })),
    };
  } catch (err: any) {
    console.error('[personalDataSheet] listChildren error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load children.' };
  }
}

export async function saveChildren(
  employeeId: string,
  children: EmployeeChild[],
): Promise<PdsResult<null>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };

  // A row with no name is an empty form line the employee never filled in,
  // not a child — dropping it here keeps blank rows out of the printed sheet.
  const rows = children
    .filter((c) => c.fullName?.trim())
    .map((c, i) => ({
      employee_id: employeeId,
      full_name: c.fullName.trim(),
      date_of_birth: c.dateOfBirth || null,
      sort_order: i,
    }));

  try {
    const { error: delError } = await supabase
      .from('employee_children')
      .delete()
      .eq('employee_id', employeeId);
    if (delError) throw delError;

    if (rows.length > 0) {
      const { error: insError } = await supabase.from('employee_children').insert(rows);
      if (insError) throw insError;
    }
    return { ok: true, data: null };
  } catch (err: any) {
    console.error('[personalDataSheet] saveChildren error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save children.' };
  }
}

// ---------------------------------------------------------------------------
// 26. Educational background
// ---------------------------------------------------------------------------

export async function listEducation(employeeId: string): Promise<PdsResult<EmployeeEducation[]>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('employee_education')
      .select('id, level, school, degree, period_from, period_to, highest_level_units, year_graduated, scholarship_honors, sort_order')
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        level: r.level ?? '',
        school: r.school ?? '',
        degree: r.degree ?? '',
        periodFrom: r.period_from ?? '',
        periodTo: r.period_to ?? '',
        highestLevelUnits: r.highest_level_units ?? '',
        yearGraduated: r.year_graduated ?? null,
        scholarshipHonors: r.scholarship_honors ?? '',
        sortOrder: r.sort_order ?? 0,
      })),
    };
  } catch (err: any) {
    console.error('[personalDataSheet] listEducation error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load education.' };
  }
}

export async function saveEducation(
  employeeId: string,
  rows: EmployeeEducation[],
): Promise<PdsResult<null>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };

  // Keep a level's row only when something was actually entered on it. The form
  // always renders all five levels, so untouched ones would otherwise persist
  // as empty records and print as stray rows.
  const payload = rows
    .filter((r) =>
      [r.school, r.degree, r.periodFrom, r.periodTo, r.highestLevelUnits, r.scholarshipHonors]
        .some((v) => v?.toString().trim()) || r.yearGraduated,
    )
    .map((r, i) => ({
      employee_id: employeeId,
      level: r.level || null,
      school: r.school?.trim() || null,
      degree: r.degree?.trim() || null,
      period_from: r.periodFrom?.trim() || null,
      period_to: r.periodTo?.trim() || null,
      highest_level_units: r.highestLevelUnits?.trim() || null,
      // smallint column: an empty box must become NULL, not NaN.
      year_graduated: Number.isFinite(Number(r.yearGraduated)) && r.yearGraduated
        ? Number(r.yearGraduated)
        : null,
      scholarship_honors: r.scholarshipHonors?.trim() || null,
      sort_order: i,
    }));

  try {
    const { error: delError } = await supabase
      .from('employee_education')
      .delete()
      .eq('employee_id', employeeId);
    if (delError) throw delError;

    if (payload.length > 0) {
      const { error: insError } = await supabase.from('employee_education').insert(payload);
      if (insError) throw insError;
    }
    return { ok: true, data: null };
  } catch (err: any) {
    console.error('[personalDataSheet] saveEducation error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save education.' };
  }
}

/**
 * The five form rows, pre-filled from whatever is stored.
 *
 * The sheet always prints all five levels in a fixed order whether or not the
 * employee attended them, so the editor is seeded the same way instead of
 * starting empty and asking the employee to add rows.
 */
export function buildEducationRows(stored: EmployeeEducation[]): EmployeeEducation[] {
  return EDUCATION_LEVELS.map((level, i) => {
    const match = stored.find((r) => r.level === level);
    return (
      match ?? {
        level,
        school: '',
        degree: '',
        periodFrom: '',
        periodTo: '',
        highestLevelUnits: '',
        yearGraduated: null,
        scholarshipHonors: '',
        sortOrder: i,
      }
    );
  });
}
