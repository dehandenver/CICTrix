import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const { remote, fetchEmployeeMock } = vi.hoisted(() => ({
  remote: {
    rows: [] as Row[],
    queryError: null as { code?: string; message: string } | null,
  },
  fetchEmployeeMock: vi.fn(),
}));

vi.mock('./lib/supabase', () => {
  const builder = (table: string) => {
    const ilikeFilters: Array<{ column: string; value: string }> = [];
    const execute = async () => {
      if (table !== 'employee_portal_accounts') {
        return { data: [], error: null };
      }
      if (remote.queryError) {
        return { data: null, error: remote.queryError };
      }
      const data = remote.rows.filter((row) =>
        ilikeFilters.every((f) => {
          const expected = f.value.replace(/\\_/g, '_').toLowerCase();
          return String(row[f.column] ?? '').trim().toLowerCase() === expected;
        }),
      );
      return { data, error: null };
    };
    const q: any = {
      select: () => q,
      is: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      ilike: (column: string, value: string) => {
        ilikeFilters.push({ column, value });
        return q;
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        execute().then(onFulfilled, onRejected),
    };
    return q;
  };

  return {
    supabase: {
      from: (table: string) => builder(table),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    },
  };
});

vi.mock('./lib/api/employeePortal', () => ({
  fetchPortalEmployeeByNumber: fetchEmployeeMock,
}));

vi.mock('./modules/employee', async () => {
  const actual = await vi.importActual<typeof import('./modules/employee/EmployeeLoginPage')>(
    './modules/employee/EmployeeLoginPage',
  );
  return {
    EmployeeLoginPage: actual.EmployeeLoginPage,
    EmployeePage: ({ currentUser, loginUsername }: any) => (
      <div data-testid="employee-portal-shell">
        <span>Employee: {currentUser?.employeeId}</span>
        <span>Username: {loginUsername}</span>
        <span>Path: {window.location.pathname}</span>
      </div>
    ),
    SetInitialPasswordPage: ({ username, fullName }: any) => (
      <div data-testid="employee-set-password">
        <span>SetPasswordFor: {username}</span>
        <span>Name: {fullName}</span>
      </div>
    ),
  };
});

import App from './App';
import { readEmployeeSession } from './lib/employeeSession';

const LOCAL_ACCOUNTS_KEY = 'cictrix_employee_portal_accounts';

const makeRemoteAccount = (overrides: Row = {}): Row => ({
  id: 'portal-EMP-2026-001',
  username: 'maria.santos',
  password: 'RemoteCurrent#1',
  employee_id: 'EMP-2026-001',
  full_name: 'Maria Santos',
  email: 'maria.santos@example.gov.ph',
  mobile_number: '09171234567',
  created_at: '2026-11-01T00:00:00.000000+00:00',
  updated_at: '2026-11-20T08:00:00.123456+00:00',
  deleted_at: null,
  must_change_password: false,
  ...overrides,
});

const submitLogin = (username: string, password: string) => {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.submit(screen.getByLabelText('Username').closest('form')!);
};

describe('App employee portal authentication integration', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    remote.rows = [makeRemoteAccount()];
    remote.queryError = null;
    fetchEmployeeMock.mockReset().mockResolvedValue({
      ok: true,
      data: {
        supabaseId: 'emp-uuid-001',
        employeeId: 'EMP-2026-001',
        fullName: 'Maria Santos',
        email: 'maria.santos@example.gov.ph',
      },
    });
    window.history.pushState({}, '', '/employee/login');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('rejects a legacy cached localStorage password and never creates a session or navigates', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(
      LOCAL_ACCOUNTS_KEY,
      JSON.stringify([
        {
          id: 'portal-EMP-2026-001',
          username: 'maria.santos',
          password: 'StaleCachedPassword#1',
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
          employee: {
            employeeId: 'EMP-2026-001',
            fullName: 'Maria Santos',
            email: 'maria.santos@example.gov.ph',
          },
        },
      ]),
    );

    render(<App />);
    submitLogin('maria.santos', 'StaleCachedPassword#1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That username and password don't match an account.",
    );
    expect(readEmployeeSession()).toBeNull();
    expect(screen.queryByTestId('employee-portal-shell')).not.toBeInTheDocument();
  });

  it('authenticates valid remote credentials with empty browser storage and navigates to returnTo', async () => {
    window.history.pushState({}, '', '/employee/login?returnTo=/employee/profile');

    render(<App />);
    submitLogin('maria.santos', 'RemoteCurrent#1');

    expect(await screen.findByTestId('employee-portal-shell')).toHaveTextContent('EMP-2026-001');
    expect(screen.getByTestId('employee-portal-shell')).toHaveTextContent('Path: /employee/profile');
    expect(readEmployeeSession()).toMatchObject({
      employeeId: 'EMP-2026-001',
      loginUsername: 'maria.santos',
      supabaseId: 'emp-uuid-001',
      mustChangePassword: false,
    });
  });

  it('routes a durable must_change_password=true remote account to /employee/set-password in a fresh browser', async () => {
    remote.rows = [makeRemoteAccount({ must_change_password: true })];

    render(<App />);
    submitLogin('maria.santos', 'RemoteCurrent#1');

    expect(await screen.findByTestId('employee-set-password')).toHaveTextContent(
      'SetPasswordFor: maria.santos',
    );
    expect(readEmployeeSession()?.mustChangePassword).toBe(true);
  });

  it('surfaces unavailable/retry guidance on a failed remote lookup instead of invalid credentials copy', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    remote.queryError = { code: 'PGRST301', message: 'database unavailable' };

    render(<App />);
    submitLogin('maria.santos', 'RemoteCurrent#1');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain("That username and password don't match an account.");
    expect(alert.textContent).toMatch(/try again|connection|unavailable|reach/i);
    expect(readEmployeeSession()).toBeNull();
  });

  it('surfaces generic contact-HR guidance on ambiguous active accounts without exposing account counts', async () => {
    remote.rows = [
      makeRemoteAccount({ id: 'portal-1', username: 'maria.santos' }),
      makeRemoteAccount({ id: 'portal-2', username: 'MARIA.SANTOS' }),
    ];

    render(<App />);
    submitLogin('maria.santos', 'RemoteCurrent#1');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/contact hr/i);
    expect(alert.textContent).not.toContain("That username and password don't match an account.");
    expect(alert.textContent).not.toMatch(/\b(2|two|multiple|count|duplicates)\b/i);
    expect(readEmployeeSession()).toBeNull();
  });
});
