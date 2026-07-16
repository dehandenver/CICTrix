// ============================================================================
// Employee → promotional application prefill
// ============================================================================
// A promotional applicant is an existing employee. Everything the application
// form asks for is already on file, so once they authenticate with their
// employee number + portal password we pull the whole profile and fill the
// form in rather than making them retype it.
//
// Sources (all Supabase):
//   employees                 — identity, contact, address, current post
//   employee_education        — highest attainment, degree, school
//   employee_work_experience  — total years/months, most recent post
//   newly_hired               — fallback for RSP-hired employees not yet in
//                               `employees`: identity + current post only
//
// Any table that's missing or empty degrades to blank fields, never to an
// invented value — a blank field the applicant fills in is fine; a wrong
// prefilled one is not.
// ============================================================================

import { supabase } from '../supabase';

export interface EmployeeApplicationProfile {
  /** employees.id (uuid) */
  supabaseId: string;
  employeeNumber: string;

  firstName: string;
  middleName: string;
  lastName: string;
  sex: string;
  address: string;
  contactNumber: string;
  email: string;

  currentPosition: string;
  currentDepartment: string;
  currentDivision: string;

  educationAttainment: string;
  educationDegree: string;
  educationSchool: string;

  workExperienceYears: string;
  workExperienceMonths: string;
  relevantExperiencePosition: string;
  relevantExperienceCompany: string;
  relevantExperienceDuties: string;
}

// employee_education.level uses the HR vocabulary; the application form uses
// the applicant-facing one. Map across, using year_graduated to tell a
// completed degree from an undergraduate one.
const EDUCATION_LEVEL_ORDER: Record<string, number> = {
  Elementary: 1,
  Secondary: 2,
  Vocational: 3,
  College: 4,
  'Graduate Studies': 5,
  Doctorate: 6,
};

const toApplicantAttainment = (level: string, graduated: boolean): string => {
  switch (level) {
    case 'Elementary':
      return graduated ? 'Elementary Graduate' : 'Elementary Level';
    case 'Secondary':
      return graduated ? 'High School Graduate' : 'High School Level';
    case 'Vocational':
      return 'College Level';
    case 'College':
      return graduated ? 'College Graduate' : 'College Level';
    case 'Graduate Studies':
      return graduated ? 'Graduate School' : 'Masteral Units';
    case 'Doctorate':
      return 'Graduate School';
    default:
      return '';
  }
};

