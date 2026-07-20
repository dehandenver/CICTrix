/**
 * Employee Portal — Supabase integration layer
 *
 * This module is the *only* place that knows the mapping between:
 *   - The frontend `Employee` type (camelCase, portal-friendly)
 *   - The Supabase `employees` table columns (snake_case, DB schema)
 *
 * All reads/writes from `EmployeePage.tsx` that touch the live DB go through here.
 * The admin API (`src/lib/api/employees.ts`) is kept separate and unchanged.
 */

import { supabase as supabaseClient } from '../supabase';
import type { Employee } from '../../types/employee.types';

// Bypass strict generated types — same pattern as the rest of the codebase.
const supabase = supabaseClient as any;

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Map a raw Supabase `employees` row → frontend `Employee` shape.
 * Only maps fields that the Employee Portal actually uses.
 */
export function mapSupabaseRowToEmployee(row: any): Employee {
  const firstName = (row.first_name ?? '').trim();
  const middleName = (row.middle_name ?? '').trim();
  const lastName = (row.last_name ?? '').trim();
  const suffix = (row.suffix ?? '').trim();

  const nameParts = [firstName, middleName, lastName, suffix].filter(Boolean);
  const fullName = nameParts.join(' ');

  // Flatten address fields into a single string for the portal display.
  const addressParts = [
    row.current_address_street,
    row.current_address_barangay,
    row.current_address_city,
    row.current_address_province,
    row.current_address_zipcode,
  ].filter(Boolean);
  const homeAddress = addressParts.join(', ');

  // Normalise gender: DB allows 'Male' | 'Female' | 'Other'; portal adds 'Prefer not to say'.
  const rawSex = row.sex as string | null;
  let gender: Employee['gender'] = 'Prefer not to say';
  if (rawSex === 'Male') gender = 'Male';
  else if (rawSex === 'Female') gender = 'Female';
  else if (rawSex === 'Other') gender = 'Other';

  // Civil status — normalise 'Divorced' (portal) vs DB enum.
  const rawCivil = row.civil_status as string | null;
  const allowedCivil = ['Single', 'Married', 'Widowed', 'Divorced', 'Separated'] as const;
  const civilStatus: Employee['civilStatus'] =
    (allowedCivil as readonly string[]).includes(rawCivil ?? '')
      ? (rawCivil as Employee['civilStatus'])
      : 'Single';

  // Compute approximate age from date_of_birth.
  let age = 0;
  if (row.date_of_birth) {
    const dob = new Date(row.date_of_birth);
    const today = new Date();
    age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  }

  return {
    // Supabase internal ID — needed for writes.
    supabaseId: row.id ?? undefined,

    // Human-readable employee number.
    employeeId: row.employee_number ?? '',

    fullName,
    email: row.email ?? '',

    // Personal details.
    dateOfBirth: row.date_of_birth ?? '',
    placeOfBirth: row.place_of_birth ?? undefined,
    age,
    gender,
    civilStatus,
    nationality: row.nationality ?? 'Filipino',

    // Contact.
    mobileNumber: row.phone ?? '',
    homeAddress,

    // Emergency contact.
    emergencyContactName: row.emergency_contact_name ?? '',
    emergencyRelationship: row.emergency_contact_relationship ?? '',
    emergencyContactNumber: row.emergency_contact_phone ?? '',

    // Government IDs.
    sssNumber: row.sss_number ?? '',
    philhealthNumber: row.philhealth_number ?? '',
    pagibigNumber: row.pagibig_number ?? '',
    tinNumber: row.tin_number ?? '',
    gsisNumber: row.gsis_number ?? undefined,

    // Work info (read-only in the portal, but included for display).
    currentPosition: row.position ?? undefined,
    currentDepartment: row.department ?? undefined,
    employmentStatus: row.employment_status ?? undefined,
    dateHired: row.date_hired ?? undefined,

    // Metadata.
    createdAt: row.created_at ?? undefined,
    updatedAt: row.modified_at ?? undefined,

    // personal_details_finalized is an optional DB column — fall back to false if absent.
    personalDetailsFinalized: row.personal_details_finalized ?? false,
  };
}

