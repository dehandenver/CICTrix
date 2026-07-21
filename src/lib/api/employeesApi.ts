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
  department_id: string | null;
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
    .from('employees_with_department')
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
    .from('employees_with_department')
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
    .from('employees_with_department')
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
  try {
    const res = await fetch(`${API_BASE_URL}/employees/from-applicant/${applicantId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      return await res.json();
    }
    console.warn(`[employeesApi] Backend hire failed (status ${res.status}), trying client-side fallback...`);
  } catch (fetchErr) {
    console.warn('[employeesApi] Backend hire endpoint unreachable, trying client-side fallback...', fetchErr);
  }

  // Client-side fallback:
  // 1. Fetch applicant details
  const { data: applicant, error: appErr } = await (supabase as any)
    .from('applicants')
    .select('*')
    .eq('id', applicantId)
    .maybeSingle();

  if (appErr || !applicant) {
    throw new Error(appErr?.message || 'Applicant not found in Supabase for client-side fallback');
  }

  // 2. Generate employee number
  const empId = (applicant as any).employee_id || `EMP-${applicantId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  // 3. Resolve department name and ID
  const positionName = (applicant as any).position || 'Staff';
  let departmentName = (applicant as any).office || 'Operations';
  
  // Try to match department name from job_postings
  try {
    const { data: job } = await (supabase as any)
      .from('job_postings')
      .select('department')
      .ilike('title', positionName)
      .maybeSingle();
    if (job?.department) {
      departmentName = job.department;
    }
  } catch { /* ignore */ }

  const legacyMap: Record<string, string> = {
    'Human Resource Management Office': 'Human Resources',
    'Information Technology Office': 'Information Technology',
    'City Planning and Development Office': 'Operations',
    'City Health Office': 'Operations',
    'City Engineering Office': 'Operations',
    "Treasurer's Office": 'Finance',
    'Budget Office': 'Finance',
    'General Services Office': 'Operations',
    'Office of the City Engineer': 'Operations',
    'Office of the City Accountant': 'Finance',
    'Office of the City Social Welfare and Development': 'Operations',
    'IT Department': 'Information Technology',
    'HR Department': 'Human Resources',
    'Finance Department': 'Finance',
    'Legal Department': 'Legal',
    'IT Division': 'Information Technology',
    'Health Office': 'Operations',
    'Treasury Department': 'Finance'
  };

  if (legacyMap[departmentName]) {
    departmentName = legacyMap[departmentName];
  }

  // Resolve department ID from departments table
  let deptId: string | null = null;
  try {
    const { data: dept } = await (supabase as any)
      .from('departments')
      .select('id')
      .eq('name', departmentName)
      .maybeSingle();
    if (dept?.id) {
      deptId = dept.id;
    }
  } catch { /* ignore */ }

  // 4. Construct email
  let email = (applicant as any).email;
  if (!email) {
    const first = String((applicant as any).first_name || '').toLowerCase().replace(/\s+/g, '');
    const last = String((applicant as any).last_name || '').toLowerCase().replace(/\s+/g, '');
    email = `${first}.${last}.${empId.toLowerCase()}@employee.local`;
  }

  // 5. Insert employee record
  const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
  const gender = validGenders.includes((applicant as any).gender) ? (applicant as any).gender : 'Other';

  const insertData = {
    employee_number: empId,
    first_name: (applicant as any).first_name || '',
    middle_name: (applicant as any).middle_name || '',
    last_name: (applicant as any).last_name || '',
    email: email,
    phone: (applicant as any).contact_number || null,
    current_address_street: (applicant as any).address || null,
    permanent_address_street: (applicant as any).address || null,
    sex: gender,
    position: positionName,
    department: departmentName,
    employment_status: 'Regular',
    date_hired: new Date().toISOString().split('T')[0],
    status: 'Active',
    user_account_id: null
  };

  const { data: newEmp, error: insertErr } = await (supabase as any)
    .from('employees')
    .upsert(insertData, { onConflict: 'employee_number' })
    .select()
    .maybeSingle();

  if (insertErr || !newEmp) {
    throw new Error(insertErr?.message || 'Failed to insert employee record in client-side fallback');
  }

  // 6. Update applicant status
  const { error: updateErr } = await (supabase as any)
    .from('applicants')
    .update({ status: 'Hired' })
    .eq('id', applicantId);

  if (updateErr) {
    console.error('[employeesApi] Failed to update applicant status to Hired:', updateErr);
  }

  // 7. Read through view
  const { data: viewEmp } = await (supabase as any)
    .from('employees_with_department')
    .select('*')
    .eq('id', (newEmp as any).id)
    .maybeSingle();

  return (viewEmp || newEmp) as EmployeeRow;
}
