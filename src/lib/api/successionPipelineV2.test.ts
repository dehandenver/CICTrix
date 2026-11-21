import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parsePositionRequirementsV2,
  normalizeDegree,
  fetchSuccessionPoolV2,
  fetchSuccessionPoolsV2,
} from './successionPipelineV2';
import { supabase } from '../supabase';
import * as successionReviews from './successionReviews';
import * as successionApi from './succession';

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

type Row = Record<string, any>;
type QueryCapture = { table: string; filters: { op: string; column: string; value: unknown }[] };

function createMockDb(
  tables: Record<string, Row[]>,
  options?: { errors?: Record<string, string>; queries?: QueryCapture[] },
) {
  return (table: string) => {
    const filters: { op: string; column: string; value: unknown }[] = [];
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value });
        return query;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        filters.push({ op: 'in', column, value: values });
        return query;
      }),
      order: vi.fn(() => query),
      then: (resolve: (result: { data: Row[] | null; error: { message: string } | null }) => unknown) => {
        options?.queries?.push({ table, filters });
        const errMsg = options?.errors?.[table];
        if (errMsg) {
          return Promise.resolve(resolve({ data: null, error: { message: errMsg } }));
        }
        const rows = (tables[table] ?? []).filter((row) =>
          filters.every((f) => {
            if (f.op === 'eq') return row[f.column] === f.value;
            if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(row[f.column]);
            return true;
          }),
        );
        return Promise.resolve(resolve({ data: rows, error: null }));
      },
    };
    return query;
  };
}

const DEFAULT_ELIGIBILITY_TYPES = [
  { name: 'Civil Service Eligibility (Professional)', is_active: true },
  { name: 'Civil Service Eligibility (Sub-Professional)', is_active: true },
  { name: 'PRC Professional License', is_active: true },
  { name: 'Bar / Board Eligibility (RA 1080)', is_active: true },
  { name: 'Latin Honors', is_active: true },
  { name: 'Barangay Eligibility', is_active: true },
  { name: "Professional Driver's License", is_active: true },
  { name: 'Other Recognized Eligibility', is_active: true },
];