/**
 * Map a partial `Employee` patch → Supabase column names.
 * Only includes fields that the portal is allowed to edit.
 */
function mapPatchToColumns(patch: Partial<Employee>): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  if (patch.email !== undefined)
    row.email = patch.email;

  if (patch.mobileNumber !== undefined)
    row.phone = patch.mobileNumber;

  // Write the full address string into the street column as a best-effort mapping.
  if (patch.homeAddress !== undefined)
    row.current_address_street = patch.homeAddress;

  if (patch.dateOfBirth !== undefined)
    row.date_of_birth = patch.dateOfBirth || null;

  if (patch.placeOfBirth !== undefined)
    row.place_of_birth = patch.placeOfBirth || null;

  if (patch.gender !== undefined) {
    // Map 'Prefer not to say' → 'Other' to satisfy the DB CHECK constraint.
    row.sex = patch.gender === 'Prefer not to say' ? 'Other' : patch.gender;
  }

  if (patch.fullName !== undefined) {
    // Best-effort: write the full name into first_name when editing via the portal.
    // A proper split would require more context (e.g., a separate name-fields form).
    row.first_name = patch.fullName;
  }

  // Emergency contact.
  if (patch.emergencyContactName !== undefined)
    row.emergency_contact_name = patch.emergencyContactName;
  if (patch.emergencyRelationship !== undefined)
    row.emergency_contact_relationship = patch.emergencyRelationship;
  if (patch.emergencyContactNumber !== undefined)
    row.emergency_contact_phone = patch.emergencyContactNumber;

  // Government IDs.
  if (patch.sssNumber !== undefined)
    row.sss_number = patch.sssNumber;
  if (patch.philhealthNumber !== undefined)
    row.philhealth_number = patch.philhealthNumber;
  if (patch.pagibigNumber !== undefined)
    row.pagibig_number = patch.pagibigNumber;
  if (patch.tinNumber !== undefined)
    row.tin_number = patch.tinNumber;
  if (patch.gsisNumber !== undefined)
    row.gsis_number = patch.gsisNumber;

  // Lock flag — written once after the first personal details save.
  if (patch.personalDetailsFinalized !== undefined)
    row.personal_details_finalized = patch.personalDetailsFinalized;

  row.modified_at = new Date().toISOString();

  return row;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a single `employees` row by its Supabase UUID and return it mapped
 * to the portal `Employee` shape.
 *
 * Returns `{ ok: false }` when the row doesn't exist or on any DB error.
 */
export async function fetchPortalEmployeeById(
  supabaseId: string,
): Promise<{ ok: true; data: Employee } | { ok: false; error: string }> {
  if (!supabaseId) return { ok: false, error: 'No supabase ID provided.' };

  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', supabaseId)
      .single();

    if (error) throw error;
    if (!data) return { ok: false, error: 'Employee row not found.' };

    return { ok: true, data: mapSupabaseRowToEmployee(data) };
  } catch (err: any) {
    console.error('[employeePortal] fetchPortalEmployeeById error:', err);
    return { ok: false, error: err?.message ?? 'Unknown error fetching employee.' };
  }
}

/**
 * Look up a single `employees` row by `employee_number` (the human-readable ID
 * such as "EMP-2026-001") and return the mapped portal `Employee`.
 *
 * Used at login time to resolve `supabaseId` from the localStorage account.
 */
