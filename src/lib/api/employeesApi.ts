import { supabase } from '../supabase';
import { normalizeApplicationType } from './applicantScores';
import {
  PromotionalAppointmentError,
  completePromotionalAppointment,
} from './promotionalHiring';
import type { PromotionalAppointmentResult } from './promotionalHiring';

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
    return { employee: await fetchEmployeeById(result.employeeUuid), promotion: result };
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
};

/**
 * Hire and say which path ran. The type is read from the saved application,
 * so a caller holding a stale cached type still learns it was a promotion.
 */
export async function hireApplicantWithOutcome(applicantId: string): Promise<HireOutcome> {
  if (await isPromotionApplication(applicantId)) {
    return hirePromotion(applicantId);
  }
  return { employee: await hireExternalApplicant(applicantId), promotion: null };
}

/**
 * Hire Applicant Flow.
 * Promotions go through the appointment transaction; external applicants keep
 * the backend-then-client-fallback path below.
 */
export async function hireApplicant(applicantId: string): Promise<EmployeeRow> {
  return (await hireApplicantWithOutcome(applicantId)).employee;
}

/** Thrown when an external hire is refused for a reason a retry cannot fix. The message is written for the person reading it. */
export class ExternalHireError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'ExternalHireError';
  }
}

/** The number in a "Plantilla <n>" label. Same rule as `complete_promotional_appointment`. */
const PLANTILLA_LABEL_NUMBER = /^\s*[Pp]lantilla\s+([0-9]+)\s*$/;

const clean = (value: unknown): string => String(value ?? '').trim();

type ExternalAssignment = { department: string; division: string | null; plantillaNumber: string | null };

/**
 * Office, division and plantilla number for an external hire. The reserved
 * plantilla's posting is the source, as it is for promotions. Without a
 * reserved plantilla, a posting is used only when exactly one has the title.
 * The office is written as the active department's own name, because the
 * `enforce_active_office` trigger rejects anything else.
 */
async function resolveExternalAssignment(applicant: any, positionName: string): Promise<ExternalAssignment> {
  let office = clean(applicant.office);
  let division: string | null = null;
  let plantillaNumber: string | null = null;

  if (applicant.plantilla_slot_id) {
    const { data: slot, error: slotErr } = await (supabase as any)
      .from('plantilla_slots')
      .select('id, job_posting_id, label, division')
      .eq('id', applicant.plantilla_slot_id)
      .maybeSingle();
    if (slotErr) throw new Error(slotErr.message || 'Could not read the plantilla for this application');

    const { data: posting, error: postingErr } = slot
      ? await (supabase as any)
          .from('job_postings')
          .select('id, title, department, division')
          .eq('id', slot.job_posting_id)
          .is('deleted_at', null)
          .maybeSingle()
      : { data: null, error: null };
    if (postingErr) throw new Error(postingErr.message || 'Could not read the job posting for this application');
    if (!slot || !posting) throw new ExternalHireError('The job posting for this plantilla no longer exists.');

    office = clean(posting.department);
    division = clean(slot.division) || clean(posting.division) || null;
    plantillaNumber = PLANTILLA_LABEL_NUMBER.exec(String(slot.label ?? ''))?.[1] ?? null;
  } else {
    const { data: postings, error: postingsErr } = await (supabase as any)
      .from('job_postings')
      .select('id, title, department, division')
      .is('deleted_at', null)
      .ilike('title', positionName);
    if (postingsErr) throw new Error(postingsErr.message || 'Could not read the job postings for this application');
    if (Array.isArray(postings) && postings.length === 1) {
      office = clean(postings[0].department);
      division = clean(postings[0].division) || null;
    }
  }

  if (!office) {
    throw new ExternalHireError("This application has no office. Set the job posting's office, then hire again.");
  }

  const { data: departments, error: departmentsErr } = await (supabase as any)
    .from('departments')
    .select('name')
    .eq('is_active', true);
  if (departmentsErr) throw new Error(departmentsErr.message || 'Could not read the active offices');

  const wanted = office.toLowerCase();
  const matches = ((departments ?? []) as Array<{ name: string }>).filter((d) => clean(d.name).toLowerCase() === wanted);
  if (matches.length === 0) {
    throw new ExternalHireError(
      `Office "${office}" is not an active office. Change the job posting's office to an active one, then hire again.`,
    );
  }
  if (matches.length > 1) {
    throw new ExternalHireError(`Office "${office}" matches more than one active office. Resolve the duplicate first.`);
  }
  return { department: matches[0].name, division, plantillaNumber };
}

