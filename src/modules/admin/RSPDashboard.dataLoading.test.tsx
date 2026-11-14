import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Which data the RSP dashboard shell is allowed to read on each route.
 *
 * Dashboard, Accounts and Reports render parent-owned recruitment data.
 * Succession's two views own their data, so they must not trigger the parent
 * bundle, the employee/newly-hired loaders, or any realtime subscription.
 */

const {
  fromCalls,
  queryState,
  loaderMocks,
  realtimeOptions,
  departmentEnabled,
  plantillaEnabled,
  overviewProps,
} = vi.hoisted(() => {
  const fromCalls: string[] = [];
  const queryState = {
    applicantsRows: [] as unknown[],
    evaluationsRows: [] as unknown[],
    applicantsGate: null as Promise<void> | null,
  };

  const resolveQuery = (table: string) => {
    if (table === 'applicants') {
      return (queryState.applicantsGate ?? Promise.resolve()).then(() => ({
        data: queryState.applicantsRows,
        error: null,
      }));
    }
    if (table === 'evaluations') {
      return Promise.resolve({ data: queryState.evaluationsRows, error: null });
    }
    return Promise.resolve({ data: [], error: null });
  };

  const from = vi.fn((table: string) => {
    fromCalls.push(table);
    const chain: any = {
      select: () => chain,
      order: () => chain,
      eq: () => chain,
      limit: () => chain,
      single: () => resolveQuery(table),
      maybeSingle: () => resolveQuery(table),
      then: (onFulfilled: any, onRejected: any) =>
        resolveQuery(table).then(onFulfilled, onRejected),
    };
    return chain;
  });

  const loaderMocks = {
    from,
    ensureRecruitmentSeedData: vi.fn(),
    getAuthoritativeJobPostings: vi.fn(() => []),
    getDeletedJobReports: vi.fn(() => []),
    getEmployeeRecordsFromSupabase: vi.fn(async () => []),
    getJobPostingsFromSupabase: vi.fn(async () => []),
    loadJobPostings: vi.fn(async () => []),
    getNewlyHiredFromSupabase: vi.fn(async () => []),
    getApplicants: vi.fn(() => []),
    saveDeletedJobReports: vi.fn(),
    saveJobPostings: vi.fn(),
    saveNewlyHired: vi.fn(),
    resolveDepartmentForPosition: vi.fn(() => ''),
    fetchWrittenExamTotals: vi.fn(async () => ({ totals: {} })),
    getOfficeDirectory: vi.fn(async () => ({ ok: true, data: [] })),
  };

  return {
    fromCalls,
    queryState,
    loaderMocks,
    realtimeOptions: [] as Array<{ channel: string; enabled?: boolean }>,
    departmentEnabled: [] as boolean[],
    plantillaEnabled: [] as boolean[],
    overviewProps: { evaluatedApplicantIds: new Set<string>() },
  };
});

vi.mock('../../lib/supabase', () => ({
  supabase: { from: loaderMocks.from },
  isMockModeEnabled: false,
}));

vi.mock('../../lib/recruitmentData', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, ...loaderMocks };
});

vi.mock('../../lib/api/examTotalPoints', () => ({
  fetchWrittenExamTotals: loaderMocks.fetchWrittenExamTotals,
}));

vi.mock('../../lib/api/officeDirectory', () => ({
  getOfficeDirectory: loaderMocks.getOfficeDirectory,
}));

vi.mock('../../hooks/useRealtimeRefresh', () => ({
  useRealtimeRefresh: (options: { channel: string; enabled?: boolean }) => {
    realtimeOptions.push(options);
  },
}));

vi.mock('../../hooks/useDepartmentOptions', () => ({
  useDepartmentNames: (enabled = true) => {
    departmentEnabled.push(enabled);
    return [];
  },
  useDepartmentOptions: () => [],
}));

vi.mock('../../hooks/usePlantillaNames', () => ({
  usePlantillaNames: (enabled = true) => {
    plantillaEnabled.push(enabled);
    return { nameFor: () => '', summaryForPosting: () => '' };
  },
}));

