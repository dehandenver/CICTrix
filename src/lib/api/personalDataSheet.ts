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
} from '../../types/employee.types';

const supabase = supabaseClient as any;

export type PdsResult<T> = { ok: true; data: T } | { ok: false; error: string };

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

  // A row with no name is an empty form line the employee never filled in,
  // not a child — dropping it here keeps blank rows out of the printed sheet.
  const rows = children
    .filter((c) => c.fullName?.trim())
    .map((c, i) => ({
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

  const asIntOrNull = (v: number | null | undefined) =>
    Number.isFinite(Number(v)) && v != null ? Number(v) : null;

  // Keep a level's row only when it has a school name — school_name is
  // NOT NULL on the real table, so a row without one can't be inserted at
  // all, not just "would print as a stray blank row" as the education-only
  // fields further down would.
  const payload = rows
    .filter((r) => r.school?.trim())
    .map((r, i) => ({
      employee_id: employeeId,
      level: r.level || null,
      school_name: r.school!.trim(),
      course: r.degree?.trim() || null,
      year_attended_from: asIntOrNull(r.periodFrom),
      year_attended_to: asIntOrNull(r.periodTo),
      units_earned: asIntOrNull(r.highestLevelUnits),
      year_graduated: asIntOrNull(r.yearGraduated),
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
 * The five form rows, pre-filled from whatever is stored.
 *
 * The sheet always prints all five levels in a fixed order whether or not the
 * employee attended them, so the editor is seeded the same way instead of
 * starting empty and asking the employee to add rows.
 */
export function buildEducationRows(stored: EmployeeEducation[]): EmployeeEducation[] {
  return EDUCATION_LEVELS.map((level, i) => {
    const match = stored.find((r) => r.level === level);
    return (
      match ?? {
        level,
        school: '',
        degree: '',
        periodFrom: null,
        periodTo: null,
        highestLevelUnits: null,
        yearGraduated: null,
        scholarshipHonors: '',
        sortOrder: i,
      }
    );
  });
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

  const payload = rows
    .filter((r) => r.eligibilityName?.trim())
    .map((r, i) => ({
      employee_id: employeeId,
      eligibility_type: r.eligibilityName.trim(),
      rating: Number.isFinite(Number(r.rating)) && r.rating != null ? Number(r.rating) : null,
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

  const payload = rows
    .filter((r) => r.positionTitle?.trim() && r.departmentAgencyOfficeCompany?.trim() && r.dateFrom)
    .map((r, i) => ({
      employee_id: employeeId,
      from_date: r.dateFrom,
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

  const payload = rows
    .filter((r) => r.orgNameAddress?.trim())
    .map((r, i) => ({
      employee_id: employeeId,
      org_name_address: r.orgNameAddress.trim(),
      date_from: r.dateFrom || null,
      date_to: r.dateTo || null,
      number_of_hours: Number.isFinite(Number(r.numberOfHours)) && r.numberOfHours != null
        ? Number(r.numberOfHours)
        : null,
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

  const payload = rows
    .filter((r) => r.title?.trim())
    .map((r, i) => ({
      employee_id: employeeId,
      title: r.title.trim(),
      date_from: r.dateFrom || null,
      date_to: r.dateTo || null,
      number_of_hours: Number.isFinite(Number(r.numberOfHours)) && r.numberOfHours != null
        ? Number(r.numberOfHours)
        : null,
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

  const payload = rows
    .filter((r) => r.name?.trim())
    .map((r, i) => ({
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
