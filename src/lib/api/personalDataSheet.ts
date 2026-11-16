/**
 * Personal Data Sheet — the two repeating lists on CS Form 212 page 1.
 *
 * Item 23 (NAME of CHILDREN) and item 26 (EDUCATIONAL BACKGROUND) are lists,
 * so they live in their own tables rather than as columns on `employees`.
 * Everything else on page 1 is a scalar and goes through `employeePortal.ts`.
 *
 * Both lists use replace-all semantics: the form edits the whole list at once,
 * and rows carry no meaning outside their position in it, so reconciling
 * individual inserts/updates/deletes against what the user happens to have
 * typed would add a lot of matching logic for no behavioural difference.
 */

import { supabase as supabaseClient } from '../supabase';
import {
  EDUCATION_LEVELS,
  type EmployeeChild,
  type EmployeeEducation,
  type EmployeeEligibility,
  type EmployeeWorkExperience,
  type EmployeeVoluntaryWork,
  type EmployeeLdIntervention,
  type EmployeeReference,
  type PdsFieldIssue,
  type PdsListSection,
} from '../../types/employee.types';

// Re-exported so callers of the PDS service do not need a second import path
// for the validator's shared types.
export type { PdsFieldIssue, PdsListSection } from '../../types/employee.types';

const supabase = supabaseClient as any;

export type PdsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldIssues?: PdsFieldIssue[] };

// ---------------------------------------------------------------------------
// Row validation shared by every PDS list
//
// The editor seeds blank rows so the printed sheet's fixed layout is visible.
// Those placeholders only carry their level/sort order, which are not input.
// A row with real input is validated and either saved or rejected loudly; an
// existing row (one with an id) is never dropped just because a field is
// empty. The same function runs inside each save service, before any delete
// or insert, so a partially filled row can never reach the database.
// ---------------------------------------------------------------------------

type PdsRowBySection = {
  children: EmployeeChild;
  education: EmployeeEducation;
  eligibility: EmployeeEligibility;
  workExperience: EmployeeWorkExperience;
  voluntaryWork: EmployeeVoluntaryWork;
  training: EmployeeLdIntervention;
  references: EmployeeReference;
};

export function validatePdsRows<S extends PdsListSection>(
  section: S,
  rows: readonly PdsRowBySection[S][],
): PdsFieldIssue[] {
  switch (section) {
    case 'children':
      return validateChildrenRows(rows as readonly EmployeeChild[]);
    case 'education':
      return validateEducationRows(rows as readonly EmployeeEducation[]);
    case 'eligibility':
      return validateEligibilityRows(rows as readonly EmployeeEligibility[]);
    case 'workExperience':
      return validateWorkExperienceRows(rows as readonly EmployeeWorkExperience[]);
    case 'voluntaryWork':
      return validateVoluntaryWorkRows(rows as readonly EmployeeVoluntaryWork[]);
    case 'training':
      return validateLdInterventionRows(rows as readonly EmployeeLdIntervention[]);
    case 'references':
      return validateReferenceRows(rows as readonly EmployeeReference[]);
  }
}

const MEANINGFUL_FIELDS: Record<PdsListSection, readonly string[]> = {
  children: ['fullName', 'dateOfBirth'],
  // level and sortOrder describe the placeholder row, not employee input.
  education: ['school', 'degree', 'periodFrom', 'periodTo', 'highestLevelUnits', 'yearGraduated', 'scholarshipHonors'],
  eligibility: ['eligibilityName', 'rating', 'examDate', 'examPlace', 'licenseNumber', 'licenseValidUntil'],
  workExperience: ['dateFrom', 'dateTo', 'positionTitle', 'departmentAgencyOfficeCompany', 'statusOfAppointment', 'govtService'],
  voluntaryWork: ['orgNameAddress', 'dateFrom', 'dateTo', 'numberOfHours', 'positionNatureOfWork'],
  training: ['title', 'dateFrom', 'dateTo', 'numberOfHours', 'ldType', 'conductedBy'],
  references: ['name', 'address', 'contactInfo'],
};

