import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const remote = vi.hoisted(() => ({
  rows: [] as Row[],
  selectError: null as unknown,
  usernameSelectError: null as unknown,
  updateError: null as unknown,
  updateHandler: null as null | ((patch: Row, filters: Array<{ op: string; column: string; value: unknown }>) => { data: Row[] | null; error: unknown } | Promise<{ data: Row[] | null; error: unknown }>),
  selectLog: [] as Array<{ columns: string; filters: Array<{ op: string; column: string; value: unknown }> }>,
  updateLog: [] as Array<{ patch: Row; filters: Array<{ op: string; column: string; value: unknown }> }>,
  insertCalls: [] as unknown[],
  upsertCalls: [] as unknown[],
}));

vi.mock('./supabase', () => {
  const from = (table: string) => {
    if (table !== 'employee_portal_accounts') {
      throw new Error(`Unexpected table ${table}`);
    }

    let mode: 'select' | 'update' = 'select';
    let selectedColumns = '';
    let updatePatch: Row = {};
    const filters: Array<{ op: string; column: string; value: unknown }> = [];

    const matchesFilters = (row: Row) =>
      filters.every((f) => {
        if (f.op === 'is' && f.value === null) return row[f.column] == null;
        if (f.op === 'eq') return String(row[f.column] ?? '') === String(f.value ?? '');
        if (f.op === 'ilike') {
          const expected = String(f.value ?? '').replace(/\\_/g, '_').trim().toLowerCase();
          return String(row[f.column] ?? '').trim().toLowerCase() === expected;
        }
        return true;
      });

    const execute = async () => {
      if (mode === 'select') {
        remote.selectLog.push({ columns: selectedColumns, filters: [...filters] });
        const hasUsernameIlike = filters.some((f) => f.op === 'ilike' && f.column === 'username');
        if (hasUsernameIlike && remote.usernameSelectError) {
          return { data: null, error: remote.usernameSelectError };
        }
        if (remote.selectError) {
          return { data: null, error: remote.selectError };
        }
        return { data: remote.rows.filter(matchesFilters).map((r) => ({ ...r })), error: null };
      }

      remote.updateLog.push({ patch: { ...updatePatch }, filters: [...filters] });
      if (remote.updateHandler) {
        return await remote.updateHandler(updatePatch, [...filters]);
      }
      if (remote.updateError) {
        return { data: null, error: remote.updateError };
      }
      const matched = remote.rows.filter(matchesFilters);
      for (const row of matched) {
        Object.assign(row, updatePatch);
      }
      return { data: matched.map((r) => ({ ...r })), error: null };
    };

    const chain: any = {
      select: (cols: string) => {
        selectedColumns = cols;
        return chain;
      },
      update: (patch: Row) => {
        mode = 'update';
        updatePatch = { ...patch };
        return chain;
      },
      insert: (payload: unknown) => {
        remote.insertCalls.push(payload);
        return chain;
      },
      upsert: (payload: unknown) => {
        remote.upsertCalls.push(payload);
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value });
        return chain;
      },
      ilike: (column: string, value: unknown) => {
        filters.push({ op: 'ilike', column, value });
        return chain;
      },
      is: (column: string, value: unknown) => {
        filters.push({ op: 'is', column, value });
        return chain;
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        execute().then(onFulfilled, onRejected),
    };

    return chain;
  };

  return { supabase: { from }, isMockModeEnabled: false };
});

import * as portalData from './employeePortalData';

const changeEmployeePortalPassword = (portalData as any).changeEmployeePortalPassword as (
  target: { accountId: string; employeeNumber: string; expectedRevision: string },
  currentPassword: string,
  newPassword: string,
) => Promise<any>;

const changeEmployeePortalUsername = (portalData as any).changeEmployeePortalUsername as (
  target: { accountId: string; employeeNumber: string; expectedRevision: string },
  newUsername: string,
) => Promise<any>;