vi.mock('../../components/AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('../../components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../../components/SuccessionPlanningPage', () => ({
  SuccessionPlanningPage: () => <p>plan view</p>,
}));
vi.mock('../../components/EligibilityPointsPanel', () => ({
  EligibilityPointsPanel: () => <p>points view</p>,
}));
vi.mock('./RspDashboardOverview', () => ({
  RspDashboardOverview: ({ evaluatedApplicantIds }: { evaluatedApplicantIds: Set<string> }) => {
    overviewProps.evaluatedApplicantIds = evaluatedApplicantIds;
    return null;
  },
}));
vi.mock('../../components/QualifiedApplicantsSection', () => ({
  QualifiedApplicantsSection: () => null,
}));
vi.mock('./rsp-archives', () => ({ RspArchives: () => null }));

import { invalidateCacheKey } from '../../lib/singleFlight';
import { RSPDashboard } from './RSPDashboard';

const renderAt = async (url: string) => {
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="*" element={<RSPDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
  // Let every mount effect settle (all mocked loaders resolve immediately).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
};

const expectNoParentLoads = () => {
  expect(fromCalls).toEqual([]);
  expect(loaderMocks.getJobPostingsFromSupabase).not.toHaveBeenCalled();
  expect(loaderMocks.loadJobPostings).not.toHaveBeenCalled();
  expect(loaderMocks.getEmployeeRecordsFromSupabase).not.toHaveBeenCalled();
  expect(loaderMocks.getNewlyHiredFromSupabase).not.toHaveBeenCalled();
  expect(loaderMocks.getApplicants).not.toHaveBeenCalled();
  expect(loaderMocks.fetchWrittenExamTotals).not.toHaveBeenCalled();
  expect(loaderMocks.getOfficeDirectory).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  fromCalls.length = 0;
  realtimeOptions.length = 0;
  departmentEnabled.length = 0;
  plantillaEnabled.length = 0;
  queryState.applicantsRows = [];
  queryState.evaluationsRows = [];
  queryState.applicantsGate = null;
  overviewProps.evaluatedApplicantIds = new Set();
  delete (window as any).__evaluationsByApplicantId;
  invalidateCacheKey('rsp-dashboard:recruitment:primary');
  invalidateCacheKey('rsp-dashboard:recruitment:secondary');
});

