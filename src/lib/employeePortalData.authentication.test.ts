import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const remote = vi.hoisted(() => ({
  rows: [] as Row[],
  queryError: null as { code?: string; message: string } | null,
  throwError: null as Error | null,
  selectProjections: [] as string[],
  ilikeCalls: [] as Array<{ column: string; value: string }>,
  inCalls: [] as Array<{ column: string; values: unknown[] }>,
  isCalls: [] as Array<{ column: string; value: unknown }>,
}));

vi.mock('./supabase', () => {
  const builder = () => {
    const ilikeFilters: Array<{ column: string; value: string }> = [];
    let inFilter: { column: string; values: string[] } | null = null;

    const execute = async () => {
      if (remote.throwError) throw remote.throwError;
      if (remote.queryError) return { data: null, error: remote.queryError };

      // Intentionally do not filter `deleted_at` in the fake so tests verify
      // that the service defends against permissive policies returning soft-deleted rows.
      const matched = remote.rows.filter((row) => {
        const ilikeOk = ilikeFilters.every((f) => {
          const expected = f.value.replace(/\\_/g, '_').toLowerCase();
          return String(row[f.column] ?? '').trim().toLowerCase() === expected;
        });
        const inOk =
          inFilter === null ||
          inFilter.values.includes(String(row[inFilter.column] ?? '').trim().toLowerCase());
        return ilikeOk && inOk;
      });

      return { data: matched, error: null };
    };

    const query: any = {
      select: (projection: string) => {
        remote.selectProjections.push(projection);
        return query;
      },
      is: (column: string, value: unknown) => {
        remote.isCalls.push({ column, value });
        return query;
      },
      ilike: (column: string, value: string) => {
        remote.ilikeCalls.push({ column, value });
        ilikeFilters.push({ column, value });
        return query;
      },
      in: (column: string, values: unknown[]) => {
        remote.inCalls.push({ column, values });
        inFilter = {
          column,
          values: values.map((v) => String(v ?? '').trim().toLowerCase()),
        };
        return query;
      },
      order: () => query,
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        execute().then(onFulfilled, onRejected),
    };
    return query;
  };

  return { supabase: { from: () => builder() } };
});

import * as portalData from './employeePortalData';

const LOCAL_ACCOUNTS_KEY = 'cictrix_employee_portal_accounts';
const RAW_UPDATED_AT = '2026-11-20T08:15:30.123456+00:00';

const makeRemoteRow = (overrides: Row = {}): Row => ({
  id: 'portal-EMP-2026-001',
  username: 'maria_santos',
  password: 'Exact#Pass 123',
  employee_id: 'EMP-2026-001',
  full_name: 'Maria Santos',
  email: 'maria.santos@example.gov.ph',
  mobile_number: '09171234567',
  created_at: '2026-11-01T00:00:00.000000+00:00',
  updated_at: RAW_UPDATED_AT,
  deleted_at: null,
  must_change_password: false,
  ...overrides,
});

const seedLocalCache = (password = 'StaleLocalPass#9') => {
  localStorage.setItem(
    LOCAL_ACCOUNTS_KEY,
    JSON.stringify([
      {
        id: 'portal-EMP-2026-001',
        username: 'maria_santos',
        password,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
        mustChangePassword: false,
        employee: {
          employeeId: 'EMP-2026-001',
          fullName: 'Maria Santos',
          email: 'maria.santos@example.gov.ph',
        },
      },
    ]),
  );
};