const RAW_MICROS_REV = '2026-11-19T12:00:00.123456+00:00';
const LOCAL_ACCOUNTS_KEY = 'cictrix_employee_portal_accounts';

const makeRow = (overrides: Row = {}): Row => ({
  id: 'acct-maria-1',
  username: 'maria.santos',
  password: 'Current#Pass1',
  employee_id: 'EMP-2026-001',
  full_name: 'Maria Santos',
  email: 'maria.santos@example.gov.ph',
  mobile_number: '09171234567',
  created_at: '2026-11-01T00:00:00.000000+00:00',
  updated_at: RAW_MICROS_REV,
  deleted_at: null,
  must_change_password: true,
  ...overrides,
});

const defaultTarget = (overrides: Partial<{ accountId: string; employeeNumber: string; expectedRevision: string }> = {}) => ({
  accountId: 'acct-maria-1',
  employeeNumber: 'EMP-2026-001',
  expectedRevision: RAW_MICROS_REV,
  ...overrides,
});

beforeEach(() => {
  remote.rows = [makeRow()];
  remote.selectError = null;
  remote.usernameSelectError = null;
  remote.updateError = null;
  remote.updateHandler = null;
  remote.selectLog = [];
  remote.updateLog = [];
  remote.insertCalls = [];
  remote.upsertCalls = [];
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('changeEmployeePortalPassword & changeEmployeePortalUsername (Credential Task 2)', () => {
  it('validates target fields and password/username constraints without remote writes', async () => {
    expect(
      await changeEmployeePortalPassword(defaultTarget({ accountId: '  ' }), 'Current#Pass1', 'NewValid#2'),
    ).toMatchObject({ ok: false, kind: 'validation' });

    expect(
      await changeEmployeePortalPassword(defaultTarget({ expectedRevision: 'not-a-timestamp' }), 'Current#Pass1', 'NewValid#2'),
    ).toMatchObject({ ok: false, kind: 'validation' });

    expect(
      await changeEmployeePortalPassword(defaultTarget(), 'Current#Pass1', 'short'),
    ).toMatchObject({ ok: false, kind: 'validation' });

    expect(
      await changeEmployeePortalPassword(defaultTarget(), 'Current#Pass1', 'Current#Pass1'),
    ).toMatchObject({ ok: false, kind: 'validation' });

    expect(
      await changeEmployeePortalUsername(defaultTarget(), 'ab'),
    ).toMatchObject({ ok: false, kind: 'validation' });

    expect(
      await changeEmployeePortalUsername(defaultTarget(), 'bad username!'),
    ).toMatchObject({ ok: false, kind: 'validation' });

    expect(remote.updateLog).toHaveLength(0);
  });

  it('updates password with exact microsecond expectedRevision filter and +2ms monotonic updated_at advance even when Date.now() is behind', async () => {
    // Clock is 10 seconds behind the row's updated_at timestamp.
    const behindNow = Date.parse('2026-11-19T11:59:50.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(behindNow);

    const res = await changeEmployeePortalPassword(defaultTarget(), 'Current#Pass1', 'NewPass#99');

    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.account.id).toBe('acct-maria-1');
      expect(res.account.mustChangePassword).toBe(false);
      expect('password' in res.account).toBe(false);
      expect(Date.parse(res.account.updatedAt)).toBe(Date.parse(RAW_MICROS_REV) + 2);
    }

    expect(remote.updateLog).toHaveLength(1);
    const updateEntry = remote.updateLog[0];
    expect(updateEntry.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'id', value: 'acct-maria-1' },
        { op: 'eq', column: 'employee_id', value: 'EMP-2026-001' },
        { op: 'eq', column: 'username', value: 'maria.santos' },
        { op: 'eq', column: 'updated_at', value: RAW_MICROS_REV },
        { op: 'is', column: 'deleted_at', value: null },
      ]),
    );
    // Password is never placed in URL filters
    expect(remote.selectLog.every((s) => s.filters.every((f) => f.column !== 'password'))).toBe(true);
    expect(updateEntry.filters.every((f) => f.column !== 'password')).toBe(true);
    expect(updateEntry.patch).toMatchObject({
      password: 'NewPass#99',
      must_change_password: false,
    });
    expect(localStorage.getItem(LOCAL_ACCOUNTS_KEY)).toBeNull();
  });

  it('rejects wrong current password or stale localStorage password without writing', async () => {
    localStorage.setItem(
      LOCAL_ACCOUNTS_KEY,
      JSON.stringify([{ id: 'acct-maria-1', username: 'maria.santos', password: 'StaleCached#1' }]),
    );

    const res = await changeEmployeePortalPassword(defaultTarget(), 'StaleCached#1', 'NewValid#2');
    expect(res).toMatchObject({ ok: false, kind: 'invalid_credentials' });
    expect(remote.updateLog).toHaveLength(0);
    expect(remote.rows[0].password).toBe('Current#Pass1');
  });

  it('never switches to another employee who took the former username while the form was open', async () => {
    remote.rows = [
      makeRow({ id: 'acct-maria-1', username: 'maria.renamed', employee_id: 'EMP-2026-001', password: 'Current#Pass1' }),
      makeRow({ id: 'acct-other-2', username: 'maria.santos', employee_id: 'EMP-2026-999', password: 'Current#Pass1' }),
    ];

    const res = await changeEmployeePortalPassword(
      defaultTarget({ accountId: 'acct-maria-1', employeeNumber: 'EMP-2026-999' }),
      'Current#Pass1',
      'NewValid#2',
    );
    expect(res).toMatchObject({ ok: false, kind: 'account_unavailable' });
    expect(remote.updateLog).toHaveLength(0);
    expect(remote.rows[1].password).toBe('Current#Pass1');
  });

  it('rejects a stale revision before writing and when a concurrent update wins the CAS race', async () => {
    const staleBeforeWrite = await changeEmployeePortalPassword(
      defaultTarget({ expectedRevision: '2026-11-19T11:00:00.000000+00:00' }),
      'Current#Pass1',
      'NewValid#2',
    );
    expect(staleBeforeWrite).toMatchObject({ ok: false, kind: 'conflict' });
    expect(remote.updateLog).toHaveLength(0);

    // Concurrent race after read: update returns 0 rows
    remote.updateHandler = () => ({ data: [], error: null });
    const casConflict = await changeEmployeePortalPassword(defaultTarget(), 'Current#Pass1', 'NewValid#2');
    expect(casConflict).toMatchObject({ ok: false, kind: 'conflict' });
    expect(remote.insertCalls).toHaveLength(0);
    expect(remote.upsertCalls).toHaveLength(0);
  });

  it('recovers from a lost update response via one bounded readback by accountId and never promises old password works when unconfirmed', async () => {
    // 1. Committed on server before response dropped
    remote.updateHandler = (patch) => {
      Object.assign(remote.rows[0], patch);
      return Promise.reject(new TypeError('Failed to fetch'));
    };

    const committed = await changeEmployeePortalPassword(defaultTarget(), 'Current#Pass1', 'Committed#Pass2');
    expect(committed.ok).toBe(true);
    if (committed.ok === true) {
      expect(committed.account.mustChangePassword).toBe(false);
    }
    expect(remote.updateLog).toHaveLength(1);

    // 2. Pre-commit drop (row still at expectedRevision) -> unconfirmed, never claims old password still works
    remote.rows = [makeRow()];
    remote.updateLog = [];
    remote.updateHandler = () => Promise.reject(new Error('network timeout'));

    const unconfirmed = await changeEmployeePortalPassword(defaultTarget(), 'Current#Pass1', 'Maybe#Pass3');
    expect(unconfirmed).toMatchObject({ ok: false, kind: 'unconfirmed' });
    expect(unconfirmed.error).not.toMatch(/old password (still|remains)/i);
    expect(remote.updateLog).toHaveLength(1);
  });

  it('changes username with case-insensitive collision check, 23505 mapping, and untouched must_change_password', async () => {
    remote.rows = [
      makeRow({ id: 'acct-maria-1', username: 'maria.santos', must_change_password: true }),
      makeRow({ id: 'acct-juan-2', username: 'juan.delacruz', employee_id: 'EMP-2026-002' }),
    ];

    const sameUsername = await changeEmployeePortalUsername(defaultTarget(), 'MARIA.SANTOS');
    expect(sameUsername).toMatchObject({ ok: false, kind: 'validation' });

    const takenUsername = await changeEmployeePortalUsername(defaultTarget(), 'Juan.DelaCruz');
    expect(takenUsername).toMatchObject({ ok: false, kind: 'username_taken' });
    expect(remote.updateLog).toHaveLength(0);

    // 23505 on update
    remote.updateHandler = () => ({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const raceTaken = await changeEmployeePortalUsername(defaultTarget(), 'maria.new');
    expect(raceTaken).toMatchObject({ ok: false, kind: 'username_taken' });

    // Clean update preserves must_change_password: true
    remote.updateHandler = null;
    const okRes = await changeEmployeePortalUsername(defaultTarget(), 'maria.new');
    expect(okRes.ok).toBe(true);
    if (okRes.ok === true) {
      expect(okRes.account.username).toBe('maria.new');
      expect(okRes.account.mustChangePassword).toBe(true);
    }
  });
});

