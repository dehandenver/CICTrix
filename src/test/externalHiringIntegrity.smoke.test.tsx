import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({
  seq: 0,
  applicants: [] as Row[],
  employees: [] as Row[],
  newlyHired: [] as Row[],
  portalAccounts: [] as Row[],
  passwordResets: [] as Row[],
  selectQueries: [] as Array<{ table: string; cols: string }>,
  dropNextHireRpcResponse: false,
  dropNextAccountInsertResponse: false,
  dropNextSelfChangeResponse: false,
  dropNextResetRpcResponse: false,
}));

vi.mock('../lib/supabase', () => {
  const tableData = (table: string): Row[] => {
    switch (table) {
      case 'applicants':
        return store.applicants;
      case 'employees':
      case 'employees_with_department':
        return store.employees;
      case 'newly_hired':
        return store.newlyHired;
      case 'employee_portal_accounts':
        return store.portalAccounts;
      case 'employee_password_resets':
        return store.passwordResets;
      default:
        return [];
    }
  };

  const applyProjection = (row: Row, cols: string): Row => {
    const trimmed = cols.trim();
    if (!trimmed || trimmed === '*') return { ...row };
    const colList = trimmed
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const out: Row = {};
    for (const c of colList) {
      if (c in row) out[c] = row[c];
    }
    return out;
  };

  const from = (table: string) => {
    const filters: Array<{ op: 'eq' | 'ilike' | 'in' | 'is' | 'not_is'; col: string; val: unknown }> = [];
    let selectedCols = '*';
    let mode: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payloadRows: Row[] = [];
    let updatePatch: Row = {};
    let isSingle = false;
    let isMaybeSingle = false;
    let sliceRange: [number, number] | null = null;

    const matchRows = (rows: Row[]) =>
      rows.filter((row) =>
        filters.every((f) => {
          if (f.op === 'eq') return String(row[f.col] ?? '') === String(f.val ?? '');
          if (f.op === 'is' && f.val === null) return row[f.col] == null;
          if (f.op === 'not_is' && f.val === null) return row[f.col] != null;
          if (f.op === 'in') return (f.val as unknown[]).map(String).includes(String(row[f.col] ?? ''));
          if (f.op === 'ilike') {
            const normalized = String(f.val ?? '').replace(/\\_/g, '_').toLowerCase();
            return String(row[f.col] ?? '').trim().toLowerCase() === normalized;
          }
          return true;
        }),
      );

    const execute = async () => {
      if (mode === 'insert') {
        const rows = tableData(table);
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
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          const next = { ...r };
          rows.push(next);
          inserted.push(next);
        }

        if (table === 'employee_portal_accounts' && store.dropNextAccountInsertResponse) {
          store.dropNextAccountInsertResponse = false;
          throw new TypeError('Failed to fetch');
        }

        const out = inserted.map((r) => applyProjection(r, selectedCols));
        return { data: out, error: null };
      }

      if (mode === 'upsert') {
        const rows = tableData(table);
        for (const r of payloadRows) {
          const idx = rows.findIndex((existing) => String(existing.id) === String(r.id));
          if (idx >= 0) rows[idx] = { ...rows[idx], ...r };
          else rows.push({ ...r });
        }
        return { data: payloadRows, error: null };
      }

      if (mode === 'update') {
        const rows = tableData(table);
        const matched = matchRows(rows);
        if (matched.length === 0) {
          return { data: [], error: null };
        }
        const newUpdatedAt = `2026-11-20T09:00:${String(++store.seq).padStart(2, '0')}.000000+00:00`;
        const updated: Row[] = [];
        for (const r of matched) {
          Object.assign(r, updatePatch);
          if (table === 'employee_portal_accounts') {
            r.updated_at = newUpdatedAt;
          }
          updated.push(applyProjection(r, selectedCols));
        }

        if (table === 'employee_portal_accounts' && store.dropNextSelfChangeResponse) {
          store.dropNextSelfChangeResponse = false;
          throw new TypeError('Failed to fetch');
        }

        return { data: updated, error: null };
      }

      const matched = matchRows(tableData(table));
      if (isSingle) {
        if (matched.length !== 1) {
          return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
        }
        return { data: applyProjection(matched[0], selectedCols), error: null };
      }
      if (isMaybeSingle) {
        return { data: matched[0] ? applyProjection(matched[0], selectedCols) : null, error: null };
      }
      const sliced = sliceRange ? matched.slice(sliceRange[0], sliceRange[1] + 1) : matched;
      return { data: sliced.map((r) => applyProjection(r, selectedCols)), error: null };
    };

    const chain: any = {
      select: (cols = '*') => {
        selectedCols = cols;
        store.selectQueries.push({ table, cols });
        return chain;
      },
      insert: (rows: Row[]) => {
        mode = 'insert';
        payloadRows = rows;
        return chain;
      },
      upsert: (rows: Row[]) => {
        mode = 'upsert';
        payloadRows = rows;
        return chain;
      },
      update: (patch: Row) => {
        mode = 'update';
        updatePatch = patch;
        return chain;
      },
      eq: (col: string, val: unknown) => {
        filters.push({ op: 'eq', col, val });
        return chain;
      },
      ilike: (col: string, val: unknown) => {
        filters.push({ op: 'ilike', col, val });
        return chain;
      },
      in: (col: string, val: unknown[]) => {
        filters.push({ op: 'in', col, val });
        return chain;
      },
      is: (col: string, val: unknown) => {
        filters.push({ op: 'is', col, val });
        return chain;
      },
      not: (col: string, op: string, val: unknown) => {
        if (op === 'is') filters.push({ op: 'not_is', col, val });
        return chain;
      },
      order: () => chain,
      range: (fromIdx: number, toIdx: number) => {
        sliceRange = [fromIdx, toIdx];
        return chain;
      },
      limit: () => chain,
      single: () => {
        isSingle = true;
        return chain;
      },
      maybeSingle: () => {
        isMaybeSingle = true;
        return chain;
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        execute().then(onFulfilled, onRejected),
    };
    return chain;
  };

  const rpc = (fn: string, params: Record<string, unknown>) => {
    const run = async () => {
      if (fn === 'complete_external_hire') {
        const applicant = store.applicants.find((a) => a.id === params.p_applicant_id);
        if (!applicant) {
          return { data: null, error: { code: 'P0001', hint: 'application_not_found', message: 'Applicant not found' } };
        }

        const existing = store.employees.find((e) => e.application_id === applicant.id);
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

        const empUuid = `emp-uuid-${++store.seq}`;
        const empNumber = `EMP-2026-100${store.seq}`;
        const completedAt = '2026-11-20T08:00:00.000Z';
        store.employees.push({
          id: empUuid,
          application_id: applicant.id,
          employee_id: empNumber,
          employee_number: empNumber,
          full_name: `${applicant.first_name} ${applicant.last_name}`,
          first_name: applicant.first_name,
          last_name: applicant.last_name,
          email: applicant.email,
          current_position: applicant.position,
          position: applicant.position,
          current_department: applicant.office,
          department: applicant.office,
          plantilla_slot_id: applicant.plantilla_slot_id,
          status: 'Active',
          hire_date: completedAt,
          created_at: completedAt,
          updated_at: completedAt,
        });
        applicant.status = 'Hired';

        if (store.dropNextHireRpcResponse) {
          store.dropNextHireRpcResponse = false;
          throw new TypeError('Failed to fetch');
        }

        return {
          data: {
            applicant_id: applicant.id,
            employee_uuid: empUuid,
            employee_number: empNumber,
            slot_id: applicant.plantilla_slot_id ?? 'slot-1',
            completed_at: completedAt,
            already_completed: false,
          },
          error: null,
        };
      }

      if (fn === 'reset_employee_portal_password') {
        const account = store.portalAccounts.find(
          (a) => a.deleted_at == null && a.id === params.p_account_id,
        );
        if (!account) {
          return { data: null, error: { code: 'P0002', hint: 'account_not_found', message: 'not found' } };
        }
        if (account.employee_id !== params.p_employee_number) {
          return { data: null, error: { code: '22023', hint: 'identity_mismatch', message: 'mismatch' } };
        }
        if (account.updated_at !== params.p_expected_updated_at) {
          return { data: null, error: { code: '40001', hint: 'revision_conflict', message: 'conflict' } };
        }
        if (
          store.passwordResets.some(
            (r) => r.account_id === account.id && r.request_id === params.p_request_id,
          )
        ) {
          return { data: null, error: { code: '23505', hint: 'duplicate_request_id', message: 'duplicate' } };
        }

        const nextRev = `2026-11-20T09:30:${String(++store.seq).padStart(2, '0')}.000000+00:00`;
        account.password = params.p_new_password;
        account.must_change_password = true;
        account.updated_at = nextRev;
        store.passwordResets.push({
          id: `reset-${store.seq}`,
          account_id: account.id,
          employee_username: account.username,
          employee_number: account.employee_id,
          reset_at: nextRev,
          request_id: params.p_request_id,
        });

        if (store.dropNextResetRpcResponse) {
          store.dropNextResetRpcResponse = false;
          throw new TypeError('Failed to fetch');
        }

        return {
          data: {
            account_id: account.id,
            employee_number: account.employee_id,
            username: account.username,
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

  return { supabase: { from, rpc }, isMockModeEnabled: false };
});

import { generateEmployeeCredentials, type ReservedApplicant } from '../lib/hiringFlow';
import {
  authenticateEmployeePortalAccount,
  changeEmployeePortalPassword,
  getEmployeePortalAccountByEmployeeNumber,
  resetEmployeePortalPassword,
} from '../lib/employeePortalData';
import { syncNewlyHiredToEmployees } from '../lib/hiredApplicantSync';

const makeReservedRow = (overrides: Partial<ReservedApplicant> = {}): ReservedApplicant => ({
  id: 'app-ext-smoke-1',
  fullName: 'Elena Reyes',
  email: 'elena.reyes@example.gov.ph',
  referenceNo: 'REF-EXT-SMOKE-1',
  position: 'Administrative Officer II',
  department: 'Human Resources',
  plantilla: 'HRMO - Item 042 (Slot 1)',
  slotItemNumber: '042',
  slotNumber: 1,
  slotId: 'slot-hrmo-42',
  signingDeadline: '2026-11-30T00:00:00.000Z',
  applicationType: 'job',
  interviewScore: 91,
  employeeNumber: null,
  ...overrides,
});

describe('Release Unit 1 External Hiring + Credentials cross-boundary smoke', () => {
  let emailCalls: Array<Record<string, unknown>>;

  beforeEach(() => {
    store.seq = 0;
    store.applicants = [
      {
        id: 'app-ext-smoke-1',
        first_name: 'Elena',
        middle_name: '',
        last_name: 'Reyes',
        email: 'elena.reyes@example.gov.ph',
        position: 'Administrative Officer II',
        office: 'Human Resources',
        contact_number: '09171230001',
        plantilla_slot_id: 'slot-hrmo-42',
        status: 'For Contract Signing',
        application_type: 'job',
      },
    ];
    store.employees = [];
    store.newlyHired = [];
    store.portalAccounts = [];
    store.passwordResets = [];
    store.selectQueries = [];
    store.dropNextHireRpcResponse = false;
    store.dropNextAccountInsertResponse = false;
    store.dropNextSelfChangeResponse = false;
    store.dropNextResetRpcResponse = false;
    localStorage.clear();
    sessionStorage.clear();
    emailCalls = [];
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('replays external hire + startup backfill with zero duplicate employees, unchanged credentials/username, and no second email', async () => {
    const firstPass = await generateEmployeeCredentials([makeReservedRow()]);
    expect(firstPass.failures).toEqual([]);
    expect(firstPass.credentials).toHaveLength(1);
    expect(firstPass.existingAccounts).toHaveLength(0);
    expect(emailCalls).toHaveLength(1);

    const empNumber = firstPass.credentials[0].employeeId;
    const tempPass = firstPass.credentials[0].tempPassword;
    const initialAccountId = store.portalAccounts[0].id as string;

    // Employee signs in and changes password independently
    const lookup1 = await getEmployeePortalAccountByEmployeeNumber(empNumber);
    expect(lookup1.ok).toBe(true);
    if (lookup1.ok === false) return;

    const selfPass = 'ElenaSelfChosen#2026';
    const selfChange = await changeEmployeePortalPassword(
      {
        accountId: lookup1.account.id,
        employeeNumber: empNumber,
        expectedRevision: lookup1.account.updatedAt,
      },
      tempPass,
      selfPass,
    );
    expect(selfChange.ok).toBe(true);

    // Seed stale cached credential in localStorage and replay hiring + startup backfill in fresh tab
    localStorage.setItem(
      'cictrix_employee_portal_accounts',
      JSON.stringify([
        {
          id: initialAccountId,
          username: empNumber,
          password: 'OldStaleCachePassword#9',
          employee: { employeeId: empNumber, fullName: 'Elena Reyes' },
        },
      ]),
    );
    sessionStorage.clear();

    const replayPass = await generateEmployeeCredentials([makeReservedRow()]);
    expect(replayPass.failures).toEqual([]);
    expect(replayPass.credentials).toHaveLength(0);
    expect(replayPass.existingAccounts).toHaveLength(1);
    expect(replayPass.existingAccounts[0]).toMatchObject({
      applicantId: 'app-ext-smoke-1',
      employeeNumber: empNumber,
      accountId: initialAccountId,
      username: empNumber,
    });
    expect('password' in replayPass.existingAccounts[0]).toBe(false);
    expect(emailCalls).toHaveLength(1); // No repeated email

    // Startup newly_hired backfill runs cleanly without duplicating employees
    await syncNewlyHiredToEmployees();
    expect(sessionStorage.getItem('cictrix_newly_hired_employee_sync_done')).toBe('1');
    expect(store.employees).toHaveLength(1);
    expect(store.portalAccounts).toHaveLength(1);
    expect(store.portalAccounts[0].password).toBe(selfPass);
  });

  it('recovers dropped responses cleanly across appointment commit, account insert, self-change, and HR reset without reading password on reset check', async () => {
    // 1. Dropped external hire RPC response -> retry replays idempotently
    store.dropNextHireRpcResponse = true;
    // 2. Dropped portal account insert response -> re-read confirms existing account safely (existingAccounts, no duplicate insert)
    store.dropNextAccountInsertResponse = true;

    const firstAttempt = await generateEmployeeCredentials([makeReservedRow()]);
    expect(firstAttempt.failures).toEqual([]);
    expect(firstAttempt.credentials).toHaveLength(0);
    expect(firstAttempt.existingAccounts).toHaveLength(1);
    expect(store.employees).toHaveLength(1);
    expect(store.portalAccounts).toHaveLength(1);
    expect(emailCalls).toHaveLength(0);

    const account = store.portalAccounts[0];
    const empNumber = String(account.employee_id);
    const createdPassword = String(account.password);

    // 3. Dropped self-change response -> recovers via state read without second write
    store.dropNextSelfChangeResponse = true;
    const nextSelfPass = 'RecoveredSelfPass#11';
    const selfRes = await changeEmployeePortalPassword(
      {
        accountId: String(account.id),
        employeeNumber: empNumber,
        expectedRevision: String(account.updated_at),
      },
      createdPassword,
      nextSelfPass,
    );
    expect(selfRes.ok).toBe(true);
    if (selfRes.ok === false) return;

    // 4. Dropped HR reset RPC response -> recovers via employee_password_resets.request_id + metadata projection (never selecting password)
    store.selectQueries = [];
    store.dropNextResetRpcResponse = true;
    const resetRes = await resetEmployeePortalPassword({
      accountId: selfRes.account.id,
      employeeNumber: empNumber,
      expectedRevision: selfRes.account.updatedAt,
    });
    expect(resetRes.ok).toBe(true);
    if (resetRes.ok === false) return;

    const resetRecoveryReads = store.selectQueries.filter(
      (q) => q.table === 'employee_portal_accounts' || q.table === 'employee_password_resets',
    );
    expect(resetRecoveryReads.length).toBeGreaterThanOrEqual(2);
    expect(
      resetRecoveryReads.every((q) => !/\bpassword\b/i.test(q.cols.replace(/must_change_password/gi, ''))),
    ).toBe(true);

    // Verify recovered temporary password actually authenticates remotely
    const authRes = await authenticateEmployeePortalAccount(
      resetRes.credentials.username,
      resetRes.credentials.password,
    );
    expect(authRes.ok).toBe(true);
    if (authRes.ok === true) {
      expect(authRes.account.mustChangePassword).toBe(true);
      expect('password' in authRes.account).toBe(false);
    }
  });
});
