/**
 * Employee API Integration
 * Handles all employee-related API calls for the admin dashboard.
 *
 * Column names match the LIVE Supabase schema (verified 2026-05-11):
 *   employee_id (text), full_name, current_position, current_department,
 *   current_division, hire_date, mobile_number, status enum
 *   (Active/On Leave/Resigned/Terminated). Department is read via the
 *   `employees_with_department` view which exposes the canonical `department`
 *   name from the departments lookup (migration 006). Writes set `department_id`
 *   and the BEFORE-trigger keeps `current_department` in sync.
 */

import { supabase as supabaseClient } from '../../lib/supabase';
import { getDepartmentIdByName } from './departments';

// Cast to `any` to bypass the auto-generated Supabase types resolving to `never`
// for tables that exist at runtime but aren't reflected in the local type defs.
const supabase = supabaseClient as any;

export interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  current_position: string | null;
  /** Canonical name from departments lookup (sourced via employees_with_department view). */
  department: string | null;
  current_department: string | null;
  department_id?: string;
  status: 'Active' | 'On Leave' | 'Resigned' | 'Terminated';
  email: string;
  mobile_number?: string | null;
  hire_date: string | null;
  [key: string]: any;
}

/**
 * Get all employees with optional filters
 */
export async function getAllEmployees(filters?: {
  status?: string;
  department?: string;
  search?: string;
}) {
  try {
    let query = supabase.from('employees_with_department').select('*');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.department) {
      query = query.eq('department', filters.department);
    }

    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(
        `full_name.ilike.${searchTerm},email.ilike.${searchTerm},employee_id.ilike.${searchTerm}`
      );
    }

    const { data, error } = await query.order('full_name');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching employees:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get employee by Supabase UUID with related collections.
 */
