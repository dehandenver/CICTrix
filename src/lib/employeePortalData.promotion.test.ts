import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const remote = vi.hoisted(() => ({
  rows: [] as Row[],
  failures: {} as Record<string, unknown>,
  queries: [] as Array<{ column: string; value: string }>,
  isFilters: [] as Array<{ column: string; value: unknown }>,
}));

vi.mock('./supabase', () => {
  const builder = () => {
    const filters: Array<{ column: string; value: string }> = [];
    // The production `is('deleted_at', null)` filter is recorded but not
    // enforced here: a permissive policy must still be defended against when
    // it returns a soft-deleted row.
    const result = () => ({
      data: remote.rows.filter((row) =>
        filters.every((filter) => {
          const expected = filter.value.replace(/\\_/g, '_');
          return String(row[filter.column] ?? '').trim().toLowerCase() === expected;
        }),
      ),
      error: null,
    });

    const query: any = {
      select: () => query,
      ilike: (column: string, value: string) => {
        remote.queries.push({ column, value });
        const failure = remote.failures[column];
        if (failure) return Promise.resolve({ data: null, error: failure });
        filters.push({ column, value: String(value).trim().toLowerCase() });
        return query;
      },
      is: (column: string, value: unknown) => {
        remote.isFilters.push({ column, value });
        return query;
      },
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(onFulfilled, onRejected),
    };
    return query;
  };

  return { supabase: { from: () => builder() } };
});

import {
  PROMOTIONAL_AUTH_ERROR,
  authenticatePromotionalEmployee,
} from './employeePortalData';

const LOCAL_ACCOUNTS_KEY = 'cictrix_employee_portal_accounts';

const accountRow = (overrides: Row = {}): Row => ({
  id: 'account-maria',
  username: 'maria.santos',
  password: 'Correct#123',
  employee_id: 'EMP-2024-001',
  full_name: 'Maria Santos',
  email: 'maria.santos@example.gov.ph',
  mobile_number: '+63-900-000-0000',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  ...overrides,
});

const localAccount = (overrides: Record<string, unknown> = {}) => ({
  id: 'account-maria',
  username: 'maria.santos',
  password: 'OldPass#1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  employee: {
    employeeId: 'EMP-2024-001',
    fullName: 'Maria Santos',
    email: 'maria.santos@example.gov.ph',
    mobileNumber: '+63-900-000-0000',
    dateOfBirth: '',
    age: 0,
    gender: 'Other',
    civilStatus: 'Single',
    nationality: '',
    homeAddress: '',
    emergencyContactName: '',
    emergencyRelationship: '',
    emergencyContactNumber: '',
    sssNumber: '',
    philhealthNumber: '',
    pagibigNumber: '',
    tinNumber: '',
  },
  ...overrides,
});

beforeEach(() => {
  remote.rows = [accountRow()];
  remote.failures = {};
  remote.queries = [];
  remote.isFilters = [];
  localStorage.clear();
  sessionStorage.clear();
});

