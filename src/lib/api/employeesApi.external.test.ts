import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * External hire, client fallback: the office, division and plantilla number
 * come from the reserved plantilla's posting (the same source the promotion
 * transaction uses), and the office is written as the active department's own
 * name. A hire the database would reject is refused before anything is written.
 */

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };
type Row = Record<string, unknown>;

const { fake } = vi.hoisted(() => ({
  fake: {
    calls: [] as Array<{ table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> }>,
    applicants: {} as Record<string, Record<string, unknown>>,
    slots: {} as Record<string, Record<string, unknown>>,
    postings: [] as Array<Record<string, unknown>>,
    departments: [] as Array<Record<string, unknown>>,
    slotError: null as { message: string } | null,
    postingError: null as { message: string } | null,
    departmentError: null as { message: string } | null,
    viewRow: null as Record<string, unknown> | null,
  },
}));

vi.mock('../supabase', () => {
  const filterValue = (q: Call, column: string) => q.filters.find(([c]) => c === column)?.[1];

  const resolveQuery = (q: Call) => {
    if (q.table === 'applicants' && q.op === 'select') {
      const id = String(filterValue(q, 'id'));
      return { data: fake.applicants[id] ?? null, error: null };
    }
    if (q.table === 'plantilla_slots') {
      if (fake.slotError) return { data: null, error: fake.slotError };
      return { data: fake.slots[String(filterValue(q, 'id'))] ?? null, error: null };
    }
    if (q.table === 'job_postings') {
      if (fake.postingError) return { data: null, error: fake.postingError };
      const live = fake.postings.filter((p) => p.deleted_at == null);
      const id = filterValue(q, 'id');
      if (id !== undefined) return { data: live.find((p) => p.id === id) ?? null, error: null };
      const title = String(filterValue(q, 'title') ?? '').toLowerCase();
      return { data: live.filter((p) => String(p.title ?? '').toLowerCase() === title), error: null };
    }
    if (q.table === 'departments') {
      if (fake.departmentError) return { data: null, error: fake.departmentError };
      return { data: fake.departments.filter((d) => d.is_active === filterValue(q, 'is_active')), error: null };
    }
    if (q.table === 'employees_with_department') {
      return { data: fake.viewRow, error: null };
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
      rpc: () => Promise.reject(new Error('rpc must not be called for an external hire')),
    },
  };
});

import { ExternalHireError, hireApplicant } from './employeesApi';

const APPLICANT_ID = '11111111-0000-4000-8000-0000000000bb';
const SLOT_ID = 'slot-1';
const POSTING_ID = 'posting-1';

const baseApplicant = (overrides: Row = {}): Row => ({
  id: APPLICANT_ID,
  application_type: 'job',
  employee_id: null,
  first_name: 'Ana',
  last_name: 'Reyes',
  email: 'ana.reyes@example.org',
  position: 'Accountant II',
  office: 'Budget Office',
  gender: 'Female',
  plantilla_slot_id: SLOT_ID,
  ...overrides,
});

const fetchMock = vi.fn();

const inserts = () => fake.calls.filter((c) => c.table === 'employees' && c.op === 'insert');
const applicantUpdates = () => fake.calls.filter((c) => c.table === 'applicants' && c.op === 'update');
const employeesTouched = () => fake.calls.filter((c) => c.table === 'employees');
const expectNothingWritten = () => {
  expect(inserts()).toEqual([]);
  expect(applicantUpdates()).toEqual([]);
  expect(employeesTouched()).toEqual([]);
};

