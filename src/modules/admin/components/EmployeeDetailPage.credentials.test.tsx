import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEmployeePortalAccountByEmployeeNumber: vi.fn(),
  resetEmployeePortalPassword: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => {
  const from = () => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data: null, error: null }),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
    };
    return chain;
  };
  const channel = { on: () => channel, subscribe: () => channel, unsubscribe: () => {} };
  return {
    supabase: {
      from,
      rpc: () => Promise.resolve({ data: null, error: null }),
      channel: () => channel,
      removeChannel: () => {},
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
    isMockModeEnabled: false,
  };
});
vi.mock('../../../lib/employeeDocuments', () => ({
  createDocumentRequest: vi.fn(),
}));
vi.mock('./ChangePositionModal', () => ({
  default: () => null,
}));
vi.mock('../../../lib/employeePortalData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/employeePortalData')>();
  return {
    ...actual,
    getEmployeePortalAccountByEmployeeNumber: (...args: unknown[]) =>
      mocks.getEmployeePortalAccountByEmployeeNumber(...args),
    resetEmployeePortalPassword: (...args: unknown[]) =>
      mocks.resetEmployeePortalPassword(...args),
  };
});

import EmployeeDetailPage from './EmployeeDetailPage';

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const makeEmployee = (overrides: Record<string, unknown> = {}) => ({
  id: 'emp-uuid-1',
  employee_id: 'EMP-2026-0042',
  full_name: 'Maria Santos',
  current_position: 'Budget Analyst',
  department: 'Budget Office',
  status: 'Active',
  email: 'maria@example.gov.ph',
  mobile_number: '09171234567',
  hire_date: '2026-01-15',
  ...overrides,
});

const mariaIdentity = (overrides: Record<string, unknown> = {}) => ({
  id: 'acct-custom-9',
  username: 'maria.custom',
  mustChangePassword: false,
  updatedAt: '2026-11-20T08:00:00.123456+00:00',
  employee: {
    employeeId: 'EMP-2026-0042',
    fullName: 'Maria Santos',
    email: 'maria@example.gov.ph',
  },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValue({
    ok: true,
    account: mariaIdentity(),
  });
});

afterEach(() => {
  cleanup();
});

describe('EmployeeDetailPage explicit password reset (Credential Task 4)', () => {
  it('resolves remote target with empty localStorage, preserves username, serializes clicks, and shows password only after confirmation', async () => {
    const pendingReset = deferred<any>();
    mocks.resetEmployeePortalPassword.mockReturnValueOnce(pendingReset.promise);

    render(<EmployeeDetailPage employee={makeEmployee()} onRefresh={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Reset Password/i }));

    const confirmBtn = await screen.findByRole('button', { name: /Yes, reset password/i });
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
    expect(screen.queryByText('New Password Generated')).not.toBeInTheDocument();

    pendingReset.resolve({
      ok: true,
      account: mariaIdentity({ mustChangePassword: true, updatedAt: '2026-11-20T09:00:00.000000+00:00' }),
      credentials: { username: 'maria.custom', password: 'DetailReset#Pass9' },
    });

    expect(await screen.findByText('New Password Generated')).toBeInTheDocument();
    expect(screen.getByText('maria.custom')).toBeInTheDocument();
    expect(screen.getByText('DetailReset#Pass9')).toBeInTheDocument();
  });

  it('refuses reset on missing/unavailable remote account and discards late completions after switching employee', async () => {
    mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValueOnce({
      ok: false,
      kind: 'not_found',
    });

    const { rerender } = render(<EmployeeDetailPage employee={makeEmployee()} onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Reset Password/i }));

    expect(await screen.findByText(/No employee-portal account exists for EMP-2026-0042/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Yes, reset password/i })).not.toBeInTheDocument();
    expect(mocks.resetEmployeePortalPassword).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Close'));

    // Re-open for EMP-2026-0042, trigger reset, then switch employee before RPC resolves
    mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValueOnce({
      ok: true,
      account: mariaIdentity(),
    });
    const pendingLate = deferred<any>();
    mocks.resetEmployeePortalPassword.mockReturnValueOnce(pendingLate.promise);

    fireEvent.click(screen.getByRole('button', { name: /Reset Password/i }));
    const confirmBtn = await screen.findByRole('button', { name: /Yes, reset password/i });
    await waitFor(() => expect(confirmBtn).toBeEnabled());
    fireEvent.click(confirmBtn);

    rerender(
      <EmployeeDetailPage
        employee={makeEmployee({ id: 'emp-uuid-2', employee_id: 'EMP-2026-0099', full_name: 'Juan Dela Cruz' })}
        onRefresh={() => {}}
      />,
    );

    pendingLate.resolve({
      ok: true,
      account: mariaIdentity({ mustChangePassword: true, updatedAt: '2026-11-20T10:00:00.000000+00:00' }),
      credentials: { username: 'maria.custom', password: 'LateStalePassword#8' },
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('LateStalePassword#8')).not.toBeInTheDocument();
    expect(screen.queryByText('New Password Generated')).not.toBeInTheDocument();
  });
});