describe('RSPDashboard route-specific loading', () => {
  it('reads no parent data on the Succession Plan view', async () => {
    await renderAt('/admin/rsp/succession');

    expect(screen.getByText('plan view')).toBeTruthy();
    expectNoParentLoads();
    expect(realtimeOptions.length).toBeGreaterThan(0);
    expect(realtimeOptions.every((option) => option.enabled === false)).toBe(true);
    expect(departmentEnabled[departmentEnabled.length - 1]).toBe(false);
    expect(plantillaEnabled[plantillaEnabled.length - 1]).toBe(false);
  });

  it('reads no parent data on the Eligibility Points view', async () => {
    await renderAt('/admin/rsp/succession?view=eligibility-points');

    expect(screen.getByText('points view')).toBeTruthy();
    expectNoParentLoads();
    expect(realtimeOptions.every((option) => option.enabled === false)).toBe(true);
    expect(departmentEnabled[departmentEnabled.length - 1]).toBe(false);
  });

  it('loads the recruitment snapshot for the dashboard without discarded reads', async () => {
    await renderAt('/admin?module=rsp');

    expect(fromCalls).toContain('applicants');
    expect(fromCalls).toContain('raters');
    expect(fromCalls).toContain('evaluations');
    // The two bundle reads whose results were thrown away must be gone.
    expect(fromCalls).not.toContain('job_postings');
    expect(fromCalls).not.toContain('jobs');
    expect(loaderMocks.getJobPostingsFromSupabase).toHaveBeenCalled();

    // Dashboard-local reads only.
    expect(loaderMocks.getEmployeeRecordsFromSupabase).not.toHaveBeenCalled();
    expect(loaderMocks.getNewlyHiredFromSupabase).not.toHaveBeenCalled();
    expect(loaderMocks.fetchWrittenExamTotals).not.toHaveBeenCalled();
    expect(loaderMocks.getOfficeDirectory).not.toHaveBeenCalled();
    expect(realtimeOptions.every((option) => option.enabled === true)).toBe(true);
    expect(departmentEnabled[departmentEnabled.length - 1]).toBe(false);
  });

  it('keeps an evaluation on its own application when two share an email', async () => {
    const EVALUATED_ID = '09e72c95-0e64-4199-8324-49e8dde07bc7';
    const SIBLING_ID = '3f0a7a56-2a3c-4f7e-9d7b-0b1f3c9a1111';
    queryState.applicantsRows = [
      { id: EVALUATED_ID, email: 'shared@example.com', status: 'Hired' },
      { id: SIBLING_ID, email: 'shared@example.com', status: 'Hired' },
    ];
    queryState.evaluationsRows = [{ applicant_id: EVALUATED_ID, personality_score: 4, overall_impression_score: 4 }];

    await renderAt('/admin?module=rsp');

    await waitFor(() => expect(overviewProps.evaluatedApplicantIds.has(EVALUATED_ID)).toBe(true));
    expect(overviewProps.evaluatedApplicantIds.has(SIBLING_ID)).toBe(false);
    const evaluations = (window as any).__evaluationsByApplicantId as Map<string, unknown>;
    expect(evaluations.has(EVALUATED_ID)).toBe(true);
    expect(evaluations.has(SIBLING_ID)).toBe(false);
  });

  it('loads rater data on Rater Management', async () => {
    await renderAt('/admin/rsp/raters');

    expect(fromCalls).toContain('raters');
    expect(fromCalls).toContain('applicants');
    expect(loaderMocks.getJobPostingsFromSupabase).toHaveBeenCalled();
    expect(loaderMocks.getEmployeeRecordsFromSupabase).not.toHaveBeenCalled();
    expect(loaderMocks.getNewlyHiredFromSupabase).not.toHaveBeenCalled();
    expect(loaderMocks.fetchWrittenExamTotals).not.toHaveBeenCalled();
    expect(loaderMocks.getOfficeDirectory).not.toHaveBeenCalled();
    expect(realtimeOptions.every((option) => option.enabled === true)).toBe(true);
  });

  it('loads account data only on Accounts', async () => {
    await renderAt('/admin/rsp/accounts');

    expect(loaderMocks.getEmployeeRecordsFromSupabase).toHaveBeenCalled();
    expect(fromCalls).toContain('employees');
    expect(loaderMocks.getNewlyHiredFromSupabase).toHaveBeenCalled();
    expect(loaderMocks.getOfficeDirectory).toHaveBeenCalled();
    expect(loaderMocks.fetchWrittenExamTotals).not.toHaveBeenCalled();
    expect(departmentEnabled[departmentEnabled.length - 1]).toBe(true);
    expect(realtimeOptions.every((option) => option.enabled === true)).toBe(true);
  });

  it('loads exam totals only on Reports', async () => {
    await renderAt('/admin/rsp/reports');

    expect(loaderMocks.fetchWrittenExamTotals).toHaveBeenCalled();
    expect(loaderMocks.getNewlyHiredFromSupabase).toHaveBeenCalled();
    expect(loaderMocks.getJobPostingsFromSupabase).toHaveBeenCalled();
    expect(loaderMocks.getEmployeeRecordsFromSupabase).not.toHaveBeenCalled();
    expect(fromCalls).not.toContain('employees');
    expect(departmentEnabled[departmentEnabled.length - 1]).toBe(false);
  });

  it('does not publish a late response after the route unmounts', async () => {
    let releaseApplicants: () => void = () => undefined;
    queryState.applicantsGate = new Promise<void>((resolve) => {
      releaseApplicants = resolve;
    });
    queryState.applicantsRows = [{ id: 'a1', email: 'a1@example.com', status: 'Pending' }];
    queryState.evaluationsRows = [{ applicant_id: 'a1', overall_score: 90 }];

    const view = await renderAt('/admin/rsp/reports');
    expect(fromCalls).toContain('applicants');

    view.unmount();

    await act(async () => {
      releaseApplicants();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The unmounted instance must not publish its evaluation lookup, which a
    // newly mounted Reports page would read.
    expect((window as any).__evaluationsByApplicantId).toBeUndefined();
  });
});