const hasInput = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
};

function hasMeaningfulInput(section: PdsListSection, row: object): boolean {
  const record = row as Record<string, unknown>;
  // An existing row is never treated as disposable input.
  if (hasInput(record.id)) return true;
  return MEANINGFUL_FIELDS[section].some((field) => hasInput(record[field]));
}

function validateRequiredText(
  issues: PdsFieldIssue[],
  rowIndex: number,
  field: string,
  label: string,
  value: unknown,
): void {
  if (!hasInput(value)) {
    issues.push({ rowIndex, field, message: `${label} is required.` });
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function calendarDateValue(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!ISO_DATE.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}

function validateDateField(
  issues: PdsFieldIssue[],
  rowIndex: number,
  field: string,
  label: string,
  value: unknown,
): number | null {
  if (!hasInput(value)) return null;
  const time = calendarDateValue(value);
  if (time == null) {
    issues.push({
      rowIndex,
      field,
      message: `${label} must be a valid calendar date (YYYY-MM-DD).`,
    });
  }
  return time;
}

function validateNumberField(
  issues: PdsFieldIssue[],
  rowIndex: number,
  field: string,
  label: string,
  value: unknown,
  integerOnly = false,
): void {
  if (!hasInput(value)) return;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    issues.push({ rowIndex, field, message: `${label} must be a finite number.` });
    return;
  }
  if (integerOnly && !Number.isInteger(number)) {
    issues.push({ rowIndex, field, message: `${label} must be a whole number.` });
  }
}

function validateDateRange(
  issues: PdsFieldIssue[],
  rowIndex: number,
  fromLabel: string,
  fromTime: number | null,
  toField: string,
  toLabel: string,
  toTime: number | null,
): void {
  if (fromTime != null && toTime != null && toTime < fromTime) {
    issues.push({
      rowIndex,
      field: toField,
      message: `${toLabel} cannot be earlier than ${fromLabel}.`,
    });
  }
}

function validateChildrenRows(rows: readonly EmployeeChild[]): PdsFieldIssue[] {
  const issues: PdsFieldIssue[] = [];
  rows.forEach((row, rowIndex) => {
    if (!hasMeaningfulInput('children', row)) return;
    validateRequiredText(issues, rowIndex, 'fullName', 'Full name', row.fullName);
    validateDateField(issues, rowIndex, 'dateOfBirth', 'Date of birth', row.dateOfBirth);
  });
  return issues;
}

function validateEducationRows(rows: readonly EmployeeEducation[]): PdsFieldIssue[] {
  const issues: PdsFieldIssue[] = [];
  rows.forEach((row, rowIndex) => {
    if (!hasMeaningfulInput('education', row)) return;
    validateRequiredText(issues, rowIndex, 'school', 'Name of school', row.school);
    validateNumberField(issues, rowIndex, 'periodFrom', 'Year attended from', row.periodFrom, true);
    validateNumberField(issues, rowIndex, 'periodTo', 'Year attended to', row.periodTo, true);
    validateNumberField(issues, rowIndex, 'highestLevelUnits', 'Units earned', row.highestLevelUnits, true);
    validateNumberField(issues, rowIndex, 'yearGraduated', 'Year graduated', row.yearGraduated, true);
    if (
      typeof row.periodFrom === 'number' &&
      typeof row.periodTo === 'number' &&
      Number.isInteger(row.periodFrom) &&
      Number.isInteger(row.periodTo)
    ) {
      validateDateRange(
        issues,
        rowIndex,
        'Year attended from',
        row.periodFrom,
        'periodTo',
        'Year attended to',
        row.periodTo,
      );
    }
  });
  return issues;
}

function validateEligibilityRows(rows: readonly EmployeeEligibility[]): PdsFieldIssue[] {
  const issues: PdsFieldIssue[] = [];
  rows.forEach((row, rowIndex) => {
    if (!hasMeaningfulInput('eligibility', row)) return;
    validateRequiredText(issues, rowIndex, 'eligibilityName', 'Eligibility', row.eligibilityName);
    validateNumberField(issues, rowIndex, 'rating', 'Rating', row.rating);
    validateDateField(issues, rowIndex, 'examDate', 'Date of examination', row.examDate);
    validateDateField(issues, rowIndex, 'licenseValidUntil', 'License validity date', row.licenseValidUntil);
  });
  return issues;
}

function validateWorkExperienceRows(rows: readonly EmployeeWorkExperience[]): PdsFieldIssue[] {
  const issues: PdsFieldIssue[] = [];
  rows.forEach((row, rowIndex) => {
    if (!hasMeaningfulInput('workExperience', row)) return;
    validateRequiredText(issues, rowIndex, 'dateFrom', 'Date From', row.dateFrom);
    validateRequiredText(issues, rowIndex, 'positionTitle', 'Position title', row.positionTitle);
    validateRequiredText(
      issues,
      rowIndex,
      'departmentAgencyOfficeCompany',
      'Department/Agency/Office/Company',
      row.departmentAgencyOfficeCompany,
    );
    const fromTime = validateDateField(issues, rowIndex, 'dateFrom', 'Date From', row.dateFrom);
    const toTime = validateDateField(issues, rowIndex, 'dateTo', 'Date To', row.dateTo);
    validateDateRange(issues, rowIndex, 'Date From', fromTime, 'dateTo', 'Date To', toTime);
  });
  return issues;
}

function validateVoluntaryWorkRows(rows: readonly EmployeeVoluntaryWork[]): PdsFieldIssue[] {
  const issues: PdsFieldIssue[] = [];
  rows.forEach((row, rowIndex) => {
    if (!hasMeaningfulInput('voluntaryWork', row)) return;
    validateRequiredText(issues, rowIndex, 'orgNameAddress', 'Name & address of organization', row.orgNameAddress);
    const fromTime = validateDateField(issues, rowIndex, 'dateFrom', 'Date From', row.dateFrom);
    const toTime = validateDateField(issues, rowIndex, 'dateTo', 'Date To', row.dateTo);
    validateDateRange(issues, rowIndex, 'Date From', fromTime, 'dateTo', 'Date To', toTime);
    validateNumberField(issues, rowIndex, 'numberOfHours', 'Number of hours', row.numberOfHours);
  });
  return issues;
}

function validateLdInterventionRows(rows: readonly EmployeeLdIntervention[]): PdsFieldIssue[] {
  const issues: PdsFieldIssue[] = [];
  rows.forEach((row, rowIndex) => {
    if (!hasMeaningfulInput('training', row)) return;
    validateRequiredText(issues, rowIndex, 'title', 'Title of L&D intervention/training program', row.title);
    const fromTime = validateDateField(issues, rowIndex, 'dateFrom', 'Date From', row.dateFrom);
    const toTime = validateDateField(issues, rowIndex, 'dateTo', 'Date To', row.dateTo);
    validateDateRange(issues, rowIndex, 'Date From', fromTime, 'dateTo', 'Date To', toTime);
    validateNumberField(issues, rowIndex, 'numberOfHours', 'Number of hours', row.numberOfHours);
  });
  return issues;
}

function validateReferenceRows(rows: readonly EmployeeReference[]): PdsFieldIssue[] {
  const issues: PdsFieldIssue[] = [];
  rows.forEach((row, rowIndex) => {
    if (!hasMeaningfulInput('references', row)) return;
    validateRequiredText(issues, rowIndex, 'name', 'Name', row.name);
  });
  return issues;
}

function meaningfulRows<S extends PdsListSection>(
  section: S,
  rows: readonly PdsRowBySection[S][],
): PdsRowBySection[S][] {
  return rows.filter((row) => hasMeaningfulInput(section, row));
}

function validationFailure(issues: PdsFieldIssue[]): { ok: false; error: string; fieldIssues: PdsFieldIssue[] } {
  const detail = issues.map((issue) => `Row ${issue.rowIndex + 1}: ${issue.message}`).join(' ');
  return {
    ok: false,
    error: `Fix the following entries before saving. ${detail}`,
    fieldIssues: issues,
  };
}

const toNullableNumber = (value: number | null | undefined): number | null => {
  if (value == null || (value as unknown) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toNullableInt = (value: number | null | undefined): number | null => {
  const number = toNullableNumber(value);
  return number == null ? null : Math.trunc(number);
};

// ---------------------------------------------------------------------------
// 23. Children
// ---------------------------------------------------------------------------

export async function listChildren(employeeId: string): Promise<PdsResult<EmployeeChild[]>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('employee_children')
      .select('id, full_name, date_of_birth, sort_order')
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        fullName: r.full_name ?? '',
        dateOfBirth: r.date_of_birth ?? undefined,
        sortOrder: r.sort_order ?? 0,
      })),
    };
  } catch (err: any) {
    console.error('[personalDataSheet] listChildren error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load children.' };
  }
}

