import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOfficeDirectory: vi.fn(),
  getEmployeeRecordsFromSupabase: vi.fn(),
  getNewlyHiredFromSupabase: vi.fn(),
  listEmployeePortalAccountIdentities: vi.fn(),
  getEmployeePortalAccountByEmployeeNumber: vi.fn(),
  resetEmployeePortalPassword: vi.fn(),
  getLastEmployeePasswordReset: vi.fn(),
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
  return {
    supabase: supabaseStub((table) =>
      table === 'employees_with_department'
        ? [
            {
              id: 'e1',
              employee_id: 'EMP-2026-0042',
              full_name: 'Maria Santos',
              first_name: 'Maria',
              last_name: 'Santos',
              current_position: 'Budget Analyst',
              department: 'Budget Office',
              status: 'Active',
              email: 'maria@example.gov.ph',
            },
            {
              id: 'e2',
              employee_id: 'EMP-2026-0099',
              full_name: 'Juan Dela Cruz',
              first_name: 'Juan',
              last_name: 'Dela Cruz',
              current_position: 'Accountant',
              department: 'Budget Office',
              status: 'Active',
              email: 'juan@example.gov.ph',
            },
          ]
        : [],
    ),
    isMockModeEnabled: false,
  };
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
    getEmployeePortalAccountByEmployeeNumber: (...args: unknown[]) =>
      mocks.getEmployeePortalAccountByEmployeeNumber(...args),
    resetEmployeePortalPassword: (...args: unknown[]) =>
      mocks.resetEmployeePortalPassword(...args),
    getLastEmployeePasswordReset: (...args: unknown[]) =>
      mocks.getLastEmployeePasswordReset(...args),
  };
});

import { RSPDashboard } from './RSPDashboard';

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const mariaIdentity = (overrides: Record<string, unknown> = {}) => ({
  id: 'acct-custom-9',
  username: 'maria.custom',
  mustChangePassword: false,
  updatedAt: '2026-11-20T08:00:00.123456+00:00',
  employee: {
    employeeId: 'EMP-2026-0042',
    fullName: 'Maria Santos',
    email: 'maria@example.gov.ph',
    currentDepartment: 'Budget Office',
    currentPosition: 'Budget Analyst',
  },
  ...overrides,
});

const openEmployeeDetailsAndResetModal = async (employeeName = 'Maria Santos') => {
  render(
    <MemoryRouter initialEntries={['/admin/rsp/accounts']}>
      <Routes>
        <Route path="/admin/rsp/accounts" element={<RSPDashboard />} />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByText('Budget Office'));
  await screen.findByRole('heading', { name: 'Budget Office' });
  fireEvent.click(await screen.findByText(employeeName));
  await screen.findByRole('heading', { name: new RegExp(employeeName) });
  fireEvent.click(screen.getByRole('button', { name: /Reset Password/i }));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.getOfficeDirectory.mockResolvedValue({
    ok: true,
    data: [{ officeId: 'o1', officeName: 'Budget Office', code: 'BUD', isActive: true, deptHead: null, supervisors: [], employeeCount: 2, divisions: [] }],
  });
  mocks.getEmployeeRecordsFromSupabase.mockResolvedValue([]);
  mocks.getNewlyHiredFromSupabase.mockResolvedValue([]);
  mocks.listEmployeePortalAccountIdentities.mockResolvedValue({ ok: true, accounts: [mariaIdentity()] });
  mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValue({ ok: true, account: mariaIdentity() });
  mocks.getLastEmployeePasswordReset.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
});

