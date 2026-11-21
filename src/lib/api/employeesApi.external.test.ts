import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * External hire routing via complete_external_hire:
 * - routes external applicants directly to the complete_external_hire RPC,
 * - extends hireApplicantWithOutcome with explicit external completion metadata,
 * - preserves hireApplicant(): Promise<EmployeeRow>,
 * - never falls back to FastAPI or client-side table inserts/updates on failure,
 * - treats post-commit view-read failures as committed/unconfirmed-read (retryable).
 */

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };

const { fake } = vi.hoisted(() => ({
  fake: {
    calls: [] as Call[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    applicants: {} as Record<string, Record<string, unknown>>,
    classificationError: null as { message: string } | null,
    viewRow: null as Record<string, unknown> | null,
    viewError: null as { code?: string; message: string } | null,
    rpcResult: null as { data: unknown; error: unknown } | null,
    rpcThrows: null as unknown,
  },
}));

vi.mock('../supabase', () => {
  const filterValue = (q: Call, column: string) => q.filters.find(([c]) => c === column)?.[1];

  const resolveQuery = (q: Call) => {
    if (q.table === 'applicants' && q.op === 'select') {
      if (fake.classificationError) return { data: null, error: fake.classificationError };
      const id = String(filterValue(q, 'id'));
      return { data: fake.applicants[id] ?? null, error: null };
    }
    if (q.table === 'employees_with_department') {
      if (fake.viewError) return { data: null, error: fake.viewError };
      return { data: fake.viewRow, error: null };
    }
    return { data: null, error: null };
  };

  const builder = (table: string) => {
    const q: Call = { table, op: 'select', filters: [] };
    fake.calls.push(q);
    const b: any = {
      select: () => b,
      insert: (payload: unknown) => { q.op = 'insert'; q.payload = payload; return b; },
      update: (payload: unknown) => { q.op = 'update'; q.payload = payload; return b; },
      upsert: (payload: unknown) => { q.op = 'upsert'; q.payload = payload; return b; },
      delete: () => { q.op = 'delete'; return b; },
      eq: (column: string, value: unknown) => { q.filters.push([column, value]); return b; },
      is: (column: string, value: unknown) => { q.filters.push([column, value]); return b; },
      in: (column: string, value: unknown) => { q.filters.push([column, value]); return b; },
      ilike: (column: string, value: unknown) => { q.filters.push([column, value]); return b; },
      maybeSingle: () => Promise.resolve(resolveQuery(q)),
      single: () => Promise.resolve(resolveQuery(q)),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(resolveQuery(q)).then(resolve, reject),
    };
    return b;
  };

  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'test-token' } } }) },
      from: builder,
      rpc: (name: string, args: Record<string, unknown>) => {
        fake.rpcCalls.push({ name, args });
        const outcome = () =>
          fake.rpcThrows !== null
            ? Promise.reject(fake.rpcThrows)
            : Promise.resolve(fake.rpcResult ?? { data: null, error: null });
        return { abortSignal: () => outcome() };
      },
    },
  };
});

import { ExternalHireError, hireApplicant, hireApplicantWithOutcome } from './employeesApi';

const APPLICANT_ID = '11111111-0000-4000-8000-0000000000bb';
const EMPLOYEE_UUID = 'e0e0e0e0-0000-4000-8000-000000000099';
const SLOT_ID = 'slot-1';

const employeeView = {
  id: EMPLOYEE_UUID,
  employee_id: 'EMP-11111111',
  full_name: 'Ana Reyes',
  current_position: 'Clerk I',
  current_department: 'Human Resource Management Office',
};

const committed = (alreadyCompleted = false) => ({
  data: {
    applicant_id: APPLICANT_ID,
    employee_uuid: EMPLOYEE_UUID,
    employee_number: 'EMP-11111111',
    slot_id: SLOT_ID,
    completed_at: '2026-11-20T08:00:00+00:00',
    already_completed: alreadyCompleted,
  },
  error: null,
});

const fetchMock = vi.fn();

const writes = () => fake.calls.filter((c) => c.op !== 'select');
const touched = (table: string) => fake.calls.filter((c) => c.table === table);

const expectNoFallbackOrSideEffects = () => {
  expect(writes()).toEqual([]);
  expect(touched('employees')).toEqual([]);
  expect(touched('employee_portal_accounts')).toEqual([]);
  expect(touched('newly_hired')).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
};