export async function saveChildren(
  employeeId: string,
  children: EmployeeChild[],
): Promise<PdsResult<null>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };

  const issues = validatePdsRows('children', children);
  if (issues.length > 0) return validationFailure(issues);

  // Wholly blank new rows are empty form lines the employee never filled in,
  // not children — dropping them keeps blank rows out of the printed sheet.
  const rows = meaningfulRows('children', children).map((c, i) => ({
    employee_id: employeeId,
    full_name: c.fullName.trim(),
    date_of_birth: c.dateOfBirth || null,
    sort_order: i,
  }));

  try {
    const { error: delError } = await supabase
      .from('employee_children')
      .delete()
      .eq('employee_id', employeeId);
    if (delError) throw delError;

    if (rows.length > 0) {
      const { error: insError } = await supabase.from('employee_children').insert(rows);
      if (insError) throw insError;
    }
    return { ok: true, data: null };
  } catch (err: any) {
    console.error('[personalDataSheet] saveChildren error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save children.' };
  }
}

// ---------------------------------------------------------------------------
// 26. Educational background
//
// employee_education is a pre-existing table (predates this PDS work), so
// this reads/writes its real columns (school_name NOT NULL, course,
// year_attended_from/to as ints, units_earned as int, honors_awards, and a
// `level` column constrained by valid_education_level to Elementary/
// Secondary/Vocational/College/'Graduate Studies'/Doctorate — see
// EDUCATION_LEVELS's comment) rather than PDS-invented column names.
// ---------------------------------------------------------------------------