export async function fetchPortalEmployeeByNumber(
  employeeNumber: string,
): Promise<{ ok: true; data: Employee } | { ok: false; error: string }> {
  if (!employeeNumber) return { ok: false, error: 'No employee number provided.' };

  try {
    // Read through employees_with_department, not the base employees table.
    // employees has RLS enabled with policies that only match Supabase-Auth
    // admins / self-users (20260510_create_employees_table.sql); portal
    // employees reach PostgREST as anon, so the base table returns zero rows
    // and login silently loses supabaseId (the "account not linked" banner).
    // The view is GRANTed to anon and bypasses RLS. It renames some columns,
    // so normalise back to the base-column names mapSupabaseRowToEmployee reads.
    const { data, error } = await (supabase as any)
      .from('employees_with_department')
      .select('*')
      .eq('employee_id', employeeNumber) // view: employee_number AS employee_id
      .maybeSingle();

    if (error) throw error;
    if (!data) return { ok: false, error: `No employee row found for ${employeeNumber}.` };

    const normalised = {
      ...data,
      employee_number: data.employee_id,
      phone: data.mobile_number,
      sex: data.gender,
      current_address_street: data.home_address,
      // The view exposes these as current_position / current_department;
      // mapSupabaseRowToEmployee reads the base-table names. Without this the
      // portal showed no position at all for a newly hired employee.
      position: data.current_position ?? data.position,
      department: data.current_department ?? data.department,
    };

    return { ok: true, data: mapSupabaseRowToEmployee(normalised) };
  } catch (err: any) {
    console.error('[employeePortal] fetchPortalEmployeeByNumber error:', err);
    return { ok: false, error: err?.message ?? 'Unknown error.' };
  }
}

/**
 * Persist a partial patch to the `employees` row identified by the Supabase UUID.
 * Only the fields present in `patch` are sent — no full-object replacement.
 */
export async function patchPortalEmployee(
  supabaseId: string,
  patch: Partial<Employee>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabaseId) return { ok: false, error: 'No supabase ID — cannot save.' };

  const columns = mapPatchToColumns(patch);
  if (Object.keys(columns).length <= 1) {
    // Only modified_at was set — nothing to write.
    return { ok: true };
  }

  try {
    const { error } = await supabase
      .from('employees')
      .update(columns)
      .eq('id', supabaseId);

    if (error) throw error;
    return { ok: true };
  } catch (err: any) {
    console.error('[employeePortal] patchPortalEmployee error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save to database.' };
  }
}

/**
 * Copy contact details captured on the application onto the employee row, at
 * the moment portal credentials are generated.
 *
 * The applicant supplies email, phone and address when they apply, but the
 * portal's Personal Information reads `employees`, not `applicants` — so a new
 * hire was met by the "complete your profile" wizard asking for an address they
 * had already typed. The generated portal account can't carry it either:
 * `employee_portal_accounts` has no address column, so anything set there is
 * dropped on the way to Supabase.
 *
 * Only fills columns that are currently blank — never overwrites a value an
 * employee has already corrected in the portal. Best-effort: a failure here
 * must not block credential generation, so it logs and resolves.
 */
export async function seedEmployeeContactFromApplication(
  employeeNumber: string,
  contact: { homeAddress?: string; mobileNumber?: string; email?: string },
): Promise<void> {
  const number = String(employeeNumber ?? '').trim();
  if (!number) return;

  try {
    const { data, error } = await (supabase as any)
      .from('employees')
      .select('id, email, phone, current_address_street')
      .eq('employee_number', number)
      .maybeSingle();
    if (error) throw error;
    if (!data) return;

    const blank = (v: unknown) => !String(v ?? '').trim();
    const columns: Record<string, unknown> = {};
    if (blank(data.current_address_street) && contact.homeAddress?.trim())
      columns.current_address_street = contact.homeAddress.trim();
    if (blank(data.phone) && contact.mobileNumber?.trim())
      columns.phone = contact.mobileNumber.trim();
    if (blank(data.email) && contact.email?.trim())
      columns.email = contact.email.trim();

    if (Object.keys(columns).length === 0) return;

    const { error: updateError } = await (supabase as any)
      .from('employees')
      .update(columns)
      .eq('id', data.id);
    if (updateError) throw updateError;
  } catch (err: any) {
    console.error('[employeePortal] seedEmployeeContactFromApplication failed:', err);
  }
}
