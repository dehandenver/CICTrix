import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../supabase', () => ({ supabase: { from: db.from } }));

import { fetchEmployeeApplicationProfile } from './employeeApplicationProfile';

function makeQuery(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (val: unknown) => unknown, reject?: (err: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

describe('fetchEmployeeApplicationProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('picks Doctorate over multiple College degrees and sums work experience with is_present and duties', async () => {
    db.from.mockImplementation((table: string) => {
      if (table === 'employees') {
        return makeQuery({
          data: {
            id: 'emp-uuid-1',
            employee_number: 'EMP-001',
            first_name: 'Maria',
            middle_name: 'L.',
            last_name: 'Santos',
            sex: 'Female',
            phone: '09170000001',
            email: 'maria.santos@lgu.test',
            position: 'Administrative Officer IV',
            department: 'HRMO',
            division: 'Personnel',
            current_address_street: '10 Rizal St',
            current_address_city: 'Iloilo City',
            highest_educational_attainment: null,
            date_hired: '2022-01-01',
          },
          error: null,
        });
      }
      if (table === 'employee_education') {
        return makeQuery({
          data: [
            {
              id: 'edu-col-1',
              level: 'College',
              course: 'BS Public Administration',
              school_name: 'West Visayas State University',
              year_graduated: 2012,
            },
            {
              id: 'edu-col-2',
              level: 'College',
              course: 'BS Information Systems',
              school_name: 'University of Iloilo',
              year_graduated: 2015,
            },
            {
              id: 'edu-doc-1',
              level: 'Doctorate',
              course: 'Doctor of Public Administration',
              school_name: 'University of the Philippines',
              year_graduated: 2023,
            },
          ],
          error: null,
        });
      }
      if (table === 'employee_work_experience') {
        return makeQuery({
          data: [
            {
              id: 'work-1',
              from_date: '2016-01-01',
              to_date: '2018-01-01',
              is_present: false,
              position_title: 'Administrative Aide',
              company_name: 'Province of Iloilo',
              duties_responsibilities: 'Maintained personnel 201 files',
              separation_reason: 'Transfer',
            },
            {
              id: 'work-2',
              from_date: '2022-01-01',
              to_date: null,
              is_present: true,
              position_title: 'Administrative Officer IV',
              company_name: 'City Hall HRMO',
              duties_responsibilities: 'Leads succession and recruitment records',
              separation_reason: null,
            },
          ],
          error: null,
        });
      }
      return makeQuery({ data: [], error: null });
    });

    const profile = await fetchEmployeeApplicationProfile('EMP-001');

    expect(profile).not.toBeNull();
    expect(profile?.educationAttainment).toBe('Graduate School');
    expect(profile?.educationDegree).toBe('Doctor of Public Administration');
    expect(profile?.educationSchool).toBe('University of the Philippines');

    // Sum includes the 2016-2018 record (24 mos) plus the ongoing is_present record (>= 24 mos).
    const totalMonths =
      Number(profile?.workExperienceYears || 0) * 12 +
      Number(profile?.workExperienceMonths || 0);
    expect(totalMonths).toBeGreaterThanOrEqual(48);
    expect(profile?.relevantExperiencePosition).toBe('Administrative Officer IV');
    expect(profile?.relevantExperienceCompany).toBe('City Hall HRMO');
    expect(profile?.relevantExperienceDuties).toBe('Leads succession and recruitment records');
  });

  it('retains preserved PDS rows and work metadata after an unrelated PDS edit', async () => {
    const workRows = [
      {
        id: 'work-1',
        from_date: '2019-06-01',
        to_date: '2021-06-01',
        is_present: false,
        position_title: 'HR Clerk',
        company_name: 'City Hall',
        duties_responsibilities: 'Handled PDS encoding',
        separation_reason: 'Promoted',
      },
      {
        id: 'work-2',
        from_date: '2021-07-01',
        to_date: null,
        is_present: true,
        position_title: 'HR Specialist',
        company_name: 'City Hall',
        duties_responsibilities: 'Audits plantilla records',
        separation_reason: null,
      },
    ];

    db.from.mockImplementation((table: string) => {
      if (table === 'employees') {
        return makeQuery({
          data: {
            id: 'emp-uuid-2',
            employee_number: 'EMP-002',
            first_name: 'Jose',
            last_name: 'Reyes',
            position: 'HR Specialist',
            department: 'HRMO',
          },
          error: null,
        });
      }
      if (table === 'employee_education') {
        return makeQuery({
          data: [
            { id: 'edu-1', level: 'College', course: 'BS Management', school_name: 'CPU', year_graduated: 2018 },
            { id: 'edu-2', level: 'Graduate Studies', course: 'MPA', school_name: 'WVSU', year_graduated: null },
          ],
          error: null,
        });
      }
      if (table === 'employee_work_experience') {
        return makeQuery({ data: workRows, error: null });
      }
      return makeQuery({ data: [], error: null });
    });

    const profile = await fetchEmployeeApplicationProfile('EMP-002');
    expect(profile?.educationAttainment).toBe('Masteral Units');
    expect(profile?.educationDegree).toBe('MPA');
    expect(profile?.relevantExperiencePosition).toBe('HR Specialist');
    expect(profile?.relevantExperienceDuties).toBe('Audits plantilla records');
  });

  it('falls back to legacy employee, applicant, and newly_hired scalars when detail rows are absent', async () => {
    // Case 1: employees row exists without detail tables -> falls back to employees & applicants scalars.
    db.from.mockImplementation((table: string) => {
      if (table === 'employees') {
        return makeQuery({
          data: {
            id: 'emp-uuid-3',
            employee_number: 'EMP-003',
            full_name: 'Elena Villanueva Bautista',
            gender: 'Female',
            mobile_number: '09181112222',
            email: 'elena@lgu.test',
            home_address: 'Molo, Iloilo City',
            current_position: 'Clerk I',
            current_department: 'Budget Office',
            highest_educational_attainment: 'College Graduate',
          },
          error: null,
        });
      }
      if (table === 'applicants') {
        return makeQuery({
          data: [
            {
              education_level: 'College Graduate',
              education_degree: 'BS Accountancy',
              education_school: 'UI',
              years_of_experience: 2.5,
              current_division: 'Accounting Division',
            },
          ],
          error: null,
        });
      }
      return makeQuery({ data: [], error: null });
    });

    const fromEmployee = await fetchEmployeeApplicationProfile('EMP-003');
    expect(fromEmployee).toMatchObject({
      supabaseId: 'emp-uuid-3',
      firstName: 'Elena',
      middleName: 'Villanueva',
      lastName: 'Bautista',
      educationAttainment: 'College Graduate',
      educationDegree: 'BS Accountancy',
      educationSchool: 'UI',
      workExperienceYears: '2',
      workExperienceMonths: '6',
      relevantExperiencePosition: 'Clerk I',
      relevantExperienceCompany: 'Budget Office',
      currentDivision: 'Accounting Division',
    });

    // Case 2: not yet in employees -> falls back to newly_hired + applicants.
    db.from.mockImplementation((table: string) => {
      if (table === 'employees') {
        return makeQuery({ data: null, error: null });
      }
      if (table === 'newly_hired') {
        return makeQuery({
          data: {
            id: 'nh-1',
            employee_id: 'EMP-004',
            applicant_id: 'app-4',
            first_name: 'Carlo',
            last_name: 'Mendoza',
            email: 'carlo@lgu.test',
            position: 'Engineer I',
            department: 'Engineering',
            division: 'Planning',
          },
          error: null,
        });
      }
      if (table === 'applicants') {
        return makeQuery({
          data: {
            first_name: 'Carlo',
            middle_name: 'D.',
            last_name: 'Mendoza',
            gender: 'Male',
            address: 'Jaro, Iloilo City',
            contact_number: '09193334444',
            email: 'carlo@lgu.test',
            education_level: 'College Graduate',
            years_of_experience: 1.5,
          },
          error: null,
        });
      }
      return makeQuery({ data: null, error: null });
    });

    const fromNewlyHired = await fetchEmployeeApplicationProfile('EMP-004');
    expect(fromNewlyHired).toMatchObject({
      supabaseId: 'nh-1',
      employeeNumber: 'EMP-004',
      firstName: 'Carlo',
      middleName: 'D.',
      lastName: 'Mendoza',
      currentPosition: 'Engineer I',
      currentDepartment: 'Engineering',
      educationAttainment: 'College Graduate',
      workExperienceYears: '1',
      workExperienceMonths: '6',
    });
  });
});