export async function listEducation(employeeId: string): Promise<PdsResult<EmployeeEducation[]>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('employee_education')
      .select('id, level, school_name, course, year_attended_from, year_attended_to, units_earned, year_graduated, honors_awards, sort_order')
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        level: r.level ?? '',
        school: r.school_name ?? '',
        degree: r.course ?? '',
        periodFrom: r.year_attended_from ?? null,
        periodTo: r.year_attended_to ?? null,
        highestLevelUnits: r.units_earned ?? null,
        yearGraduated: r.year_graduated ?? null,
        scholarshipHonors: r.honors_awards ?? '',
        sortOrder: r.sort_order ?? 0,
      })),
    };
  } catch (err: any) {
    console.error('[personalDataSheet] listEducation error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load education.' };
  }
}

export async function saveEducation(
  employeeId: string,
  rows: EmployeeEducation[],
): Promise<PdsResult<null>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };

  const issues = validatePdsRows('education', rows);
  if (issues.length > 0) return validationFailure(issues);

  // school_name is NOT NULL on the real table, so a row with real input but
  // no school name is rejected above rather than silently dropped here.
  const payload = meaningfulRows('education', rows).map((r, i) => ({
    employee_id: employeeId,
    level: r.level || null,
    school_name: r.school!.trim(),
    course: r.degree?.trim() || null,
    year_attended_from: toNullableInt(r.periodFrom),
    year_attended_to: toNullableInt(r.periodTo),
    units_earned: toNullableInt(r.highestLevelUnits),
    year_graduated: toNullableInt(r.yearGraduated),
    honors_awards: r.scholarshipHonors?.trim() || null,
    sort_order: i,
  }));

  try {
    const { error: delError } = await supabase
      .from('employee_education')
      .delete()
      .eq('employee_id', employeeId);
    if (delError) throw delError;

    if (payload.length > 0) {
      const { error: insError } = await supabase.from('employee_education').insert(payload);
      if (insError) throw insError;
    }
    return { ok: true, data: null };
  } catch (err: any) {
    console.error('[personalDataSheet] saveEducation error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save education.' };
  }
}

