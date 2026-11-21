import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listEmployeePortalAccountIdentities: vi.fn(),
  getOfficeDirectory: vi.fn(),
  getEmployeeRecordsFromSupabase: vi.fn(),
  getNewlyHiredFromSupabase: vi.fn(),
}));

vi.mock('../../components/AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('../../components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./RspDashboardOverview', () => ({ RspDashboardOverview: () => null }));
vi.mock('../../components/QualifiedApplicantsSection', () => ({ QualifiedApplicantsSection: () => null }));
vi.mock('./rsp-archives', () => ({ RspArchives: () => null }));
vi.mock('../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));

const NO_DEPARTMENTS: string[] = [];
vi.mock('../../hooks/useDepartmentOptions', () => ({
  useDepartmentNames: () => NO_DEPARTMENTS,
  useDepartmentOptions: () => NO_DEPARTMENTS,
}));
vi.mock('../../hooks/usePlantillaNames', () => ({
  usePlantillaNames: () => ({ nameFor: () => '', summaryForPosting: () => '' }),
}));

vi.mock('../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../test/supabaseStub');
  return { supabase: supabaseStub(() => []), isMockModeEnabled: false };
});

vi.mock('../../lib/api/officeDirectory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api/officeDirectory')>()),
  getOfficeDirectory: (...args: unknown[]) => mocks.getOfficeDirectory(...args),
}));

vi.mock('../../lib/recruitmentData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/recruitmentData')>()),
  getEmployeeRecordsFromSupabase: (...args: unknown[]) => mocks.getEmployeeRecordsFromSupabase(...args),
  getNewlyHiredFromSupabase: (...args: unknown[]) => mocks.getNewlyHiredFromSupabase(...args),
  getAuthoritativeJobPostings: () => [],
  loadJobPostings: async () => [],
  getApplicants: () => [],
  getDeletedJobReports: () => [],
}));

vi.mock('../../lib/employeePortalData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/employeePortalData')>();
  return {
    ...actual,
    listEmployeePortalAccountIdentities: (...args: unknown[]) =>
      mocks.listEmployeePortalAccountIdentities(...args),
  };
});

import { RSPDashboard } from './RSPDashboard';

const renderAccounts = () =>
  render(
    <MemoryRouter initialEntries={['/admin/rsp/accounts']}>
      <Routes>
        <Route path="/admin/rsp/accounts" element={<RSPDashboard />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.getOfficeDirectory.mockResolvedValue({
    ok: true,
    data: [{ officeId: 'o1', officeName: 'Budget Office', code: 'BUD', isActive: true, deptHead: null, supervisors: [], employeeCount: 1, divisions: [] }],
  });
  mocks.getEmployeeRecordsFromSupabase.mockResolvedValue([]);
  mocks.getNewlyHiredFromSupabase.mockResolvedValue([]);
  mocks.listEmployeePortalAccountIdentities.mockResolvedValue({ ok: true, accounts: [] });
});

afterEach(() => {
  cleanup();
});

describe('RSPDashboard accounts remote metadata loading', () => {
  it('loads unfiltered remote account metadata via listEmployeePortalAccountIdentities with empty localStorage', async () => {
    mocks.listEmployeePortalAccountIdentities.mockResolvedValue({
      ok: true,
      accounts: [
        {
          id: 'portal-EMP-2026-0042',
          username: 'maria.santos',
          mustChangePassword: false,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
          employee: {
            employeeId: 'EMP-2026-0042',
            fullName: 'Maria Santos',
            email: 'maria.santos@example.gov.ph',
            currentDepartment: 'Budget Office',
            currentPosition: 'Budget Analyst',
          },
        },
      ],
    });

    renderAccounts();

    await waitFor(() => {
      expect(mocks.listEmployeePortalAccountIdentities).toHaveBeenCalledTimes(1);
    });
    expect(mocks.listEmployeePortalAccountIdentities).toHaveBeenCalledWith();
    expect(localStorage.getItem('cictrix_employee_portal_accounts')).toBeNull();
  });

  it('surfaces ErrorBanner with retry when listEmployeePortalAccountIdentities returns ok: false', async () => {
    mocks.listEmployeePortalAccountIdentities
      .mockResolvedValueOnce({
        ok: false,
        kind: 'lookup_unavailable',
        error: 'Portal account directory unavailable.',
      })
      .mockResolvedValueOnce({ ok: true, accounts: [] });

    renderAccounts();

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /Retry|Try again/i });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(mocks.listEmployeePortalAccountIdentities).toHaveBeenCalledTimes(2);
    });
  });
});