describe('RSPDashboard explicit password reset (Credential Task 4)', () => {
  it('resolves remote target from empty storage, preserves existing username, disables duplicate clicks while pending, and reveals temporary password only on confirmed success', async () => {
    const pendingReset = deferred<any>();
    mocks.resetEmployeePortalPassword.mockReturnValueOnce(pendingReset.promise);

    await openEmployeeDetailsAndResetModal();

    const dialog = await screen.findByRole('dialog');
    const confirmBtn = await within(dialog).findByRole('button', { name: /Yes, reset password/i });
    await waitFor(() => expect(confirmBtn).toBeEnabled());

    expect(mocks.getEmployeePortalAccountByEmployeeNumber).toHaveBeenCalledWith('EMP-2026-0042');

    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    expect(mocks.resetEmployeePortalPassword).toHaveBeenCalledTimes(1);
    expect(mocks.resetEmployeePortalPassword).toHaveBeenCalledWith({
      accountId: 'acct-custom-9',
      employeeNumber: 'EMP-2026-0042',
      expectedRevision: '2026-11-20T08:00:00.123456+00:00',
    });
    expect(within(dialog).getByRole('button', { name: /Yes, reset password/i })).toBeDisabled();
    expect(within(dialog).queryByText(/New Password Generated/i)).not.toBeInTheDocument();

    pendingReset.resolve({
      ok: true,
      account: mariaIdentity({ mustChangePassword: true, updatedAt: '2026-11-20T09:00:00.000000+00:00' }),
      credentials: { username: 'maria.custom', password: 'ResetTemp#Password9' },
    });

    expect(await within(dialog).findByText('New Password Generated')).toBeInTheDocument();
    expect(within(dialog).getByText('maria.custom')).toBeInTheDocument();
    expect(within(dialog).getByText('ResetTemp#Password9')).toBeInTheDocument();
  });

  it('refuses reset honestly when remote account is missing or unavailable without creating an account or touching localStorage', async () => {
    localStorage.setItem(
      'cictrix_employee_portal_accounts',
      JSON.stringify([{ id: 'stale-local', username: 'stale.local', password: 'Old#1', employee: { employeeId: 'EMP-2026-0042' } }]),
    );
    mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValueOnce({ ok: false, kind: 'not_found' });

    await openEmployeeDetailsAndResetModal();

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByText(/no employee-portal account|not found|contact/i)).toBeInTheDocument();
    });
    expect(within(dialog).queryByRole('button', { name: /Yes, reset password/i })).not.toBeInTheDocument();
    expect(mocks.resetEmployeePortalPassword).not.toHaveBeenCalled();
  });

  it('shows failure copy with zero password on conflict or unconfirmed reset and discards stale completion after modal close', async () => {
    mocks.resetEmployeePortalPassword.mockResolvedValueOnce({
      ok: false,
      kind: 'conflict',
      error: 'This portal account was updated elsewhere since it was loaded. Refresh and try again.',
    });

    await openEmployeeDetailsAndResetModal();
    const dialog = await screen.findByRole('dialog');
    const confirmBtn = await within(dialog).findByRole('button', { name: /Yes, reset password/i });
    await waitFor(() => expect(confirmBtn).toBeEnabled());
    fireEvent.click(confirmBtn);

    expect(await within(dialog).findByText(/updated elsewhere/i)).toBeInTheDocument();
    expect(within(dialog).queryByText('New Password Generated')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('Close'));

    // Re-open with pending reset, close while in flight, resolve -> must not re-open or display secret
    const pendingLate = deferred<any>();
    mocks.resetEmployeePortalPassword.mockReturnValueOnce(pendingLate.promise);
    fireEvent.click(screen.getByRole('button', { name: /Reset Password/i }));
    const dialog2 = await screen.findByRole('dialog');
    const confirmBtn2 = await within(dialog2).findByRole('button', { name: /Yes, reset password/i });
    await waitFor(() => expect(confirmBtn2).toBeEnabled());
    fireEvent.click(confirmBtn2);

    // Switch back to office list (closing employee detail & modal) while pending
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    pendingLate.resolve({
      ok: true,
      account: mariaIdentity({ mustChangePassword: true, updatedAt: '2026-11-20T10:00:00.000000+00:00' }),
      credentials: { username: 'maria.custom', password: 'LateLeakedPassword#7' },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('LateLeakedPassword#7')).not.toBeInTheDocument();
  });
});
