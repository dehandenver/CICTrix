import { supabase } from '../supabase';
import type { Database } from '../../types/database.types';

// Ideally this comes from the generated types. 
// We manually bridge it here according to the schema since we can't regenerate types yet.
export type EmployeeRow = {
  id: string;
  employee_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  date_of_birth: string | null;
  place_of_birth: string | null;
  gender: string | null;
  civil_status: string | null;
  nationality: string | null;
  mobile_number: string | null;
  home_address: string | null;
  emergency_contact_name: string | null;
  emergency_relationship: string | null;
  emergency_contact_number: string | null;
  sss_number: string | null;
  philhealth_number: string | null;
  pagibig_number: string | null;
  tin_number: string | null;
  current_position: string | null;
  current_department: string | null;
  current_division: string | null;
  status: 'Active' | 'On Leave' | 'Resigned' | 'Terminated';
  hire_date: string | null;
  position_history: any[];
  personal_details_finalized: boolean;
  created_at: string;
  updated_at: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Fetch all employees. Uses Supabase JS Client for reads via PostgREST.
 */
export async function fetchEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as EmployeeRow[];
}

/**
 * Fetch a single employee by their Supabase UUID.
 */
export async function fetchEmployeeById(id: string) {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as EmployeeRow;
}

/**
 * Fetch an employee by their custom literal Employee ID (EMP-XXXX...)
 */
export async function fetchEmployeeByEmpId(employee_id: string) {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('employee_id', employee_id)
    .single();

  // Handle case where we use this in auth resolution and don't want to strictly throw
  if (error && error.code === 'PGRST116') return null;
  if (error) throw error;
  return data as EmployeeRow;
}

/**
 * Get JWT Helper
 */
async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

/**
 * Hire Applicant Flow (writes via FastAPI).
 */
export async function hireApplicant(applicantId: string): Promise<EmployeeRow> {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE_URL}/employees/from-applicant/${applicantId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to hire applicant');
  }

  return res.json();
}