/**
 * The six schema levels, in the order the form prints them. Doctorate is a
 * stored value in `employee_education` even though the printed form folds it
 * under Graduate Studies; it is never rewritten into that level here.
 */
const PDS_EDUCATION_SCHEMA_LEVELS = [...EDUCATION_LEVELS, 'Doctorate'] as const;

/**
 * The form rows, pre-filled from whatever is stored.
 *
 * The sheet prints every level in a fixed order whether or not the employee
 * attended it, so the editor is seeded the same way instead of starting empty
 * and asking the employee to add rows. Every stored row is preserved,
 * including repeated levels and Doctorate; a blank placeholder is added only
 * for a level with no stored row.
 */
export function buildEducationRows(stored: EmployeeEducation[]): EmployeeEducation[] {
  const grouped = new Map<string, EmployeeEducation[]>();
  for (const row of stored) {
    const level = row.level ?? '';
    const bucket = grouped.get(level);
    if (bucket) bucket.push(row);
    else grouped.set(level, [row]);
  }

  const rows: EmployeeEducation[] = [];
  for (const level of PDS_EDUCATION_SCHEMA_LEVELS) {
    const matches = grouped.get(level);
    if (matches?.length) {
      rows.push(...matches);
      grouped.delete(level);
      continue;
    }
    rows.push({
      level,
      school: '',
      degree: '',
      periodFrom: null,
      periodTo: null,
      highestLevelUnits: null,
      yearGraduated: null,
      scholarshipHonors: '',
      sortOrder: rows.length,
    });
  }

  // Preserve any stored level outside the schema list instead of dropping an
  // existing qualification on the floor.
  for (const matches of grouped.values()) rows.push(...matches);
  return rows;
}

// ---------------------------------------------------------------------------
// 27. Civil Service Eligibility
//
// employee_eligibility is a pre-existing table (predates this PDS work — see
// the page 2-4 migration's comment), so this reads/writes its real columns
// (eligibility_type, rating numeric, date_of_exam, place_of_examination,
// validity_date) rather than PDS-invented ones.
// ---------------------------------------------------------------------------

export async function listEligibility(employeeId: string): Promise<PdsResult<EmployeeEligibility[]>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('employee_eligibility')
      .select('id, eligibility_type, rating, date_of_exam, place_of_examination, license_number, validity_date, sort_order')
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        eligibilityName: r.eligibility_type ?? '',
        rating: r.rating ?? null,
        examDate: r.date_of_exam ?? '',
        examPlace: r.place_of_examination ?? '',
        licenseNumber: r.license_number ?? '',
        licenseValidUntil: r.validity_date ?? '',
        sortOrder: r.sort_order ?? 0,
      })),
    };
  } catch (err: any) {
    console.error('[personalDataSheet] listEligibility error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load eligibility.' };
  }
}

export async function saveEligibility(
  employeeId: string,
  rows: EmployeeEligibility[],
): Promise<PdsResult<null>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };

  const issues = validatePdsRows('eligibility', rows);
  if (issues.length > 0) return validationFailure(issues);

  const payload = meaningfulRows('eligibility', rows).map((r, i) => ({
    employee_id: employeeId,
    eligibility_type: r.eligibilityName.trim(),
    rating: toNullableNumber(r.rating),
    date_of_exam: r.examDate || null,
    place_of_examination: r.examPlace?.trim() || null,
    license_number: r.licenseNumber?.trim() || null,
    validity_date: r.licenseValidUntil || null,
    sort_order: i,
  }));

  try {
    const { error: delError } = await supabase
      .from('employee_eligibility')
      .delete()
      .eq('employee_id', employeeId);
    if (delError) throw delError;

    if (payload.length > 0) {
      const { error: insError } = await supabase.from('employee_eligibility').insert(payload);
      if (insError) throw insError;
    }
    return { ok: true, data: null };
  } catch (err: any) {
    console.error('[personalDataSheet] saveEligibility error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save eligibility.' };
  }
}

