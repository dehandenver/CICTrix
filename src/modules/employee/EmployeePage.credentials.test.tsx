import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee } from '../../types/employee.types';

const mocks = vi.hoisted(() => ({
  getEmployeePortalAccountByEmployeeNumber: vi.fn(),
  authenticateEmployeePortalAccount: vi.fn(),
  changeEmployeePortalUsername: vi.fn(),
  changeEmployeePortalPassword: vi.fn(),
  patchPortalEmployee: vi.fn(),
}));

vi.mock('../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../test/supabaseStub');
  return { supabase: supabaseStub() };
});
vi.mock('../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('../../components/portal-header', () => ({ PortalHeader: () => null }));
vi.mock('../../lib/api/officeRoles', () => ({ getActiveOfficeRole: async () => null }));
vi.mock('../../lib/api/employeePortal', () => ({
  fetchPortalEmployeeById: async () => ({ ok: false }),
  patchPortalEmployee: (...args: unknown[]) => mocks.patchPortalEmployee(...args),
}));
vi.mock('../../lib/api/performanceEvaluations', () => ({
  getEmployeeRawDetails: async () => ({ success: true, data: { employee_number: 'EMP-2026-001' } }),
  getActivePerformanceCycle: async () => ({ success: true, data: { id: 1 } }),
  getCompetenciesList: async () => ({ success: true, data: [] }),
  getLatestEmployeeIPCR: async () => ({ success: true, data: { rows: [], ratingPeriod: '2026' } }),
  getEmployeeEvaluations: async () => ({ success: true, data: [] }),
}));
vi.mock('../../lib/api/ipcrTargets', async (original) => ({
  ...(await original<typeof import('../../lib/api/ipcrTargets')>()),
  getActiveCycle: async () => ({ ok: true, data: { id: 1 } }),
  loadTargetSetting: async () => ({ ok: true, data: null }),
}));
vi.mock('../../lib/api/ipcrWorkspace', async (original) => ({
  ...(await original<typeof import('../../lib/api/ipcrWorkspace')>()),
  getWorkspace: async () => null,
}));
vi.mock('../../lib/api/employeePhaseGate', () => ({
  EMPTY_PHASE_GATE: {},
  fetchPhaseGate: async () => ({}),
  isPhaseOpen: () => false,
}));
vi.mock('../../lib/api/phaseSchedules', async (original) => ({
  ...(await original<typeof import('../../lib/api/phaseSchedules')>()),
  loadEffectiveSchedules: async () => ({}),
}));
vi.mock('../../lib/api/employeeNotifications', () => ({
  listEmployeeNotifications: async () => [],
  markEmployeeNotificationsRead: vi.fn(),
}));
vi.mock('../../lib/employeePortalData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/employeePortalData')>();
  return {
    ...actual,
    getEmployeePortalAccountByEmployeeNumber: (...args: unknown[]) =>
      mocks.getEmployeePortalAccountByEmployeeNumber(...args),
    authenticateEmployeePortalAccount: (...args: unknown[]) =>
      mocks.authenticateEmployeePortalAccount(...args),
    changeEmployeePortalUsername: (...args: unknown[]) =>
      mocks.changeEmployeePortalUsername(...args),
    changeEmployeePortalPassword: (...args: unknown[]) =>
      mocks.changeEmployeePortalPassword(...args),
  };
});

import { EmployeePage } from './EmployeePage';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const makeUser = (overrides: Partial<Employee> = {}): Employee =>
  ({
    supabaseId: 'emp-uuid-1',
    employeeId: 'EMP-2026-001',
    fullName: 'Maria Santos',
    email: 'maria.santos@example.gov.ph',
    mobileNumber: '09171234567',
    homeAddress: 'Iloilo City',
    emergencyContactName: 'Juan Santos',
    emergencyRelationship: 'Spouse',
    emergencyContactNumber: '09170000000',
    sssNumber: '11-111',
    philhealthNumber: '22-222',
    pagibigNumber: '33-333',
    tinNumber: '44-444',
    employmentStatus: 'Regular',
    ...overrides,
  }) as Employee;

