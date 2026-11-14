import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression for the audit's duplicate-employee reproduction: hiring a promotion
 * through the backend-then-fallback path used to INSERT a second employee for a
 * person who already works here. A promotion must go through the transaction
 * and nothing else, whether or not the backend is reachable.
 */

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };

const { fake } = vi.hoisted(() => ({
  fake: {
    calls: [] as Array<{ table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> }>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    applicants: {} as Record<string, Record<string, unknown>>,
    classificationError: null as { message: string } | null,
    viewRow: null as Record<string, unknown> | null,
    viewError: null as { message: string } | null,
    departments: [] as Array<{ name: string; is_active: boolean }>,
    rpcResult: null as { data: unknown; error: unknown } | null,
    rpcThrows: null as unknown,
  },
}));

vi.mock('../supabase', () => {
  const resolveQuery = (q: Call) => {
    const idFilter = q.filters.find(([column]) => column === 'id');
    if (q.table === 'applicants' && q.op === 'select') {
      if (fake.classificationError) return { data: null, error: fake.classificationError };
      const row = idFilter ? fake.applicants[String(idFilter[1])] : undefined;
      return { data: row ?? null, error: null };
    }
    if (q.table === 'employees_with_department') {
      if (fake.viewError) return { data: null, error: fake.viewError };
      return { data: fake.viewRow, error: fake.viewRow ? null : { code: 'PGRST116', message: 'no rows' } };
    }
    if (q.table === 'departments') {
      return { data: fake.departments, error: null };
    }
    if (q.table === 'job_postings') {
      return { data: [], error: null };
    }
    if (q.table === 'employees' && q.op === 'insert') {
      return { data: { id: 'inserted-employee-uuid', ...(q.payload as object) }, error: null };
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

import { hireApplicant } from './employeesApi';
import { PromotionalAppointmentError } from './promotionalHiring';

const PROMOTION_ID = '09e72c95-0000-4000-8000-0000000000aa';
const EXTERNAL_ID = '11111111-0000-4000-8000-0000000000bb';
const EMPLOYEE_UUID = 'e0e0e0e0-0000-4000-8000-000000000042';
const ORIGINAL_HIRE_DATE = '2019-03-04';

const employeeView = {
  id: EMPLOYEE_UUID,
  employee_id: 'EMP-0042',
  full_name: 'Maria Santos',
  current_position: 'City Accountant II',
  hire_date: ORIGINAL_HIRE_DATE,
};

const committed = (alreadyCompleted = false) => ({
  data: {
    applicant_id: PROMOTION_ID,
    employee_uuid: EMPLOYEE_UUID,
    employee_number: 'EMP-0042',
    slot_id: 'slot-1',
    completed_at: '2026-11-02T08:00:00+00:00',
    already_completed: alreadyCompleted,
  },
  error: null,
});

const fetchMock = vi.fn();

const writes = () => fake.calls.filter((c) => c.op !== 'select');
const touched = (table: string) => fake.calls.filter((c) => c.table === table);

const expectNoSideEffectsOutsideTheTransaction = () => {
  expect(writes()).toEqual([]);
  // No uniqueness probes for a number or email either: those belong to inserts.
  expect(touched('employees')).toEqual([]);
  expect(touched('employee_portal_accounts')).toEqual([]);
  expect(touched('newly_hired')).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
};

beforeEach(() => {
  fake.calls = [];
  fake.rpcCalls = [];
  fake.applicants = {
    [PROMOTION_ID]: { id: PROMOTION_ID, application_type: 'promotion', employee_id: 'EMP-0042', status: 'For Contract Signing' },
    [EXTERNAL_ID]: {
      id: EXTERNAL_ID,
      application_type: 'job',
      employee_id: null,
      first_name: 'Ana',
      last_name: 'Reyes',
      email: 'ana.reyes@example.org',
      position: 'Clerk I',
      office: 'Human Resource Management Office',
      gender: 'Female',
    },
  };
  fake.departments = [{ name: 'Human Resource Management Office', is_active: true }];
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

describe('hireApplicant: promotions', () => {
  it('completes through the RPC and returns the existing employee, with the backend reachable', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'backend-employee' }) });

    const employee = await hireApplicant(PROMOTION_ID);

    expect(fake.rpcCalls).toEqual([
      { name: 'complete_promotional_appointment', args: { p_applicant_id: PROMOTION_ID } },
    ]);
    expect(employee.id).toBe(EMPLOYEE_UUID);
    expect(employee.hire_date).toBe(ORIGINAL_HIRE_DATE);
    expect(touched('employees_with_department')[0].filters).toContainEqual(['id', EMPLOYEE_UUID]);
    expectNoSideEffectsOutsideTheTransaction();
  });

  it('completes through the RPC and returns the existing employee, with the backend unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const employee = await hireApplicant(PROMOTION_ID);

    expect(fake.rpcCalls).toHaveLength(1);
    expect(employee.employee_id).toBe('EMP-0042');
    expectNoSideEffectsOutsideTheTransaction();
  });

  it('classifies from the saved application, accepting promotional spellings', async () => {
    fake.applicants[PROMOTION_ID].application_type = '  Promotional ';

    await hireApplicant(PROMOTION_ID);

    expect(fake.rpcCalls).toHaveLength(1);
    expectNoSideEffectsOutsideTheTransaction();
  });

  it('classifies a promotion even when it carries no employee number', async () => {
    fake.applicants[PROMOTION_ID].employee_id = null;

    await expect(hireApplicant(PROMOTION_ID)).resolves.toMatchObject({ id: EMPLOYEE_UUID });

    // The database decides whether the identity is usable; the client never
    // falls through to inserting an employee because it is missing.
    expect(fake.rpcCalls).toHaveLength(1);
    expectNoSideEffectsOutsideTheTransaction();
  });

  const rpcFailures: Array<[string, () => void, string]> = [
    [
      'a database rejection',
      () => { fake.rpcResult = { data: null, error: { code: 'P0001', hint: 'slot_filled_elsewhere', message: 'Taken.' } }; },
      'rejected',
    ],
    [
      'an authorization failure',
      () => { fake.rpcResult = { data: null, error: { code: '42501', hint: 'not_authorized', message: 'No.' } }; },
      'not_authorized',
    ],
    [
      'a missing RPC',
      () => { fake.rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }; },
      'not_deployed',
    ],
    [
      'a thrown network error',
      () => { fake.rpcThrows = new TypeError('Failed to fetch'); },
      'uncertain',
    ],
    [
      'an aborted request',
      () => { fake.rpcThrows = Object.assign(new Error('aborted'), { name: 'AbortError' }); },
      'uncertain',
    ],
  ];

  it.each(rpcFailures)('never reaches the insert fallback after %s', async (_label, arrange, kind) => {
    arrange();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await hireApplicant(PROMOTION_ID).catch((e) => e);

    expect(error).toBeInstanceOf(PromotionalAppointmentError);
    expect((error as PromotionalAppointmentError).kind).toBe(kind);
    expect(fake.rpcCalls).toHaveLength(1);
    expectNoSideEffectsOutsideTheTransaction();
  });

  it('throws, rather than guessing external, when the classification read fails', async () => {
    fake.classificationError = { message: 'network down' };
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(hireApplicant(PROMOTION_ID)).rejects.toThrow(/network down/);

    expect(fake.rpcCalls).toEqual([]);
    expectNoSideEffectsOutsideTheTransaction();
  });

  it('throws when the application cannot be found', async () => {
    delete fake.applicants[PROMOTION_ID];

    await expect(hireApplicant(PROMOTION_ID)).rejects.toThrow(/not found/i);

    expect(fake.rpcCalls).toEqual([]);
    expectNoSideEffectsOutsideTheTransaction();
  });

  it('retries safely when the RPC committed but the employee read failed', async () => {
    fake.viewError = { message: 'connection reset' };

    const first = await hireApplicant(PROMOTION_ID).catch((e) => e);

    expect(first).toBeInstanceOf(PromotionalAppointmentError);
    expect((first as PromotionalAppointmentError).retryable).toBe(true);
    expect((first as PromotionalAppointmentError).message).toMatch(/retry/i);
    expect(fake.rpcCalls).toHaveLength(1);

    // The retry replays the RPC, which reports the completed appointment.
    fake.viewError = null;
    fake.rpcResult = committed(true);

    const employee = await hireApplicant(PROMOTION_ID);

    expect(employee.id).toBe(EMPLOYEE_UUID);
    expect(fake.rpcCalls).toHaveLength(2);
    expect(fake.rpcCalls.every((c) => c.name === 'complete_promotional_appointment')).toBe(true);
    expectNoSideEffectsOutsideTheTransaction();
  });

  it('reports a missing employee view row as retryable, not as a new hire', async () => {
    fake.viewRow = null;

    const error = await hireApplicant(PROMOTION_ID).catch((e) => e);

    expect(error).toBeInstanceOf(PromotionalAppointmentError);
    expect((error as PromotionalAppointmentError).retryable).toBe(true);
    expectNoSideEffectsOutsideTheTransaction();
  });
});