// ---------------------------------------------------------------------------
// 28. Work Experience
//
// employee_work_experience is also pre-existing (same admin read path).
// position_title, company_name and from_date are NOT NULL on that table, so
// a row missing any of the three is dropped rather than sent — a partially
// filled row would otherwise fail the whole save with a DB constraint error.
// ---------------------------------------------------------------------------

export async function listWorkExperience(employeeId: string): Promise<PdsResult<EmployeeWorkExperience[]>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('employee_work_experience')
      .select('id, from_date, to_date, position_title, company_name, status_of_appointment, is_government_service, sort_order')
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        dateFrom: r.from_date ?? '',
        dateTo: r.to_date ?? '',
        positionTitle: r.position_title ?? '',
        departmentAgencyOfficeCompany: r.company_name ?? '',
        statusOfAppointment: r.status_of_appointment ?? '',
        govtService: r.is_government_service ?? null,
        sortOrder: r.sort_order ?? 0,
      })),
    };
  } catch (err: any) {
    console.error('[personalDataSheet] listWorkExperience error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load work experience.' };
  }
}

export async function saveWorkExperience(
  employeeId: string,
  rows: EmployeeWorkExperience[],
): Promise<PdsResult<null>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };

  const issues = validatePdsRows('workExperience', rows);
  if (issues.length > 0) return validationFailure(issues);

  const payload = meaningfulRows('workExperience', rows).map((r, i) => ({
    employee_id: employeeId,
    from_date: r.dateFrom!,
    to_date: r.dateTo || null,
    position_title: r.positionTitle.trim(),
    company_name: r.departmentAgencyOfficeCompany!.trim(),
    status_of_appointment: r.statusOfAppointment?.trim() || null,
    is_government_service: r.govtService ?? null,
    sort_order: i,
  }));

  try {
    const { error: delError } = await supabase
      .from('employee_work_experience')
      .delete()
      .eq('employee_id', employeeId);
    if (delError) throw delError;

    if (payload.length > 0) {
      const { error: insError } = await supabase.from('employee_work_experience').insert(payload);
      if (insError) throw insError;
    }
    return { ok: true, data: null };
  } catch (err: any) {
    console.error('[personalDataSheet] saveWorkExperience error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save work experience.' };
  }
}

// ---------------------------------------------------------------------------
// 29. Voluntary Work
// ---------------------------------------------------------------------------

export async function listVoluntaryWork(employeeId: string): Promise<PdsResult<EmployeeVoluntaryWork[]>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('employee_voluntary_work')
      .select('id, org_name_address, date_from, date_to, number_of_hours, position_nature_of_work, sort_order')
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        orgNameAddress: r.org_name_address ?? '',
        dateFrom: r.date_from ?? '',
        dateTo: r.date_to ?? '',
        numberOfHours: r.number_of_hours ?? null,
        positionNatureOfWork: r.position_nature_of_work ?? '',
        sortOrder: r.sort_order ?? 0,
      })),
    };
  } catch (err: any) {
    console.error('[personalDataSheet] listVoluntaryWork error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load voluntary work.' };
  }
}

export async function saveVoluntaryWork(
  employeeId: string,
  rows: EmployeeVoluntaryWork[],
): Promise<PdsResult<null>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };

  const issues = validatePdsRows('voluntaryWork', rows);
  if (issues.length > 0) return validationFailure(issues);

  const payload = meaningfulRows('voluntaryWork', rows).map((r, i) => ({
    employee_id: employeeId,
    org_name_address: r.orgNameAddress.trim(),
    date_from: r.dateFrom || null,
    date_to: r.dateTo || null,
    number_of_hours: toNullableNumber(r.numberOfHours),
    position_nature_of_work: r.positionNatureOfWork?.trim() || null,
    sort_order: i,
  }));

  try {
    const { error: delError } = await supabase
      .from('employee_voluntary_work')
      .delete()
      .eq('employee_id', employeeId);
    if (delError) throw delError;

    if (payload.length > 0) {
      const { error: insError } = await supabase.from('employee_voluntary_work').insert(payload);
      if (insError) throw insError;
    }
    return { ok: true, data: null };
  } catch (err: any) {
    console.error('[personalDataSheet] saveVoluntaryWork error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save voluntary work.' };
  }
}

