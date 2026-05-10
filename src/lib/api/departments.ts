/**
 * Department API integration.
 * Reads from the canonical `departments` lookup table introduced by
 * migration 006. Use this in place of the static DEPARTMENTS constant
 * in src/constants/positions.ts (kept only as offline fallback).
 */

import { supabase } from '../supabase';

export interface Department {
  id: string;
  code: string;
  name: string;
  head_employee_id: string | null;
  parent_department_id: string | null;
  is_active: boolean;
  created_at: string;
}

export type DepartmentOption = { value: string; label: string };

export async function listDepartments(includeInactive = false) {
  try {
    let query = supabase.from('departments').select('*');
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query.order('name');
    if (error) throw error;
    return { success: true as const, data: (data as Department[]) ?? [] };
  } catch (error) {
    console.error('Error fetching departments:', error);
    return { success: false as const, error: String(error), data: [] as Department[] };
  }
}

export async function getDepartmentById(id: string) {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return { success: true as const, data: data as Department };
  } catch (error) {
    console.error('Error fetching department:', error);
    return { success: false as const, error: String(error) };
  }
}

export async function createDepartment(input: {
  code: string;
  name: string;
  head_employee_id?: string | null;
  parent_department_id?: string | null;
  is_active?: boolean;
}) {
  try {
    const { data, error } = await supabase
      .from('departments')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return { success: true as const, data: data as Department };
  } catch (error) {
    console.error('Error creating department:', error);
    return { success: false as const, error: String(error) };
  }
}

export async function updateDepartment(
  id: string,
  patch: Partial<Omit<Department, 'id' | 'created_at'>>
) {
  try {
    const { data, error } = await supabase
      .from('departments')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { success: true as const, data: data as Department };
  } catch (error) {
    console.error('Error updating department:', error);
    return { success: false as const, error: String(error) };
  }
}

/**
 * Convenience helper for Select components — matches the legacy
 * DEPARTMENT_OPTIONS shape so consumers can swap with minimal change.
 */
export async function getDepartmentOptions(): Promise<DepartmentOption[]> {
  const result = await listDepartments(false);
  if (!result.success) return [];
  return result.data.map((d) => ({ value: d.name, label: d.name }));
}