describe('authenticatePromotionalEmployee', () => {
  it('resolves the same remote account by username or employee number with an empty local cache', async () => {
    expect(localStorage.getItem(LOCAL_ACCOUNTS_KEY)).toBeNull();

    const byUsername = await authenticatePromotionalEmployee('Maria.Santos', 'Correct#123');
    const byEmployeeNumber = await authenticatePromotionalEmployee(' EMP-2024-001 ', 'Correct#123');

    expect(byUsername.ok).toBe(true);
    expect(byUsername.error).toBeUndefined();
    expect(byUsername.account).toMatchObject({ id: 'account-maria', username: 'maria.santos' });
    expect(byUsername.account?.employee.employeeId).toBe('EMP-2024-001');

    expect(byEmployeeNumber.ok).toBe(true);
    expect(byEmployeeNumber.error).toBeUndefined();
    expect(byEmployeeNumber.account).toMatchObject({ id: 'account-maria', username: 'maria.santos' });
    expect(byEmployeeNumber.account?.employee.employeeId).toBe('EMP-2024-001');

    // Only the two targeted lookups ran: username and employee_id. No roster scan.
    expect(remote.queries.map((entry) => entry.column).sort()).toEqual([
      'employee_id',
      'employee_id',
      'username',
      'username',
    ]);
    // Every account read explicitly excludes soft-deleted rows rather than
    // relying on RLS to hide them.
    expect(remote.isFilters).toHaveLength(remote.queries.length);
    expect(
      remote.isFilters.every((filter) => filter.column === 'deleted_at' && filter.value === null),
    ).toBe(true);
    // A successful remote login never seeds the legacy browser cache.
    expect(localStorage.getItem(LOCAL_ACCOUNTS_KEY)).toBeNull();
  });

  it('requires an exact password match against the current remote account', async () => {
    const result = await authenticatePromotionalEmployee('maria.santos', 'correct#123');

    expect(result).toEqual({ ok: false, error: PROMOTIONAL_AUTH_ERROR.INVALID_CREDENTIALS });
    expect(result.account).toBeUndefined();
  });

  it('rejects an account deleted remotely even when its password is cached locally', async () => {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify([localAccount()]));
    remote.rows = [];

    const result = await authenticatePromotionalEmployee('maria.santos', 'OldPass#1');

    expect(result).toEqual({ ok: false, error: PROMOTIONAL_AUTH_ERROR.INVALID_CREDENTIALS });
    expect(localStorage.getItem(LOCAL_ACCOUNTS_KEY)).toContain('OldPass#1');
  });

  it('rejects a soft-deleted row returned by a permissive policy even with a stale local cache', async () => {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify([localAccount()]));
    remote.rows = [accountRow({ deleted_at: '2026-10-01T00:00:00.000Z' })];

    const result = await authenticatePromotionalEmployee('maria.santos', 'Correct#123');

    expect(result).toEqual({ ok: false, error: PROMOTIONAL_AUTH_ERROR.INVALID_CREDENTIALS });
    expect(result.account).toBeUndefined();
    expect(localStorage.getItem(LOCAL_ACCOUNTS_KEY)).toContain('OldPass#1');
    // The request asked for active rows too; the defensive row check is what
    // rejects this leaked soft-deleted row.
    expect(remote.isFilters).toHaveLength(remote.queries.length);
  });

  it('escapes a literal underscore in the request while keeping matches case-insensitive', async () => {
    remote.rows = [accountRow({ username: 'maria_santos', employee_id: 'EMP_2024_001' })];

    const byUsername = await authenticatePromotionalEmployee('Maria_Santos', 'Correct#123');
    const byEmployeeNumber = await authenticatePromotionalEmployee(' emp_2024_001 ', 'Correct#123');

    expect(byUsername.ok).toBe(true);
    expect(byUsername.account?.id).toBe('account-maria');
    expect(byEmployeeNumber.ok).toBe(true);
    expect(byEmployeeNumber.account?.id).toBe('account-maria');

    expect(remote.queries.map((entry) => entry.value)).toEqual([
      'maria\\_santos',
      'maria\\_santos',
      'emp\\_2024\\_001',
      'emp\\_2024\\_001',
    ]);
    expect(remote.queries.every((entry) => entry.value.includes('\\_'))).toBe(true);
  });

  it('rejects ILIKE/PostgREST wildcard identifiers without a remote read', async () => {
    for (const identifier of ['maria%santos', 'maria*santos', 'maria\\santos']) {
      expect(await authenticatePromotionalEmployee(identifier, 'Correct#123')).toEqual({
        ok: false,
        error: PROMOTIONAL_AUTH_ERROR.INVALID_CREDENTIALS,
      });
    }
    expect(remote.queries).toEqual([]);
  });

  it.each([null, '   '])(
    'rejects a successfully authenticated account without a usable employee number (%s)',
    async (employeeId) => {
      remote.rows = [accountRow({ employee_id: employeeId })];

      const result = await authenticatePromotionalEmployee('maria.santos', 'Correct#123');

      expect(result).toEqual({
        ok: false,
        error: PROMOTIONAL_AUTH_ERROR.MISSING_EMPLOYEE_NUMBER,
      });
      expect(result.account).toBeUndefined();
    },
  );

  it('rejects an identifier matched by two different remote accounts', async () => {
    remote.rows = [
      accountRow(),
      accountRow({
        id: 'account-other',
        username: 'emp-2024-001',
        employee_id: 'EMP-9999-001',
        email: 'other.employee@example.gov.ph',
      }),
    ];

    const result = await authenticatePromotionalEmployee('EMP-2024-001', 'Correct#123');

    expect(result).toEqual({ ok: false, error: PROMOTIONAL_AUTH_ERROR.AMBIGUOUS_ACCOUNT });
    expect(result.account).toBeUndefined();
  });

  it.each(['username', 'employee_id'])(
    'reports a failed remote %s read as unavailable, not invalid credentials',
    async (column) => {
      remote.failures[column] = new Error('network unavailable');

      const result = await authenticatePromotionalEmployee('maria.santos', 'Correct#123');

      expect(result).toEqual({ ok: false, error: PROMOTIONAL_AUTH_ERROR.LOOKUP_UNAVAILABLE });
      expect(result.account).toBeUndefined();
    },
  );

  it('never authenticates with a stale local password after the remote password changes', async () => {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify([localAccount()]));
    remote.rows = [accountRow({ password: 'NewPass#2' })];

    const stale = await authenticatePromotionalEmployee('maria.santos', 'OldPass#1');
    expect(stale).toEqual({ ok: false, error: PROMOTIONAL_AUTH_ERROR.INVALID_CREDENTIALS });
    expect(stale.account).toBeUndefined();

    const current = await authenticatePromotionalEmployee('maria.santos', 'NewPass#2');
    expect(current.ok).toBe(true);
    expect(current.account?.id).toBe('account-maria');

    // The stale browser copy is neither trusted nor rewritten.
    expect(localStorage.getItem(LOCAL_ACCOUNTS_KEY)).toContain('OldPass#1');
  });

  it('rejects blank credentials without contacting the remote service', async () => {
    expect(await authenticatePromotionalEmployee('   ', 'Correct#123')).toEqual({
      ok: false,
      error: PROMOTIONAL_AUTH_ERROR.INVALID_CREDENTIALS,
    });
    expect(await authenticatePromotionalEmployee('maria.santos', '')).toEqual({
      ok: false,
      error: PROMOTIONAL_AUTH_ERROR.INVALID_CREDENTIALS,
    });
    expect(remote.queries).toEqual([]);
  });
});
