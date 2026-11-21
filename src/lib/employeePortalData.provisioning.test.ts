import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const remote = vi.hoisted(() => ({
  portalRows: [] as Row[],
  employeeViewRows: [] as Row[],
  newlyHiredRows: [] as Row[],
  portalSelectColumns: [] as string[],
  portalSelectErrors: {} as Record<string, unknown>,
  employeeViewError: null as unknown,
  newlyHiredError: null as unknown,
  insertCalls: [] as Row[],
  upsertCalls: [] as unknown[],
  insertHandler: null as null | ((rows: Row[]) => { data: Row[] | null; error: unknown } | Promise<{ data: Row[] | null; error: unknown }>),
  portalQueryLog: [] as Array<{ table: string; op: string; columns?: string }>,
}));

vi.mock('./supabase', () => {
  const from = (table: string) => {
    const filters: Array<{ op: 'ilike' | 'eq' | 'is'; column: string; value: unknown }> = [];
    let selectedCols = '';

    const runSelect = () => {
      if (table === 'employees_with_department') {
        remote.portalQueryLog.push({ table, op: 'select', columns: selectedCols });
        if (remote.employeeViewError) return { data: null, error: remote.employeeViewError };
        return { data: remote.employeeViewRows, error: null };
      }
      if (table === 'newly_hired') {
        remote.portalQueryLog.push({ table, op: 'select', columns: selectedCols });
        if (remote.newlyHiredError) return { data: null, error: remote.newlyHiredError };
        return { data: remote.newlyHiredRows, error: null };
      }
      if (table === 'employee_portal_accounts') {
        remote.portalQueryLog.push({ table, op: 'select', columns: selectedCols });
        if (remote.portalSelectErrors['*']) {
          return { data: null, error: remote.portalSelectErrors['*'] };
        }
        for (const f of filters) {
          const failure = remote.portalSelectErrors[f.column];
          if (failure) return { data: null, error: failure };
        }
        const filtered = remote.portalRows.filter((row) =>
          filters.every((f) => {
            if (f.op === 'is' && f.value === null) return row[f.column] == null;
            if (f.op === 'ilike') {
              const expected = String(f.value ?? '').replace(/\\_/g, '_').trim().toLowerCase();
              return String(row[f.column] ?? '').trim().toLowerCase() === expected;
            }
            if (f.op === 'eq') {
              return String(row[f.column] ?? '') === String(f.value ?? '');
            }
            return true;
          }),
        );
        return { data: filtered, error: null };
      }
      return { data: [], error: null };
    };

    const query: any = {
      select: (columns: string) => {
        selectedCols = columns;
        if (table === 'employee_portal_accounts') {
          remote.portalSelectColumns.push(columns);
        }
        return query;
      },
      ilike: (column: string, value: string) => {
        filters.push({ op: 'ilike', column, value });
        return query;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value });
        return query;
      },
      is: (column: string, value: unknown) => {
        filters.push({ op: 'is', column, value });
        return query;
      },
      order: () => query,
      insert: (payload: Row | Row[]) => {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...r }));
        remote.insertCalls.push(...rows);
        const execInsert = async () => {
          if (remote.insertHandler) {
            return await remote.insertHandler(rows);
          }
          remote.portalRows.push(...rows);
          return { data: rows, error: null };
        };
        const insertChain: any = {
          select: (cols: string) => {
            remote.portalSelectColumns.push(cols);
            return {
              single: async () => {
                const res = await execInsert();
                return {
                  data: Array.isArray(res.data) ? res.data[0] ?? null : res.data,
                  error: res.error,
                };
              },
              maybeSingle: async () => {
                const res = await execInsert();
                return {
                  data: Array.isArray(res.data) ? res.data[0] ?? null : res.data,
                  error: res.error,
                };
              },
              then: (onFulfilled: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) =>
                execInsert().then(onFulfilled, onRejected),
            };
          },
          then: (onFulfilled: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) =>
            execInsert().then(onFulfilled, onRejected),
        };
        return insertChain;
      },
      upsert: (payload: unknown) => {
        remote.upsertCalls.push(payload);
        return {
          select: () => Promise.resolve({ data: [], error: null }),
          then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onFulfilled),
        };
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) =>
        Promise.resolve(runSelect()).then(onFulfilled, onRejected),
    };
    return query;
  };

  return {
    supabase: { from },
    isMockModeEnabled: false,
  };
});

import * as portalData from './employeePortalData';
import { createEmployeeNumberAllocator } from './recruitmentData';
import type { Employee } from '../types/employee.types';

const ensureEmployeePortalAccount = (portalData as any).ensureEmployeePortalAccount as (input: {
  employee: Employee;
  requestedUsername: string;
}) => Promise<any>;

const LOCAL_ACCOUNTS_KEY = 'cictrix_employee_portal_accounts';

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  employeeId: 'EMP-2026-0042',
  fullName: 'Maria Santos',
  email: 'maria.santos@example.gov.ph',
  dateOfBirth: '',
  age: 0,
  gender: 'Female',
  civilStatus: 'Single',
  nationality: 'Filipino',
  mobileNumber: '+63 912 345 6789',
  homeAddress: 'Iloilo City',
  emergencyContactName: '',
  emergencyRelationship: '',
  emergencyContactNumber: '',
  sssNumber: '',
  philhealthNumber: '',
  pagibigNumber: '',
  tinNumber: '',
  ...overrides,
});