/** External applicants: writes via FastAPI, with a client fallback. */
async function hireExternalApplicant(applicantId: string): Promise<EmployeeRow> {
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

  // 2. Resolve office, division and plantilla number. Done first so a hire the
  // database would reject is refused before anything is looked up or written.
  const positionName = (applicant as any).position || 'Staff';
  const assignment = await resolveExternalAssignment(applicant, positionName);

  // 3. Generate and verify unique employee number
  let empId = (applicant as any).employee_id;
  if (!empId) {
    let candidateId = `EMP-${applicantId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      const { data: existing } = await (supabase as any)
        .from('employees')
        .select('employee_number')
        .eq('employee_number', candidateId)
        .maybeSingle();
      if (!existing) {
        isUnique = true;
        empId = candidateId;
      } else {
        const randHex = Math.floor(Math.random() * 0xffffffff).toString(16).padEnd(8, '0').toUpperCase();
        candidateId = `EMP-NH${randHex.slice(0, 6)}`;
        attempts++;
      }
    }
    if (!empId) empId = candidateId;
  } else {
    // If the applicant had a pre-assigned employee_id, verify it doesn't clash
    const { data: clashingEmp } = await (supabase as any)
      .from('employees')
      .select('employee_number')
      .eq('employee_number', empId)
      .maybeSingle();
    
    if (clashingEmp) {
      let candidateId = `EMP-NH${applicantId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 10) {
        const { data: existing } = await (supabase as any)
          .from('employees')
          .select('employee_number')
          .eq('employee_number', candidateId)
          .maybeSingle();
        if (!existing) {
          isUnique = true;
          empId = candidateId;
        } else {
          const randHex = Math.floor(Math.random() * 0xffffffff).toString(16).padEnd(8, '0').toUpperCase();
          candidateId = `EMP-NH${randHex.slice(0, 6)}`;
          attempts++;
        }
      }
      if (!empId) empId = candidateId;
    }
  }

  // 4. Construct email & resolve email uniqueness constraint
  let email = (applicant as any).email;
  if (!email) {
    const first = String((applicant as any).first_name || '').toLowerCase().replace(/\s+/g, '');
    const last = String((applicant as any).last_name || '').toLowerCase().replace(/\s+/g, '');
    email = `${first}.${last}.${empId.toLowerCase()}@employee.local`;
  }

  let finalEmail = email;
  let emailUnique = false;
  let emailAttempts = 0;
  while (!emailUnique && emailAttempts < 10) {
    const { data: existingEmail } = await (supabase as any)
      .from('employees')
      .select('email')
      .eq('email', finalEmail)
      .maybeSingle();
    if (!existingEmail) {
      emailUnique = true;
    } else {
      emailAttempts++;
      const parts = email.split('@');
      finalEmail = `${parts[0]}.${emailAttempts + 1}@${parts[1]}`;
    }
  }

  // 5. Insert employee record (using insert, not upsert, for safety)
  const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
  const gender = validGenders.includes((applicant as any).gender) ? (applicant as any).gender : 'Other';

  const insertData = {
    employee_number: empId,
    first_name: (applicant as any).first_name || '',
    middle_name: (applicant as any).middle_name || '',
    last_name: (applicant as any).last_name || '',
    email: finalEmail,
    phone: (applicant as any).contact_number || null,
    current_address_street: (applicant as any).address || null,
    permanent_address_street: (applicant as any).address || null,
    sex: gender,
    position: positionName,
    department: assignment.department,
    division: assignment.division,
    plantilla_num: assignment.plantillaNumber,
    employment_status: 'Regular',
    date_hired: new Date().toISOString().split('T')[0],
    status: 'Active',
    user_account_id: null
  };

  const { data: newEmp, error: insertErr } = await (supabase as any)
    .from('employees')
    .insert(insertData)
    .select()
    .maybeSingle();

  if (insertErr || !newEmp) {
    throw new Error(insertErr?.message || 'Failed to insert employee record in client-side fallback');
  }

  // 6. Update applicant status and link to the new employee number
  const { error: updateErr } = await (supabase as any)
    .from('applicants')
    .update({ status: 'Hired', employee_id: empId })
    .eq('id', applicantId);

  if (updateErr) {
    console.error('[employeesApi] Failed to update applicant status and link:', updateErr);
  }

  // 7. Read through view
  const { data: viewEmp } = await (supabase as any)
    .from('employees_with_department')
    .select('*')
    .eq('id', (newEmp as any).id)
    .maybeSingle();

  return (viewEmp || newEmp) as EmployeeRow;
}
