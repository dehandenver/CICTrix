/**
 * Personal Data Sheet repeating lists on CS Form 212.
 *
 * Every list is read and saved through one pair of transactional RPCs:
 * `read_pds_section` returns a canonical snapshot plus a revision, and
 * `save_pds_section` reconciles the submitted rows against that revision
 * inside a single database transaction. The service never deletes and
 * re-inserts a list, so row IDs, creation metadata, and legacy columns such
 * as work-experience duties survive an edit.
 *
 * Children and references also own family/background scalar columns on
 * `employees`; those travel in the same RPC call so a scalar failure rolls
 * the list back and a list failure rolls the scalars back. Other PDS scalars
 * still go through `employeePortal.ts`.
 */

import { supabase as supabaseClient } from '../supabase';
import {
  EDUCATION_LEVELS,
  type Employee,
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
import {
  mapPdsScalarColumnsToEmployee,
  mapPdsScalarPatchToColumns,
  type PdsScalarPairing,
} from './employeePortal';

// Re-exported so callers of the PDS service do not need a second import path
// for the validator's shared types.
export type { PdsFieldIssue, PdsListSection } from '../../types/employee.types';

const supabase = supabaseClient as any;

/** Canonical section state returned by both PDS RPCs. */
export type PdsSectionSnapshot<T> = {
  rows: T[];
  revision: string;
  scalars?: Partial<Employee>;
};

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
// Snapshot transport
// ---------------------------------------------------------------------------

function pairingForSection(section: PdsListSection): PdsScalarPairing | null {
  if (section === 'children') return 'family';
  if (section === 'references') return 'background';
  return null;
}

function mapChildRow(row: any): EmployeeChild {
  return {
    id: row.id,
    fullName: row.full_name ?? '',
    dateOfBirth: row.date_of_birth ?? undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

function mapEducationRow(row: any): EmployeeEducation {
  return {
    id: row.id,
    level: row.level ?? '',
    school: row.school_name ?? '',
    degree: row.course ?? '',
    periodFrom: row.year_attended_from ?? null,
    periodTo: row.year_attended_to ?? null,
    highestLevelUnits: row.units_earned ?? null,
    yearGraduated: row.year_graduated ?? null,
    scholarshipHonors: row.honors_awards ?? '',
    sortOrder: row.sort_order ?? 0,
  };
}

function mapEligibilityRow(row: any): EmployeeEligibility {
  return {
    id: row.id,
    eligibilityName: row.eligibility_type ?? '',
    rating: row.rating ?? null,
    examDate: row.date_of_exam ?? '',
    examPlace: row.place_of_examination ?? '',
    licenseNumber: row.license_number ?? '',
    licenseValidUntil: row.validity_date ?? '',
    sortOrder: row.sort_order ?? 0,
  };
}

function mapWorkExperienceRow(row: any): EmployeeWorkExperience {
  return {
    id: row.id,
    dateFrom: row.from_date ?? '',
    dateTo: row.to_date ?? '',
    positionTitle: row.position_title ?? '',
    departmentAgencyOfficeCompany: row.company_name ?? '',
    statusOfAppointment: row.status_of_appointment ?? '',
    govtService: row.is_government_service ?? null,
    sortOrder: row.sort_order ?? 0,
  };
}

function mapVoluntaryWorkRow(row: any): EmployeeVoluntaryWork {
  return {
    id: row.id,
    orgNameAddress: row.org_name_address ?? '',
    dateFrom: row.date_from ?? '',
    dateTo: row.date_to ?? '',
    numberOfHours: row.number_of_hours ?? null,
    positionNatureOfWork: row.position_nature_of_work ?? '',
    sortOrder: row.sort_order ?? 0,
  };
}

function mapLdInterventionRow(row: any): EmployeeLdIntervention {
  return {
    id: row.id,
    title: row.title ?? '',
    dateFrom: row.date_from ?? '',
    dateTo: row.date_to ?? '',
    numberOfHours: row.number_of_hours ?? null,
    ldType: row.ld_type ?? '',
    conductedBy: row.conducted_by ?? '',
    sortOrder: row.sort_order ?? 0,
  };
}

function mapReferenceRow(row: any): EmployeeReference {
  return {
    id: row.id,
    name: row.name ?? '',
    address: row.address ?? '',
    contactInfo: row.contact_info ?? '',
    sortOrder: row.sort_order ?? 0,
  };
}

function mapSectionRows<S extends PdsListSection>(
  section: S,
  rows: any[],
): PdsRowBySection[S][] {
  switch (section) {
    case 'children':
      return rows.map(mapChildRow) as PdsRowBySection[S][];
    case 'education':
      return rows.map(mapEducationRow) as PdsRowBySection[S][];
    case 'eligibility':
      return rows.map(mapEligibilityRow) as PdsRowBySection[S][];
    case 'workExperience':
      return rows.map(mapWorkExperienceRow) as PdsRowBySection[S][];
    case 'voluntaryWork':
      return rows.map(mapVoluntaryWorkRow) as PdsRowBySection[S][];
    case 'training':
      return rows.map(mapLdInterventionRow) as PdsRowBySection[S][];
    case 'references':
      return rows.map(mapReferenceRow) as PdsRowBySection[S][];
  }
}

/**
 * Convert the editor's rows to the database column names the RPC expects.
 * sort_order is deliberately omitted: the server assigns it from the submitted
 * order, so the returned snapshot is the canonical order even if the editor
 * was showing placeholders.
 */
function rowPayload<S extends PdsListSection>(
  section: S,
  rows: readonly PdsRowBySection[S][],
): Record<string, unknown>[] {
  return meaningfulRows(section, rows).map((row) => {
    const r = row as any;
    const withId: Record<string, unknown> = r.id ? { id: r.id } : {};
    switch (section) {
      case 'children':
        return {
          ...withId,
          full_name: r.fullName.trim(),
          date_of_birth: r.dateOfBirth || null,
        };
      case 'education':
        return {
          ...withId,
          level: r.level || null,
          school_name: r.school!.trim(),
          course: r.degree?.trim() || null,
          year_attended_from: toNullableInt(r.periodFrom),
          year_attended_to: toNullableInt(r.periodTo),
          units_earned: toNullableInt(r.highestLevelUnits),
          year_graduated: toNullableInt(r.yearGraduated),
          honors_awards: r.scholarshipHonors?.trim() || null,
        };
      case 'eligibility':
        return {
          ...withId,
          eligibility_type: r.eligibilityName.trim(),
          rating: toNullableNumber(r.rating),
          date_of_exam: r.examDate || null,
          place_of_examination: r.examPlace?.trim() || null,
          license_number: r.licenseNumber?.trim() || null,
          validity_date: r.licenseValidUntil || null,
        };
      case 'workExperience':
        return {
          ...withId,
          from_date: r.dateFrom!,
          to_date: r.dateTo || null,
          position_title: r.positionTitle.trim(),
          company_name: r.departmentAgencyOfficeCompany!.trim(),
          status_of_appointment: r.statusOfAppointment?.trim() || null,
          is_government_service: r.govtService ?? null,
        };
      case 'voluntaryWork':
        return {
          ...withId,
          org_name_address: r.orgNameAddress.trim(),
          date_from: r.dateFrom || null,
          date_to: r.dateTo || null,
          number_of_hours: toNullableNumber(r.numberOfHours),
          position_nature_of_work: r.positionNatureOfWork?.trim() || null,
        };
      case 'training':
        return {
          ...withId,
          title: r.title.trim(),
          date_from: r.dateFrom || null,
          date_to: r.dateTo || null,
          number_of_hours: toNullableNumber(r.numberOfHours),
          ld_type: r.ldType?.trim() || null,
          conducted_by: r.conductedBy?.trim() || null,
        };
      case 'references':
        return {
          ...withId,
          name: r.name.trim(),
          address: r.address?.trim() || null,
          contact_info: r.contactInfo?.trim() || null,
        };
    }
  });
}

function snapshotFailure(
  error: any,
  fallback: string,
): { ok: false; error: string } {
  const message = String(error?.message ?? '');
  if (error?.code === '40001' || message.includes('pds_revision_conflict')) {
    return {
      ok: false,
      error: 'This section changed since it was loaded. Reload it before saving again.',
    };
  }
  return { ok: false, error: error?.message ?? fallback };
}

function parseSnapshot<S extends PdsListSection>(
  section: S,
  payload: any,
  fallback: string,
): PdsResult<PdsSectionSnapshot<PdsRowBySection[S]>> {
  if (!payload || !Array.isArray(payload.rows) || typeof payload.revision !== 'string') {
    return { ok: false, error: fallback };
  }

  const pairing = pairingForSection(section);
  const scalars =
    pairing && payload.scalars && typeof payload.scalars === 'object'
      ? mapPdsScalarColumnsToEmployee(pairing, payload.scalars as Record<string, unknown>)
      : {};

  return {
    ok: true,
    data: {
      rows: mapSectionRows(section, payload.rows),
      revision: payload.revision,
      scalars,
    },
  };
}

async function readPdsSection<S extends PdsListSection>(
  employeeId: string,
  section: S,
): Promise<PdsResult<PdsSectionSnapshot<PdsRowBySection[S]>>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };

  try {
    const { data, error } = await supabase.rpc('read_pds_section', {
      p_employee_id: employeeId,
      p_section: section,
    });
    if (error) return snapshotFailure(error, `Failed to load ${section}.`);
    return parseSnapshot(section, data, `Failed to load ${section}.`);
  } catch (err: any) {
    console.error(`[personalDataSheet] read ${section} error:`, err);
    return snapshotFailure(err, `Failed to load ${section}.`);
  }
}

async function writePdsSection<S extends PdsListSection>(
  employeeId: string,
  section: S,
  rows: readonly PdsRowBySection[S][],
  expectedRevision: string,
  scalarPatch: Partial<Employee> = {},
): Promise<PdsResult<PdsSectionSnapshot<PdsRowBySection[S]>>> {
  if (!employeeId) return { ok: false, error: 'No employee id.' };
  if (!expectedRevision) {
    return { ok: false, error: 'This section has not been loaded. Reload it before saving.' };
  }

  const issues = validatePdsRows(section, rows);
  if (issues.length > 0) return validationFailure(issues);

  const pairing = pairingForSection(section);
  const columns = pairing ? mapPdsScalarPatchToColumns(pairing, scalarPatch) : {};

  try {
    const { data, error } = await supabase.rpc('save_pds_section', {
      p_employee_id: employeeId,
      p_section: section,
      p_rows: rowPayload(section, rows),
      p_expected_revision: expectedRevision,
      p_scalar_patch: columns,
    });
    if (error) return snapshotFailure(error, `Failed to save ${section}.`);
    return parseSnapshot(section, data, `Failed to save ${section}.`);
  } catch (err: any) {
    console.error(`[personalDataSheet] save ${section} error:`, err);
    return snapshotFailure(err, `Failed to save ${section}.`);
  }
}

// ---------------------------------------------------------------------------
// 23. Children
// ---------------------------------------------------------------------------

export function listChildren(
  employeeId: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeChild>>> {
  return readPdsSection(employeeId, 'children');
}

export function saveChildren(
  employeeId: string,
  children: EmployeeChild[],
  expectedRevision: string,
  scalarPatch: Partial<Employee> = {},
): Promise<PdsResult<PdsSectionSnapshot<EmployeeChild>>> {
  return writePdsSection(employeeId, 'children', children, expectedRevision, scalarPatch);
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

export function listEducation(
  employeeId: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeEducation>>> {
  return readPdsSection(employeeId, 'education');
}

export function saveEducation(
  employeeId: string,
  rows: EmployeeEducation[],
  expectedRevision: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeEducation>>> {
  return writePdsSection(employeeId, 'education', rows, expectedRevision);
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

export function listEligibility(
  employeeId: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeEligibility>>> {
  return readPdsSection(employeeId, 'eligibility');
}

export function saveEligibility(
  employeeId: string,
  rows: EmployeeEligibility[],
  expectedRevision: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeEligibility>>> {
  return writePdsSection(employeeId, 'eligibility', rows, expectedRevision);
}

// ---------------------------------------------------------------------------
// 28. Work Experience
//
// employee_work_experience is also pre-existing (same admin read path).
// position_title, company_name and from_date are NOT NULL on that table, so
// a row missing any of the three is rejected before the database sees it.
// ---------------------------------------------------------------------------

export function listWorkExperience(
  employeeId: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeWorkExperience>>> {
  return readPdsSection(employeeId, 'workExperience');
}

export function saveWorkExperience(
  employeeId: string,
  rows: EmployeeWorkExperience[],
  expectedRevision: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeWorkExperience>>> {
  return writePdsSection(employeeId, 'workExperience', rows, expectedRevision);
}

// ---------------------------------------------------------------------------
// 29. Voluntary Work
// ---------------------------------------------------------------------------

export function listVoluntaryWork(
  employeeId: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeVoluntaryWork>>> {
  return readPdsSection(employeeId, 'voluntaryWork');
}

export function saveVoluntaryWork(
  employeeId: string,
  rows: EmployeeVoluntaryWork[],
  expectedRevision: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeVoluntaryWork>>> {
  return writePdsSection(employeeId, 'voluntaryWork', rows, expectedRevision);
}

// ---------------------------------------------------------------------------
// 30. Learning & Development Interventions
// ---------------------------------------------------------------------------

export function listLdInterventions(
  employeeId: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeLdIntervention>>> {
  return readPdsSection(employeeId, 'training');
}

export function saveLdInterventions(
  employeeId: string,
  rows: EmployeeLdIntervention[],
  expectedRevision: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeLdIntervention>>> {
  return writePdsSection(employeeId, 'training', rows, expectedRevision);
}

// ---------------------------------------------------------------------------
// 41. References
// ---------------------------------------------------------------------------

export function listReferences(
  employeeId: string,
): Promise<PdsResult<PdsSectionSnapshot<EmployeeReference>>> {
  return readPdsSection(employeeId, 'references');
}

export function saveReferences(
  employeeId: string,
  rows: EmployeeReference[],
  expectedRevision: string,
  scalarPatch: Partial<Employee> = {},
): Promise<PdsResult<PdsSectionSnapshot<EmployeeReference>>> {
  return writePdsSection(employeeId, 'references', rows, expectedRevision, scalarPatch);
}
