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

const joinAddress = (row: any): string =>
  [
    row?.current_address_street,
    row?.current_address_barangay,
    row?.current_address_city,
    row?.current_address_province,
    row?.current_address_zipcode,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');

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
 * Look up an employee by employee number and build the full application
 * prefill. Returns null when there's no employees row for that number — the
 * caller must then leave the form blank rather than guessing.
 */
export async function fetchEmployeeApplicationProfile(
  employeeNumber: string,
): Promise<EmployeeApplicationProfile | null> {
  const number = String(employeeNumber ?? '').trim();
  if (!number) return null;

  const client = supabase as any;

  const { data: employeeRow, error: employeeError } = await client
    .from('employees')
    .select('*')
    .eq('employee_number', number)
    .maybeSingle();

  if (employeeError) {
    console.warn('[employeeApplicationProfile] employees lookup failed:', employeeError);
    return null;
  }
  if (!employeeRow) return null;

  const employeeId = String(employeeRow.id ?? '');

  // Education and experience are optional detail tables — a failure to read
  // them shouldn't sink the whole prefill, so settle both and tolerate errors.
  const [educationResult, experienceResult] = await Promise.allSettled([
    client.from('employee_education').select('*').eq('employee_id', employeeId),
    client.from('employee_work_experience').select('*').eq('employee_id', employeeId),
  ]);

  // ── Highest educational attainment ──
  // employees.highest_educational_attainment is already in the applicant-facing
  // vocabulary and is what the HR dataset populates, so it wins. The
  // employee_education detail rows fill in degree/school, and stand in for the
  // attainment itself when the column is blank.
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

  // No prior-employment rows on file (common — the HR dataset records the
  // employee's post and hire date, not a full CV). Their service in the agency
  // is still real, relevant experience, so fall back to tenure since date_hired
  // rather than prefilling zero years for a long-serving employee.
  if (totalMonths === 0 && employeeRow.date_hired) {
    totalMonths = monthsBetween(String(employeeRow.date_hired), null, true);
  }
  if (!relevantExperiencePosition) {
    relevantExperiencePosition = String(employeeRow.position ?? '').trim();
    relevantExperienceCompany = String(employeeRow.department ?? '').trim();
  }

  return {
    supabaseId: employeeId,
    employeeNumber: number,

    firstName: String(employeeRow.first_name ?? '').trim(),
    middleName: String(employeeRow.middle_name ?? '').trim(),
    lastName: String(employeeRow.last_name ?? '').trim(),
    sex: String(employeeRow.sex ?? '').trim(),
    address: joinAddress(employeeRow),
    contactNumber: String(employeeRow.phone ?? '').trim(),
    email: String(employeeRow.email ?? '').trim(),

    currentPosition: String(employeeRow.position ?? '').trim(),
    currentDepartment: String(employeeRow.department ?? '').trim(),
    currentDivision: String(employeeRow.division ?? '').trim(),

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
