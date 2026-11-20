import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parsePositionRequirementsV2,
  normalizeDegree,
  fetchSuccessionPoolV2,
} from './successionPipelineV2';
import { supabase } from '../supabase';
import * as successionReviews from './successionReviews';
import * as successionApi from './succession';

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

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
    it('discovers department employees, applies fallbacks, and ranks candidates', async () => {
      // Mock critical_positions
      const mockSinglePos = vi.fn().mockResolvedValue({
        data: {
          id: 'pos-1',
          title: 'IT Officer II',
          department_id: 'dept-1',
          min_years_experience: 2,
          required_training_hours: 40,
          required_education: "Bachelor's Degree in IT",
          required_eligibility: 'CSC Professional',
          incumbent_employee_id: 'emp-incumbent',
        },
        error: null,
      });

      // Mock department lookup
      const mockSingleDept = vi.fn().mockResolvedValue({
        data: { id: 'dept-1', name: 'Information Technology Office' },
        error: null,
      });

      // Mock active employees in department
      const mockEmps = [
        {
          id: 'emp-1',
          first_name: 'Juan',
          last_name: 'Dela Cruz',
          position: 'IT Officer I',
          department: 'Information Technology Office',
          employment_status: 'Regular',
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
          date_hired: '2015-01-01',
        },
        {
          id: 'emp-peer',
          first_name: 'Same',
          last_name: 'Title',
          position: 'IT Officer II', // same title peer -> excluded
          department: 'Information Technology Office',
          employment_status: 'Permanent',
          date_hired: '2018-01-01',
        },
        {
          id: 'emp-probationary',
          first_name: 'New',
          last_name: 'Hire',
          position: 'IT Staff',
          department: 'Information Technology Office',
          employment_status: 'Probationary', // probationary -> excluded
          date_hired: '2026-01-01',
        },
      ];

      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);

      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(
        new Map([
          ['emp-1', { overallScore: 4.8, adjectival: 'Outstanding', period: '2025 H2', cycleId: 1 }],
          ['emp-2', { overallScore: 4.2, adjectival: 'Very Satisfactory', period: '2025 H2', cycleId: 1 }],
        ]),
      );

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'critical_positions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: mockSinglePos }),
            }),
          };
        }
        if (table === 'departments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: mockSingleDept }),
            }),
          };
        }
        if (table === 'succession_candidates') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'employees') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: mockEmps, error: null }),
              }),
            }),
          };
        }
        if (table === 'employee_work_experience') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'work-1',
                    employee_id: 'emp-1',
                    from_date: '2020-01-01',
                    to_date: '2024-01-01',
                    is_present: false,
                    position_title: 'IT Staff',
                  },
                  // emp-2 has empty work experience records -> tests date_hired tenure fallback
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'employee_training') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
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
                error: null,
              }),
            }),
          };
        }
        if (table === 'employee_education') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'ed-1',
                    employee_id: 'emp-1',
                    level: 'College',
                    course: 'BS Information Technology',
                  },
                  // emp-2 has empty education rows -> tests profile highest_educational_attainment fallback
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'employee_eligibility') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'el-1',
                    employee_id: 'emp-1',
                    eligibility_type: 'CSC Professional',
                    validity_date: null,
                  },
                  // emp-2 has empty eligibility rows -> tests profile eligibility fallback
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'critical_position_competency_requirements') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'employee_training_competencies') {
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) };
      });

      const pool = await fetchSuccessionPoolV2('pos-1', '2026-10-28');
      expect(pool.positionId).toBe('pos-1');

      // Incumbent, same-title peer, and probationary staff were excluded during discovery
      // emp-1 and emp-2 meet all minimum requirements and are ranked
      expect(pool.ranked.length).toBe(2);
      expect(pool.ranked[0].candidate.employeeId).toBe('emp-1');
      expect(pool.ranked[0].rank).toBe(1);
      expect(pool.ranked[0].total).toBeGreaterThan(0);

      expect(pool.ranked[1].candidate.employeeId).toBe('emp-2');
      expect(pool.ranked[1].rank).toBe(2);
      expect(pool.ranked[1].total).toBeGreaterThan(0);

      // Automated bypass means candidates are not stuck in needsReview
      expect(pool.needsReview.length).toBe(0);
      expect(pool.configurationNeeded.length).toBe(0);
      expect(pool.excluded.length).toBe(0);
    });

    it('identifies configuration-needed when position has missing requirements', async () => {
      const mockSinglePos = vi.fn().mockResolvedValue({
        data: {
          id: 'pos-2',
          title: 'Unconfigured Position',
          department_id: 'dept-1',
          min_years_experience: null, // missing experience requirement
          required_training_hours: null,
          required_education: null,
          required_eligibility: null,
        },
        error: null,
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'critical_positions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: mockSinglePos }),
            }),
          };
        }
        if (table === 'departments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'dept-1', name: 'IT' } }) }),
            }),
          };
        }
        if (table === 'succession_candidates') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [] }) }) };
        }
        if (table === 'employees') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: 'emp-1', first_name: 'Ana', last_name: 'Cruz', employment_status: 'Regular' }],
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [] }),
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      });

      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(new Map());

      const pool = await fetchSuccessionPoolV2('pos-2');
      expect(pool.configurationNeeded.length).toBe(1);
      expect(pool.ranked.length).toBe(0);
    });

    it('selects only live-schema employee_work_experience columns without department_agency_office_company', async () => {
      const selectCalls: Record<string, string[]> = {};
      (supabase.from as any).mockImplementation((table: string) => {
        const recordSelect = (cols: string) => {
          selectCalls[table] = [...(selectCalls[table] ?? []), cols];
        };
        if (table === 'critical_positions') {
          return {
            select: (cols: string) => {
              recordSelect(cols);
              return {
                eq: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'pos-1',
                      title: 'IT Officer II',
                      department_id: 'dept-1',
                      min_years_experience: 1,
                      required_training_hours: 8,
                      required_education: "Bachelor's Degree in IT",
                      required_eligibility: 'None required',
                    },
                    error: null,
                  }),
                }),
              };
            },
          };
        }
        if (table === 'departments') {
          return {
            select: (cols: string) => {
              recordSelect(cols);
              return {
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: 'dept-1', name: 'IT' }, error: null }),
                }),
              };
            },
          };
        }
        if (table === 'succession_candidates') {
          return {
            select: (cols: string) => {
              recordSelect(cols);
              return { eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
            },
          };
        }
        if (table === 'employees') {
          return {
            select: (cols: string) => {
              recordSelect(cols);
              return {
                eq: () => ({
                  eq: vi.fn().mockResolvedValue({
                    data: [{ id: 'emp-1', first_name: 'Ana', last_name: 'Cruz', employment_status: 'Regular', date_hired: '2020-01-01' }],
                    error: null,
                  }),
                }),
              };
            },
          };
        }
        if (table === 'employee_training_competencies') {
          return {
            select: (cols: string) => {
              recordSelect(cols);
              return Promise.resolve({ data: [], error: null });
            },
          };
        }
        return {
          select: (cols: string) => {
            recordSelect(cols);
            return {
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          },
        };
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

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'critical_positions') {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'pos-1',
                    title: 'IT Officer II',
                    department_id: 'dept-1',
                    min_years_experience: 1,
                    required_training_hours: 8,
                    required_education: "Bachelor's Degree in IT",
                    required_eligibility: 'None required',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'departments') {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue(
                  failingTarget === 'departments'
                    ? { data: null, error: dbError }
                    : { data: { id: 'dept-1', name: 'IT' }, error: null },
                ),
              }),
            }),
          };
        }
        if (table === 'succession_candidates') {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue(
                failingTarget === 'succession_candidates'
                  ? { data: null, error: dbError }
                  : { data: [{ id: 'cand-1', employee_id: 'emp-manual', note: null }], error: null },
              ),
            }),
          };
        }
        if (table === 'employees') {
          return {
            select: () => ({
              eq: () => ({
                eq: vi.fn().mockResolvedValue(
                  failingTarget === 'employees_dept'
                    ? { data: null, error: dbError }
                    : {
                        data: [{ id: 'emp-1', first_name: 'Ana', last_name: 'Cruz', employment_status: 'Regular', date_hired: '2018-01-01' }],
                        error: null,
                      },
                ),
              }),
              in: vi.fn().mockResolvedValue(
                failingTarget === 'employees_manual'
                  ? { data: null, error: dbError }
                  : {
                      data: [{ id: 'emp-manual', first_name: 'Ben', last_name: 'Reyes', employment_status: 'Regular', date_hired: '2019-01-01' }],
                      error: null,
                    },
              ),
            }),
          };
        }
        if (table === 'employee_training_competencies') {
          return {
            select: vi.fn().mockResolvedValue(
              failingTarget === 'employee_training_competencies'
                ? { data: null, error: dbError }
                : { data: [], error: null },
            ),
          };
        }
        if (table === failingTarget) {
          return {
            select: () => ({
              in: vi.fn().mockResolvedValue({ data: null, error: dbError }),
              eq: vi.fn().mockResolvedValue({ data: null, error: dbError }),
            }),
          };
        }
        return {
          select: () => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
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

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'critical_positions') {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'pos-1',
                    title: 'Department Head',
                    department_id: 'dept-1',
                    min_years_experience: 2,
                    required_training_hours: 40,
                    required_education: "Bachelor's Degree in Public Administration",
                    required_eligibility: 'CSC Professional',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'departments') {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({ data: { id: 'dept-1', name: 'Admin' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'succession_candidates') {
          return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
        }
        if (table === 'employees') {
          return {
            select: () => ({
              eq: () => ({
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: 'emp-1', first_name: 'Maria', last_name: 'Santos', employment_status: 'Regular', date_hired: '2022-01-01' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'employee_work_experience') {
          return { select: () => ({ in: vi.fn().mockResolvedValue({ data: preservedWork, error: null }) }) };
        }
        if (table === 'employee_training') {
          return {
            select: () => ({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'tr-1', employee_id: 'emp-1', training_title: 'Leadership', number_of_hours: 40, from_date: '2025-01-01', to_date: '2025-01-05', conducted_by: 'CSC' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'employee_education') {
          return { select: () => ({ in: vi.fn().mockResolvedValue({ data: preservedEducation, error: null }) }) };
        }
        if (table === 'employee_eligibility') {
          return {
            select: () => ({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'el-1', employee_id: 'emp-1', eligibility_type: 'CSC Professional', validity_date: null }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'critical_position_competency_requirements') {
          return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
        }
        if (table === 'employee_training_competencies') {
          return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        }
        return { select: () => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      });

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
