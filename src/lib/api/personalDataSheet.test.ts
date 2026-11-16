import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdsListSection } from '../../types/employee.types';

const db = vi.hoisted(() => {
  const calls: Array<{ table: string; action: string; payload?: unknown }> = [];
  const from = vi.fn((table: string) => {
    const chain: any = {
      delete: () => {
        calls.push({ table, action: 'delete' });
        return chain;
      },
      insert: (payload: unknown) => {
        calls.push({ table, action: 'insert', payload });
        return Promise.resolve({ error: null });
      },
      eq: () => chain,
    };
    return chain;
  });
  return { calls, from };
});

vi.mock('../supabase', () => ({ supabase: { from: db.from } }));

import {
  buildEducationRows,
  saveChildren,
  saveEducation,
  saveEligibility,
  saveLdInterventions,
  saveReferences,
  saveVoluntaryWork,
  saveWorkExperience,
  validatePdsRows,
} from './personalDataSheet';

beforeEach(() => {
  db.calls.length = 0;
  db.from.mockClear();
});

describe('buildEducationRows', () => {
  it('preservesTwoCollegeRecordsAndDoctorate', () => {
    const rows = buildEducationRows([
      { id: 'edu-college-1', level: 'College', school: 'College One', degree: 'BSA', sortOrder: 3 },
      { id: 'edu-doctorate', level: 'Doctorate', school: 'Doctorate School', degree: 'PhD', sortOrder: 5 },
      { id: 'edu-college-2', level: 'College', school: 'College Two', degree: 'BSB', sortOrder: 4 },
    ]);

    expect(rows.map((row) => row.id).filter(Boolean)).toEqual(
      expect.arrayContaining(['edu-college-1', 'edu-college-2', 'edu-doctorate']),
    );
    expect(rows.filter((row) => row.level === 'College')).toHaveLength(2);
    expect(rows.filter((row) => row.level === 'Doctorate')).toHaveLength(1);
    expect(rows.find((row) => row.id === 'edu-doctorate')?.level).toBe('Doctorate');
    expect(rows.filter((row) => row.level === 'Graduate Studies' && row.school === 'Doctorate School')).toHaveLength(0);

    // One placeholder only for a level with no stored row.
    expect(rows.filter((row) => !row.id).map((row) => row.level).sort()).toEqual(
      ['Elementary', 'Graduate Studies', 'Secondary', 'Vocational'],
    );
  });
});

