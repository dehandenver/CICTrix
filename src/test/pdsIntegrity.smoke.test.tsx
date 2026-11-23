import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmployeeWorkExperience } from '../types/employee.types';

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({
  employeeId: 'emp-pds-1',
  criticalPositionId: 'crit-pos-1',
  departmentId: 'dept-eng-1',
  workRevision: 'rev-work-1',
  workCounter: 1,
  selectQueries: [] as Array<{ table: string; cols: string }>,
  workReadError: null as { code?: string; message: string } | null,
  workRows: [] as Row[],
  trainingRows: [] as Row[],
  educationRows: [] as Row[],
  eligibilityRows: [] as Row[],
  reviewRows: [] as Row[],
  employees: [] as Row[],
  departments: [] as Row[],
  criticalPositions: [] as Row[],
  successionCandidates: [] as Row[],
}));

vi.mock('../lib/supabase', () => {
  const tableRows = (table: string): Row[] => {
    switch (table) {
      case 'employee_work_experience':
        return store.workRows;
      case 'employee_training':
        return store.trainingRows;
      case 'employee_education':
        return store.educationRows;
      case 'employee_eligibility':
        return store.eligibilityRows;
      case 'succession_evidence_reviews':
        return store.reviewRows;
      case 'employees':
        return store.employees;
      case 'departments':
        return store.departments;
      case 'critical_positions':
        return store.criticalPositions;
      case 'succession_candidates':
        return store.successionCandidates;
      default:
        return [];
    }
  };

  const from = (table: string) => {
    const filters: Array<{ op: 'eq' | 'in'; col: string; val: unknown }> = [];
    let isSingle = false;
    let sliceRange: [number, number] | null = null;

    const execute = async () => {
      if (table === 'employee_work_experience' && store.workReadError) {
        return { data: null, error: store.workReadError };
      }

      const matched = tableRows(table).filter((row) =>
        filters.every((f) => {
          if (f.op === 'eq') return String(row[f.col] ?? '') === String(f.val ?? '');
          if (f.op === 'in') return (f.val as unknown[]).map(String).includes(String(row[f.col] ?? ''));
          return true;
        }),
      );

      if (isSingle) {
        if (matched.length !== 1) {
          return { data: null, error: { code: 'PGRST116', message: 'Not found' } };
        }
        return { data: matched[0], error: null };
      }

      const rows = sliceRange ? matched.slice(sliceRange[0], sliceRange[1] + 1) : matched;
      return { data: rows, error: null };
    };

    const chain: any = {
      select: (cols: string) => {
        store.selectQueries.push({ table, cols });
        return chain;
      },
      eq: (col: string, val: unknown) => {
        filters.push({ op: 'eq', col, val });
        return chain;
      },
      in: (col: string, val: unknown[]) => {
        filters.push({ op: 'in', col, val });
        return chain;
      },
      order: () => chain,
      range: (fromIdx: number, toIdx: number) => {
        sliceRange = [fromIdx, toIdx];
        return chain;
      },
      limit: () => chain,
      single: () => {
        isSingle = true;
        return chain;
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        execute().then(onFulfilled, onRejected),
    };
    return chain;
  };

  const rpc = async (fn: string, params: Record<string, unknown>) => {
    if (fn === 'read_pds_section' && params.p_section === 'workExperience') {
      if (store.workReadError) {
        return { data: null, error: store.workReadError };
      }
      const rows = store.workRows
        .filter((r) => r.employee_id === params.p_employee_id)
        .map((r) => ({
          id: r.id,
          from_date: r.from_date,
          to_date: r.to_date,
          is_present: r.is_present,
          position_title: r.position_title,
          company_name: r.company_name,
          appointment_status: r.appointment_status,
          govt_service: r.govt_service,
        }));
      return {
        data: { rows, revision: store.workRevision, scalars: {} },
        error: null,
      };
    }

    if (fn === 'save_pds_section' && params.p_section === 'workExperience') {
      if (params.p_expected_revision !== store.workRevision) {
        return {
          data: null,
          error: { code: '40001', hint: 'pds_revision_conflict', message: 'revision conflict' },
        };
      }

      const incoming = (params.p_rows as Row[]) ?? [];
      const existingById = new Map(store.workRows.map((r) => [String(r.id), r]));
      const reconciled: Row[] = incoming.map((item) => {
        const existingId = item.id ? String(item.id) : '';
        const prior = existingId ? existingById.get(existingId) : undefined;
        const id = prior ? String(prior.id) : `work-${++store.workCounter}`;
        return {
          id,
          employee_id: params.p_employee_id,
          from_date: item.from_date,
          to_date: item.to_date ?? null,
          is_present: Boolean(item.is_present),
          position_title: item.position_title,
          company_name: item.company_name,
          appointment_status: item.appointment_status ?? null,
          govt_service: Boolean(item.govt_service),
          // Preserve pre-existing legacy columns not included in PDS editor payload
          monthly_salary: prior?.monthly_salary ?? null,
          duties_responsibilities: prior?.duties_responsibilities ?? null,
        };
      });

      store.workRows = [
        ...store.workRows.filter((r) => r.employee_id !== params.p_employee_id),
        ...reconciled,
      ];
      store.workRevision = `rev-work-${++store.workCounter}`;

      return {
        data: {
          rows: reconciled.map((r) => ({
            id: r.id,
            from_date: r.from_date,
            to_date: r.to_date,
            is_present: r.is_present,
            position_title: r.position_title,
            company_name: r.company_name,
            appointment_status: r.appointment_status,
            govt_service: r.govt_service,
          })),
          revision: store.workRevision,
          scalars: {},
        },
        error: null,
      };
    }

    return { data: null, error: { code: 'PGRST202', message: `Unexpected rpc ${fn}` } };
  };

  return { supabase: { from, rpc }, isMockModeEnabled: false };
});

import { listWorkExperience, saveWorkExperience } from '../lib/api/personalDataSheet';
import { fetchSuccessionPoolV2, parsePositionRequirementsV2 } from '../lib/api/successionPipelineV2';
import { fetchSuccessionReviews, isReviewStale } from '../lib/api/successionReviews';
import { CandidateEvidenceReviewModal } from '../components/CandidateEvidenceReviewModal';

describe('Release Unit 1 PDS -> Succession cross-boundary smoke', () => {
  beforeEach(() => {
    store.workCounter = 1;
    store.workRevision = 'rev-work-1';
    store.selectQueries = [];
    store.workReadError = null;
    store.departments = [{ id: store.departmentId, name: 'Engineering Office' }];
    store.criticalPositions = [
      {
        id: store.criticalPositionId,
        title: 'City Engineer',
        department_id: store.departmentId,
        required_education: 'Bachelor of Science in Civil Engineering',
        required_eligibility: 'Civil Service Professional',
        min_years_experience: 2,
        required_training_hours: 16,
        incumbent_employee_id: null,
      },
    ];
    store.employees = [
      {
        id: store.employeeId,
        first_name: 'Maria',
        last_name: 'Santos',
        position: 'Engineer II',
        department: 'Engineering Office',
        status: 'Active',
        employment_status: 'Permanent',
        date_hired: '2020-01-10',
        highest_educational_attainment: 'Bachelor',
        eligibility: 'Civil Service Professional',
      },
    ];
    store.successionCandidates = [
      { id: 'cand-1', critical_position_id: store.criticalPositionId, employee_id: store.employeeId, note: '' },
    ];
    store.workRows = [
      {
        id: 'work-existing-1',
        employee_id: store.employeeId,
        from_date: '2020-01-10',
        to_date: '2025-12-31',
        is_present: false,
        position_title: 'Engineer II',
        company_name: 'City Engineering Office',
        appointment_status: 'Permanent',
        govt_service: true,
        monthly_salary: 45000,
        duties_responsibilities: 'Oversee infrastructure projects',
      },
    ];
    store.trainingRows = [
      {
        id: 'train-1',
        employee_id: store.employeeId,
        training_title: 'Structural Safety Seminar',
        number_of_hours: 24,
        from_date: '2024-06-01',
        to_date: '2024-06-03',
        conducted_by: 'CSC',
      },
    ];
    store.educationRows = [
      {
        id: 'edu-1',
        employee_id: store.employeeId,
        level: 'College',
        course: 'BS Civil Engineering',
        year_graduated: 2016,
      },
    ];
    store.eligibilityRows = [
      {
        id: 'elig-1',
        employee_id: store.employeeId,
        eligibility_type: 'Civil Service Professional',
        validity_date: null,
      },
    ];
    const reqSnap = parsePositionRequirementsV2(store.criticalPositions[0]) as unknown as Record<string, unknown>;
    store.reviewRows = [
      {
        id: 'rev-row-1',
        critical_position_id: store.criticalPositionId,
        employee_id: store.employeeId,
        criterion: 'work',
        source_record_id: 'work-existing-1',
        is_relevant: true,
        is_city_hall: true,
        matches_requirement: null,
        evidence_snapshot: {
          from_date: '2020-01-10',
          to_date: '2025-12-31',
          is_present: false,
          position_title: 'Engineer II',
        },
        requirements_snapshot: reqSnap,
        reviewed_by: null,
        reviewed_at: '2026-10-28T00:00:00.000Z',
        created_at: '2026-10-28T00:00:00.000Z',
        updated_at: '2026-10-28T00:00:00.000Z',
      },
    ];
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('preserves row IDs and company_name across PDS save -> reload -> succession pool -> evidence review modal, and rejects unavailable reads', async () => {
    const initialLoad = await listWorkExperience(store.employeeId);
    expect(initialLoad.ok).toBe(true);
    if (initialLoad.ok === false) return;
    expect(initialLoad.data.revision).toBe('rev-work-1');

    // Update company_name on existing row while adding a new work entry
    const editedRows: EmployeeWorkExperience[] = [
      {
        ...initialLoad.data.rows[0],
        departmentAgencyOfficeCompany: 'Iloilo City Engineering Office',
      },
      {
        dateFrom: '2018-01-01',
        dateTo: '2019-12-31',
        positionTitle: 'Junior Engineer',
        departmentAgencyOfficeCompany: 'DPWH Region VI',
        statusOfAppointment: 'Contractual',
        govtService: true,
      },
    ];

    const saveRes = await saveWorkExperience(store.employeeId, editedRows, initialLoad.data.revision);
    expect(saveRes.ok).toBe(true);
    if (saveRes.ok === false) return;

    // Preserves existing row ID, legacy columns in store, and company_name
    expect(saveRes.data.rows[0].id).toBe('work-existing-1');
    expect(saveRes.data.rows[0].departmentAgencyOfficeCompany).toBe('Iloilo City Engineering Office');
    expect(store.workRows[0].monthly_salary).toBe(45000);
    expect(store.workRows[0].duties_responsibilities).toBe('Oversee infrastructure projects');
    expect(saveRes.data.revision).not.toBe('rev-work-1');

    // Reload returns canonical snapshot + revision matching save
    const reloadRes = await listWorkExperience(store.employeeId);
    expect(reloadRes).toEqual(saveRes);

    // Fetch succession reviews + pipeline: queries company_name (never department_agency_office_company) and keeps review non-stale
    const reviews = await fetchSuccessionReviews(store.criticalPositionId, store.employeeId);
    expect(reviews).toHaveLength(1);
    const reqSnap = parsePositionRequirementsV2(store.criticalPositions[0]) as unknown as Record<string, unknown>;
    expect(
      isReviewStale(
        reviews[0],
        {
          from_date: store.workRows[0].from_date,
          to_date: store.workRows[0].to_date,
          is_present: store.workRows[0].is_present,
          position_title: store.workRows[0].position_title,
        },
        reqSnap,
      ),
    ).toBe(false);

    const pool = await fetchSuccessionPoolV2(store.criticalPositionId, '2026-11-20');
    const workQueries = store.selectQueries.filter((q) => q.table === 'employee_work_experience');
    expect(workQueries.length).toBeGreaterThan(0);
    expect(workQueries.every((q) => q.cols.includes('company_name') && !q.cols.includes('department_agency_office_company'))).toBe(true);
    expect(pool.ranked.length + pool.needsReview.length + pool.configurationNeeded.length).toBeGreaterThan(0);

    // Render CandidateEvidenceReviewModal -> shows updated company_name & preserves review link
    render(
      <CandidateEvidenceReviewModal
        isOpen
        onClose={() => {}}
        candidate={{ employeeId: store.employeeId, name: 'Maria Santos' }}
        criticalPosition={{
          id: store.criticalPositionId,
          title: 'City Engineer',
          requirements: parsePositionRequirementsV2(store.criticalPositions[0]),
        }}
        onReviewSaved={() => {}}
      />,
    );

    expect(await screen.findByText(/Iloilo City Engineering Office/)).toBeInTheDocument();
    expect(screen.getByText(/DPWH Region VI/)).toBeInTheDocument();

    const modalWorkQueries = store.selectQueries.filter((q) => q.table === 'employee_work_experience');
    expect(modalWorkQueries.every((q) => q.cols.includes('company_name') && !q.cols.includes('department_agency_office_company'))).toBe(true);

    // Failed work-experience reads fail loudly instead of returning fallback scores or empty modal state
    cleanup();
    store.workReadError = { code: 'PGRST301', message: 'work table unreachable' };

    const pdsErr = await listWorkExperience(store.employeeId);
    expect(pdsErr).toMatchObject({ ok: false, kind: 'unavailable' });

    await expect(fetchSuccessionPoolV2(store.criticalPositionId, '2026-11-20')).rejects.toThrow(
      /work table unreachable/i,
    );

    render(
      <CandidateEvidenceReviewModal
        isOpen
        onClose={() => {}}
        candidate={{ employeeId: store.employeeId, name: 'Maria Santos' }}
        criticalPosition={{
          id: store.criticalPositionId,
          title: 'City Engineer',
          requirements: parsePositionRequirementsV2(store.criticalPositions[0]),
        }}
        onReviewSaved={() => {}}
      />,
    );

    expect(await screen.findByText(/Failed to load work experience: work table unreachable/i)).toBeInTheDocument();
  });
});
