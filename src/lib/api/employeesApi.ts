import { supabase } from '../supabase';
import { normalizeApplicationType } from './applicantScores';
import {
  PromotionalAppointmentError,
  completePromotionalAppointment,
} from './promotionalHiring';
import type { PromotionalAppointmentResult } from './promotionalHiring';
import {
  ExternalHireError,
  completeExternalHire,
} from './externalHiring';
import type { ExternalHireResult } from './externalHiring';

export { ExternalHireError };
export type { ExternalHireResult };

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
 * Read the saved application's type remotely. Cached UI state is never trusted
 * for this, and a failed read throws instead of guessing "external": guessing
 * wrong would insert a second employee for someone who already works here.
 */
async function isPromotionApplication(applicantId: string): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from('applicants')
    .select('application_type')
    .eq('id', applicantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Could not read the application to decide how to hire it');
  }
  if (!data) {
    throw new Error('Applicant not found');
  }
  return normalizeApplicationType(data.application_type) === 'promotional';
}

/**
 * Promotion path: the database transaction is the only writer. The employee
 * already exists, so nothing here creates an employee, number, email, account
 * or password, and the backend endpoint is not called.
 */
async function hirePromotion(applicantId: string): Promise<HireOutcome> {
  const result = await completePromotionalAppointment(applicantId);
  try {
    return { employee: await fetchEmployeeById(result.employeeUuid), promotion: result, external: null };
  } catch (err) {
    // The appointment is committed. Retrying replays the RPC, which answers
    // already_completed, and then reads the employee again.
    throw new PromotionalAppointmentError(
      'The promotion was completed, but the employee record could not be loaded. Retry to load it. Retrying will not appoint the employee again.',
      { kind: 'employee_read_failed', retryable: true, code: String((err as any)?.code ?? '') || null },
    );
  }
}

export type HireOutcome = {
  employee: EmployeeRow;
  /** Set when the saved application was a promotion. The employee kept their account, so callers must not issue credentials. */
  promotion: PromotionalAppointmentResult | null;
  /** Set when the saved application completed through the external appointment transaction. */
  external?: ExternalHireResult | null;
};

/**
 * Hire and say which path ran. The type is read from the saved application,
 * so a caller holding a stale cached type still learns it was a promotion.
 */
export async function hireApplicantWithOutcome(applicantId: string): Promise<HireOutcome> {
  if (await isPromotionApplication(applicantId)) {
    return hirePromotion(applicantId);
  }
  return hireExternalApplicant(applicantId);
}

/**
 * Hire Applicant Flow.
 * Promotions and external appointments both execute via database RPC transactions.
 */
export async function hireApplicant(applicantId: string): Promise<EmployeeRow> {
  return (await hireApplicantWithOutcome(applicantId)).employee;
}

/**
 * External path: the database transaction `complete_external_hire` is the only
 * writer. It never falls back to FastAPI or client-side inserts/updates.
 */
async function hireExternalApplicant(applicantId: string): Promise<HireOutcome> {
  const result = await completeExternalHire(applicantId);
  try {
    const employee = await fetchEmployeeById(result.employeeUuid);
    if (!employee) {
      throw new Error('Employee record was not found after hire');
    }
    return { employee, promotion: null, external: result };
  } catch (err) {
    // The appointment is committed. Retrying replays the RPC, which answers
    // already_completed, and then reads the employee again.
    throw new ExternalHireError(
      'The external hire was completed, but the employee record could not be loaded. Retry to load it. Retrying will not hire the applicant again.',
      { kind: 'employee_read_failed', retryable: true, code: String((err as any)?.code ?? '') || null },
    );
  }
}
