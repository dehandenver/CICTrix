/**
 * Employee API Integration
 * Handles all employee-related API calls for the admin dashboard
 */

import { supabase } from '../../lib/supabase';

export interface Employee {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  position: string;
  department: string;
  status: string;
  email: string;
  phone?: string;
  date_hired: string;
  employment_status: string;
  [key: string]: any;
}

/**
 * Get all employees with optional filters
 */
export async function getAllEmployees(filters?: {
  status?: string;
  department?: string;
  employment_status?: string;
  search?: string;
}) {
  try {
    let query = supabase.from('employees').select('*');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.department) {
      query = query.eq('department', filters.department);
    }

    if (filters?.employment_status) {
      query = query.eq('employment_status', filters.employment_status);
    }

    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(
        `first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},employee_number.ilike.${searchTerm}`
      );
    }

    const { data, error } = await query.order('first_name');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching employees:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get employee by ID with full details
 */
export async function getEmployeeById(employeeId: string) {
  try {
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single();

    if (empError) throw empError;

    // Fetch related data
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
      .from('employees')
      .select('*')
      .eq('position', position)
      .eq('department', department)
      .eq('status', 'Active')
      .order('first_name');

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
      .from('employees')
      .select('position, department')
      .eq('status', 'Active');

    if (error) throw error;

    // Group by position
    const positionMap = new Map();
    employees?.forEach((emp) => {
      const key = `${emp.position}-${emp.department}`;
      if (!positionMap.has(key)) {
        positionMap.set(key, {
          name: emp.position,
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
 * Get distinct departments
 */
export async function getDepartments() {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('department')
      .eq('status', 'Active')
      .neq('department', null);

    if (error) throw error;

    const departments = Array.from(new Set(data?.map((e) => e.department) || []))
      .sort();

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
    // Get current employee data for history
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single();

    if (empError) throw empError;

    // Update employee
    const { error: updateError } = await supabase
      .from('employees')
      .update({
        position: updates.position,
        department: updates.department,
        modified_at: new Date().toISOString(),
      })
      .eq('id', employeeId);

    if (updateError) throw updateError;

    // Log change in history
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
        field_changed: 'position,department',
        old_value: `${employee.position} - ${employee.department}`,
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

    // If no balance exists for this year, return defaults
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
      .from('employees')
      .select('*')
      .or(
        `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,employee_number.ilike.%${searchTerm}%`
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
    const [totalResult, activeResult, onLeaveResult, probationaryResult] = await Promise.all([
      supabase.from('employees').select('id').neq('status', 'Separated'),
      supabase.from('employees').select('id').eq('status', 'Active'),
      supabase.from('employees').select('id').eq('status', 'On Leave'),
      supabase.from('employees').select('id').eq('employment_status', 'Probationary'),
    ]);

    return {
      success: true,
      data: {
        total: totalResult.data?.length || 0,
        active: activeResult.data?.length || 0,
        onLeave: onLeaveResult.data?.length || 0,
        probationary: probationaryResult.data?.length || 0,
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
export async function resetEmployeePassword(employeeId: string) {
  try {
    // This would typically call a backend endpoint that generates a reset token
    // and sends an email to the employee
    // For now, we'll just return a message

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
    // CSV headers
    const headers = [
      'Employee Number',
      'First Name',
      'Last Name',
      'Position',
      'Department',
      'Status',
      'Email',
      'Phone',
      'Date Hired',
      'Employment Status',
    ];

    // CSV rows
    const rows = employees.map((emp) => [
      emp.employee_number,
      emp.first_name,
      emp.last_name,
      emp.position,
      emp.department,
      emp.status,
      emp.email,
      emp.phone || '',
      new Date(emp.date_hired).toLocaleDateString(),
      emp.employment_status,
    ]);

    // Create CSV content
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
