import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdsListSection } from '../../types/employee.types';

const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(() => {
    throw new Error('legacy table write is forbidden in this test');
  }),
}));

vi.mock('../supabase', () => ({ supabase: { rpc: db.rpc, from: db.from } }));

import {
  buildEducationRows,
  listChildren,
  listEducation,
  listEligibility,
  listLdInterventions,
  listReferences,
  listVoluntaryWork,
  listWorkExperience,
  saveChildren,
  saveEducation,
  saveEligibility,
  saveLdInterventions,
  saveReferences,
  saveVoluntaryWork,
  saveWorkExperience,
  validatePdsRows,
} from './personalDataSheet';

const rpcResult = (section: PdsListSection, rows: unknown[], revision = `${section}-revision`) => ({
  data: { rows, revision, scalars: {} },
  error: null,
});

const rpcCalls = () =>
  db.rpc.mock.calls.map(([fn, args]) => ({
    fn: fn as string,
    args: args as Record<string, unknown>,
  }));

beforeEach(() => {
  db.rpc.mockReset();
  db.from.mockClear();
  db.rpc.mockImplementation(async (fn: string) => ({
    data: null,
    error: { message: `Unexpected RPC ${fn}` },
  }));
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

describe('read PDS sections', () => {
  it('reads every section through the read RPC and returns its snapshot', async () => {
    const cases: Array<{ section: PdsListSection; read: (id: string) => Promise<{ ok: boolean }> }> = [
      { section: 'children', read: listChildren },
      { section: 'education', read: listEducation },
    ];

    for (const { section, read } of cases) {
      db.rpc.mockResolvedValueOnce(
        rpcResult(section, [
          section === 'children'
            ? {
                id: 'child-1',
                full_name: 'Test Child',
                date_of_birth: '2020-01-01',
                sort_order: 2,
              }
            : {
                id: 'edu-1',
                level: 'College',
                school_name: 'Test University',
                course: 'BS Computer Science',
                year_attended_from: 2010,
                year_attended_to: 2014,
                units_earned: 0,
                year_graduated: 2014,
                honors_awards: null,
                sort_order: 0,
              },
        ]),
      );

      const result = await read('emp-1');
      expect(result).toEqual({
        ok: true,
        data: {
          rows: [
            section === 'children'
              ? {
                  id: 'child-1',
                  fullName: 'Test Child',
                  dateOfBirth: '2020-01-01',
                  sortOrder: 2,
                }
              : {
                  id: 'edu-1',
                  level: 'College',
                  school: 'Test University',
                  degree: 'BS Computer Science',
                  periodFrom: 2010,
                  periodTo: 2014,
                  highestLevelUnits: 0,
                  yearGraduated: 2014,
                  scholarshipHonors: '',
                  sortOrder: 0,
                },
          ],
          revision: `${section}-revision`,
          scalars: {},
        },
      });
    }

    expect(rpcCalls()).toEqual([
      { fn: 'read_pds_section', args: { p_employee_id: 'emp-1', p_section: 'children' } },
      { fn: 'read_pds_section', args: { p_employee_id: 'emp-1', p_section: 'education' } },
    ]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it('returns section-scoped family and background scalars from the read RPC', async () => {
    db.rpc.mockResolvedValueOnce({
      data: {
        rows: [],
        revision: 'children-revision',
        scalars: {
          spouse_surname: 'Test Spouse',
          spouse_first_name: 'Test',
          spouse_middle_name: null,
          spouse_suffix: null,
          spouse_occupation: null,
          spouse_employer: null,
          spouse_business_address: null,
          spouse_telephone: null,
          father_surname: null,
          father_first_name: null,
          father_middle_name: null,
          father_suffix: null,
          mother_surname: null,
          mother_first_name: null,
          mother_middle_name: null,
        },
      },
      error: null,
    });

    const result = await listChildren('emp-1');
    if (result.ok === false) throw new Error(result.error);

    expect(result.data.scalars).toMatchObject({
      spouseSurname: 'Test Spouse',
      spouseFirstName: 'Test',
      spouseMiddleName: '',
      spouseOccupation: '',
      fatherSurname: '',
    });
  });

  it('maps every list wrapper to its section key', async () => {
    const cases: Array<{ section: PdsListSection; read: (id: string) => Promise<{ ok: boolean }> }> = [
      { section: 'children', read: listChildren },
      { section: 'education', read: listEducation },
      { section: 'eligibility', read: listEligibility },
      { section: 'workExperience', read: listWorkExperience },
      { section: 'voluntaryWork', read: listVoluntaryWork },
      { section: 'training', read: listLdInterventions },
      { section: 'references', read: listReferences },
    ];

    for (const { section, read } of cases) {
      db.rpc.mockResolvedValueOnce(rpcResult(section, []));
      const result = await read('emp-1');
      expect(result.ok).toBe(true);
      expect((rpcCalls()[rpcCalls().length - 1])).toEqual({
        fn: 'read_pds_section',
        args: { p_employee_id: 'emp-1', p_section: section },
      });
    }
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('validatePdsRows', () => {
  it('ignoresOnlyWhollyBlankNewRows', async () => {
    const rows = [
      { level: 'Elementary', sortOrder: 0 },
      { level: 'College', sortOrder: 3 },
    ];

    expect(validatePdsRows('education', rows)).toEqual([]);

    db.rpc.mockResolvedValueOnce(rpcResult('education', []));
    const result = await saveEducation('emp-1', rows, 'revision-1');
    expect(result.ok).toBe(true);
    expect(rpcCalls()).toHaveLength(1);
    expect((rpcCalls()[0].args.p_rows as unknown[])).toEqual([]);
  });

  it('rejectsPartiallyCompletedRowsBeforeAnyWrite', async () => {
    const workIssues = validatePdsRows('workExperience', [{ positionTitle: 'Clerk' }]);
    expect(workIssues.map((issue) => issue.field).sort()).toEqual([
      'dateFrom',
      'departmentAgencyOfficeCompany',
    ]);
    expect(workIssues.every((issue) => issue.rowIndex === 0)).toBe(true);

    const workResult = await saveWorkExperience(
      'emp-1',
      [{ positionTitle: 'Clerk' }],
      'revision-1',
    );
    expect(workResult.ok).toBe(false);
    if (workResult.ok === true) throw new Error('expected a validation failure');
    expect(workResult.fieldIssues?.map((issue) => issue.field).sort()).toEqual([
      'dateFrom',
      'departmentAgencyOfficeCompany',
    ]);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();

    const educationResult = await saveEducation(
      'emp-1',
      [{ level: 'College', degree: 'BS Computer Science' }],
      'revision-1',
    );
    expect(educationResult.ok).toBe(false);
    if (educationResult.ok === true) throw new Error('expected a validation failure');
    expect(educationResult.fieldIssues?.map((issue) => issue.field)).toContain('school');
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('rejects partial rows in every save service before any write', async () => {
    const cases = [
      {
        save: () => saveChildren('emp-1', [{ dateOfBirth: '2020-01-01' }] as never[], 'revision-1'),
        field: 'fullName',
      },
      {
        save: () => saveEligibility('emp-1', [{ rating: 0 }] as never[], 'revision-1'),
        field: 'eligibilityName',
      },
      {
        save: () => saveVoluntaryWork('emp-1', [{ numberOfHours: 0 }] as never[], 'revision-1'),
        field: 'orgNameAddress',
      },
      {
        save: () => saveLdInterventions('emp-1', [{ numberOfHours: 0 }] as never[], 'revision-1'),
        field: 'title',
      },
      {
        save: () => saveReferences('emp-1', [{ address: 'City Hall' }] as never[], 'revision-1'),
        field: 'name',
      },
    ];

    for (const { save, field } of cases) {
      const result = await save();
      expect(result.ok).toBe(false);
      if (result.ok === true) throw new Error('expected a validation failure');
      expect(result.fieldIssues?.map((issue) => issue.field)).toContain(field);
    }
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('writes validated rows in order without turning zero into null', async () => {
    db.rpc.mockResolvedValueOnce({
      data: {
        rows: [
          {
            id: 'edu-1',
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
        ],
        revision: 'revision-2',
        scalars: {},
      },
      error: null,
    });

    const result = await saveEducation(
      'emp-1',
      [
        {
          level: 'College',
          school: 'State University',
          periodFrom: 1990,
          periodTo: 1994,
          highestLevelUnits: 0,
        },
      ],
      'revision-1',
    );

    expect(result.ok).toBe(true);
    expect(rpcCalls()).toEqual([
      {
        fn: 'save_pds_section',
        args: {
          p_employee_id: 'emp-1',
          p_section: 'education',
          p_rows: [
            {
              level: 'College',
              school_name: 'State University',
              course: null,
              year_attended_from: 1990,
              year_attended_to: 1994,
              units_earned: 0,
              year_graduated: null,
              honors_awards: null,
            },
          ],
          p_expected_revision: 'revision-1',
          p_scalar_patch: {},
        },
      },
    ]);
    expect(db.from).not.toHaveBeenCalled();
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

describe('atomic PDS saves', () => {
  it('sends family scalar columns in the same save RPC as children', async () => {
    db.rpc.mockResolvedValueOnce({
      data: {
        rows: [{ id: 'child-1', full_name: 'Test Child', date_of_birth: null, sort_order: 0 }],
        revision: 'children-revision-2',
        scalars: {
          spouse_surname: 'Test Spouse',
          spouse_first_name: '',
          spouse_middle_name: '',
          spouse_suffix: '',
          spouse_occupation: '',
          spouse_employer: '',
          spouse_business_address: '',
          spouse_telephone: '',
          father_surname: '',
          father_first_name: '',
          father_middle_name: '',
          father_suffix: '',
          mother_surname: '',
          mother_first_name: '',
          mother_middle_name: '',
        },
      },
      error: null,
    });

    const result = await saveChildren(
      'emp-1',
      [{ fullName: 'Test Child' }],
      'children-revision-1',
      { spouseSurname: 'Test Spouse', spouseFirstName: '' },
    );

    expect(result.ok).toBe(true);
    expect(rpcCalls()[0]).toEqual({
      fn: 'save_pds_section',
      args: {
        p_employee_id: 'emp-1',
        p_section: 'children',
        p_rows: [{ full_name: 'Test Child', date_of_birth: null }],
        p_expected_revision: 'children-revision-1',
        p_scalar_patch: { spouse_surname: 'Test Spouse', spouse_first_name: null },
      },
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('sends background scalar columns in the same save RPC as references', async () => {
    db.rpc.mockResolvedValueOnce({
      data: {
        rows: [{ id: 'ref-1', name: 'Test Reference', address: null, contact_info: null, sort_order: 0 }],
        revision: 'references-revision-2',
        scalars: {
          related_third_degree: null,
          related_fourth_degree: false,
          related_details: '',
          admin_offense_guilty: null,
          admin_offense_details: '',
          criminally_charged: null,
          criminal_charge_details: '',
          criminal_case_date_filed: null,
          criminal_case_status: '',
          convicted_of_crime: null,
          convicted_details: '',
          separated_from_service: null,
          separated_details: '',
          election_candidate: null,
          election_candidate_details: '',
          resigned_to_campaign: null,
          resigned_to_campaign_details: '',
          immigrant_status: null,
          immigrant_country: '',
          indigenous_group_member: null,
          indigenous_group_specify: '',
          person_with_disability: null,
          pwd_id_number: '',
          solo_parent: null,
          solo_parent_id_number: '',
          gov_id_type: '',
          gov_id_number: '',
          gov_id_issued_date_place: '',
        },
      },
      error: null,
    });

    const result = await saveReferences(
      'emp-1',
      [{ name: 'Test Reference' }],
      'references-revision-1',
      { relatedFourthDegree: false, criminalCaseDateFiled: '' },
    );

    expect(result.ok).toBe(true);
    expect(rpcCalls()[0]).toEqual({
      fn: 'save_pds_section',
      args: {
        p_employee_id: 'emp-1',
        p_section: 'references',
        p_rows: [{ name: 'Test Reference', address: null, contact_info: null }],
        p_expected_revision: 'references-revision-1',
        p_scalar_patch: { related_fourth_degree: false, criminal_case_date_filed: null },
      },
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('returns the canonical rows and revision from a save', async () => {
    db.rpc.mockResolvedValueOnce({
      data: {
        rows: [
          {
            id: 'ref-2',
            name: 'Canonical Reference',
            address: null,
            contact_info: null,
            sort_order: 0,
          },
        ],
        revision: 'references-revision-2',
        scalars: { related_details: '' },
      },
      error: null,
    });

    const result = await saveReferences(
      'emp-1',
      [{ name: 'Edited Reference' }],
      'references-revision-1',
    );

    expect(result).toEqual({
      ok: true,
      data: {
        rows: [
          {
            id: 'ref-2',
            name: 'Canonical Reference',
            address: '',
            contactInfo: '',
            sortOrder: 0,
          },
        ],
        revision: 'references-revision-2',
        scalars: { relatedDetails: '' },
      },
    });
  });

  it('requires a revision and maps every save wrapper to its section key', async () => {
    const cases: Array<{
      section: PdsListSection;
      save: (id: string, rows: never[], revision: string) => Promise<{ ok: boolean }>;
    }> = [
      { section: 'children', save: saveChildren },
      { section: 'education', save: saveEducation },
      { section: 'eligibility', save: saveEligibility },
      { section: 'workExperience', save: saveWorkExperience },
      { section: 'voluntaryWork', save: saveVoluntaryWork },
      { section: 'training', save: saveLdInterventions },
      { section: 'references', save: saveReferences },
    ];

    for (const { section, save } of cases) {
      db.rpc.mockResolvedValueOnce(rpcResult(section, []));
      const result = await save('emp-1', [], 'loaded-revision');
      expect(result.ok).toBe(true);
      expect((rpcCalls()[rpcCalls().length - 1])).toMatchObject({
        fn: 'save_pds_section',
        args: {
          p_employee_id: 'emp-1',
          p_section: section,
          p_expected_revision: 'loaded-revision',
        },
      });
    }
    expect(db.from).not.toHaveBeenCalled();
  });

  it('refuses to save without a loaded revision', async () => {
    const result = await saveEducation('emp-1', [], '');

    expect(result).toEqual({
      ok: false,
      error: 'This section has not been loaded. Reload it before saving.',
      kind: 'unavailable',
    });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('does not fall back to table writes when the RPC is missing', async () => {
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.save_pds_section' },
    });

    const result = await saveEducation('emp-1', [], 'revision-1');

    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error('expected a failed save');
    expect(result.kind).toBe('unavailable');
    expect(result.error).toContain('Could not find the function');
    expect(db.from).not.toHaveBeenCalled();
  });

  it('maps a stale revision conflict to a reload message', async () => {
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '40001', message: 'pds_revision_conflict' },
    });

    const result = await saveEducation('emp-1', [], 'stale-revision');

    expect(result).toEqual({
      ok: false,
      error: 'This section changed since it was loaded. Reload it before saving again.',
      kind: 'conflict',
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('classifies failure kinds across validation, conflict, uncertain, and unavailable', async () => {
    // Validation failure
    const valResult = await saveWorkExperience('emp-1', [{ positionTitle: 'Clerk' }], 'rev-1');
    expect(valResult.ok).toBe(false);
    if (valResult.ok === false) expect(valResult.kind).toBe('validation');

    // Conflict via message without code
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'pds_revision_conflict: stale' },
    });
    const conflictResult = await saveWorkExperience('emp-1', [], 'rev-1');
    expect(conflictResult.ok).toBe(false);
    if (conflictResult.ok === false) expect(conflictResult.kind).toBe('conflict');

    // Uncertain on thrown fetch error during save
    db.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const thrownSave = await saveWorkExperience('emp-1', [], 'rev-1');
    expect(thrownSave.ok).toBe(false);
    if (thrownSave.ok === false) expect(thrownSave.kind).toBe('uncertain');

    // Uncertain on gateway timeout / transport error returned by rpc
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { status: 504, message: 'Gateway Timeout' },
    });
    const timeoutSave = await saveWorkExperience('emp-1', [], 'rev-1');
    expect(timeoutSave.ok).toBe(false);
    if (timeoutSave.ok === false) expect(timeoutSave.kind).toBe('uncertain');

    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'NetworkError when attempting to fetch resource.' },
    });
    const networkSave = await saveWorkExperience('emp-1', [], 'rev-1');
    expect(networkSave.ok).toBe(false);
    if (networkSave.ok === false) expect(networkSave.kind).toBe('uncertain');

    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'TypeError: fetch failed' },
    });
    const nodeFetchSave = await saveWorkExperience('emp-1', [], 'rev-1');
    expect(nodeFetchSave.ok).toBe(false);
    if (nodeFetchSave.ok === false) expect(nodeFetchSave.kind).toBe('uncertain');

    // Unavailable on definite DB failures (permission denied, missing RPC 42883, unparseable payload)
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'permission denied for table employee_work_experience' },
    });
    const permSave = await saveWorkExperience('emp-1', [], 'rev-1');
    expect(permSave.ok).toBe(false);
    if (permSave.ok === false) expect(permSave.kind).toBe('unavailable');

    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42883', message: 'function public.save_pds_section does not exist' },
    });
    const missingSave = await saveWorkExperience('emp-1', [], 'rev-1');
    expect(missingSave.ok).toBe(false);
    if (missingSave.ok === false) expect(missingSave.kind).toBe('unavailable');

    db.rpc.mockResolvedValueOnce({ data: { unexpected: true }, error: null });
    const badPayloadSave = await saveWorkExperience('emp-1', [], 'rev-1');
    expect(badPayloadSave.ok).toBe(false);
    if (badPayloadSave.ok === false) expect(badPayloadSave.kind).toBe('unavailable');

    // Read errors (including thrown fetch errors and unparseable payloads) are always unavailable
    db.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const thrownRead = await listWorkExperience('emp-1');
    expect(thrownRead.ok).toBe(false);
    if (thrownRead.ok === false) expect(thrownRead.kind).toBe('unavailable');

    db.rpc.mockResolvedValueOnce({ data: null, error: null });
    const emptyPayloadRead = await listWorkExperience('emp-1');
    expect(emptyPayloadRead.ok).toBe(false);
    if (emptyPayloadRead.ok === false) expect(emptyPayloadRead.kind).toBe('unavailable');
  });
});
