import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const { remote, fetchEmployeeMock } = vi.hoisted(() => ({
  remote: {
    lifecycleMode: false,
    seq: 0,
    rows: [] as Row[],
    applicants: [] as Row[],
    employees: [] as Row[],
    newlyHired: [] as Row[],
    passwordResets: [] as Row[],
    queryError: null as { code?: string; message: string } | null,
  },
  fetchEmployeeMock: vi.fn(),
}));

vi.mock('./lib/supabase', () => {
  const tableRows = (table: string): Row[] => {
    switch (table) {
      case 'employee_portal_accounts':
        return remote.rows;
      case 'applicants':
        return remote.applicants;
      case 'employees':
      case 'employees_with_department':
        return remote.employees;
      case 'newly_hired':
        return remote.newlyHired;
      case 'employee_password_resets':
        return remote.passwordResets;
      default:
        return [];
    }
  };

  const applyProjection = (row: Row, cols: string): Row => {
    const trimmed = cols.trim();
    if (!trimmed || trimmed === '*') return { ...row };
    const out: Row = {};
    for (const c of trimmed.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (c in row) out[c] = row[c];
    }
    return out;
  };

  const builder = (table: string) => {
    const filters: Array<{ op: 'ilike' | 'eq' | 'in' | 'is'; column: string; value: unknown }> = [];
    let selectedCols = '*';
    let mode: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payloadRows: Row[] = [];
    let updatePatch: Row = {};
    let isSingle = false;
    let isMaybeSingle = false;

    const matchRows = (rows: Row[]) =>
      rows.filter((row) =>
        filters.every((f) => {
          if (f.op === 'ilike') {
            const expected = String(f.value ?? '').replace(/\\_/g, '_').toLowerCase();
            return String(row[f.column] ?? '').trim().toLowerCase() === expected;
          }
          if (f.op === 'eq') return String(row[f.column] ?? '') === String(f.value ?? '');
          if (f.op === 'is' && f.value === null) return row[f.column] == null;
          if (f.op === 'in') return (f.value as unknown[]).map(String).includes(String(row[f.column] ?? ''));
          return true;
        }),
      );

    const execute = async () => {
      if (remote.queryError && table === 'employee_portal_accounts') {
        return { data: null, error: remote.queryError };
      }

      if (mode === 'insert') {
        const rows = tableRows(table);
        const inserted: Row[] = [];
        for (const r of payloadRows) {
          if (
            table === 'employee_portal_accounts' &&
            rows.some(
              (existing) =>
                existing.deleted_at == null &&
                (String(existing.employee_id ?? '').toLowerCase() === String(r.employee_id ?? '').toLowerCase() ||
                  String(existing.username ?? '').toLowerCase() === String(r.username ?? '').toLowerCase()),
            )
          ) {
            return { data: null, error: { code: '23505', message: 'duplicate key value' } };
          }
          const copy = { ...r };
          rows.push(copy);
          inserted.push(copy);
        }
        return { data: inserted.map((r) => applyProjection(r, selectedCols)), error: null };
      }

      if (mode === 'upsert') {
        const rows = tableRows(table);
        for (const r of payloadRows) {
          const idx = rows.findIndex((existing) => String(existing.id) === String(r.id));
          if (idx >= 0) rows[idx] = { ...rows[idx], ...r };
          else rows.push({ ...r });
        }
        return { data: payloadRows, error: null };
      }

      if (mode === 'update') {
        const rows = tableRows(table);
        const matched = matchRows(rows);
        if (matched.length === 0) return { data: [], error: null };
        const nextRev = `2026-11-20T10:00:${String(++remote.seq).padStart(2, '0')}.000000+00:00`;
        const updated: Row[] = [];
        for (const r of matched) {
          Object.assign(r, updatePatch);
          if (table === 'employee_portal_accounts') r.updated_at = nextRev;
          updated.push(applyProjection(r, selectedCols));
        }
        return { data: updated, error: null };
      }

      if (!remote.lifecycleMode && table !== 'employee_portal_accounts') {
        return { data: [], error: null };
      }

      const matched = matchRows(tableRows(table));
      if (isSingle) {
        if (matched.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'Not found' } };
        return { data: applyProjection(matched[0], selectedCols), error: null };
      }
      if (isMaybeSingle) {
        return { data: matched[0] ? applyProjection(matched[0], selectedCols) : null, error: null };
      }
      return { data: matched.map((r) => applyProjection(r, selectedCols)), error: null };
    };

    const q: any = {
      select: (cols = '*') => {
        selectedCols = cols;
        return q;
      },
      insert: (rows: Row[]) => {
        mode = 'insert';
        payloadRows = rows;
        return q;
      },
      upsert: (rows: Row[]) => {
        mode = 'upsert';
        payloadRows = rows;
        return q;
      },
      update: (patch: Row) => {
        mode = 'update';
        updatePatch = patch;
        return q;
      },
      is: (column: string, value: unknown) => {
        filters.push({ op: 'is', column, value });
        return q;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value });
        return q;
      },
      in: (column: string, value: unknown[]) => {
        filters.push({ op: 'in', column, value });
        return q;
      },
      order: () => q,
      limit: () => q,
      ilike: (column: string, value: string) => {
        filters.push({ op: 'ilike', column, value });
        return q;
      },
      single: () => {
        isSingle = true;
        return q;
      },
      maybeSingle: () => {
        isMaybeSingle = true;
        return q;
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        execute().then(onFulfilled, onRejected),
    };
    return q;
  };

  const rpc = (fn: string, params: Record<string, unknown>) => {
    const run = async () => {
      if (fn === 'complete_external_hire') {
        const applicant = remote.applicants.find((a) => a.id === params.p_applicant_id);
        if (!applicant) {
          return { data: null, error: { code: 'P0001', hint: 'application_not_found', message: 'not found' } };
        }
        const existing = remote.employees.find((e) => e.application_id === applicant.id);
        if (existing) {
          return {
            data: {
              applicant_id: applicant.id,
              employee_uuid: existing.id,
              employee_number: existing.employee_number,
              slot_id: existing.plantilla_slot_id ?? 'slot-1',
              completed_at: existing.hire_date,
              already_completed: true,
            },
            error: null,
          };
        }
        const empUuid = `emp-uuid-${++remote.seq}`;
        const empNumber = `EMP-2026-50${remote.seq}`;
        const hiredAt = '2026-11-20T08:00:00.000Z';
        remote.employees.push({
          id: empUuid,
          application_id: applicant.id,
          employee_id: empNumber,
          employee_number: empNumber,
          full_name: `${applicant.first_name} ${applicant.last_name}`,
          first_name: applicant.first_name,
          last_name: applicant.last_name,
          email: applicant.email,
          current_position: applicant.position,
          current_department: applicant.office,
          plantilla_slot_id: applicant.plantilla_slot_id,
          status: 'Active',
          hire_date: hiredAt,
          created_at: hiredAt,
          updated_at: hiredAt,
        });
        applicant.status = 'Hired';
        return {
          data: {
            applicant_id: applicant.id,
            employee_uuid: empUuid,
            employee_number: empNumber,
            slot_id: applicant.plantilla_slot_id ?? 'slot-1',
            completed_at: hiredAt,
            already_completed: false,
          },
          error: null,
        };
      }

      if (fn === 'reset_employee_portal_password') {
        const acct = remote.rows.find((a) => a.deleted_at == null && a.id === params.p_account_id);
        if (!acct) {
          return { data: null, error: { code: 'P0002', hint: 'account_not_found', message: 'not found' } };
        }
        if (acct.employee_id !== params.p_employee_number) {
          return { data: null, error: { code: '22023', hint: 'identity_mismatch', message: 'mismatch' } };
        }
        if (acct.updated_at !== params.p_expected_updated_at) {
          return { data: null, error: { code: '40001', hint: 'revision_conflict', message: 'conflict' } };
        }
        const nextRev = `2026-11-20T11:00:${String(++remote.seq).padStart(2, '0')}.000000+00:00`;
        acct.password = params.p_new_password;
        acct.must_change_password = true;
        acct.updated_at = nextRev;
        remote.passwordResets.push({
          id: `reset-${remote.seq}`,
          account_id: acct.id,
          employee_username: acct.username,
          employee_number: acct.employee_id,
          reset_at: nextRev,
          request_id: params.p_request_id,
        });
        return {
          data: {
            account_id: acct.id,
            employee_number: acct.employee_id,
            username: acct.username,
            updated_at: nextRev,
            must_change_password: true,
          },
          error: null,
        };
      }

      return { data: null, error: { code: 'PGRST202', message: `Unexpected rpc ${fn}` } };
    };

    const builder: any = {
      abortSignal: () => builder,
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        run().then(onFulfilled, onRejected),
    };
    return builder;
  };

  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc,
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
  const React = await import('react');
  const actualLogin = await vi.importActual<typeof import('./modules/employee/EmployeeLoginPage')>(
    './modules/employee/EmployeeLoginPage',
  );
  const actualSetPassword = await vi.importActual<typeof import('./modules/employee/SetInitialPasswordPage')>(
    './modules/employee/SetInitialPasswordPage',
  );
  const portalData = await import('./lib/employeePortalData');

  const LifecycleEmployeeShell = ({ currentUser, loginUsername, onPortalUsernameChanged }: any) => {
    const [status, setStatus] = React.useState('');
    return (
      <div data-testid="employee-portal-shell">
        <span>Employee: {currentUser?.employeeId}</span>
        <span>Username: {loginUsername}</span>
        <span>Path: {window.location.pathname}</span>
        {status && <span data-testid="lifecycle-status">{status}</span>}
        <button
          type="button"
          onClick={async () => {
            const targetRes = await portalData.getEmployeePortalAccountByEmployeeNumber(currentUser?.employeeId ?? '');
            if (targetRes.ok === false) {
              setStatus(`target:${targetRes.kind}`);
              return;
            }
            const res = await portalData.changeEmployeePortalPassword(
              {
                accountId: targetRes.account.id,
                employeeNumber: currentUser?.employeeId ?? '',
                expectedRevision: targetRes.account.updatedAt,
              },
              String(remote.rows.find((r) => r.id === targetRes.account.id)?.password ?? ''),
              'ContextASelfPass#2',
            );
            setStatus(res.ok === true ? 'pw:ok' : `pw:${res.kind}`);
          }}
        >
          SelfChangePassword
        </button>
        <button
          type="button"
          onClick={async () => {
            const targetRes = await portalData.getEmployeePortalAccountByEmployeeNumber(currentUser?.employeeId ?? '');
            if (targetRes.ok === false) return;
            const res = await portalData.changeEmployeePortalUsername(
              {
                accountId: targetRes.account.id,
                employeeNumber: currentUser?.employeeId ?? '',
                expectedRevision: targetRes.account.updatedAt,
              },
              'elena.renamed',
            );
            if (res.ok === true) {
              onPortalUsernameChanged?.(currentUser?.employeeId, res.account.username);
              setStatus(`rename:${res.account.username}`);
            } else {
              setStatus(`rename:${res.kind}`);
            }
          }}
        >
          RenameLifecycleUser
        </button>
      </div>
    );
  };

  return {
    EmployeeLoginPage: actualLogin.EmployeeLoginPage,
    EmployeePage: (props: any) =>
      remote.lifecycleMode ? (
        <LifecycleEmployeeShell {...props} />
      ) : (
        <div data-testid="employee-portal-shell">
          <span>Employee: {props.currentUser?.employeeId}</span>
          <span>Username: {props.loginUsername}</span>
          <span>Path: {window.location.pathname}</span>
          <button
            type="button"
            onClick={() => props.onPortalUsernameChanged?.(props.currentUser?.employeeId, 'maria.renamed')}
          >
            RenameCurrent
          </button>
          <button
            type="button"
            onClick={() => props.onPortalUsernameChanged?.('EMP-OTHER-999', 'wrong.user')}
          >
            RenameOther
          </button>
        </div>
      ),
    SetInitialPasswordPage: (props: any) =>
      remote.lifecycleMode ? (
        <actualSetPassword.SetInitialPasswordPage {...props} />
      ) : (
        <div data-testid="employee-set-password">
          <span>SetPasswordFor: {props.username}</span>
          <span>EmployeeNumber: {props.employeeNumber}</span>
          <span>Name: {props.fullName}</span>
          <button type="button" onClick={() => props.onDone?.()}>
            CompleteInitialPassword
          </button>
        </div>
      ),
  };
});