// ---------------------------------------------------------------------------
// 30. Learning & Development Interventions
// ---------------------------------------------------------------------------

export async function listLdInterventions(employeeId: string): Promise<PdsResult<EmployeeLdIntervention[]>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('employee_ld_interventions')
      .select('id, title, date_from, date_to, number_of_hours, ld_type, conducted_by, sort_order')
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title ?? '',
        dateFrom: r.date_from ?? '',
        dateTo: r.date_to ?? '',
        numberOfHours: r.number_of_hours ?? null,
        ldType: r.ld_type ?? '',
        conductedBy: r.conducted_by ?? '',
        sortOrder: r.sort_order ?? 0,
      })),
    };
  } catch (err: any) {
    console.error('[personalDataSheet] listLdInterventions error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load L&D interventions.' };
  }
}

export async function saveLdInterventions(
  employeeId: string,
  rows: EmployeeLdIntervention[],
): Promise<PdsResult<null>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };

  const issues = validatePdsRows('training', rows);
  if (issues.length > 0) return validationFailure(issues);

  const payload = meaningfulRows('training', rows).map((r, i) => ({
    employee_id: employeeId,
    title: r.title.trim(),
    date_from: r.dateFrom || null,
    date_to: r.dateTo || null,
    number_of_hours: toNullableNumber(r.numberOfHours),
    ld_type: r.ldType?.trim() || null,
    conducted_by: r.conductedBy?.trim() || null,
    sort_order: i,
  }));

  try {
    const { error: delError } = await supabase
      .from('employee_ld_interventions')
      .delete()
      .eq('employee_id', employeeId);
    if (delError) throw delError;

    if (payload.length > 0) {
      const { error: insError } = await supabase.from('employee_ld_interventions').insert(payload);
      if (insError) throw insError;
    }
    return { ok: true, data: null };
  } catch (err: any) {
    console.error('[personalDataSheet] saveLdInterventions error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save L&D interventions.' };
  }
}

// ---------------------------------------------------------------------------
// 41. References
// ---------------------------------------------------------------------------

export async function listReferences(employeeId: string): Promise<PdsResult<EmployeeReference[]>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  try {
    const { data, error } = await supabase
      .from('employee_references')
      .select('id, name, address, contact_info, sort_order')
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name ?? '',
        address: r.address ?? '',
        contactInfo: r.contact_info ?? '',
        sortOrder: r.sort_order ?? 0,
      })),
    };
  } catch (err: any) {
    console.error('[personalDataSheet] listReferences error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load references.' };
  }
}

export async function saveReferences(
  employeeId: string,
  rows: EmployeeReference[],
): Promise<PdsResult<null>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };

  const issues = validatePdsRows('references', rows);
  if (issues.length > 0) return validationFailure(issues);

  const payload = meaningfulRows('references', rows).map((r, i) => ({
    employee_id: employeeId,
    name: r.name.trim(),
    address: r.address?.trim() || null,
    contact_info: r.contactInfo?.trim() || null,
    sort_order: i,
  }));

  try {
    const { error: delError } = await supabase
      .from('employee_references')
      .delete()
      .eq('employee_id', employeeId);
    if (delError) throw delError;

    if (payload.length > 0) {
      const { error: insError } = await supabase.from('employee_references').insert(payload);
      if (insError) throw insError;
    }
    return { ok: true, data: null };
  } catch (err: any) {
    console.error('[personalDataSheet] saveReferences error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save references.' };
  }
}
