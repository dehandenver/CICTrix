import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const remote = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; params: Record<string, unknown> }>,
  rpcHandler: null as null | ((fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> | { data: unknown; error: unknown }),
  accountRows: [] as Row[],
  resetAuditRows: [] as Row[],
  accountSelectCols: [] as string[],
  resetSelectCols: [] as string[],
  accountReadError: null as unknown,
  resetReadError: null as unknown,
}));

vi.mock('./supabase', () => {
  const from = (table: string) => {
    const filters: Array<{ op: 'eq' | 'is'; column: string; value: unknown }> = [];

    const matchRows = (rows: Row[]) =>
      rows.filter((r) =>
        filters.every((f) => {
          if (f.op === 'is' && f.value === null) return r[f.column] == null;
          if (f.op === 'eq') return String(r[f.column] ?? '') === String(f.value ?? '');
          return true;
        }),
      );

    const chain: any = {
      select: (columns: string) => {
        if (table === 'employee_portal_accounts') remote.accountSelectCols.push(columns);
        if (table === 'employee_password_resets') remote.resetSelectCols.push(columns);
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value });
        return chain;
      },
      is: (column: string, value: unknown) => {
        filters.push({ op: 'is', column, value });
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
        const res =
          table === 'employee_portal_accounts'
            ? remote.accountReadError
              ? { data: null, error: remote.accountReadError }
              : { data: matchRows(remote.accountRows), error: null }
            : table === 'employee_password_resets'
              ? remote.resetReadError
                ? { data: null, error: remote.resetReadError }
                : { data: matchRows(remote.resetAuditRows), error: null }
              : { data: [], error: null };
        return Promise.resolve(res).then(onFulfilled, onRejected);
      },
    };
    return chain;
  };

  const rpc = async (fn: string, params: Record<string, unknown>) => {
    remote.rpcCalls.push({ fn, params });
    if (remote.rpcHandler) {
      return await remote.rpcHandler(fn, params);
    }
    return { data: null, error: null };
  };

  return { supabase: { from, rpc }, isMockModeEnabled: false };
});

import * as portalData from './employeePortalData';

const resetEmployeePortalPassword = (portalData as any).resetEmployeePortalPassword as (target: {
  accountId: string;
  employeeNumber: string;
  expectedRevision: string;
}) => Promise<any>;

const RAW_REV = '2026-11-20T08:00:00.123456+00:00';
const LOCAL_ACCOUNTS_KEY = 'cictrix_employee_portal_accounts';

const makeTarget = (overrides: Partial<{ accountId: string; employeeNumber: string; expectedRevision: string }> = {}) => ({
  accountId: 'acct-custom-9',
  employeeNumber: 'EMP-2026-0042',
  expectedRevision: RAW_REV,
  ...overrides,
});

const makeAccountRow = (overrides: Row = {}): Row => ({
  id: 'acct-custom-9',
  username: 'maria.custom',
  employee_id: 'EMP-2026-0042',
  full_name: 'Maria Santos',
  email: 'maria@example.gov.ph',
  mobile_number: '09171234567',
  created_at: '2026-01-01T00:00:00.000000+00:00',
  updated_at: RAW_REV,
  deleted_at: null,
  must_change_password: false,
  ...overrides,
});