import App from './App';
import { readEmployeeSession } from './lib/employeeSession';
import {
  authenticatePromotionalEmployee,
  changeEmployeePortalPassword,
  resetEmployeePortalPassword,
} from './lib/employeePortalData';
import { generateEmployeeCredentials } from './lib/hiringFlow';

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
    remote.lifecycleMode = false;
    remote.seq = 0;
    remote.applicants = [];
    remote.employees = [];
    remote.newlyHired = [];
    remote.passwordResets = [];
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

  it('passes employeeNumber to SetInitialPasswordPage and synchronizes confirmed username changes into employeeSession', async () => {
    remote.rows = [makeRemoteAccount({ must_change_password: true })];

    render(<App />);
    submitLogin('maria.santos', 'RemoteCurrent#1');

    const setPwView = await screen.findByTestId('employee-set-password');
    expect(setPwView).toHaveTextContent('EmployeeNumber: EMP-2026-001');

    fireEvent.click(screen.getByRole('button', { name: 'CompleteInitialPassword' }));

    const shell = await screen.findByTestId('employee-portal-shell');
    expect(shell).toHaveTextContent('Username: maria.santos');
    expect(readEmployeeSession()?.mustChangePassword).toBe(false);

    // Mismatched employeeId callback is ignored
    fireEvent.click(screen.getByRole('button', { name: 'RenameOther' }));
    expect(screen.getByTestId('employee-portal-shell')).toHaveTextContent('Username: maria.santos');
    expect(readEmployeeSession()?.loginUsername).toBe('maria.santos');

    // Matching employeeId callback updates in-memory state and persisted session
    fireEvent.click(screen.getByRole('button', { name: 'RenameCurrent' }));
    expect(screen.getByTestId('employee-portal-shell')).toHaveTextContent('Username: maria.renamed');
    expect(readEmployeeSession()?.loginUsername).toBe('maria.renamed');
  });

  it('executes full cross-context lifecycle across hire -> Context A -> stale replay -> Context B -> HR reset -> stale conflict -> rename -> promotion prefill -> reload', async () => {
    remote.lifecycleMode = true;
    remote.rows = [];
    remote.applicants = [
      {
        id: 'app-life-1',
        first_name: 'Elena',
        last_name: 'Reyes',
        email: 'elena.reyes@example.gov.ph',
        position: 'Engineer I',
        office: 'Engineering Office',
        contact_number: '09171230001',
        plantilla_slot_id: 'slot-life-1',
        status: 'For Contract Signing',
        application_type: 'job',
      },
    ];
    fetchEmployeeMock.mockImplementation(async (empNumber: string) => {
      const emp = remote.employees.find((e) => String(e.employee_number) === empNumber);
      if (!emp) return { ok: false, error: 'Not found' };
      return {
        ok: true,
        data: {
          supabaseId: emp.id,
          employeeId: emp.employee_number,
          fullName: emp.full_name,
          email: emp.email,
        },
      };
    });

    const emailCalls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (init?.body) emailCalls.push(JSON.parse(String(init.body)));
        return {
          ok: true,
          json: async () => ({ success: true, deliveredTo: ['elena.reyes@example.gov.ph'], message: 'sent' }),
        } as Response;
      }),
    );

    // Explicit isolated browser storage/session contexts (Context A & Context B)
    type BrowserSnapshot = { local: Record<string, string>; session: Record<string, string> };
    const captureStorage = (): BrowserSnapshot => {
      const local: Record<string, string> = {};
      const session: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i)!;
        local[k] = localStorage.getItem(k)!;
      }
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const k = sessionStorage.key(i)!;
        session[k] = sessionStorage.getItem(k)!;
      }
      return { local, session };
    };
    const restoreStorage = (snap: BrowserSnapshot) => {
      localStorage.clear();
      sessionStorage.clear();
      for (const [k, v] of Object.entries(snap.local)) localStorage.setItem(k, v);
      for (const [k, v] of Object.entries(snap.session)) sessionStorage.setItem(k, v);
    };

    const reservedApplicant = {
      id: 'app-life-1',
      fullName: 'Elena Reyes',
      email: 'elena.reyes@example.gov.ph',
      referenceNo: 'REF-LIFE-1',
      position: 'Engineer I',
      department: 'Engineering Office',
      plantilla: 'Engineering - Item 010 (Slot 1)',
      slotItemNumber: '010',
      slotNumber: 1,
      slotId: 'slot-life-1',
      signingDeadline: '2026-11-30T00:00:00.000Z',
      applicationType: 'job' as const,
      interviewScore: 90,
      employeeNumber: null,
    };

    // 1. New external hire creates account (must_change_password: true) + sends credential email once
    const hireRes = await generateEmployeeCredentials([reservedApplicant]);
    expect(hireRes.failures).toEqual([]);
    expect(hireRes.credentials).toHaveLength(1);
    expect(emailCalls).toHaveLength(1);

    const empNumber = hireRes.credentials[0].employeeId;
    const tempPassword = hireRes.credentials[0].tempPassword;
    const initialAccountId = String(remote.rows[0].id);

    // 2. Context A sign-in routes to /employee/set-password
    let ctxA: BrowserSnapshot = { local: {}, session: {} };
    let ctxB: BrowserSnapshot = { local: {}, session: {} };
    restoreStorage(ctxA);
    window.history.pushState({}, '', '/employee/login');
    const appA1 = render(<App />);
    submitLogin(empNumber, tempPassword);

    expect(await screen.findByText('Set Your Password')).toBeInTheDocument();
    expect(readEmployeeSession()?.mustChangePassword).toBe(true);

    // 3. Initial password change clears must_change_password remotely & in Context A session
    const inputsA1 = appA1.container.querySelectorAll('input[type="password"]');
    fireEvent.change(inputsA1[0], { target: { value: tempPassword } });
    fireEvent.change(inputsA1[1], { target: { value: 'ContextAInit#1' } });
    fireEvent.change(inputsA1[2], { target: { value: 'ContextAInit#1' } });
    fireEvent.click(screen.getByRole('button', { name: /Set Password and Continue/i }));

    expect(await screen.findByTestId('employee-portal-shell')).toHaveTextContent(`Employee: ${empNumber}`);
    expect(readEmployeeSession()?.mustChangePassword).toBe(false);
    expect(remote.rows[0].must_change_password).toBe(false);

    // 4. Context A self-changes password
    fireEvent.click(screen.getByRole('button', { name: 'SelfChangePassword' }));
    await waitFor(() => expect(screen.getByTestId('lifecycle-status')).toHaveTextContent('pw:ok'));
    const revisionBeforeReset = String(remote.rows[0].updated_at);
    ctxA = captureStorage();
    appA1.unmount();

    // 5. Stale-cache hire replay from stale localStorage preserves remote account/password/employee with zero duplicate email/rows
    localStorage.setItem(
      LOCAL_ACCOUNTS_KEY,
      JSON.stringify([
        {
          id: initialAccountId,
          username: empNumber,
          password: tempPassword,
          employee: { employeeId: empNumber, fullName: 'Elena Reyes' },
        },
      ]),
    );
    const replayRes = await generateEmployeeCredentials([reservedApplicant]);
    expect(replayRes.failures).toEqual([]);
    expect(replayRes.credentials).toHaveLength(0);
    expect(replayRes.existingAccounts).toHaveLength(1);
    expect(emailCalls).toHaveLength(1);
    expect(remote.employees).toHaveLength(1);
    expect(remote.newlyHired).toHaveLength(1);
    expect(remote.rows[0].password).toBe('ContextASelfPass#2');

    // 6. Context B (fresh empty storage) rejects old/stale password and signs in with current remote password
    restoreStorage(ctxB);
    window.history.pushState({}, '', '/employee/login');
    const appB1 = render(<App />);
    submitLogin(empNumber, tempPassword);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That username and password don't match an account.",
    );
    expect(readEmployeeSession()).toBeNull();

    submitLogin(empNumber, 'ContextASelfPass#2');
    expect(await screen.findByTestId('employee-portal-shell')).toHaveTextContent(`Username: ${empNumber}`);
    ctxB = captureStorage();
    appB1.unmount();

    // 7. HR explicit reset sets must_change_password: true & advances updated_at
    const resetRes = await resetEmployeePortalPassword({
      accountId: initialAccountId,
      employeeNumber: empNumber,
      expectedRevision: revisionBeforeReset,
    });
    expect(resetRes.ok).toBe(true);
    if (resetRes.ok === false) return;
    expect(remote.rows[0].must_change_password).toBe(true);
    expect(resetRes.account.updatedAt).not.toBe(revisionBeforeReset);

    // 8. Context A stale self-save rejected with 'conflict'
    restoreStorage(ctxA);
    const staleSelfRes = await changeEmployeePortalPassword(
      {
        accountId: initialAccountId,
        employeeNumber: empNumber,
        expectedRevision: revisionBeforeReset,
      },
      'ContextASelfPass#2',
      'StaleOverwriteAttempt#9',
    );
    expect(staleSelfRes).toMatchObject({ ok: false, kind: 'conflict' });
    expect(remote.rows[0].password).toBe(resetRes.credentials.password);

    // 9. Context B signs in with HR reset password -> routes to /employee/set-password -> sets new password -> renames username
    restoreStorage({ local: {}, session: {} });
    window.history.pushState({}, '', '/employee/login');
    const appB2 = render(<App />);
    submitLogin(empNumber, resetRes.credentials.password);
    expect(await screen.findByText('Set Your Password')).toBeInTheDocument();

    const inputsB2 = appB2.container.querySelectorAll('input[type="password"]');
    fireEvent.change(inputsB2[0], { target: { value: resetRes.credentials.password } });
    fireEvent.change(inputsB2[1], { target: { value: 'ContextBPostReset#3' } });
    fireEvent.change(inputsB2[2], { target: { value: 'ContextBPostReset#3' } });
    fireEvent.click(screen.getByRole('button', { name: /Set Password and Continue/i }));

    expect(await screen.findByTestId('employee-portal-shell')).toHaveTextContent(`Username: ${empNumber}`);
    fireEvent.click(screen.getByRole('button', { name: 'RenameLifecycleUser' }));
    await waitFor(() =>
      expect(screen.getByTestId('lifecycle-status')).toHaveTextContent('rename:elena.renamed'),
    );
    expect(readEmployeeSession()?.loginUsername).toBe('elena.renamed');
    ctxB = captureStorage();
    appB2.unmount();

    // 10. Promotional authentication works with renamed username & returns password-free identity
    const promoAuth = await authenticatePromotionalEmployee('elena.renamed', 'ContextBPostReset#3');
    expect(promoAuth.ok).toBe(true);
    if (promoAuth.ok === true) {
      expect(promoAuth.account.username).toBe('elena.renamed');
      expect('password' in promoAuth.account).toBe(false);
    }

    // 11. Reload in Context B resolves updated session username
    restoreStorage(ctxB);
    window.history.pushState({}, '', '/employee');
    const appB3 = render(<App />);
    expect(await screen.findByTestId('employee-portal-shell')).toHaveTextContent('Username: elena.renamed');
    appB3.unmount();

    // 12. Unavailable remote lookup produces zero session
    restoreStorage({ local: {}, session: {} });
    remote.queryError = { code: 'PGRST301', message: 'database unavailable' };
    window.history.pushState({}, '', '/employee/login');
    render(<App />);
    submitLogin('elena.renamed', 'ContextBPostReset#3');
    const unavailableAlert = await screen.findByRole('alert');
    expect(unavailableAlert.textContent).toMatch(/try again|connection|unavailable|reach/i);
    expect(readEmployeeSession()).toBeNull();
    vi.unstubAllGlobals();
  });
});