describe('successionPipelineV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parsePositionRequirementsV2', () => {
    it('parses typical plantilla position requirements', () => {
      const res = parsePositionRequirementsV2({
        min_years_experience: 3,
        required_training_hours: 40,
        required_education: "Bachelor's Degree in Computer Science",
        required_eligibility: 'CSC Professional',
      });

      expect(res.experienceYears).toBe(3);
      expect(res.trainingHours).toBe(40);
      expect(res.education?.minimum).toBe('bachelor');
      expect(res.education?.field).toBe('Computer Science');
      expect(res.eligibility).toEqual({ kind: 'required', key: 'CSC Professional' });
    });

    it('handles master and doctorate requirements', () => {
      const masterRes = parsePositionRequirementsV2({
        required_education: 'Master in Public Administration',
      });
      expect(masterRes.education?.minimum).toBe('master');

      const docRes = parsePositionRequirementsV2({
        required_education: 'Doctorate in Education',
      });
      expect(docRes.education?.minimum).toBe('doctorate');
    });

    it('handles none required eligibility', () => {
      const noneRes = parsePositionRequirementsV2({
        required_eligibility: 'None required',
      });
      expect(noneRes.eligibility).toEqual({ kind: 'none' });
    });
  });

  describe('normalizeDegree', () => {
    it('normalizes professional degrees', () => {
      expect(normalizeDegree('Post-Graduate', 'Doctor of Medicine (MD)')).toBe('MD');
      expect(normalizeDegree(null, 'Juris Doctor (JD)')).toBe('JD');
      expect(normalizeDegree('Law', 'Bachelor of Laws (LLB)')).toBe('LLB');
    });

    it('normalizes standard degrees', () => {
      expect(normalizeDegree('College', 'BS Information Technology')).toBe('bachelor');
      expect(normalizeDegree('Masteral', 'MS Computer Science')).toBe('master');
      expect(normalizeDegree('Doctoral', 'PhD in Public Administration')).toBe('doctorate');
    });
  });

  describe('fetchSuccessionPoolV2', () => {
    it('discovers department employees, applies fallbacks, and ranks candidates with metadata', async () => {
      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(
        new Map([
          ['emp-1', { overallScore: 4.8, adjectival: 'Outstanding', period: '2025 H2', cycleId: 1 }],
          ['emp-2', { overallScore: 4.2, adjectival: 'Very Satisfactory', period: '2025 H2', cycleId: 1 }],
        ]),
      );

      (supabase.from as any).mockImplementation(
        createMockDb({
          critical_positions: [
            {
              id: 'pos-1',
              title: 'IT Officer II',
              department_id: 'dept-1',
              min_years_experience: 2,
              required_training_hours: 40,
              required_education: "Bachelor's Degree in IT",
              required_eligibility: 'CSC Professional',
              incumbent_employee_id: 'emp-incumbent',
            },
          ],
          departments: [{ id: 'dept-1', name: 'Information Technology Office' }],
          succession_candidates: [],
          employees: [
            {
              id: 'emp-1',
              first_name: 'Juan',
              last_name: 'Dela Cruz',
              position: 'IT Officer I',
              department: 'Information Technology Office',
              employment_status: 'Regular',
              status: 'Active',
              date_hired: '2020-01-01',
              highest_educational_attainment: 'BS Information Technology',
              eligibility: 'CSC Professional',
            },
            {
              id: 'emp-2',
              first_name: 'Maria',
              last_name: 'Santos',
              position: 'Computer Programmer II',
              department: 'Information Technology Office',
              employment_status: 'Permanent',
              status: 'Active',
              date_hired: '2019-01-01',
              highest_educational_attainment: 'BS Computer Science',
              eligibility: 'CSC Professional',
            },
            {
              id: 'emp-incumbent',
              first_name: 'Current',
              last_name: 'Incumbent',
              position: 'IT Officer II',
              department: 'Information Technology Office',
              employment_status: 'Permanent',
              status: 'Active',
              date_hired: '2015-01-01',
            },
            {
              id: 'emp-peer',
              first_name: 'Same',
              last_name: 'Title',
              position: 'IT Officer II',
              department: 'Information Technology Office',
              employment_status: 'Permanent',
              status: 'Active',
              date_hired: '2018-01-01',
            },
            {
              id: 'emp-probationary',
              first_name: 'New',
              last_name: 'Hire',
              position: 'IT Staff',
              department: 'Information Technology Office',
              employment_status: 'Probationary',
              status: 'Active',
              date_hired: '2026-01-01',
            },
          ],
          employee_work_experience: [
            {
              id: 'work-1',
              employee_id: 'emp-1',
              from_date: '2020-01-01',
              to_date: '2024-01-01',
              is_present: false,
              position_title: 'IT Staff',
            },
          ],
          employee_training: [
            {
              id: 't-1',
              employee_id: 'emp-1',
              training_title: 'Network Administration',
              number_of_hours: 80,
              from_date: '2023-01-01',
              to_date: '2023-01-10',
              conducted_by: 'CSC',
            },
            {
              id: 't-2',
              employee_id: 'emp-2',
              training_title: 'Database Systems',
              number_of_hours: 50,
              from_date: '2023-02-01',
              to_date: '2023-02-10',
              conducted_by: 'DICT',
            },
          ],
          employee_education: [
            {
              id: 'ed-1',
              employee_id: 'emp-1',
              level: 'College',
              course: 'BS Information Technology',
            },
          ],
          employee_eligibility: [
            {
              id: 'el-1',
              employee_id: 'emp-1',
              eligibility_type: 'CSC Professional',
              validity_date: null,
            },
          ],
          critical_position_competency_requirements: [],
          employee_training_competencies: [],
          eligibility_types: DEFAULT_ELIGIBILITY_TYPES,
        }),
      );

      const pool = await fetchSuccessionPoolV2('pos-1', '2026-10-28');
      expect(pool.positionId).toBe('pos-1');
      expect(pool.downwardMovesExcluded).toBe(0);

      expect(pool.ranked.length).toBe(2);
      expect(pool.ranked[0].candidate.employeeId).toBe('emp-1');
      expect(pool.ranked[0].rank).toBe(1);
      expect(pool.ranked[1].candidate.employeeId).toBe('emp-2');
      expect(pool.ranked[1].rank).toBe(2);

      expect(pool.candidateMeta['emp-1']).toMatchObject({
        presentPosition: 'IT Officer I',
        department: 'Information Technology Office',
        ipcrPeriod: '2025 H2',
        ipcrAdjectival: 'Outstanding',
        experienceUsedTenureFallback: false,
        eligibilityDetail: {
          recognized: ['Civil Service Eligibility (Professional)'],
          expired: [],
          unrecognized: [],
        },
      });
      expect(pool.candidateMeta['emp-2'].experienceUsedTenureFallback).toBe(true);
      expect(pool.needsReview.length).toBe(0);
      expect(pool.configurationNeeded.length).toBe(0);
      expect(pool.excluded.length).toBe(0);
    });

    it('identifies configuration-needed when position has missing requirements', async () => {
      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(new Map());

      (supabase.from as any).mockImplementation(
        createMockDb({
          critical_positions: [
            {
              id: 'pos-2',
              title: 'Unconfigured Position',
              department_id: 'dept-1',
              min_years_experience: null,
              required_training_hours: null,
              required_education: null,
              required_eligibility: null,
            },
          ],
          departments: [{ id: 'dept-1', name: 'IT' }],
          employees: [
            {
              id: 'emp-1',
              first_name: 'Ana',
              last_name: 'Cruz',
              department: 'IT',
              employment_status: 'Regular',
              status: 'Active',
            },
          ],
        }),
      );

      const pool = await fetchSuccessionPoolV2('pos-2');
      expect(pool.configurationNeeded.length).toBe(1);
      expect(pool.ranked.length).toBe(0);
    });

    it('throws when the requested critical position is not found', async () => {
      (supabase.from as any).mockImplementation(createMockDb({ critical_positions: [] }));
      await expect(fetchSuccessionPoolV2('missing-pos')).rejects.toThrow(/Not found/);
    });
  });

  describe('fetchSuccessionPoolsV2', () => {
    it('returns an empty map for empty input without querying', async () => {
      const pools = await fetchSuccessionPoolsV2([]);
      expect(pools.size).toBe(0);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('excludes downward title moves and counts downwardMovesExcluded while keeping manual nominees', async () => {
      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(
        new Map([
          ['emp-junior', { overallScore: 4.5, adjectival: 'Outstanding', period: '2026 H1', cycleId: 1 }],
          ['emp-manual-senior', { overallScore: 4.9, adjectival: 'Outstanding', period: '2026 H1', cycleId: 1 }],
        ]),
      );

      (supabase.from as any).mockImplementation(
        createMockDb({
          critical_positions: [
            {
              id: 'pos-eng-2',
              title: 'Engineer II',
              department_id: 'dept-eng',
              min_years_experience: 1,
              required_training_hours: 10,
              required_education: "Bachelor's Degree in Engineering",
              required_eligibility: 'None',
            },
          ],
          departments: [{ id: 'dept-eng', name: 'Engineering' }],
          succession_candidates: [
            { id: 'mc-1', critical_position_id: 'pos-eng-2', employee_id: 'emp-manual-senior' },
          ],
          employees: [
            {
              id: 'emp-junior',
              first_name: 'Leo',
              last_name: 'Reyes',
              position: 'Engineer I',
              department: 'Engineering',
              employment_status: 'Regular',
              status: 'Active',
              date_hired: '2020-01-01',
              highest_educational_attainment: 'BS Civil Engineering',
            },
            {
              id: 'emp-senior',
              first_name: 'Senior',
              last_name: 'Chief',
              position: 'Engineer IV',
              department: 'Engineering',
              employment_status: 'Regular',
              status: 'Active',
              date_hired: '2010-01-01',
              highest_educational_attainment: 'BS Civil Engineering',
            },
            {
              id: 'emp-dept-head',
              first_name: 'City',
              last_name: 'Eng',
              position: 'City Engineer',
              department: 'Engineering',
              employment_status: 'Regular',
              status: 'Active',
              date_hired: '2008-01-01',
              highest_educational_attainment: 'BS Civil Engineering',
            },
            {
              id: 'emp-manual-senior',
              first_name: 'Manual',
              last_name: 'Override',
              position: 'Engineer III',
              department: 'Engineering',
              employment_status: 'Regular',
              status: 'Active',
              date_hired: '2014-01-01',
              highest_educational_attainment: 'BS Civil Engineering',
            },
          ],
          employee_training: [
            { id: 'tr-j', employee_id: 'emp-junior', training_title: 'CAD', number_of_hours: 20, from_date: '2024-01-01', to_date: '2024-01-02' },
            { id: 'tr-m', employee_id: 'emp-manual-senior', training_title: 'PM', number_of_hours: 20, from_date: '2024-01-01', to_date: '2024-01-02' },
          ],
          eligibility_types: DEFAULT_ELIGIBILITY_TYPES,
        }),
      );

      const pools = await fetchSuccessionPoolsV2(['pos-eng-2'], '2026-10-28');
      const pool = pools.get('pos-eng-2')!;
      expect(pool.downwardMovesExcluded).toBe(2);
      expect(pool.ranked.map((r) => r.candidate.employeeId).sort()).toEqual([
        'emp-junior',
        'emp-manual-senior',
      ]);
    });

    it('enforces active eligibility catalog, deduplicates aliases, and tracks expired/unrecognized details', async () => {
      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(
        new Map([
          ['emp-dup', { overallScore: 4.5, adjectival: 'Outstanding', period: '2026 H1', cycleId: 1 }],
          ['emp-unrec', { overallScore: 4.5, adjectival: 'Outstanding', period: '2026 H1', cycleId: 1 }],
        ]),
      );

      (supabase.from as any).mockImplementation(
        createMockDb({
          critical_positions: [
            {
              id: 'pos-1',
              title: 'Accountant III',
              department_id: 'dept-acct',
              min_years_experience: 1,
              required_training_hours: 10,
              required_education: "Bachelor's Degree in Accountancy",
              required_eligibility: 'Civil Service Eligibility (Professional)',
            },
          ],
          departments: [{ id: 'dept-acct', name: 'Accounting' }],
          employees: [
            {
              id: 'emp-dup',
              first_name: 'Alias',
              last_name: 'Dedupe',
              position: 'Accountant I',
              department: 'Accounting',
              employment_status: 'Regular',
              status: 'Active',
              date_hired: '2020-01-01',
              highest_educational_attainment: 'BS Accountancy',
            },
            {
              id: 'emp-unrec',
              first_name: 'Unrec',
              last_name: 'Only',
              position: 'Accountant II',
              department: 'Accounting',
              employment_status: 'Regular',
              status: 'Active',
              date_hired: '2020-01-01',
              highest_educational_attainment: 'BS Accountancy',
            },
          ],
          employee_training: [
            { id: 't-dup', employee_id: 'emp-dup', training_title: 'Audit', number_of_hours: 20, from_date: '2024-01-01', to_date: '2024-01-02' },
            { id: 't-unrec', employee_id: 'emp-unrec', training_title: 'Audit', number_of_hours: 20, from_date: '2024-01-01', to_date: '2024-01-02' },
          ],
          employee_eligibility: [
            // Two aliases for the same canonical type -> should deduplicate to 1 (7.5 pts, not 15)
            { id: 'el-1', employee_id: 'emp-dup', eligibility_type: 'CSC Professional', validity_date: null },
            { id: 'el-2', employee_id: 'emp-dup', eligibility_type: 'Civil Service Eligibility (Professional)', validity_date: null },
            // Deactivated catalog type -> unrecognized
            { id: 'el-3', employee_id: 'emp-dup', eligibility_type: 'PRC License', validity_date: null },
            // Expired recognized type -> expired
            { id: 'el-4', employee_id: 'emp-dup', eligibility_type: 'Latin Honors', validity_date: '2020-01-01' },
            // Strictly unrecognized free-text strings
            { id: 'el-5', employee_id: 'emp-unrec', eligibility_type: 'Registered Civil Engineer', validity_date: null },
            { id: 'el-6', employee_id: 'emp-unrec', eligibility_type: 'Mechanic (MC 11, s. 1996 - Cat. II)', validity_date: null },
          ],
          eligibility_types: [
            { name: 'Civil Service Eligibility (Professional)', is_active: true },
            { name: 'Latin Honors', is_active: true },
            { name: 'PRC Professional License', is_active: false },
          ],
        }),
      );

      const pools = await fetchSuccessionPoolsV2(['pos-1'], '2026-10-28');
      const pool = pools.get('pos-1')!;

      // emp-dup has 1 distinct valid recognized eligibility -> 7.5 / 15
      expect(pool.ranked).toHaveLength(1);
      expect(pool.ranked[0].candidate.employeeId).toBe('emp-dup');
      expect(pool.ranked[0].contributions.eligibility).toBe(7.5);
      expect(pool.candidateMeta['emp-dup'].eligibilityDetail).toEqual({
        recognized: ['Civil Service Eligibility (Professional)'],
        expired: ['Latin Honors'],
        unrecognized: ['PRC Professional License'],
      });

      // emp-unrec holds only unrecognized strings -> excluded from required eligibility
      expect(pool.excluded).toHaveLength(1);
      expect(pool.excluded[0].candidate.employeeId).toBe('emp-unrec');
      expect(pool.excluded[0].reasonCodes).toContain('ELIGIBILITY_MINIMUM_NOT_MET');
      expect(pool.candidateMeta['emp-unrec'].eligibilityDetail).toEqual({
        recognized: [],
        expired: [],
        unrecognized: ['Registered Civil Engineer', 'Mechanic (MC 11, s. 1996 - Cat. II)'],
      });
    });

    it('builds competency breakdown metadata and filters employee_training_competencies via .in()', async () => {
      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(
        new Map([['emp-1', { overallScore: 4.5, adjectival: 'Outstanding', period: '2026 H1', cycleId: 1 }]]),
      );

      const queries: QueryCapture[] = [];
      (supabase.from as any).mockImplementation(
        createMockDb(
          {
            critical_positions: [
              {
                id: 'pos-1',
                title: 'HR Officer III',
                department_id: 'dept-hr',
                min_years_experience: 1,
                required_training_hours: 10,
                required_education: "Bachelor's Degree in Psychology",
                required_eligibility: 'None',
              },
            ],
            departments: [{ id: 'dept-hr', name: 'HRMO' }],
            employees: [
              {
                id: 'emp-1',
                first_name: 'Carla',
                last_name: 'Mendoza',
                position: 'HR Officer II',
                department: 'HRMO',
                employment_status: 'Regular',
                status: 'Active',
                date_hired: '2020-01-01',
                highest_educational_attainment: 'BS Psychology',
              },
            ],
            employee_training: [
              {
                id: 'tr-101',
                employee_id: 'emp-1',
                training_title: 'Strategic HR Workshop',
                number_of_hours: 24,
                from_date: '2025-01-01',
                to_date: '2025-01-03',
              },
            ],
            critical_position_competency_requirements: [
              {
                critical_position_id: 'pos-1',
                competency_id: 'comp-1',
                competencies: { name: 'Talent Management' },
              },
              {
                critical_position_id: 'pos-1',
                competency_id: 'comp-2',
                // omit embedded competencies to exercise fallback lookup from competencies table
              },
            ],
            competencies: [{ id: 'comp-2', name: 'Labor Relations' }],
            employee_training_competencies: [
              { employee_training_id: 'tr-101', competency_id: 'comp-1' },
            ],
            eligibility_types: DEFAULT_ELIGIBILITY_TYPES,
          },
          { queries },
        ),
      );

      const pools = await fetchSuccessionPoolsV2(['pos-1'], '2026-10-28');
      const pool = pools.get('pos-1')!;
      const meta = pool.candidateMeta['emp-1'];

      expect(meta.competencyBreakdown).toEqual([
        { name: 'Talent Management', met: true, satisfiedBy: 'Strategic HR Workshop' },
        { name: 'Labor Relations', met: false, satisfiedBy: null },
      ]);
      expect(meta.gapAnalysis).toEqual(['Missing required competency: Labor Relations (1/2 met)']);
      expect(meta.requiredActions).toEqual(['Complete a training tagged with "Labor Relations"']);
      expect(meta.timeline).toBe('6 months');

      const tagQueries = queries.filter((q) => q.table === 'employee_training_competencies');
      expect(tagQueries).toHaveLength(1);
      expect(tagQueries[0].filters).toContainEqual({
        op: 'in',
        column: 'employee_training_id',
        value: ['tr-101'],
      });
    });

    it('throws an explicit error when a Supabase query fails', async () => {
      (supabase.from as any).mockImplementation(
        createMockDb({}, { errors: { critical_positions: 'DB connection lost' } }),
      );

      await expect(fetchSuccessionPoolsV2(['pos-1'])).rejects.toThrow(
        /Failed to load critical positions: DB connection lost/,
      );
    });

    it('selects only live-schema employee_work_experience columns without department_agency_office_company', async () => {
      const selectCalls: Record<string, string[]> = {};
      const baseDb = createMockDb({
        critical_positions: [
          {
            id: 'pos-1',
            title: 'IT Officer II',
            department_id: 'dept-1',
            min_years_experience: 1,
            required_training_hours: 8,
            required_education: "Bachelor's Degree in IT",
            required_eligibility: 'None required',
          },
        ],
        departments: [{ id: 'dept-1', name: 'IT' }],
        employees: [
          { id: 'emp-1', first_name: 'Ana', last_name: 'Cruz', department: 'IT', employment_status: 'Regular', status: 'Active', date_hired: '2020-01-01' },
        ],
        eligibility_types: DEFAULT_ELIGIBILITY_TYPES,
      });

      (supabase.from as any).mockImplementation((table: string) => {
        const q = baseDb(table);
        const origSelect = q.select;
        q.select = vi.fn((cols: string) => {
          selectCalls[table] = [...(selectCalls[table] ?? []), cols];
          return origSelect(cols);
        });
        return q;
      });

      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(new Map());

      await fetchSuccessionPoolV2('pos-1', '2026-10-28');

      const workSelect = selectCalls.employee_work_experience?.[0] ?? '';
      expect(workSelect).toContain('company_name');
      expect(workSelect).not.toContain('department_agency_office_company');
      expect(workSelect).toBe('id, employee_id, from_date, to_date, is_present, position_title, company_name');
    });

    it.each([
      'departments',
      'succession_candidates',
      'employees_dept',
      'employees_manual',
      'employee_work_experience',
      'employee_training',
      'employee_education',
      'employee_eligibility',
      'critical_position_competency_requirements',
      'employee_training_competencies',
    ])('throws when %s query fails instead of falling back to date_hired or empty lists', async (failingTarget) => {
      const dbError = { message: `Query failed on ${failingTarget}`, code: '42703' };

      const tables: Record<string, Row[]> = {
        critical_positions: [
          {
            id: 'pos-1',
            title: 'IT Officer II',
            department_id: 'dept-1',
            min_years_experience: 1,
            required_training_hours: 8,
            required_education: "Bachelor's Degree in IT",
            required_eligibility: 'None required',
          },
        ],
        departments: [{ id: 'dept-1', name: 'IT' }],
        succession_candidates: [{ id: 'cand-1', critical_position_id: 'pos-1', employee_id: 'emp-manual', note: null }],
        employees: [
          { id: 'emp-1', first_name: 'Ana', last_name: 'Cruz', department: 'IT', employment_status: 'Regular', status: 'Active', date_hired: '2018-01-01' },
          { id: 'emp-manual', first_name: 'Ben', last_name: 'Reyes', department: 'Finance', employment_status: 'Regular', status: 'Active', date_hired: '2019-01-01' },
        ],
        employee_training: [
          { id: 'tr-1', employee_id: 'emp-1', training_title: 'Security', number_of_hours: 12, from_date: '2024-01-01', to_date: '2024-01-02' },
        ],
        eligibility_types: DEFAULT_ELIGIBILITY_TYPES,
      };

      const baseDb = createMockDb(tables);
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'employees' && (failingTarget === 'employees_dept' || failingTarget === 'employees_manual')) {
          const inner = baseDb('employees');
          const filters: { op: string; column: string; value: unknown }[] = [];
          const q: any = {
            select: vi.fn((cols: string) => {
              inner.select(cols);
              return q;
            }),
            eq: vi.fn((col: string, val: unknown) => {
              filters.push({ op: 'eq', column: col, value: val });
              inner.eq(col, val);
              return q;
            }),
            in: vi.fn((col: string, val: unknown[]) => {
              filters.push({ op: 'in', column: col, value: val });
              inner.in(col, val);
              return q;
            }),
            then: (resolve: (r: any) => unknown) => {
              const isManual = filters.some((f) => f.op === 'in' && f.column === 'id');
              if ((isManual && failingTarget === 'employees_manual') || (!isManual && failingTarget === 'employees_dept')) {
                return Promise.resolve(resolve({ data: null, error: dbError }));
              }
              return inner.then(resolve);
            },
          };
          return q;
        }
        if (table === failingTarget) {
          return createMockDb(tables, { errors: { [failingTarget]: dbError.message } })(table);
        }
        return baseDb(table);
      });

      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(new Map());

      await expect(fetchSuccessionPoolV2('pos-1', '2026-10-28')).rejects.toThrow(`Query failed on ${failingTarget}`);
    });

    it('preserves two College degrees, Doctorate, work metadata, and non-stale evidence reviews across PDS round-trip', async () => {
      const reqSnapshot = {
        experienceYears: 2,
        trainingHours: 40,
        education: { minimum: 'bachelor' as const, field: 'Public Administration' },
        eligibility: { kind: 'required' as const, key: 'CSC Professional' },
      };

      const preservedWork = [
        {
          id: 'work-uuid-1',
          employee_id: 'emp-1',
          from_date: '2018-01-01',
          to_date: '2021-12-31',
          is_present: false,
          position_title: 'Administrative Officer II',
          company_name: 'Private Corp',
          duties_responsibilities: 'Records management',
          separation_reason: 'Resignation',
        },
        {
          id: 'work-uuid-2',
          employee_id: 'emp-1',
          from_date: '2022-01-01',
          to_date: null,
          is_present: true,
          position_title: 'Administrative Officer IV',
          company_name: 'City Hall',
          duties_responsibilities: 'Supervises HR records',
          separation_reason: null,
        },
      ];
      const preservedEducation = [
        { id: 'edu-col-1', employee_id: 'emp-1', level: 'College', course: 'BS Public Administration', year_graduated: 2014 },
        { id: 'edu-col-2', employee_id: 'emp-1', level: 'College', course: 'BS Information Systems', year_graduated: 2016 },
        { id: 'edu-doc-1', employee_id: 'emp-1', level: 'Doctorate', course: 'Doctor of Public Administration', year_graduated: 2024 },
      ];

      const work1Review: successionReviews.SuccessionEvidenceReview = {
        id: 'rev-work-1',
        criticalPositionId: 'pos-1',
        employeeId: 'emp-1',
        criterion: 'work',
        sourceRecordId: 'work-uuid-1',
        isRelevant: true,
        isCityHall: false,
        matchesRequirement: null,
        evidenceSnapshot: {
          from_date: '2018-01-01',
          to_date: '2021-12-31',
          is_present: false,
          position_title: 'Administrative Officer II',
        },
        requirementsSnapshot: reqSnapshot,
        reviewedBy: 'admin@lgu.test',
        reviewedAt: '2026-10-01T00:00:00Z',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      const preservedWork1Snap = {
        from_date: preservedWork[0].from_date,
        to_date: preservedWork[0].to_date,
        is_present: preservedWork[0].is_present,
        position_title: preservedWork[0].position_title,
      };
      expect(successionReviews.isReviewStale(work1Review, preservedWork1Snap, reqSnapshot)).toBe(false);
      expect(
        successionReviews.isReviewStale(
          work1Review,
          { ...preservedWork1Snap, position_title: 'Drifted Title' },
          reqSnapshot,
        ),
      ).toBe(true);
      expect(
        successionReviews.isReviewStale(
          work1Review,
          preservedWork1Snap,
          { ...reqSnapshot, experienceYears: 5 },
        ),
      ).toBe(true);

      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([
        work1Review,
        {
          id: 'rev-work-2',
          criticalPositionId: 'pos-1',
          employeeId: 'emp-1',
          criterion: 'work',
          sourceRecordId: 'work-uuid-2',
          isRelevant: true,
          isCityHall: true,
          matchesRequirement: null,
          evidenceSnapshot: {
            from_date: '2022-01-01',
            to_date: null,
            is_present: true,
            position_title: 'Administrative Officer IV',
          },
          requirementsSnapshot: reqSnapshot,
          reviewedBy: 'admin@lgu.test',
          reviewedAt: '2026-10-01T00:00:00Z',
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
        {
          id: 'rev-doc-1',
          criticalPositionId: 'pos-1',
          employeeId: 'emp-1',
          criterion: 'education',
          sourceRecordId: 'edu-doc-1',
          isRelevant: true,
          isCityHall: null,
          matchesRequirement: true,
          evidenceSnapshot: { level: 'Doctorate', course: 'Doctor of Public Administration' },
          requirementsSnapshot: reqSnapshot,
          reviewedBy: 'admin@lgu.test',
          reviewedAt: '2026-10-01T00:00:00Z',
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ]);

      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(
        new Map([['emp-1', { overallScore: 4.5, adjectival: 'Outstanding', period: '2026', cycleId: 1 }]]),
      );

      (supabase.from as any).mockImplementation(
        createMockDb({
          critical_positions: [
            {
              id: 'pos-1',
              title: 'Department Head',
              department_id: 'dept-1',
              min_years_experience: 2,
              required_training_hours: 40,
              required_education: "Bachelor's Degree in Public Administration",
              required_eligibility: 'CSC Professional',
            },
          ],
          departments: [{ id: 'dept-1', name: 'Admin' }],
          employees: [
            { id: 'emp-1', first_name: 'Maria', last_name: 'Santos', department: 'Admin', employment_status: 'Regular', status: 'Active', date_hired: '2022-01-01' },
          ],
          employee_work_experience: preservedWork,
          employee_training: [
            { id: 'tr-1', employee_id: 'emp-1', training_title: 'Leadership', number_of_hours: 40, from_date: '2025-01-01', to_date: '2025-01-05', conducted_by: 'CSC' },
          ],
          employee_education: preservedEducation,
          employee_eligibility: [
            { id: 'el-1', employee_id: 'emp-1', eligibility_type: 'CSC Professional', validity_date: null },
          ],
          eligibility_types: DEFAULT_ELIGIBILITY_TYPES,
        }),
      );

      const pool = await fetchSuccessionPoolV2('pos-1', '2026-10-28');
      expect(pool.ranked).toHaveLength(1);
      const ranked = pool.ranked[0];
      expect(ranked.audit.highestRelevantDegree).toBe('doctorate');
      // Honoring rev-work-1 (isCityHall: false) excludes the 2018-2021 private role,
      // leaving only work-uuid-2 (~4.82 yrs) instead of defaulting to >8 yrs.
      expect(ranked.audit.relevantYears).toBeGreaterThan(4);
      expect(ranked.audit.relevantYears).toBeLessThan(5.5);
      expect(ranked.contributions.education).toBe(15);
    });
  });
});
