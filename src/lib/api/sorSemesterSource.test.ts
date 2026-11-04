import { beforeEach, describe, expect, it, vi } from 'vitest';

// Configurable mock database state
const mockDb = {
  rpcResult: null as any,
  rpcError: null as any,
  performanceCycles: [] as any[],
  roster: [] as any[],
  targetSettings: [] as any[],
  evaluations: [] as any[],
  employeeCompetencies: [] as any[],
  assessmentRuns: [] as any[],
  summaries: [] as any[],
  employees: [] as any[],
  positionRequirements: [] as any[],
  standards: [] as any[],
};

vi.mock('../supabase', () => {
  const fakeSupabase = {
    rpc: vi.fn(async (_fnName: string, _args: any) => {
      if (mockDb.rpcError) {
        return { data: null, error: mockDb.rpcError };
      }
      return { data: mockDb.rpcResult, error: null };
    }),
    from: vi.fn((table: string) => {
      const eqFilters: [string, any][] = [];
      const inFilters: [string, any[]][] = [];
      let range: [number, number] | null = null;

      const queryBuilder: any = {
        select: vi.fn((_cols = '*') => {
          return queryBuilder;
        }),
        eq: vi.fn((col: string, val: any) => {
          eqFilters.push([col, val]);
          return queryBuilder;
        }),
        in: vi.fn((col: string, vals: any[]) => {
          inFilters.push([col, vals]);
          return queryBuilder;
        }),
        ilike: vi.fn((col: string, val: any) => {
          eqFilters.push([col, val]);
          return queryBuilder;
        }),
        order: vi.fn(() => queryBuilder),
        range: vi.fn((from: number, to: number) => {
          range = [from, to];
          return queryBuilder;
        }),
        update: vi.fn((_payload: any) => queryBuilder),
        maybeSingle: vi.fn(async () => {
          const rows = getFilteredRows();
          return { data: rows.length > 0 ? rows[0] : null, error: null };
        }),
        then: (resolve: (val: any) => void) => {
          const rows = getFilteredRows();
          resolve({ data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null });
        },
      };

      function getFilteredRows() {
        let tableData: any[] = [];
        switch (table) {
          case 'performance_cycles':
            tableData = mockDb.performanceCycles;
            break;
          case 'ipcr_semester_roster':
            tableData = mockDb.roster;
            break;
          case 'target_settings':
            tableData = mockDb.targetSettings;
            break;
          case 'performance_evaluations':
            tableData = mockDb.evaluations;
            break;
          case 'employee_competencies':
            tableData = mockDb.employeeCompetencies;
            break;
          case 'competency_assessment_runs':
            tableData = mockDb.assessmentRuns;
            break;
          case 'employee_competency_summaries':
            tableData = mockDb.summaries;
            break;
          case 'employees_with_department':
            tableData = mockDb.employees;
            break;
          case 'position_competency_requirements':
            tableData = mockDb.positionRequirements;
            break;
          case 'competency_standards':
            tableData = mockDb.standards;
            break;
          default:
            tableData = [];
        }

        return tableData.filter((row) => {
          for (const [col, val] of eqFilters) {
            if (typeof row[col] === 'string' && typeof val === 'string') {
              if (row[col].toLowerCase() !== val.toLowerCase()) return false;
            } else if (row[col] !== val) {
              return false;
            }
          }
          for (const [col, vals] of inFilters) {
            if (!vals.includes(row[col])) return false;
          }
          return true;
        });
      }

      return queryBuilder;
    }),
  };

  return { supabase: fakeSupabase };
});

import {
  getDepartmentSourceSemester,
  getPublishedRecords,
} from './sorSemesterSource';