describe('hireApplicant / hireApplicantWithOutcome: external RPC routing', () => {
  beforeEach(() => {
    fake.calls = [];
    fake.rpcCalls = [];
    fake.applicants = {
      [APPLICANT_ID]: {
        id: APPLICANT_ID,
        application_type: 'job',
        status: 'For Contract Signing',
      },
    };
    fake.classificationError = null;
    fake.viewRow = employeeView;
    fake.viewError = null;
    fake.rpcResult = committed();
    fake.rpcThrows = null;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls complete_external_hire and returns the view row from hireApplicant', async () => {
    const employee = await hireApplicant(APPLICANT_ID);

    expect(employee).toEqual(employeeView);
    expect(fake.rpcCalls).toEqual([
      { name: 'complete_external_hire', args: { p_applicant_id: APPLICANT_ID } },
    ]);
    expectNoFallbackOrSideEffects();
  });

  it('treats a missing application_type as external and routes via complete_external_hire', async () => {
    fake.applicants[APPLICANT_ID].application_type = null;

    await hireApplicant(APPLICANT_ID);

    expect(fake.rpcCalls).toEqual([
      { name: 'complete_external_hire', args: { p_applicant_id: APPLICANT_ID } },
    ]);
    expectNoFallbackOrSideEffects();
  });

  it('returns explicit external completion metadata from hireApplicantWithOutcome', async () => {
    fake.rpcResult = committed(true);

    const outcome = await hireApplicantWithOutcome(APPLICANT_ID);

    expect(outcome).toEqual({
      employee: employeeView,
      promotion: null,
      external: {
        applicantId: APPLICANT_ID,
        employeeUuid: EMPLOYEE_UUID,
        employeeNumber: 'EMP-11111111',
        slotId: SLOT_ID,
        completedAt: '2026-11-20T08:00:00+00:00',
        alreadyCompleted: true,
      },
    });
    expectNoFallbackOrSideEffects();
  });

  it.each([
    ['401/JWT expired', { code: 'PGRST301', message: 'JWT expired' }, 'not_authorized'],
    ['403/not_authorized', { code: '42501', hint: 'not_authorized', message: 'Forbidden' }, 'not_authorized'],
    ['409/not_reserved', { code: 'P0001', hint: 'not_reserved', message: 'Not reserved' }, 'rejected'],
    ['409/slot_missing', { code: 'P0001', hint: 'slot_missing', message: 'Slot missing' }, 'rejected'],
    ['422/office_inactive', { code: 'P0001', hint: 'office_inactive', message: 'Office inactive' }, 'rejected'],
    ['missing migration', { code: 'PGRST202', message: 'Function not found' }, 'not_deployed'],
  ])('never falls back to client-side inserts on %s', async (_label, rpcError, expectedKind) => {
    fake.rpcResult = { data: null, error: rpcError };

    const error = await hireApplicant(APPLICANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ExternalHireError);
    expect(error.kind).toBe(expectedKind);
    expectNoFallbackOrSideEffects();
  });

  it('never falls back on transport timeout or dropped RPC response', async () => {
    fake.rpcThrows = new TypeError('Failed to fetch');

    const error = await hireApplicant(APPLICANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ExternalHireError);
    expect(error.kind).toBe('uncertain');
    expect(error.retryable).toBe(true);
    expectNoFallbackOrSideEffects();
  });

  it('treats post-commit view-read failure as committed/unconfirmed-read (retryable) without hiring again', async () => {
    fake.viewRow = null;
    fake.viewError = { code: 'PGRST116', message: 'view read failed' };

    const first = await hireApplicant(APPLICANT_ID).catch((e) => e);
    expect(first).toBeInstanceOf(ExternalHireError);
    expect(first.kind).toBe('employee_read_failed');
    expect(first.retryable).toBe(true);
    expect(first.message).toMatch(/retry/i);
    expectNoFallbackOrSideEffects();

    // Retry succeeds cleanly with replay
    fake.viewError = null;
    fake.viewRow = employeeView;
    fake.rpcResult = committed(true);

    const outcome = await hireApplicantWithOutcome(APPLICANT_ID);
    expect(outcome.employee).toEqual(employeeView);
    expect(outcome.external?.alreadyCompleted).toBe(true);
  });
});