const makeIdentity = (overrides: Record<string, unknown> = {}) => ({
  id: 'acct-maria-1',
  username: 'maria.santos',
  mustChangePassword: false,
  updatedAt: '2026-11-20T08:00:00.123456+00:00',
  employee: makeUser(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValue({
    ok: true,
    account: makeIdentity(),
  });
  mocks.authenticateEmployeePortalAccount.mockResolvedValue({
    ok: true,
    account: makeIdentity(),
  });
});

afterEach(() => {
  cleanup();
});

describe('EmployeePage Account & Security and unlinked profile protection (Credential Task 3)', () => {
  it('resolves remote account with empty localStorage and rejects unlock for a different employee account', async () => {
    render(
      <MemoryRouter initialEntries={['/employee/account']}>
        <EmployeePage currentUser={makeUser()} onLogout={() => {}} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mocks.getEmployeePortalAccountByEmployeeNumber).toHaveBeenCalledWith('EMP-2026-001');
    });

    const usernameInput = await screen.findByPlaceholderText('Enter your username');
    await waitFor(() => expect(usernameInput).toBeEnabled());

    // Authenticate as another employee's valid account
    mocks.authenticateEmployeePortalAccount.mockResolvedValueOnce({
      ok: true,
      account: makeIdentity({
        id: 'acct-other-2',
        username: 'other.user',
        employee: makeUser({ employeeId: 'EMP-2026-999' }),
      }),
    });

    fireEvent.change(usernameInput, { target: { value: 'other.user' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your current password'), {
      target: { value: 'OtherPass#1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(/don't match the account you're logged in as/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Change Username' })).not.toBeInTheDocument();
  });

  it('serializes username and password saves, awaits confirmation, advances revision, and notifies onPortalUsernameChanged', async () => {
    const onPortalUsernameChanged = vi.fn();
    render(
      <MemoryRouter initialEntries={['/employee/account']}>
        <EmployeePage
          currentUser={makeUser()}
          onLogout={() => {}}
          {...({ onPortalUsernameChanged } as any)}
        />
      </MemoryRouter>,
    );

    const usernameInput = await screen.findByPlaceholderText('Enter your username');
    await waitFor(() => expect(usernameInput).toBeEnabled());

    fireEvent.change(usernameInput, { target: { value: 'maria.santos' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your current password'), {
      target: { value: 'Current#Pass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByRole('heading', { name: 'Change Username' });

    const pendingRename = deferred<any>();
    mocks.changeEmployeePortalUsername.mockReturnValueOnce(pendingRename.promise);

    fireEvent.change(screen.getByPlaceholderText('e.g. mariasantos'), {
      target: { value: 'maria.renamed' },
    });

    const saveUsernameBtn = screen.getByRole('button', { name: /Save Username/i });
    fireEvent.click(saveUsernameBtn);
    fireEvent.click(saveUsernameBtn);

    expect(mocks.changeEmployeePortalUsername).toHaveBeenCalledTimes(1);
    expect(mocks.changeEmployeePortalUsername).toHaveBeenCalledWith(
      {
        accountId: 'acct-maria-1',
        employeeNumber: 'EMP-2026-001',
        expectedRevision: '2026-11-20T08:00:00.123456+00:00',
      },
      'maria.renamed',
    );
    expect(onPortalUsernameChanged).not.toHaveBeenCalled();

    const newRev = '2026-11-20T08:05:00.000000+00:00';
    pendingRename.resolve({
      ok: true,
      account: makeIdentity({ username: 'maria.renamed', updatedAt: newRev }),
    });

    expect(await screen.findByText(/Username updated to "maria\.renamed"/i)).toBeInTheDocument();
    expect(onPortalUsernameChanged).toHaveBeenCalledWith('EMP-2026-001', 'maria.renamed');

    // Subsequent password change uses the updated revision from the rename result
    mocks.changeEmployeePortalPassword.mockResolvedValueOnce({
      ok: true,
      account: makeIdentity({
        username: 'maria.renamed',
        updatedAt: '2026-11-20T08:10:00.000000+00:00',
      }),
    });

    fireEvent.change(screen.getByLabelText(/Current Password/i), {
      target: { value: 'Current#Pass1' },
    });
    fireEvent.change(screen.getByLabelText(/^New Password$/i), {
      target: { value: 'NextPass#99' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm New Password/i), {
      target: { value: 'NextPass#99' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Password/i }));

    await waitFor(() => {
      expect(mocks.changeEmployeePortalPassword).toHaveBeenCalledWith(
        {
          accountId: 'acct-maria-1',
          employeeNumber: 'EMP-2026-001',
          expectedRevision: newRev,
        },
        'Current#Pass1',
        'NextPass#99',
      );
    });
    expect(await screen.findByText(/Password updated/i)).toBeInTheDocument();
  });

  it('ignores delayed unlock/save responses after currentUser switches to another employee', async () => {
    const onPortalUsernameChanged = vi.fn();
    const { rerender } = render(
      <MemoryRouter initialEntries={['/employee/account']}>
        <EmployeePage
          currentUser={makeUser()}
          onPortalUsernameChanged={onPortalUsernameChanged}
          onLogout={() => {}}
        />
      </MemoryRouter>,
    );

    const usernameInput = await screen.findByPlaceholderText('Enter your username');
    await waitFor(() => expect(usernameInput).toBeEnabled());

    fireEvent.change(usernameInput, { target: { value: 'maria.santos' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your current password'), {
      target: { value: 'Current#Pass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Change Username' });

    const pendingRename = deferred<any>();
    mocks.changeEmployeePortalUsername.mockReturnValueOnce(pendingRename.promise);

    fireEvent.change(screen.getByPlaceholderText('e.g. mariasantos'), {
      target: { value: 'maria.late' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Username/i }));

    // Simultaneous password click while username save is in flight is blocked
    fireEvent.click(screen.getByRole('button', { name: /Save Password/i }));
    expect(mocks.changeEmployeePortalPassword).not.toHaveBeenCalled();

    // Switch employee identity while save is pending
    mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValueOnce({
      ok: true,
      account: makeIdentity({
        id: 'acct-juan-2',
        username: 'juan.delacruz',
        employee: makeUser({ employeeId: 'EMP-2026-002', fullName: 'Juan Dela Cruz' }),
      }),
    });

    rerender(
      <MemoryRouter initialEntries={['/employee/account']}>
        <EmployeePage
          currentUser={makeUser({ employeeId: 'EMP-2026-002', fullName: 'Juan Dela Cruz' })}
          onPortalUsernameChanged={onPortalUsernameChanged}
          onLogout={() => {}}
        />
      </MemoryRouter>,
    );

    // Tab re-locked on identity switch
    expect(screen.queryByRole('heading', { name: 'Change Username' })).not.toBeInTheDocument();

    // Resolve the stale EMP-2026-001 rename
    pendingRename.resolve({
      ok: true,
      account: makeIdentity({ username: 'maria.late' }),
    });

    await waitFor(() => {
      expect(mocks.getEmployeePortalAccountByEmployeeNumber).toHaveBeenCalledWith('EMP-2026-002');
    });
    expect(onPortalUsernameChanged).not.toHaveBeenCalled();
  });

  it('fails honestly on unlinked profile edit (!currentUser.supabaseId) and writes nothing to cictrix_employee_portal_accounts', async () => {
    render(
      <MemoryRouter initialEntries={['/employee/profile']}>
        <EmployeePage
          currentUser={makeUser({ supabaseId: undefined, email: '' })}
          onLogout={() => {}}
        />
      </MemoryRouter>,
    );

    const emailField = await screen.findByPlaceholderText('your@email.com');
    fireEvent.change(emailField, { target: { value: 'unlinked@example.gov.ph' } });
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(localStorage.getItem('cictrix_employee_portal_accounts')).toBeNull();
    expect(mocks.patchPortalEmployee).not.toHaveBeenCalled();
  });
});

describe('EmployeePage Account & Security: read failures, tab re-entry, rejection and stale completions', () => {
  const Nav = () => {
    const navigate = useNavigate();
    return (
      <>
        <button type="button" onClick={() => navigate('/employee/profile')}>go-profile</button>
        <button type="button" onClick={() => navigate('/employee/account')}>go-account</button>
      </>
    );
  };

  const renderAt = (user: Employee, onPortalUsernameChanged?: (id: string, u: string) => void) => {
    const tree = (u: Employee) => (
      <MemoryRouter initialEntries={['/employee/account']}>
        <Nav />
        <EmployeePage currentUser={u} onPortalUsernameChanged={onPortalUsernameChanged} onLogout={() => {}} />
      </MemoryRouter>
    );
    const view = render(tree(user));
    return { ...view, rerenderAs: (u: Employee) => view.rerender(tree(u)) };
  };

  const submitUnlock = (username = 'maria.santos', password = 'Current#Pass1') => {
    fireEvent.change(screen.getByPlaceholderText('Enter your username'), { target: { value: username } });
    fireEvent.change(screen.getByPlaceholderText('Enter your current password'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  };

  const unlock = async () => {
    const input = await screen.findByPlaceholderText('Enter your username');
    await waitFor(() => expect(input).toBeEnabled());
    submitUnlock();
    await screen.findByRole('heading', { name: 'Change Username' });
  };

  it('shows unavailable/ambiguous read failures and re-resolves a renamed account when the Account tab is re-entered', async () => {
    mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValueOnce({ ok: false, kind: 'lookup_unavailable' });
    renderAt(makeUser());

    expect(await screen.findByText(/Unable to load your portal account right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/No portal account was found/i)).not.toBeInTheDocument();

    mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValueOnce({ ok: false, kind: 'ambiguous_account' });
    fireEvent.click(screen.getByRole('button', { name: 'go-profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'go-account' }));
    expect(await screen.findByText(/Multiple portal accounts matched your employee number/i)).toBeInTheDocument();

    // Renamed on another device: re-entry resolves the new remote username.
    mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValueOnce({
      ok: true,
      account: makeIdentity({ username: 'maria.elsewhere', updatedAt: '2026-11-20T09:00:00.000000+00:00' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'go-profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'go-account' }));
    await waitFor(() => expect(mocks.getEmployeePortalAccountByEmployeeNumber).toHaveBeenCalledTimes(3));

    mocks.authenticateEmployeePortalAccount.mockResolvedValueOnce({
      ok: true,
      account: makeIdentity({ username: 'maria.elsewhere', updatedAt: '2026-11-20T09:00:00.000000+00:00' }),
    });
    const input = await screen.findByPlaceholderText('Enter your username');
    await waitFor(() => expect(input).toBeEnabled());
    submitUnlock('maria.elsewhere');
    await screen.findByRole('heading', { name: 'Change Username' });
    const shown = screen.getAllByDisplayValue('maria.elsewhere');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown[0]).toBeDisabled();
  });

  it('rejects an unlock whose account has a blank employee identity', async () => {
    renderAt(makeUser());
    const input = await screen.findByPlaceholderText('Enter your username');
    await waitFor(() => expect(input).toBeEnabled());

    mocks.authenticateEmployeePortalAccount.mockResolvedValueOnce({
      ok: true,
      account: makeIdentity({ employee: makeUser({ employeeId: '   ' }) }),
    });
    submitUnlock();

    expect(await screen.findByText(/don't match the account you're logged in as/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Change Username' })).not.toBeInTheDocument();
  });

  it('keeps retryable input after an explicit rejection and asks for reverification after an unconfirmed outcome', async () => {
    renderAt(makeUser());
    await unlock();

    mocks.changeEmployeePortalUsername.mockResolvedValueOnce({
      ok: false,
      kind: 'username_taken',
      error: 'That username is already taken. Pick a different one.',
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. mariasantos'), { target: { value: 'maria.taken' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Username/i }));

    expect(await screen.findByText('That username is already taken. Pick a different one.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. mariasantos')).toHaveValue('maria.taken');

    mocks.changeEmployeePortalPassword.mockResolvedValueOnce({
      ok: false,
      kind: 'unconfirmed',
      error: 'We could not confirm whether your password change completed. Try signing in with your new password or check Account & Security before trying again.',
    });
    fireEvent.change(screen.getByLabelText(/Current Password/i), { target: { value: 'Current#Pass1' } });
    fireEvent.change(screen.getByLabelText(/^New Password$/i), { target: { value: 'NextPass#99' } });
    fireEvent.change(screen.getByLabelText(/Confirm New Password/i), { target: { value: 'NextPass#99' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Password/i }));

    const unconfirmed = await screen.findByText(/could not confirm whether your password change completed/i);
    expect(unconfirmed.textContent).not.toMatch(/failed|was not changed/i);
    expect(screen.getByLabelText(/^New Password$/i)).toHaveValue('NextPass#99');
    expect(screen.queryByText(/Password updated/i)).not.toBeInTheDocument();
  });

  it('does not let a stale unlock completion unlock the tab after leaving and re-entering it', async () => {
    renderAt(makeUser());
    const input = await screen.findByPlaceholderText('Enter your username');
    await waitFor(() => expect(input).toBeEnabled());

    const pendingAuth = deferred<any>();
    mocks.authenticateEmployeePortalAccount.mockReturnValueOnce(pendingAuth.promise);
    submitUnlock();

    fireEvent.click(screen.getByRole('button', { name: 'go-profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'go-account' }));
    await waitFor(() => expect(mocks.getEmployeePortalAccountByEmployeeNumber).toHaveBeenCalledTimes(2));

    pendingAuth.resolve({ ok: true, account: makeIdentity() });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.queryByRole('heading', { name: 'Change Username' })).not.toBeInTheDocument();
    expect(await screen.findByPlaceholderText('Enter your username')).toBeInTheDocument();
  });

  it("keeps employee B's single-flight guard when A's stale save settles after switching employees", async () => {
    const juan = makeUser({ employeeId: 'EMP-2026-002', fullName: 'Juan Dela Cruz' });
    const juanIdentity = makeIdentity({ id: 'acct-juan-2', username: 'juan.delacruz', employee: juan });
    mocks.getEmployeePortalAccountByEmployeeNumber.mockImplementation(async (employeeNumber: string) => ({
      ok: true,
      account: employeeNumber === 'EMP-2026-002' ? juanIdentity : makeIdentity(),
    }));
    mocks.authenticateEmployeePortalAccount.mockImplementation(async (username: string) => ({
      ok: true,
      account: username === 'juan.delacruz' ? juanIdentity : makeIdentity(),
    }));

    const { rerenderAs } = renderAt(makeUser());
    await unlock();

    const pendingA = deferred<any>();
    mocks.changeEmployeePortalUsername.mockReturnValueOnce(pendingA.promise);
    fireEvent.change(screen.getByPlaceholderText('e.g. mariasantos'), { target: { value: 'maria.late' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Username/i }));
    expect(mocks.changeEmployeePortalUsername).toHaveBeenCalledTimes(1);

    rerenderAs(juan);
    const usernameInput = await screen.findByPlaceholderText('Enter your username');
    await waitFor(() => expect(usernameInput).toBeEnabled());
    submitUnlock('juan.delacruz');
    await screen.findByRole('heading', { name: 'Change Username' });

    const pendingB = deferred<any>();
    mocks.changeEmployeePortalUsername.mockReturnValueOnce(pendingB.promise);
    fireEvent.change(screen.getByPlaceholderText('e.g. mariasantos'), { target: { value: 'juan.first' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Username/i }));
    expect(mocks.changeEmployeePortalUsername).toHaveBeenCalledTimes(2);

    // A's stale completion settles while B's save is still pending.
    pendingA.resolve({ ok: true, account: makeIdentity({ username: 'maria.late' }) });
    await new Promise((resolve) => setTimeout(resolve, 20));

    fireEvent.click(screen.getByRole('button', { name: /Save Username/i }));
    expect(mocks.changeEmployeePortalUsername).toHaveBeenCalledTimes(2);
  });
});