describe('hireApplicant: external applicants keep the existing path', () => {
  it('returns the backend employee when the backend succeeds', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'backend-employee' }) });

    const employee = await hireApplicant(EXTERNAL_ID);

    expect(employee).toEqual({ id: 'backend-employee' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`/employees/from-applicant/${EXTERNAL_ID}$`));
    expect(fake.rpcCalls).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it.each([
    ['unreachable', () => fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))],
    ['failing', () => fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })],
  ])('falls back to a client-side insert when the backend is %s', async (_label, arrange) => {
    arrange();
    fake.viewRow = { id: 'inserted-employee-uuid', employee_id: 'EMP-AAAAAAAA' };

    const employee = await hireApplicant(EXTERNAL_ID);

    expect(fake.rpcCalls).toEqual([]);
    const inserts = fake.calls.filter((c) => c.table === 'employees' && c.op === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({
      first_name: 'Ana',
      last_name: 'Reyes',
      email: 'ana.reyes@example.org',
      position: 'Clerk I',
      department: 'Human Resource Management Office',
    });
    const statusUpdate = fake.calls.find((c) => c.table === 'applicants' && c.op === 'update');
    expect(statusUpdate?.payload).toMatchObject({ status: 'Hired' });
    expect(employee).toMatchObject({ id: 'inserted-employee-uuid' });
  });

  it('treats a missing application_type as external', async () => {
    fake.applicants[EXTERNAL_ID].application_type = null;
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'backend-employee' }) });

    await hireApplicant(EXTERNAL_ID);

    expect(fake.rpcCalls).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