const portalRow = (overrides: Row = {}): Row => ({
  id: 'portal-EMP-2026-0042',
  username: 'maria.custom',
  password: 'ChangedByUser#99',
  employee_id: 'EMP-2026-0042',
  full_name: 'Maria Santos',
  email: 'maria.santos@example.gov.ph',
  mobile_number: '+63 912 345 6789',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-02-01T10:00:00.000Z',
  deleted_at: null,
  must_change_password: false,
  ...overrides,
});

beforeEach(() => {
  remote.portalRows = [];
  remote.employeeViewRows = [];
  remote.newlyHiredRows = [];
  remote.portalSelectColumns = [];
  remote.portalSelectErrors = {};
  remote.employeeViewError = null;
  remote.newlyHiredError = null;
  remote.insertCalls = [];
  remote.upsertCalls = [];
  remote.insertHandler = null;
  remote.portalQueryLog = [];
  localStorage.clear();
  sessionStorage.clear();
});

describe('ensureEmployeePortalAccount (create-only provisioning)', () => {
  it('returns invalid_employee for missing/wildcard employeeId or invalid requestedUsername', async () => {
    expect(typeof ensureEmployeePortalAccount).toBe('function');

    const missingEmp = await ensureEmployeePortalAccount({
      employee: makeEmployee({ employeeId: '   ' }),
      requestedUsername: 'maria.santos',
    });
    expect(missingEmp).toMatchObject({ ok: false, kind: 'invalid_employee' });

    const wildcardEmp = await ensureEmployeePortalAccount({
      employee: makeEmployee({ employeeId: 'EMP%2026' }),
      requestedUsername: 'maria.santos',
    });
    expect(wildcardEmp).toMatchObject({ ok: false, kind: 'invalid_employee' });

    const shortUser = await ensureEmployeePortalAccount({
      employee: makeEmployee(),
      requestedUsername: 'ab',
    });
    expect(shortUser).toMatchObject({ ok: false, kind: 'invalid_employee' });

    const badCharsUser = await ensureEmployeePortalAccount({
      employee: makeEmployee(),
      requestedUsername: 'maria santos!',
    });
    expect(badCharsUser).toMatchObject({ ok: false, kind: 'invalid_employee' });
    expect(remote.insertCalls).toHaveLength(0);
    expect(remote.upsertCalls).toHaveLength(0);
  });

  it('preserves an existing remote account without reading, rotating, or leaking its password', async () => {
    remote.portalRows = [
      portalRow({
        id: 'acct-custom-9',
        username: 'maria.custom',
        password: 'ChangedByUser#99',
      }),
    ];
    localStorage.setItem(
      LOCAL_ACCOUNTS_KEY,
      JSON.stringify([{ id: 'stale', username: 'stale', password: 'OldPassword#1', employee: { employeeId: 'EMP-2026-0042' } }]),
    );

    const res = await ensureEmployeePortalAccount({
      employee: makeEmployee(),
      requestedUsername: 'EMP-2026-0042',
    });

    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.created).toBe(false);
      expect('credentials' in res).toBe(false);
      expect(res.account.id).toBe('acct-custom-9');
      expect(res.account.username).toBe('maria.custom');
      expect('password' in res.account).toBe(false);
    }
    expect(remote.insertCalls).toHaveLength(0);
    expect(remote.upsertCalls).toHaveLength(0);
    expect(remote.portalRows[0].password).toBe('ChangedByUser#99');
    expect(remote.portalSelectColumns.every((cols) => !/\bpassword\b/i.test(cols.replace(/must_change_password/gi, '')))).toBe(true);
  });

  it('rejects requestedUsername belonging to another active employee without inserting', async () => {
    remote.portalRows = [
      portalRow({
        id: 'portal-EMP-2026-0001',
        employee_id: 'EMP-2026-0001',
        username: 'maria.santos',
      }),
    ];

    const res = await ensureEmployeePortalAccount({
      employee: makeEmployee({ employeeId: 'EMP-2026-0042' }),
      requestedUsername: 'Maria.Santos',
    });

    expect(res).toMatchObject({ ok: false, kind: 'account_conflict' });
    expect(remote.insertCalls).toHaveLength(0);
    expect(remote.upsertCalls).toHaveLength(0);
  });

  it('inserts cleanly without upsert or localStorage writes and returns one-time credentials', async () => {
    const res = await ensureEmployeePortalAccount({
      employee: makeEmployee(),
      requestedUsername: 'EMP-2026-0042',
    });

    expect(remote.upsertCalls).toHaveLength(0);
    expect(remote.insertCalls).toHaveLength(1);
    expect(remote.insertCalls[0]).toMatchObject({
      id: 'portal-EMP-2026-0042',
      username: 'EMP-2026-0042',
      employee_id: 'EMP-2026-0042',
      must_change_password: true,
    });
    expect(typeof remote.insertCalls[0].password).toBe('string');
    expect(String(remote.insertCalls[0].password).length).toBeGreaterThanOrEqual(8);

    expect(res.ok).toBe(true);
    if (res.ok === true && res.created === true) {
      expect(res.credentials.username).toBe('EMP-2026-0042');
      expect(res.credentials.password).toBe(remote.insertCalls[0].password);
      expect('password' in res.account).toBe(false);
    } else {
      throw new Error(`Expected created=true, got ${JSON.stringify(res)}`);
    }
    expect(localStorage.getItem(LOCAL_ACCOUNTS_KEY)).toBeNull();
  });

  it('maps a 23505 race to created: false without returning credentials when reread finds the account', async () => {
    remote.insertHandler = () => {
      remote.portalRows.push(
        portalRow({ id: 'winner-id', username: 'winner.user', password: 'WinnerPassword#7' }),
      );
      return { data: null, error: { code: '23505', message: 'duplicate key value' } };
    };

    const res = await ensureEmployeePortalAccount({
      employee: makeEmployee(),
      requestedUsername: 'EMP-2026-0042',
    });

    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.created).toBe(false);
      expect('credentials' in res).toBe(false);
      expect(res.account.id).toBe('winner-id');
      expect(res.account.username).toBe('winner.user');
    }
    expect(remote.portalRows[0].password).toBe('WinnerPassword#7');
  });

  it('maps a 23505 username conflict (when employee_id reread finds nothing) to account_conflict', async () => {
    remote.insertHandler = () => ({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint employee_portal_accounts_username_active_idx' },
    });

    const res = await ensureEmployeePortalAccount({
      employee: makeEmployee(),
      requestedUsername: 'taken.username',
    });

    expect(res).toMatchObject({ ok: false, kind: 'account_conflict' });
  });

  it('resolves lost-response transport errors via bounded metadata reread to created: false or unconfirmed', async () => {
    remote.insertHandler = () => {
      remote.portalRows.push(
        portalRow({ id: 'portal-EMP-2026-0042', username: 'EMP-2026-0042', password: 'CommittedPassword#1' }),
      );
      return Promise.reject(new TypeError('Failed to fetch'));
    };

    const committedRes = await ensureEmployeePortalAccount({
      employee: makeEmployee(),
      requestedUsername: 'EMP-2026-0042',
    });
    expect(committedRes.ok).toBe(true);
    if (committedRes.ok === true) {
      expect(committedRes.created).toBe(false);
      expect('credentials' in committedRes).toBe(false);
    }

    remote.portalRows = [];
    remote.insertHandler = () => Promise.reject(new Error('network timeout'));
    const unconfirmedRes = await ensureEmployeePortalAccount({
      employee: makeEmployee(),
      requestedUsername: 'EMP-2026-0042',
    });
    expect(unconfirmedRes).toMatchObject({ ok: false, kind: 'unconfirmed' });
    expect('credentials' in unconfirmedRes).toBe(false);
  });

  it('maps definite permission/DB failures on insert to unavailable', async () => {
    remote.insertHandler = () => ({
      data: null,
      error: { code: '42501', message: 'permission denied for table employee_portal_accounts' },
    });

    const res = await ensureEmployeePortalAccount({
      employee: makeEmployee(),
      requestedUsername: 'EMP-2026-0042',
    });

    expect(res).toMatchObject({ ok: false, kind: 'unavailable' });
  });
});