describe('sorSemesterSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.rpcResult = null;
    mockDb.rpcError = null;
    mockDb.performanceCycles = [];
    mockDb.roster = [];
    mockDb.targetSettings = [];
    mockDb.evaluations = [];
    mockDb.employeeCompetencies = [];
    mockDb.assessmentRuns = [];
    mockDb.summaries = [];
    mockDb.employees = [];
    mockDb.positionRequirements = [];
    mockDb.standards = [];
  });

  describe('getDepartmentSourceSemester', () => {
    it('returns published semester info when RPC returns a row', async () => {
      mockDb.rpcResult = [
        {
          cycle_id: 6,
          status: 'published',
          required_count: 12,
          approved_count: 12,
          assessment_complete_count: 10,
        },
      ];
      mockDb.performanceCycles = [
        { id: 6, title: 'January–June 2026' },
      ];

      const result = await getDepartmentSourceSemester('City Health Office');

      expect(result).not.toBeNull();
      expect(result).toEqual({
        cycleId: 6,
        status: 'published',
        requiredCount: 12,
        approvedCount: 12,
        assessmentCompleteCount: 10,
        cycleTitle: 'January–June 2026',
        department: 'City Health Office',
        periodTitle: 'January–June 2026',
      });
    });

    it('returns published semester info with correction_pending status', async () => {
      mockDb.rpcResult = [
        {
          cycle_id: 5,
          status: 'correction_pending',
          required_count: 10,
          approved_count: 9,
          assessment_complete_count: 8,
        },
      ];
      mockDb.performanceCycles = [
        { id: 5, title: 'July–December 2025' },
      ];

      const result = await getDepartmentSourceSemester('City Engineer');

      expect(result).toEqual({
        cycleId: 5,
        status: 'correction_pending',
        requiredCount: 10,
        approvedCount: 9,
        assessmentCompleteCount: 8,
        cycleTitle: 'July–December 2025',
        department: 'City Engineer',
        periodTitle: 'July–December 2025',
      });
    });

    it('returns null when no qualifying semester exists', async () => {
      mockDb.rpcResult = [];

      const result = await getDepartmentSourceSemester('Office With No Completed Semester');

      expect(result).toBeNull();
    });

    it('returns null when department name is empty or null', async () => {
      expect(await getDepartmentSourceSemester('')).toBeNull();
      expect(await getDepartmentSourceSemester(null as any)).toBeNull();
    });

    it('returns null when RPC returns an error', async () => {
      mockDb.rpcError = { message: 'function evaluate_sor_publication does not exist' };

      const result = await getDepartmentSourceSemester('City Health Office');

      expect(result).toBeNull();
    });
  });

  describe('getPublishedRecords', () => {
    beforeEach(() => {
      mockDb.performanceCycles = [
        { id: 6, title: 'January–June 2026' },
      ];
      mockDb.standards = [
        { id: 1, competency_name: 'Core - Integrity', training_stream: 'Ethics' },
        { id: 2, competency_name: 'Core - Teamwork', training_stream: 'Collaboration' },
        { id: 3, competency_name: 'Organizational - Communication', training_stream: 'Soft Skills' },
      ];
      mockDb.positionRequirements = [
        {
          position_title: 'Medical Officer III',
          competency_id: 1,
          proficiency_level: 'Advanced', // 5
        },
        {
          position_title: 'Medical Officer III',
          competency_id: 2,
          proficiency_level: 'Intermediate', // 4
        },
      ];
    });

    it('sets numericalRating directly from performance_evaluations.final_score', async () => {
      mockDb.roster = [
        { cycle_id: 6, employee_id: 'emp-uuid-1', department_name: 'City Health Office', owes_ipcr: true },
      ];
      mockDb.employees = [
        {
          id: 'emp-uuid-1',
          employee_id: 'EMP-001',
          full_name: 'Santos, Maria',
          current_position: 'Medical Officer III',
          department: 'City Health Office',
        },
      ];
      mockDb.evaluations = [
        {
          cycle_id: 6,
          employee_id: 'emp-uuid-1',
          final_score: 4.85,
          remarks: 'Target goals exceeded',
          status: 'Approved',
        },
      ];
      // Competencies possess average 3.0, but final_score is 4.85
      mockDb.employeeCompetencies = [
        {
          cycle_id: 6,
          employee_id: 'emp-uuid-1',
          proficiency_level: 3,
          competencies: { name: 'Core - Integrity' },
        },
        {
          cycle_id: 6,
          employee_id: 'emp-uuid-1',
          proficiency_level: 3,
          competencies: { name: 'Core - Teamwork' },
        },
      ];

      const records = await getPublishedRecords('City Health Office', 6);

      expect(records).toHaveLength(1);
      // Strictly from performance_evaluations.final_score (4.85), NOT the competency average (3.0)!
      expect(records[0].numericalRating).toBe(4.85);
      expect(records[0].name).toBe('Santos, Maria');
      expect(records[0].period).toBe('January–June 2026');
      expect(records[0].submissionStatus).toBe('SUBMITTED');
    });

    it('maps competency standards and possessed/required levels correctly', async () => {
      mockDb.roster = [
        { cycle_id: 6, employee_id: 'emp-uuid-1', department_name: 'City Health Office', owes_ipcr: true },
      ];
      mockDb.employees = [
        {
          id: 'emp-uuid-1',
          employee_id: 'EMP-001',
          full_name: 'Santos, Maria',
          current_position: 'Medical Officer III',
          department: 'City Health Office',
        },
      ];
      mockDb.evaluations = [
        {
          cycle_id: 6,
          employee_id: 'emp-uuid-1',
          final_score: 4.5,
          status: 'Approved',
        },
      ];
      // Core - Integrity: required 5 (Advanced), possessed 4 -> Gap!
      // Core - Teamwork: required 4 (Intermediate), possessed 4 -> No gap!
      mockDb.employeeCompetencies = [
        {
          cycle_id: 6,
          employee_id: 'emp-uuid-1',
          proficiency_level: 4,
          competencies: { name: 'Core - Integrity' },
        },
        {
          cycle_id: 6,
          employee_id: 'emp-uuid-1',
          proficiency_level: 4,
          competencies: { name: 'Core - Teamwork' },
        },
      ];

      const records = await getPublishedRecords('City Health Office', 6);

      expect(records).toHaveLength(1);
      const comps = records[0].competencies ?? [];
      expect(comps).toHaveLength(2);

      const integrity = comps.find((c) => c.name === 'Core - Integrity');
      expect(integrity).toBeDefined();
      expect(integrity?.possessed).toBe(4);
      expect(integrity?.required).toBe(5);
      expect(integrity?.requiredAvailable).toBe(true);
      expect(integrity?.possessedAvailable).toBe(true);
      expect(integrity?.isGap).toBe(true); // 4 < 5

      const teamwork = comps.find((c) => c.name === 'Core - Teamwork');
      expect(teamwork).toBeDefined();
      expect(teamwork?.possessed).toBe(4);
      expect(teamwork?.required).toBe(4);
      expect(teamwork?.requiredAvailable).toBe(true);
      expect(teamwork?.possessedAvailable).toBe(true);
      expect(teamwork?.isGap).toBe(false); // 4 >= 4

      // Any gap sets remarks to Training Recommended
      expect(records[0].remarks).toBe('Training Recommended');
    });

    it('sets possessedAvailable: false when competency has no assessment', async () => {
      mockDb.roster = [
        { cycle_id: 6, employee_id: 'emp-uuid-1', department_name: 'City Health Office', owes_ipcr: true },
      ];
      mockDb.employees = [
        {
          id: 'emp-uuid-1',
          employee_id: 'EMP-001',
          full_name: 'Dela Cruz, Juan',
          current_position: 'Medical Officer III',
          department: 'City Health Office',
        },
      ];
      mockDb.evaluations = [
        {
          cycle_id: 6,
          employee_id: 'emp-uuid-1',
          final_score: 4.0,
          status: 'Approved',
        },
      ];
      // Employee has assessed Core - Integrity, but NO assessment for Core - Teamwork
      mockDb.employeeCompetencies = [
        {
          cycle_id: 6,
          employee_id: 'emp-uuid-1',
          proficiency_level: 4,
          competencies: { name: 'Core - Integrity' },
        },
      ];

      const records = await getPublishedRecords('City Health Office', 6);

      expect(records).toHaveLength(1);
      const comps = records[0].competencies ?? [];

      const teamwork = comps.find((c) => c.name === 'Core - Teamwork');
      expect(teamwork).toBeDefined();
      expect(teamwork?.possessed).toBe(0);
      expect(teamwork?.possessedAvailable).toBe(false);
      expect(teamwork?.required).toBe(4);
      expect(teamwork?.requiredAvailable).toBe(true);
      // An unassessed competency must NEVER be marked as a gap!
      expect(teamwork?.isGap).toBe(false);
    });

    it('handles unconfigured required levels when competency is assessed without a Map row', async () => {
      mockDb.roster = [
        { cycle_id: 6, employee_id: 'emp-uuid-1', department_name: 'City Health Office', owes_ipcr: true },
      ];
      mockDb.employees = [
        {
          id: 'emp-uuid-1',
          employee_id: 'EMP-001',
          full_name: 'Dela Cruz, Juan',
          current_position: 'Medical Officer III',
          department: 'City Health Office',
        },
      ];
      mockDb.evaluations = [
        {
          cycle_id: 6,
          employee_id: 'emp-uuid-1',
          final_score: 4.0,
          status: 'Approved',
        },
      ];
      // "Organizational - Communication" is NOT in positionRequirements for Medical Officer III
      mockDb.employeeCompetencies = [
        {
          cycle_id: 6,
          employee_id: 'emp-uuid-1',
          proficiency_level: 4,
          competencies: { name: 'Organizational - Communication' },
        },
      ];

      const records = await getPublishedRecords('City Health Office', 6);

      const comm = records[0].competencies?.find((c) => c.name === 'Organizational - Communication');
      expect(comm).toBeDefined();
      expect(comm?.possessed).toBe(4);
      expect(comm?.possessedAvailable).toBe(true);
      expect(comm?.required).toBeNull();
      expect(comm?.requiredAvailable).toBe(false);
      expect(comm?.isGap).toBe(false);
    });

    it('sets assessmentState correctly from competency_assessment_runs and summaries', async () => {
      mockDb.roster = [
        { cycle_id: 6, employee_id: 'emp-pending', department_name: 'City Health Office', owes_ipcr: true },
        { cycle_id: 6, employee_id: 'emp-failed', department_name: 'City Health Office', owes_ipcr: true },
        { cycle_id: 6, employee_id: 'emp-complete', department_name: 'City Health Office', owes_ipcr: true },
        { cycle_id: 6, employee_id: 'emp-unassessed', department_name: 'City Health Office', owes_ipcr: true },
      ];
      mockDb.employees = [
        { id: 'emp-pending', employee_id: 'E1', full_name: 'Alice', current_position: 'Medical Officer III', department: 'City Health Office' },
        { id: 'emp-failed', employee_id: 'E2', full_name: 'Bob', current_position: 'Medical Officer III', department: 'City Health Office' },
        { id: 'emp-complete', employee_id: 'E3', full_name: 'Charlie', current_position: 'Medical Officer III', department: 'City Health Office' },
        { id: 'emp-unassessed', employee_id: 'E4', full_name: 'Diana', current_position: 'Medical Officer III', department: 'City Health Office' },
      ];
      mockDb.assessmentRuns = [
        { employee_id: 'emp-pending', cycle_id: 6, stage: 'assessing', status: 'pending' },
        { employee_id: 'emp-failed', cycle_id: 6, stage: 'assessing', status: 'failed' },
      ];
      mockDb.summaries = [
        { employee_id: 'emp-complete', cycle_id: 6, recommendations: 'Leadership workshop recommended' },
      ];

      const records = await getPublishedRecords('City Health Office', 6);

      const alice = records.find((r) => r.id === 'E1');
      const bob = records.find((r) => r.id === 'E2');
      const charlie = records.find((r) => r.id === 'E3');
      const diana = records.find((r) => r.id === 'E4');

      expect(alice?.assessmentState).toBe('pending');
      expect(bob?.assessmentState).toBe('failed');
      expect(charlie?.assessmentState).toBe('complete');
      expect(charlie?.recommendations).toBe('Leadership workshop recommended');
      expect(diana?.assessmentState).toBe('unassessed');
    });

    it('returns empty array when roster has no eligible employees', async () => {
      mockDb.roster = [];
      mockDb.targetSettings = [];

      const records = await getPublishedRecords('Empty Office', 6);
      expect(records).toEqual([]);
    });

    it('matches positions with parenthetical functional titles against base requirements', async () => {
      mockDb.standards = [
        { id: 1, competency_name: 'Knowledge of Local Governance', training_stream: 'LEADERSHIP' },
        { id: 5, competency_name: 'Fiscal Management/Budgeting for LGU', training_stream: 'TECHNICAL' },
      ];
      mockDb.positionRequirements = [
        { position_title: 'Accountant II', competency_id: 1, proficiency_level: 'Basic' },
        { position_title: 'Accountant II', competency_id: 5, proficiency_level: 'Intermediate' },
      ];
      mockDb.roster = [
        { cycle_id: 6, employee_id: 'emp-alyssa', department_name: 'Office of The City Accountant', owes_ipcr: true },
      ];
      mockDb.employees = [
        {
          id: 'emp-alyssa',
          employee_id: 'EMP-2026-114',
          full_name: 'Alyssa Marie Fernandez',
          current_position: 'Accountant II (Pre-Audit of Transactions)',
          department: 'Office of The City Accountant',
        },
      ];
      mockDb.evaluations = [
        { cycle_id: 6, employee_id: 'emp-alyssa', final_score: 4.33, status: 'Approved' },
      ];
      mockDb.employeeCompetencies = [];

      const records = await getPublishedRecords('Office of The City Accountant', 6);

      expect(records).toHaveLength(1);
      expect(records[0].numericalRating).toBe(4.33);
      expect(records[0].competencies).toHaveLength(2);

      const gov = records[0].competencies?.find((c) => c.name === 'Knowledge of Local Governance');
      expect(gov).toBeDefined();
      expect(gov?.required).toBe(3);
      expect(gov?.stream).toBe('LEADERSHIP');
      expect(gov?.possessedAvailable).toBe(false);

      const fiscal = records[0].competencies?.find((c) => c.name === 'Fiscal Management/Budgeting for LGU');
      expect(fiscal).toBeDefined();
      expect(fiscal?.required).toBe(4);
      expect(fiscal?.stream).toBe('TECHNICAL');
      expect(fiscal?.possessedAvailable).toBe(false);
    });

    it('populates framework competencies for roles not yet in the Competency Map', async () => {
      mockDb.standards = [
        { id: 1, competency_name: 'Knowledge of Local Governance', training_stream: 'LEADERSHIP' },
        { id: 3, competency_name: 'Community Engagement Skills', training_stream: 'EMPLOYEE DEVELOPMENT' },
      ];
      mockDb.positionRequirements = []; // No requirements for this role
      mockDb.roster = [
        { cycle_id: 6, employee_id: 'emp-sw', department_name: 'Office of The City Social Welfare and Development Officer', owes_ipcr: true },
      ];
      mockDb.employees = [
        {
          id: 'emp-sw',
          employee_id: 'EMP-SW-01',
          full_name: 'Maria Santos',
          current_position: 'Social Welfare Officer II',
          department: 'Office of The City Social Welfare and Development Officer',
        },
      ];
      mockDb.evaluations = [
        { cycle_id: 6, employee_id: 'emp-sw', final_score: 4.12, status: 'Approved' },
      ];
      mockDb.employeeCompetencies = [];

      const records = await getPublishedRecords('Office of The City Social Welfare and Development Officer', 6);

      expect(records).toHaveLength(1);
      expect(records[0].competencies).toHaveLength(2);
      expect(records[0].competencies?.[0].required).toBeNull();
      expect(records[0].competencies?.[0].requiredAvailable).toBe(false);
      expect(records[0].competencies?.[0].possessedAvailable).toBe(false);
    });
  });
});