describe('authenticateEmployeePortalAccount', () => {
  beforeEach(() => {
    localStorage.clear();
    remote.rows = [makeRemoteRow()];
    remote.queryError = null;
    remote.throwError = null;
    remote.selectProjections = [];
    remote.ilikeCalls = [];
    remote.inCalls = [];
    remote.isCalls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('authenticates active remote credentials with empty browser storage and strips password from public identity', async () => {
    const authenticate = (portalData as any).authenticateEmployeePortalAccount;
    expect(typeof authenticate).toBe('function');

    const result = await authenticate('  MARIA_SANTOS ', 'Exact#Pass 123');

    expect(result).toEqual({
      ok: true,
      account: {
        id: 'portal-EMP-2026-001',
        username: 'maria_santos',
        updatedAt: RAW_UPDATED_AT,
        mustChangePassword: false,
        employee: expect.objectContaining({
          employeeId: 'EMP-2026-001',
          fullName: 'Maria Santos',
          email: 'maria.santos@example.gov.ph',
          mobileNumber: '09171234567',
        }),
      },
    });
    expect('password' in result.account).toBe(false);
    expect(remote.ilikeCalls).toEqual([{ column: 'username', value: 'maria\\_santos' }]);
    expect(remote.isCalls).toContainEqual({ column: 'deleted_at', value: null });
  });

  it('maps durable must_change_password=true and treats missing boolean column as lookup_unavailable', async () => {
    const authenticate = (portalData as any).authenticateEmployeePortalAccount;
    expect(typeof authenticate).toBe('function');

    remote.rows = [makeRemoteRow({ must_change_password: true })];
    const first = await authenticate('maria_santos', 'Exact#Pass 123');
    expect(first.ok).toBe(true);
    if (first.ok === true) {
      expect(first.account.mustChangePassword).toBe(true);
    }

    const unmigratedRow = makeRemoteRow();
    delete unmigratedRow.must_change_password;
    remote.rows = [unmigratedRow];

    const second = await authenticate('maria_santos', 'Exact#Pass 123');
    expect(second).toEqual({ ok: false, kind: 'lookup_unavailable' });
  });

  it('compares passwords verbatim without trimming or case-folding', async () => {
    const authenticate = (portalData as any).authenticateEmployeePortalAccount;
    expect(typeof authenticate).toBe('function');

    await expect(authenticate('maria_santos', ' Exact#Pass 123')).resolves.toEqual({
      ok: false,
      kind: 'invalid_credentials',
    });
    await expect(authenticate('maria_santos', 'exact#pass 123')).resolves.toEqual({
      ok: false,
      kind: 'invalid_credentials',
    });
  });

  it('never falls back to localStorage or hardcoded employee01 when remote rejects, is deleted, is missing, or errors', async () => {
    const authenticate = (portalData as any).authenticateEmployeePortalAccount;
    expect(typeof authenticate).toBe('function');

    seedLocalCache('StaleLocalPass#9');

    // Wrong password against remote, even though it matches localStorage
    await expect(authenticate('maria_santos', 'StaleLocalPass#9')).resolves.toEqual({
      ok: false,
      kind: 'invalid_credentials',
    });

    // Soft-deleted remote row
    remote.rows = [makeRemoteRow({ password: 'StaleLocalPass#9', deleted_at: '2026-11-19T00:00:00Z' })];
    await expect(authenticate('maria_santos', 'StaleLocalPass#9')).resolves.toEqual({
      ok: false,
      kind: 'invalid_credentials',
    });

    // Hardcoded DEMO_ACCOUNT employee01 / hr2024 absent remotely
    remote.rows = [];
    await expect(authenticate('employee01', 'hr2024')).resolves.toEqual({
      ok: false,
      kind: 'invalid_credentials',
    });

    // Remote error
    remote.queryError = { code: 'PGRST301', message: 'database unavailable' };
    await expect(authenticate('maria_santos', 'StaleLocalPass#9')).resolves.toEqual({
      ok: false,
      kind: 'lookup_unavailable',
    });
  });

  it('rejects blank inputs and wildcard characters without querying', async () => {
    const authenticate = (portalData as any).authenticateEmployeePortalAccount;
    expect(typeof authenticate).toBe('function');

    for (const [u, p] of [
      ['', 'Exact#Pass 123'],
      ['   ', 'Exact#Pass 123'],
      ['maria_santos', ''],
      ['maria%', 'Exact#Pass 123'],
      ['maria*', 'Exact#Pass 123'],
      ['maria\\santos', 'Exact#Pass 123'],
    ]) {
      await expect(authenticate(u, p)).resolves.toEqual({
        ok: false,
        kind: 'invalid_credentials',
      });
    }
    expect(remote.ilikeCalls).toEqual([]);
  });

  it('returns ambiguous_account when multiple active rows match the normalized username', async () => {
    const authenticate = (portalData as any).authenticateEmployeePortalAccount;
    expect(typeof authenticate).toBe('function');

    remote.rows = [
      makeRemoteRow({ id: 'portal-1', username: 'maria_santos' }),
      makeRemoteRow({ id: 'portal-2', username: 'MARIA_SANTOS' }),
    ];

    await expect(authenticate('maria_santos', 'Exact#Pass 123')).resolves.toEqual({
      ok: false,
      kind: 'ambiguous_account',
    });
  });

  it('Never logs submitted or stored passwords or account rows on lookup errors', async () => {
    const authenticate = (portalData as any).authenticateEmployeePortalAccount;
    expect(typeof authenticate).toBe('function');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    remote.throwError = new Error('network timeout');

    const res = await authenticate('maria_santos', 'SuperSecretSubmitted#1');
    expect(res).toEqual({ ok: false, kind: 'lookup_unavailable' });

    const logged = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls]);
    expect(logged).not.toContain('SuperSecretSubmitted#1');
    expect(logged).not.toContain('Exact#Pass 123');
  });
});