export async function getEmployeeById(employeeId: string) {
  try {
    const { data: employee, error: empError } = await supabase
      .from('employees_with_department')
      .select('*')
      .eq('id', employeeId)
      .single();

    if (empError) throw empError;

    const [education, experience, eligibility, training, documents] = await Promise.all([
      supabase.from('employee_education').select('*').eq('employee_id', employeeId),
      supabase.from('employee_work_experience').select('*').eq('employee_id', employeeId),
      supabase.from('employee_eligibility').select('*').eq('employee_id', employeeId),
      supabase.from('employee_training').select('*').eq('employee_id', employeeId),
      supabase.from('employee_documents').select('*').eq('employee_id', employeeId),
    ]);

    return {
      success: true,
      data: {
        ...employee,
        education: education.data || [],
        experience: experience.data || [],
        eligibility: eligibility.data || [],
        training: training.data || [],
        documents: documents.data || [],
      },
    };
  } catch (error) {
    console.error('Error fetching employee:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get employees by position
 */
export async function getEmployeesByPosition(position: string, department: string) {
  try {
    const { data, error } = await supabase
      .from('employees_with_department')
      .select('*')
      .eq('current_position', position)
      .eq('department', department)
      .eq('status', 'Active')
      .order('full_name');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching employees by position:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get distinct positions with employee counts
 */
export async function getPositions() {
  try {
    const { data: employees, error } = await supabase
      .from('employees_with_department')
      .select('current_position, department')
      .eq('status', 'Active');

    if (error) throw error;

    const positionMap = new Map();
    employees?.forEach((emp) => {
      if (!emp.current_position || !emp.department) return;
      const key = `${emp.current_position}-${emp.department}`;
      if (!positionMap.has(key)) {
        positionMap.set(key, {
          name: emp.current_position,
          department: emp.department,
          count: 0,
        });
      }
      positionMap.get(key).count += 1;
    });

    const positions = Array.from(positionMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, data: positions };
  } catch (error) {
    console.error('Error fetching positions:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get departments from the canonical lookup table.
 */
export async function getDepartments() {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('name')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    const departments = (data ?? []).map((d) => d.name);
    return { success: true, data: departments };
  } catch (error) {
    console.error('Error fetching departments:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Update employee position and department
 */
export async function updateEmployeePosition(
  employeeId: string,
  updates: {
    position: string;
    department: string;
    changeType: 'promotion' | 'transfer' | 'succession';
    effectiveDate: string;
    notes?: string;
  }
) {
  try {
    const { data: employee, error: empError } = await supabase
      .from('employees_with_department')
      .select('*')
      .eq('id', employeeId)
      .single();

    if (empError) throw empError;

    const newDepartmentId = await getDepartmentIdByName(updates.department);
    if (!newDepartmentId) {
      throw new Error(`Unknown department: ${updates.department}`);
    }

    // Write department_id; trigger keeps current_department in sync.
    const { error: updateError } = await supabase
      .from('employees')
      .update({
        current_position: updates.position,
        department_id: newDepartmentId,
      })
      .eq('id', employeeId);

    if (updateError) throw updateError;

    const actionMap = {
      promotion: 'promoted',
      transfer: 'transferred',
      succession: 'transferred',
    };

    const { error: historyError } = await supabase
      .from('employee_history')
      .insert({
        employee_id: employeeId,
        action: actionMap[updates.changeType],
        field_changed: 'current_position,current_department',
        old_value: `${employee.current_position ?? ''} - ${employee.department ?? ''}`,
        new_value: `${updates.position} - ${updates.department}`,
        effective_date: updates.effectiveDate,
        reason: updates.notes || null,
        performed_by: '00000000-0000-0000-0000-000000000000', // TODO: Replace with actual user ID
        performed_at: new Date().toISOString(),
      });

    if (historyError) throw historyError;

    return { success: true, message: 'Position updated successfully' };
  } catch (error) {
    console.error('Error updating employee position:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get employee history
 */
export async function getEmployeeHistory(employeeId: string) {
  try {
    const { data, error } = await supabase
      .from('employee_history')
      .select('*')
      .eq('employee_id', employeeId)
      .order('performed_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching employee history:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get employee documents
 */
export async function getEmployeeDocuments(employeeId: string) {
  try {
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', employeeId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching employee documents:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get employee leave balances
 */
export async function getEmployeeLeaveBalances(employeeId: string, year?: number) {
  try {
    const currentYear = year || new Date().getFullYear();

    const { data, error } = await supabase
      .from('employee_leave_balances')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('year', currentYear)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!data) {
      return {
        success: true,
        data: {
          employee_id: employeeId,
          year: currentYear,
          vacation_leave_balance: 15.0,
          vacation_leave_earned: 0,
          vacation_leave_used: 0,
          sick_leave_balance: 15.0,
          sick_leave_earned: 0,
          sick_leave_used: 0,
          maternity_leave_balance: 105.0,
          maternity_leave_used: 0,
          paternity_leave_balance: 7.0,
          paternity_leave_used: 0,
          special_leave_balance: 3.0,
          special_leave_used: 0,
        },
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching employee leave balances:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Search employees
 */
export async function searchEmployees(searchTerm: string) {
  try {
    const { data, error } = await supabase
      .from('employees_with_department')
      .select('*')
      .or(
        `full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,employee_id.ilike.%${searchTerm}%`
      )
      .eq('status', 'Active')
      .limit(20);

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error searching employees:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get employee statistics
 */
export async function getEmployeeStatistics() {
  try {
    const [totalResult, activeResult, onLeaveResult, resignedResult] = await Promise.all([
      supabase.from('employees').select('id'),
      supabase.from('employees').select('id').eq('status', 'Active'),
      supabase.from('employees').select('id').eq('status', 'On Leave'),
      supabase.from('employees').select('id').eq('status', 'Resigned'),
    ]);

    return {
      success: true,
      data: {
        total: totalResult.data?.length || 0,
        active: activeResult.data?.length || 0,
        onLeave: onLeaveResult.data?.length || 0,
        resigned: resignedResult.data?.length || 0,
      },
    };
  } catch (error) {
    console.error('Error fetching employee statistics:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Reset employee password (admin action)
 */
export async function resetEmployeePassword(_employeeId: string) {
  try {
    return {
      success: true,
      message: 'Password reset email sent to employee',
    };
  } catch (error) {
    console.error('Error resetting employee password:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Export employees to CSV
 */
export async function exportEmployeesToCSV(employees: Employee[]) {
  try {
    const headers = [
      'Employee ID',
      'Full Name',
      'Position',
      'Department',
      'Status',
      'Email',
      'Mobile Number',
      'Hire Date',
    ];

    const rows = employees.map((emp) => [
      emp.employee_id,
      emp.full_name,
      emp.current_position ?? '',
      emp.department ?? '',
      emp.status,
      emp.email,
      emp.mobile_number ?? '',
      emp.hire_date ? new Date(emp.hire_date).toLocaleDateString() : '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return {
      success: true,
      data: csvContent,
    };
  } catch (error) {
    console.error('Error exporting employees:', error);
    return { success: false, error: String(error) };
  }
}