beforeEach(() => {
  remote.rpcCalls = [];
  remote.rpcHandler = null;
  remote.accountRows = [makeAccountRow()];
  remote.resetAuditRows = [];
  remote.accountSelectCols = [];
  remote.resetSelectCols = [];
  remote.accountReadError = null;
  remote.resetReadError = null;
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resetEmployeePortalPassword (Credential Task 4)', () => {
  it('rejects invalid targets without generating a password or calling the RPC', async () => {
    expect(typeof resetEmployeePortalPassword).toBe('function');

    const badId = await resetEmployeePortalPassword(makeTarget({ accountId: '  ' }));
    const badEmp = await resetEmployeePortalPassword(makeTarget({ employeeNumber: '' }));
    const badRev = await resetEmployeePortalPassword(makeTarget({ expectedRevision: 'bad-date' }));

    expect(badId).toMatchObject({ ok: false, kind: 'account_unavailable' });
    expect(badEmp).toMatchObject({ ok: false, kind: 'account_unavailable' });
    expect(badRev).toMatchObject({ ok: false, kind: 'account_unavailable' });
    expect(remote.rpcCalls).toHaveLength(0);
  });

  it('calls reset_employee_portal_password with p_request_id, preserves username, evicts obsolete cache, and never logs password', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(
      LOCAL_ACCOUNTS_KEY,
      JSON.stringify([
        { id: 'acct-custom-9', username: 'maria.custom', password: 'OldCachedPassword#1', employee: { employeeId: 'EMP-2026-0042' } },
        { id: 'acct-other', username: 'juan.other', password: 'OtherPassword#2', employee: { employeeId: 'EMP-2026-9999' } },
      ]),
    );

    const newRev = '2026-11-20T09:00:00.000000+00:00';
    remote.rpcHandler = (_fn, params) => ({
      data: {
        account_id: params.p_account_id,
        employee_number: params.p_employee_number,
        username: 'maria.custom',
        updated_at: newRev,
        must_change_password: true,
      },
      error: null,
    });

    const res = await resetEmployeePortalPassword(makeTarget());

    expect(remote.rpcCalls).toHaveLength(1);
    const call = remote.rpcCalls[0];
    expect(call.fn).toBe('reset_employee_portal_password');
    expect(call.params).toMatchObject({
      p_account_id: 'acct-custom-9',
      p_employee_number: 'EMP-2026-0042',
      p_expected_updated_at: RAW_REV,
    });
    expect(call.params.p_actor_user_id).toBeUndefined();
    expect(typeof call.params.p_request_id).toBe('string');
    expect(String(call.params.p_request_id).length).toBeGreaterThanOrEqual(32);
    expect(typeof call.params.p_new_password).toBe('string');
    expect(String(call.params.p_new_password).length).toBeGreaterThanOrEqual(8);

    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.account.id).toBe('acct-custom-9');
      expect(res.account.username).toBe('maria.custom');
      expect(res.account.mustChangePassword).toBe(true);
      expect(res.account.updatedAt).toBe(newRev);
      expect('password' in res.account).toBe(false);
      expect(res.credentials).toEqual({
        username: 'maria.custom',
        password: call.params.p_new_password,
      });
    }

    const remainingCache = JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY) ?? '[]');
    expect(remainingCache).toHaveLength(1);
    expect(remainingCache[0].id).toBe('acct-other');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: 'P0002', hint: 'account_not_found', message: 'not found' }, 'account_unavailable'],
    [{ code: '22023', hint: 'identity_mismatch', message: 'mismatch' }, 'account_unavailable'],
    [{ code: '22023', hint: 'invalid_password', message: 'short' }, 'validation'],
    [{ code: '40001', hint: 'revision_conflict', message: 'conflict' }, 'conflict'],
    [{ code: '23505', hint: 'duplicate_request_id', message: 'duplicate' }, 'conflict'],
    [{ code: '42501', hint: 'not_authorized', message: 'forbidden' }, 'unavailable'],
    [{ code: 'PGRST202', message: 'function not found' }, 'unavailable'],
    [{ code: '42883', message: 'undefined function' }, 'unavailable'],
  ] as const)('maps definite RPC failure %o to kind=%s with zero credentials', async (rpcError, expectedKind) => {
    remote.rpcHandler = () => ({ data: null, error: rpcError });

    const res = await resetEmployeePortalPassword(makeTarget());

    expect(res).toMatchObject({ ok: false, kind: expectedKind });
    expect('credentials' in res).toBe(false);
    expect(remote.rpcCalls).toHaveLength(1);
  });

  it('recovers a dropped RPC response via (account_id, request_id) + metadata-only account check without reading password or retrying RPC', async () => {
    const newRev = '2026-11-20T09:10:00.000000+00:00';
    remote.rpcHandler = (_fn, params) => {
      remote.resetAuditRows.push({
        id: 'audit-1',
        account_id: 'acct-custom-9',
        employee_username: 'maria.custom',
        employee_number: 'EMP-2026-0042',
        reset_at: newRev,
        request_id: params.p_request_id,
      });
      remote.accountRows[0] = makeAccountRow({ updated_at: newRev, must_change_password: true });
      return Promise.reject(new TypeError('Failed to fetch'));
    };

    const res = await resetEmployeePortalPassword(makeTarget());

    expect(remote.rpcCalls).toHaveLength(1);
    expect(remote.accountSelectCols.every((c) => !/\bpassword\b/i.test(c.replace(/must_change_password/gi, '')))).toBe(true);
    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.credentials.username).toBe('maria.custom');
      expect(res.credentials.password).toBe(remote.rpcCalls[0].params.p_new_password);
      expect(res.account.updatedAt).toBe(newRev);
    }
  });

  it('returns conflict when dropped-response audit row is absent and updated_at advanced, or unconfirmed otherwise', async () => {
    // 1. Audit row absent, but another actor advanced updated_at
    remote.rpcHandler = () => {
      remote.accountRows[0] = makeAccountRow({ updated_at: '2026-11-20T09:20:00.000000+00:00' });
      return Promise.reject(new Error('network timeout'));
    };
    const conflictRes = await resetEmployeePortalPassword(makeTarget());
    expect(conflictRes).toMatchObject({ ok: false, kind: 'conflict' });
    expect('credentials' in conflictRes).toBe(false);

    // 2. Audit row absent and revision unchanged -> unconfirmed
    remote.rpcHandler = () => Promise.reject(new Error('network timeout'));
    remote.accountRows[0] = makeAccountRow({ updated_at: RAW_REV });
    const unconfirmedRes = await resetEmployeePortalPassword(makeTarget());
    expect(unconfirmedRes).toMatchObject({ ok: false, kind: 'unconfirmed' });
    expect('credentials' in unconfirmedRes).toBe(false);
    expect(unconfirmedRes.error).not.toMatch(/old password (still|remains)/i);
  });
});