beforeEach(() => {
  fake.calls = [];
  fake.applicants = { [APPLICANT_ID]: baseApplicant() };
  fake.slots = { [SLOT_ID]: { id: SLOT_ID, job_posting_id: POSTING_ID, label: 'Plantilla 3', division: ' Accounting Division ' } };
  fake.postings = [
    {
      id: POSTING_ID,
      title: 'Accountant II',
      department: ' office of the city accountant ',
      division: 'Posting Division',
      deleted_at: null,
    },
  ];
  fake.departments = [
    { name: 'Office of The City Accountant', is_active: true },
    { name: 'Human Resource Management Office', is_active: true },
    { name: 'Budget Office', is_active: false },
  ];
  fake.slotError = null;
  fake.postingError = null;
  fake.departmentError = null;
  fake.viewRow = { id: 'inserted-employee-uuid', employee_id: 'EMP-AAAAAAAA' };
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('hireApplicant: external fallback with a reserved plantilla', () => {
  it('writes the active department name, the slot division and the plantilla number', async () => {
    await hireApplicant(APPLICANT_ID);

    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].payload).toMatchObject({
      department: 'Office of The City Accountant',
      division: 'Accounting Division',
      plantilla_num: '3',
      position: 'Accountant II',
    });
    expect(applicantUpdates()).toHaveLength(1);
  });

  it('never writes a department_id', async () => {
    await hireApplicant(APPLICANT_ID);

    expect(inserts()[0].payload).not.toHaveProperty('department_id');
  });

  it('falls back to the posting division when the slot has none', async () => {
    fake.slots[SLOT_ID].division = '   ';

    await hireApplicant(APPLICANT_ID);

    expect(inserts()[0].payload).toMatchObject({ division: 'Posting Division' });
  });

  it('writes a null division when neither the slot nor the posting has one', async () => {
    fake.slots[SLOT_ID].division = null;
    fake.postings[0].division = '';

    await hireApplicant(APPLICANT_ID);

    expect(inserts()[0].payload).toMatchObject({ division: null });
  });

  it('hires with a null plantilla number when the label has no number', async () => {
    fake.slots[SLOT_ID].label = 'Item 101 / Slot 1';

    await hireApplicant(APPLICANT_ID);

    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].payload).toMatchObject({ plantilla_num: null });
  });

  it('uses the posting office, ignoring the applicant office and the title lookup', async () => {
    fake.applicants[APPLICANT_ID].office = 'Human Resource Management Office';

    await hireApplicant(APPLICANT_ID);

    expect(inserts()[0].payload).toMatchObject({ department: 'Office of The City Accountant' });
    const titleLookups = fake.calls.filter((c) => c.table === 'job_postings' && c.filters.some(([col]) => col === 'title'));
    expect(titleLookups).toEqual([]);
  });

  it('refuses an inactive office before any employee lookup, insert or applicant update', async () => {
    fake.postings[0].department = 'Budget Office';

    const error = await hireApplicant(APPLICANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ExternalHireError);
    expect(error.name).toBe('ExternalHireError');
    expect(error.retryable).toBe(false);
    expect(error.message).toBe(
      'Office "Budget Office" is not an active office. Change the job posting\'s office to an active one, then hire again.',
    );
    expectNothingWritten();
  });

  it('refuses a blank office', async () => {
    fake.postings[0].department = '   ';

    const error = await hireApplicant(APPLICANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ExternalHireError);
    expect(error.message).toBe("This application has no office. Set the job posting's office, then hire again.");
    expectNothingWritten();
  });

  it('refuses an office that matches more than one active department', async () => {
    fake.departments.push({ name: 'OFFICE OF THE CITY ACCOUNTANT', is_active: true });

    const error = await hireApplicant(APPLICANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ExternalHireError);
    expect(error.message).toBe(
      'Office "office of the city accountant" matches more than one active office. Resolve the duplicate first.',
    );
    expectNothingWritten();
  });

  it('refuses when the posting no longer exists', async () => {
    fake.postings[0].deleted_at = '2026-10-01T00:00:00Z';

    const error = await hireApplicant(APPLICANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ExternalHireError);
    expect(error.message).toBe('The job posting for this plantilla no longer exists.');
    expectNothingWritten();
  });

  it('refuses when the plantilla no longer exists', async () => {
    delete fake.slots[SLOT_ID];

    const error = await hireApplicant(APPLICANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ExternalHireError);
    expect(error.message).toBe('The job posting for this plantilla no longer exists.');
    expectNothingWritten();
  });

  it.each([
    ['plantilla', () => { fake.slotError = { message: 'connection reset' }; }],
    ['posting', () => { fake.postingError = { message: 'connection reset' }; }],
    ['department', () => { fake.departmentError = { message: 'connection reset' }; }],
  ])('throws a plain, retryable error when the %s read fails', async (_label, arrange) => {
    arrange();

    const error = await hireApplicant(APPLICANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ExternalHireError);
    expectNothingWritten();
  });
});

describe('hireApplicant: external fallback without a reserved plantilla', () => {
  beforeEach(() => {
    fake.applicants[APPLICANT_ID] = baseApplicant({
      plantilla_slot_id: null,
      office: 'Human Resource Management Office',
    });
  });

  it('uses the applicant office when several postings share the title', async () => {
    fake.postings.push({
      id: 'posting-2',
      title: 'accountant ii',
      department: 'Budget Office',
      division: null,
      deleted_at: null,
    });

    await hireApplicant(APPLICANT_ID);

    expect(inserts()[0].payload).toMatchObject({
      department: 'Human Resource Management Office',
      division: null,
      plantilla_num: null,
    });
  });

  it('uses the posting department and division when exactly one posting has the title', async () => {
    await hireApplicant(APPLICANT_ID);

    expect(inserts()[0].payload).toMatchObject({
      department: 'Office of The City Accountant',
      division: 'Posting Division',
      plantilla_num: null,
    });
  });

  it('ignores deleted postings when counting matches', async () => {
    fake.postings.push({ id: 'posting-2', title: 'Accountant II', department: 'Budget Office', division: null, deleted_at: '2026-10-01T00:00:00Z' });

    await hireApplicant(APPLICANT_ID);

    expect(inserts()[0].payload).toMatchObject({ department: 'Office of The City Accountant' });
  });

  it('uses the applicant office when no posting has the title', async () => {
    fake.postings = [];

    await hireApplicant(APPLICANT_ID);

    expect(inserts()[0].payload).toMatchObject({ department: 'Human Resource Management Office' });
  });

  it('refuses an inactive applicant office with nothing written', async () => {
    fake.postings = [];
    fake.applicants[APPLICANT_ID].office = 'Budget Office';

    const error = await hireApplicant(APPLICANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ExternalHireError);
    expect(error.message).toContain('Office "Budget Office" is not an active office.');
    expectNothingWritten();
  });

  it('refuses a blank applicant office', async () => {
    fake.postings = [];
    fake.applicants[APPLICANT_ID].office = null;

    const error = await hireApplicant(APPLICANT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ExternalHireError);
    expect(error.message).toBe("This application has no office. Set the job posting's office, then hire again.");
    expectNothingWritten();
  });
});