describe('createEmployeeNumberAllocator (remote-only)', () => {
  it('queries employees_with_department once, newly_hired, and active employee_portal_accounts, ignoring localStorage', async () => {
    const year = new Date().getFullYear();
    const first = `EMP-${year}-001`;
    const second = `EMP-${year}-002`;
    const third = `EMP-${year}-003`;
    const staleLocal = `EMP-${year}-004`;

    remote.employeeViewRows = [{ employee_id: first }];
    remote.newlyHiredRows = [{ employee_id: second }];
    remote.portalRows = [portalRow({ employee_id: third })];
    localStorage.setItem(
      LOCAL_ACCOUNTS_KEY,
      JSON.stringify([{ employee: { employeeId: staleLocal } }]),
    );

    const { allocate, reserved } = await createEmployeeNumberAllocator();

    expect(reserved.has(first)).toBe(true);
    expect(reserved.has(second)).toBe(true);
    expect(reserved.has(third)).toBe(true);
    expect(reserved.has(staleLocal)).toBe(false);
    expect(allocate()).toBe(staleLocal);

    const employeeViewQueries = remote.portalQueryLog.filter((q) => q.table === 'employees_with_department');
    expect(employeeViewQueries).toHaveLength(1);
    const portalQueries = remote.portalQueryLog.filter((q) => q.table === 'employee_portal_accounts');
    expect(portalQueries).toHaveLength(1);
    expect(portalQueries[0].columns).toBe('employee_id');
  });

  it('throws when any remote allocator query fails', async () => {
    remote.portalSelectErrors['*'] = { code: 'PGRST500', message: 'portal lookup failed' };

    await expect(createEmployeeNumberAllocator()).rejects.toBeDefined();
  });
});