describe('targeted obsolete-credential cache eviction (Credential Task 4)', () => {
  it('evicts only matching account entries from cictrix_employee_portal_accounts after confirmed remote mutations and preserves unrelated entries/keys', async () => {
    localStorage.setItem('unrelated_user_pref', 'keep-me');
    localStorage.setItem(
      LOCAL_ACCOUNTS_KEY,
      JSON.stringify([
        {
          id: 'acct-maria-1',
          username: 'maria.santos',
          password: 'OldCachedPassword#1',
          employee: { employeeId: 'EMP-2026-001' },
        },
        {
          id: 'acct-other-2',
          username: 'juan.delacruz',
          password: 'OtherCachedPassword#2',
          employee: { employeeId: 'EMP-2026-002' },
        },
      ]),
    );

    const res = await changeEmployeePortalPassword(defaultTarget(), 'Current#Pass1', 'NewFresh#Pass2');
    expect(res.ok).toBe(true);

    const remaining = JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY) ?? '[]');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('acct-other-2');
    expect(remaining[0].username).toBe('juan.delacruz');
    expect(localStorage.getItem('unrelated_user_pref')).toBe('keep-me');
    expect(JSON.stringify(remaining)).not.toContain('NewFresh#Pass2');
  });

  it('removes cictrix_employee_portal_accounts cleanly when empty and ignores localStorage exceptions', async () => {
    localStorage.setItem(
      LOCAL_ACCOUNTS_KEY,
      JSON.stringify([
        {
          id: 'acct-maria-1',
          username: 'maria.santos',
          password: 'OldCachedPassword#1',
          employee: { employeeId: 'EMP-2026-001' },
        },
      ]),
    );

    const renameRes = await changeEmployeePortalUsername(defaultTarget(), 'maria.renamed');
    expect(renameRes.ok).toBe(true);
    expect(localStorage.getItem(LOCAL_ACCOUNTS_KEY)).toBeNull();

    // Storage throwing must not turn confirmed remote success into failure
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceeded', 'QuotaExceededError');
    });

    const pwRes = await changeEmployeePortalPassword(
      {
        accountId: 'acct-maria-1',
        employeeNumber: 'EMP-2026-001',
        expectedRevision: renameRes.account.updatedAt,
      },
      'Current#Pass1',
      'NewAfterStorageErr#3',
    );
    expect(pwRes.ok).toBe(true);
  });
});