describe('validatePdsRows', () => {
  it('ignoresOnlyWhollyBlankNewRows', async () => {
    const rows = [
      { level: 'Elementary', sortOrder: 0 },
      { level: 'College', sortOrder: 3 },
    ];

    expect(validatePdsRows('education', rows)).toEqual([]);

    const result = await saveEducation('emp-1', rows);
    expect(result).toEqual({ ok: true, data: null });
    expect(db.calls.filter((call) => call.action === 'insert')).toHaveLength(0);
  });

  it('rejectsPartiallyCompletedRowsBeforeAnyWrite', async () => {
    const workIssues = validatePdsRows('workExperience', [{ positionTitle: 'Clerk' }]);
    expect(workIssues.map((issue) => issue.field).sort()).toEqual([
      'dateFrom',
      'departmentAgencyOfficeCompany',
    ]);
    expect(workIssues.every((issue) => issue.rowIndex === 0)).toBe(true);

    const workResult = await saveWorkExperience('emp-1', [{ positionTitle: 'Clerk' }]);
    expect(workResult.ok).toBe(false);
    if (workResult.ok === true) throw new Error('expected a validation failure');
    expect(workResult.fieldIssues?.map((issue) => issue.field).sort()).toEqual([
      'dateFrom',
      'departmentAgencyOfficeCompany',
    ]);
    expect(db.from).not.toHaveBeenCalled();

    const educationResult = await saveEducation('emp-1', [
      { level: 'College', degree: 'BS Computer Science' },
    ]);
    expect(educationResult.ok).toBe(false);
    if (educationResult.ok === true) throw new Error('expected a validation failure');
    expect(educationResult.fieldIssues?.map((issue) => issue.field)).toContain('school');
    expect(db.from).not.toHaveBeenCalled();
  });

  it('rejects partial rows in every save service before any write', async () => {
    const cases = [
      { save: () => saveChildren('emp-1', [{ dateOfBirth: '2020-01-01' }] as never[]), field: 'fullName' },
      { save: () => saveEligibility('emp-1', [{ rating: 0 }] as never[]), field: 'eligibilityName' },
      { save: () => saveVoluntaryWork('emp-1', [{ numberOfHours: 0 }] as never[]), field: 'orgNameAddress' },
      { save: () => saveLdInterventions('emp-1', [{ numberOfHours: 0 }] as never[]), field: 'title' },
      { save: () => saveReferences('emp-1', [{ address: 'City Hall' }] as never[]), field: 'name' },
    ];

    for (const { save, field } of cases) {
      const result = await save();
      expect(result.ok).toBe(false);
      if (result.ok === true) throw new Error('expected a validation failure');
      expect(result.fieldIssues?.map((issue) => issue.field)).toContain(field);
      expect(db.from).not.toHaveBeenCalled();
    }
  });

  it('writes validated rows in order without turning zero into null', async () => {
    const result = await saveEducation('emp-1', [
      {
        level: 'College',
        school: 'State University',
        periodFrom: 1990,
        periodTo: 1994,
        highestLevelUnits: 0,
      },
    ]);

    expect(result).toEqual({ ok: true, data: null });
    const insert = db.calls.find((call) => call.action === 'insert');
    expect(insert?.payload).toEqual([
      {
        employee_id: 'emp-1',
        level: 'College',
        school_name: 'State University',
        course: null,
        year_attended_from: 1990,
        year_attended_to: 1994,
        units_earned: 0,
        year_graduated: null,
        honors_awards: null,
        sort_order: 0,
      },
    ]);
  });

  it('validates every one of the seven list sections', () => {
    const cases: Array<{ section: PdsListSection; rows: never[]; field: string }> = [
      { section: 'children', rows: [{ dateOfBirth: '2020-01-01' }] as never[], field: 'fullName' },
      { section: 'education', rows: [{ level: 'College', degree: 'BS' }] as never[], field: 'school' },
      { section: 'eligibility', rows: [{ rating: 0 }] as never[], field: 'eligibilityName' },
      { section: 'workExperience', rows: [{ positionTitle: 'Clerk' }] as never[], field: 'dateFrom' },
      { section: 'voluntaryWork', rows: [{ numberOfHours: 0 }] as never[], field: 'orgNameAddress' },
      { section: 'training', rows: [{ numberOfHours: 0 }] as never[], field: 'title' },
      { section: 'references', rows: [{ address: 'City Hall' }] as never[], field: 'name' },
    ];

    for (const { section, rows, field } of cases) {
      expect(validatePdsRows(section, rows).map((issue) => issue.field)).toContain(field);
    }
  });

  it('rejects invalid calendar dates and reversed date ranges', () => {
    const issues = validatePdsRows('workExperience', [
      {
        dateFrom: '2024-02-30',
        dateTo: '2023-12-31',
        positionTitle: 'Clerk',
        departmentAgencyOfficeCompany: 'City Hall',
      },
    ]);

    expect(issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['dateFrom']));

    const reversed = validatePdsRows('training', [
      { title: 'Records Management', dateFrom: '2024-06-01', dateTo: '2024-05-01' },
    ]);
    expect(reversed.map((issue) => issue.field)).toContain('dateTo');
  });

  it('rejects non-finite numbers and non-integer education years or units', () => {
    expect(
      validatePdsRows('eligibility', [{ eligibilityName: 'CSC', rating: Number.POSITIVE_INFINITY }]).map(
        (issue) => issue.field,
      ),
    ).toContain('rating');

    const educationIssues = validatePdsRows('education', [
      {
        level: 'College',
        school: 'State University',
        periodFrom: 2020.5,
        highestLevelUnits: Number.NaN,
      },
    ]);
    expect(educationIssues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(['periodFrom', 'highestLevelUnits']),
    );
  });

  it('accepts zero ratings, hours, and units where the schema permits them', () => {
    expect(validatePdsRows('eligibility', [{ eligibilityName: 'CSC', rating: 0 }])).toEqual([]);
    expect(validatePdsRows('voluntaryWork', [{ orgNameAddress: 'Red Cross', numberOfHours: 0 }])).toEqual([]);
    expect(validatePdsRows('training', [{ title: 'Orientation', numberOfHours: 0 }])).toEqual([]);
    expect(
      validatePdsRows('education', [
        { level: 'College', school: 'State University', highestLevelUnits: 0, yearGraduated: 0 },
      ]),
    ).toEqual([]);
  });
});