describe('getEmployeePortalAccountByEmployeeNumber & listEmployeePortalAccountIdentities', () => {
  beforeEach(() => {
    localStorage.clear();
    remote.rows = [
      makeRemoteRow({
        id: 'portal-2',
        username: 'zoe.cruz',
        employee_id: 'EMP-2026-002',
        full_name: 'Zoe Cruz',
      }),
      makeRemoteRow({
        id: 'portal-1',
        username: 'ana.reyes',
        employee_id: 'EMP-2026-001',
        full_name: 'Ana Reyes',
        must_change_password: true,
      }),
    ];
    remote.queryError = null;
    remote.throwError = null;
    remote.selectProjections = [];
    remote.ilikeCalls = [];
    remote.inCalls = [];
    remote.isCalls = [];
  });

  it('resolves one active account by employee number using metadata-only projection (excluding password)', async () => {
    const getByEmpNo = (portalData as any).getEmployeePortalAccountByEmployeeNumber;
    expect(typeof getByEmpNo).toBe('function');

    const res = await getByEmpNo(' emp-2026-001 ');
    expect(res).toEqual({
      ok: true,
      account: expect.objectContaining({
        id: 'portal-1',
        username: 'ana.reyes',
        updatedAt: RAW_UPDATED_AT,
        mustChangePassword: true,
      }),
    });
    expect('password' in res.account).toBe(false);
    expect(remote.selectProjections).toHaveLength(1);
    const selectedCols = remote.selectProjections[0].split(',').map((c) => c.trim());
    expect(selectedCols).not.toContain('password');
    expect(selectedCols).toContain('must_change_password');
    expect(remote.selectProjections[0]).not.toBe('*');
  });

  it('returns not_found for blank, wildcard, missing, or soft-deleted employee numbers', async () => {
    const getByEmpNo = (portalData as any).getEmployeePortalAccountByEmployeeNumber;
    expect(typeof getByEmpNo).toBe('function');

    await expect(getByEmpNo('   ')).resolves.toEqual({ ok: false, kind: 'not_found' });
    await expect(getByEmpNo('EMP-%')).resolves.toEqual({ ok: false, kind: 'not_found' });
    expect(remote.ilikeCalls).toEqual([]);

    await expect(getByEmpNo('EMP-2026-999')).resolves.toEqual({ ok: false, kind: 'not_found' });
  });

  it('lists all active non-deleted account identities deterministically when employeeNumbers is omitted, without selecting password', async () => {
    const listIdentities = (portalData as any).listEmployeePortalAccountIdentities;
    expect(typeof listIdentities).toBe('function');

    remote.rows.push(
      makeRemoteRow({
        id: 'portal-deleted',
        username: 'deleted.user',
        employee_id: 'EMP-2026-001',
        deleted_at: '2026-11-18T00:00:00Z',
      }),
    );

    const res = await listIdentities();
    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.accounts.map((a: any) => a.username)).toEqual(['ana.reyes', 'zoe.cruz']);
      res.accounts.forEach((a: any) => {
        expect('password' in a).toBe(false);
      });
    }
    expect(remote.selectProjections).toHaveLength(1);
    const listCols = remote.selectProjections[0].split(',').map((c) => c.trim());
    expect(listCols).not.toContain('password');
    expect(listCols).toContain('must_change_password');
    expect(remote.inCalls).toEqual([]);
  });

  it('short-circuits [] without querying and scopes queries when employeeNumbers is provided', async () => {
    const listIdentities = (portalData as any).listEmployeePortalAccountIdentities;
    expect(typeof listIdentities).toBe('function');

    const empty = await listIdentities([]);
    expect(empty).toEqual({ ok: true, accounts: [] });
    expect(remote.selectProjections).toEqual([]);

    const scoped = await listIdentities([' EMP-2026-002 ', 'EMP-2026-002']);
    expect(scoped.ok).toBe(true);
    if (scoped.ok === true) {
      expect(scoped.accounts.map((a: any) => a.id)).toEqual(['portal-2']);
    }
  });

  it('returns ambiguous_account when active rows contain duplicate normalized employee_id or username', async () => {
    const listIdentities = (portalData as any).listEmployeePortalAccountIdentities;
    expect(typeof listIdentities).toBe('function');

    remote.rows.push(
      makeRemoteRow({
        id: 'portal-dup',
        username: 'ANA.REYES',
        employee_id: 'EMP-2026-003',
      }),
    );

    await expect(listIdentities()).resolves.toEqual({
      ok: false,
      kind: 'ambiguous_account',
    });
  });
});