const joinAddress = (row: any): string => {
  // Backend migration 001 uses separate address parts;
  // Supabase migration 20260510 uses a single home_address column.
  const parts = [
    row?.current_address_street,
    row?.current_address_barangay,
    row?.current_address_city,
    row?.current_address_province,
    row?.current_address_zipcode,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');

  // Fall back to the single home_address column when the parts are all empty.
  return parts || String(row?.home_address ?? '').trim();
};

/** Whole months between two dates, floored at 0. */
const monthsBetween = (from: string, to: string | null, isPresent: boolean): number => {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return 0;
  const end = isPresent || !to ? new Date() : new Date(to);
  if (Number.isNaN(end.getTime())) return 0;
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(0, months);
};

/**
 * Build a prefill from the RSP `newly_hired` roster. Employees hired through the
 * RSP flow keep their post + department here until their record is migrated into
 * the canonical `employees` table, so this is the only Supabase source for a
 * newly-hired promotional applicant's current position. The linked `applicants`
 * row (via applicant_id) carries the personal details newly_hired lacks — sex,
 * contact number, address, tenure — so those get merged in. Returns null when
 * there's no matching row.
 */
async function fetchProfileFromNewlyHired(
  client: any,
  employeeNumber: string,
  email?: string,
): Promise<EmployeeApplicationProfile | null> {
  // Match by employee_id first. The RSP duplication bug could file a person's
  // hire record under a different generated id than the one on their portal
  // login, so fall back to matching by email — the stable identifier shared
  // across a person's records — when the id doesn't resolve.
  let data: any = null;
  const byId = await client
    .from('newly_hired')
    .select('*')
    .eq('employee_id', employeeNumber)
    .maybeSingle();
  data = byId.data ?? null;

  const normalizedEmail = String(email ?? '').trim();
  if (!data && normalizedEmail) {
    const byEmail = await client
      .from('newly_hired')
      .select('*')
      .ilike('email', normalizedEmail)
      .order('date_hired', { ascending: false })
      .limit(1);
    data = Array.isArray(byEmail.data) && byEmail.data.length > 0 ? byEmail.data[0] : null;
  }

  if (!data) return null;

  // The original application record holds the personal fields newly_hired
  // doesn't (gender, contact, address, tenure). Pull it when linked.
  let applicant: any = null;
  const applicantId = String(data.applicant_id ?? '').trim();
  if (applicantId) {
    const { data: appRow } = await client
      .from('applicants')
      .select('*')
      .eq('id', applicantId)
      .maybeSingle();
    applicant = appRow ?? null;
  }

  // Prefer the applicant record's split name fields (first/middle/last are
  // stored cleanly there); otherwise recombine newly_hired's first_name +
  // last_name (which dumps middle+last into last_name) and re-split.
  const fullName = [data.first_name, data.last_name]
    .map((part: any) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = String(applicant?.first_name ?? '').trim() || (parts[0] ?? '');
  const lastName =
    String(applicant?.last_name ?? '').trim() || (parts.length > 1 ? parts[parts.length - 1] : '');
  const middleName =
    String(applicant?.middle_name ?? '').trim() ||
    (parts.length > 2 ? parts.slice(1, -1).join(' ') : '');

  // Applicants store total tenure as a decimal year (e.g. 1.08); split it back
  // into whole years + months for the two form fields.
  const tenureYearsFloat = Number(applicant?.years_of_experience) || 0;
  const tenureYears = Math.floor(tenureYearsFloat);
  const tenureMonths = Math.round((tenureYearsFloat - tenureYears) * 12);

  return {
    supabaseId: String(data.id ?? ''),
    employeeNumber,

    firstName,
    middleName,
    lastName,
    sex: String(applicant?.gender ?? '').trim(),
    address: String(applicant?.address ?? '').trim(),
    contactNumber: String(applicant?.contact_number ?? data.phone ?? '').trim(),
    email: String(applicant?.email ?? data.email ?? '').trim(),

    currentPosition: String(data.position ?? '').trim(),
    currentDepartment: String(data.department ?? '').trim(),
    currentDivision: String(data.division ?? '').trim(),

    educationAttainment: String(applicant?.education_level ?? '').trim(),
    educationDegree: '',
    educationSchool: '',

    workExperienceYears: tenureYears > 0 ? String(tenureYears) : '',
    workExperienceMonths: tenureMonths > 0 ? String(tenureMonths) : '',
    relevantExperiencePosition: '',
    relevantExperienceCompany: '',
    relevantExperienceDuties: '',
  };
}

/**
 * Look up an employee by employee number and build the full application prefill.
 * Handles both schema variants:
 *   - Backend migration 001: employee_number, first_name, last_name, sex, phone, position, department, division
 *   - Supabase migration 20260510: employee_id, full_name, gender, mobile_number, current_position, current_department, current_division
 * Prefers the canonical `employees` table; when there's no row there yet, falls
 * back to the RSP `newly_hired` roster. Returns null when neither has the number,
 * so the caller leaves the form blank rather than guessing.
 */
export async function fetchEmployeeApplicationProfile(
  employeeNumber: string,
  email?: string,
): Promise<EmployeeApplicationProfile | null> {
  const number = String(employeeNumber ?? '').trim();
  if (!number) return null;

  const client = supabase as any;

  // Try employee_number (backend migration 001) first.
  let employeeRow: any = null;
  const { data: byNumber, error: errByNumber } = await client
    .from('employees')
    .select('*')
    .eq('employee_number', number)
    .maybeSingle();

  if (errByNumber) {
    console.warn('[employeeApplicationProfile] employees lookup by employee_number failed:', errByNumber);
  }
  employeeRow = byNumber;

  // Fall back to employee_id (Supabase migration 20260510) if no match.
  if (!employeeRow) {
    const { data: byId, error: errById } = await client
      .from('employees')
      .select('*')
      .eq('employee_id', number)
      .maybeSingle();

    if (errById) {
      console.warn('[employeeApplicationProfile] employees lookup by employee_id failed:', errById);
    }
    employeeRow = byId;
  }

  // No canonical employees row — fall back to the RSP newly_hired roster,
  // matching by email too so a mismatched employee_id still resolves.
  if (!employeeRow) {
    return fetchProfileFromNewlyHired(client, number, email);
  }

  const employeeId = String(employeeRow.id ?? '');

  // Education and experience are optional detail tables — a failure to read
  // them shouldn't sink the whole prefill, so settle both and tolerate errors.
  const [educationResult, experienceResult] = await Promise.allSettled([
    client.from('employee_education').select('*').eq('employee_id', employeeId),
    client.from('employee_work_experience').select('*').eq('employee_id', employeeId),
  ]);

  // ── Highest educational attainment ──
  let educationAttainment = String(employeeRow.highest_educational_attainment ?? '').trim();
  let educationDegree = '';
  let educationSchool = '';

  if (educationResult.status === 'fulfilled' && Array.isArray(educationResult.value?.data)) {
    const rows = educationResult.value.data as any[];
    const highest = rows.reduce<any | null>((best, row) => {
      const rank = EDUCATION_LEVEL_ORDER[String(row?.level ?? '')] ?? 0;
      const bestRank = best ? EDUCATION_LEVEL_ORDER[String(best.level ?? '')] ?? 0 : -1;
      return rank > bestRank ? row : best;
    }, null);

    if (highest) {
      if (!educationAttainment) {
        educationAttainment = toApplicantAttainment(
          String(highest.level ?? ''),
          Boolean(highest.year_graduated),
        );
      }
      educationDegree = String(highest.course ?? '').trim();
      educationSchool = String(highest.school_name ?? '').trim();
    }
  }

  // ── Work experience: total tenure + the most recent post ──
  let totalMonths = 0;
  let relevantExperiencePosition = '';
  let relevantExperienceCompany = '';
  let relevantExperienceDuties = '';

  if (experienceResult.status === 'fulfilled' && Array.isArray(experienceResult.value?.data)) {
    const rows = experienceResult.value.data as any[];

    totalMonths = rows.reduce(
      (sum, row) =>
        sum +
        monthsBetween(
          String(row?.from_date ?? ''),
          row?.to_date ? String(row.to_date) : null,
          Boolean(row?.is_present),
        ),
      0,
    );

    const mostRecent = rows.reduce<any | null>((latest, row) => {
      if (!latest) return row;
      if (row?.is_present && !latest?.is_present) return row;
      const rowStart = new Date(String(row?.from_date ?? '')).getTime();
      const latestStart = new Date(String(latest?.from_date ?? '')).getTime();
      if (Number.isNaN(rowStart)) return latest;
      if (Number.isNaN(latestStart)) return row;
      return rowStart > latestStart ? row : latest;
    }, null);

    if (mostRecent) {
      relevantExperiencePosition = String(mostRecent.position_title ?? '').trim();
      relevantExperienceCompany = String(mostRecent.company_name ?? '').trim();
      relevantExperienceDuties = String(mostRecent.duties_responsibilities ?? '').trim();
    }
  }

  // Tenure fallback: if no work-experience rows exist, derive from date_hired/hire_date.
  const hireDate = employeeRow.date_hired || employeeRow.hire_date;
  if (totalMonths === 0 && hireDate) {
    totalMonths = monthsBetween(String(hireDate), null, true);
  }

  // Position fallback from the employee row itself.
  const rowPosition = String(employeeRow.position ?? employeeRow.current_position ?? '').trim();
  const rowDepartment = String(employeeRow.department ?? employeeRow.current_department ?? '').trim();
  if (!relevantExperiencePosition) {
    relevantExperiencePosition = rowPosition;
    relevantExperienceCompany = rowDepartment;
  }

  // Handle both schema variants for name fields:
  // Backend migration 001: first_name, middle_name, last_name
  // Supabase migration 20260510: full_name (single column)
  let firstName = String(employeeRow.first_name ?? '').trim();
  let middleName = String(employeeRow.middle_name ?? '').trim();
  let lastName = String(employeeRow.last_name ?? '').trim();

  // If no separate name columns, split from full_name
  if (!firstName && !lastName && employeeRow.full_name) {
    const parts = String(employeeRow.full_name).trim().split(/\s+/).filter(Boolean);
    firstName = parts[0] ?? '';
    lastName = parts.length > 1 ? parts[parts.length - 1] : '';
    middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
  }

  return {
    supabaseId: employeeId,
    employeeNumber: number,

    firstName,
    middleName,
    lastName,
    // sex (backend 001) or gender (Supabase 20260510)
    sex: String(employeeRow.sex ?? employeeRow.gender ?? '').trim(),
    address: joinAddress(employeeRow),
    // phone (backend 001) or mobile_number (Supabase 20260510)
    contactNumber: String(employeeRow.phone ?? employeeRow.mobile_number ?? '').trim(),
    email: String(employeeRow.email ?? '').trim(),

    // position/department/division (backend 001) or current_* (Supabase 20260510)
    currentPosition: rowPosition,
    currentDepartment: rowDepartment,
    currentDivision: String(employeeRow.division ?? employeeRow.current_division ?? '').trim(),

    educationAttainment,
    educationDegree,
    educationSchool,

    workExperienceYears: totalMonths > 0 ? String(Math.floor(totalMonths / 12)) : '',
    workExperienceMonths: totalMonths > 0 ? String(totalMonths % 12) : '',
    relevantExperiencePosition,
    relevantExperienceCompany,
    relevantExperienceDuties,
  };
}
