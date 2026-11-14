import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

type Row = Record<string, any>;

type Filter = {
  kind: 'in' | 'eq' | 'neq' | 'not';
  column: string;
  value?: any;
  operator?: string;
};

type Operation = {
  table: string;
  action: 'select' | 'insert' | 'update';
  columns?: string;
  filters: Filter[];
  payload?: any;
};

const remote = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  operations: [] as Operation[],
  failures: [] as Array<{ table: string; action: Operation['action']; error: unknown }>,
}));

vi.mock('./supabase', () => {
  const valueMatches = (actual: unknown, expected: unknown) =>
    actual === expected || String(actual ?? '') === String(expected ?? '');

  const matches = (row: Row, filters: Filter[]) =>
    filters.every((filter) => {
      const actual = row[filter.column];
      if (filter.kind === 'in') {
        return (filter.value as unknown[])
          .map((value) => String(value))
          .includes(String(actual ?? ''));
      }
      if (filter.kind === 'eq') return valueMatches(actual, filter.value);
      if (filter.kind === 'neq') return !valueMatches(actual, filter.value);
      if (filter.kind === 'not') {
        if (filter.operator === 'is' && filter.value === null) {
          return actual !== null && actual !== undefined;
        }
      }
      return true;
    });

  const from = (table: string) => {
    const operation: Operation = { table, action: 'select', filters: [] };
    remote.operations.push(operation);

    const execute = () => {
      const failure = remote.failures.find(
        (candidate) => candidate.table === table && candidate.action === operation.action,
      );
      if (failure) return { data: null, error: failure.error };

      const tableRows = remote.tables[table] ?? (remote.tables[table] = []);

      if (operation.action === 'insert') {
        const inserted = (Array.isArray(operation.payload) ? operation.payload : [operation.payload])
          .map((row: Row) => ({ ...row }));
        tableRows.push(...inserted);
        return { data: inserted, error: null };
      }

      const matched = tableRows.filter((row) => matches(row, operation.filters));

      if (operation.action === 'update') {
        for (const row of matched) Object.assign(row, operation.payload);
      }

      return { data: matched, error: null };
    };

    const builder: any = {
      select: (columns: string) => {
        operation.columns = columns;
        return builder;
      },
      insert: (payload: Row | Row[]) => {
        operation.action = 'insert';
        operation.payload = payload;
        return builder;
      },
      update: (payload: Row) => {
        operation.action = 'update';
        operation.payload = payload;
        return builder;
      },
      in: (column: string, value: unknown[]) => {
        operation.filters.push({ kind: 'in', column, value });
        return builder;
      },
      eq: (column: string, value: unknown) => {
        operation.filters.push({ kind: 'eq', column, value });
        return builder;
      },
      neq: (column: string, value: unknown) => {
        operation.filters.push({ kind: 'neq', column, value });
        return builder;
      },
      not: (column: string, operator: string, value: unknown) => {
        operation.filters.push({ kind: 'not', column, operator, value });
        return builder;
      },
      order: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(execute()).then(resolve, reject),
    };

    return builder;
  };

  return { supabase: { from } };
});

import {
  repairDefaultedEmployeeRecords,
  syncHiredApplicantStatus,
  syncNewlyHiredToEmployees,
} from './hiredApplicantSync';

const STATUS_FLAG = 'cictrix_hired_applicant_sync_done';
const EMPLOYEE_FLAG = 'cictrix_newly_hired_employee_sync_done';
const REPAIR_FLAG = 'cictrix_employee_defaults_repair_done';

const APP_JOB = '11111111-1111-4111-8111-111111111111';
const APP_JOB_ALREADY_HIRED = '22222222-2222-4222-8222-222222222222';
const APP_PROMO_OPEN = '33333333-3333-4333-8333-333333333333';
const APP_PROMO_DONE = '44444444-4444-4444-8444-444444444444';
const APP_MISSING = '55555555-5555-4555-8555-555555555555';
const APP_UNKNOWN = '66666666-6666-4666-8666-666666666666';
const APP_SHARED_JOB = '77777777-7777-4777-8777-777777777777';
const APP_SHARED_PROMO = '88888888-8888-4888-8888-888888888888';
const APP_DUPLICATE = '99999999-9999-4999-8999-999999999999';
const APP_EXISTING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_EXISTING_NUMBER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let warnSpy: MockInstance;
let infoSpy: MockInstance;

const setTable = (table: string, rows: Row[]) => {
  remote.tables[table] = rows.map((row) => ({ ...row }));
};

const tableRows = (table: string): Row[] => remote.tables[table] ?? [];

const findOperation = (table: string, action: Operation['action']) =>
  remote.operations.find((operation) => operation.table === table && operation.action === action);

const inFilterValues = (operation: Operation | undefined, column = 'id'): string[] => {
  const filter = operation?.filters.find(
    (candidate) => candidate.kind === 'in' && candidate.column === column,
  );
  return (filter?.value as string[] | undefined) ?? [];
};

const applicant = (overrides: Row = {}): Row => ({
  id: APP_JOB,
  first_name: 'Maria',
  middle_name: 'Santos',
  last_name: 'Reyes',
  address: 'Iloilo City',
  contact_number: '+63 900 000 0001',
  email: 'maria.reyes@example.test',
  position: 'Computer Science Specialist',
  item_number: 'ABYAN-2026-001',
  office: 'Information Technology',
  is_pwd: false,
  status: 'New Application',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  disqualification_reason: null,
  total_score: null,
  gender: 'Female',
  application_type: 'job',
  ...overrides,
});

const employee = (overrides: Row = {}): Row => ({
  id: 'employee-original-uuid',
  employee_number: 'EMP-2019-001',
  first_name: 'Jose',
  middle_name: 'Cruz',
  last_name: 'Garcia',
  email: 'jose.garcia@example.test',
  phone: '+63 900 000 0002',
  department: 'Administrative Services',
  position: 'Administrative Officer I',
  employment_status: 'Regular',
  date_hired: '2019-03-01',
  status: 'Active',
  created_by: '00000000-0000-0000-0000-000000000000',
  created_at: '2019-03-01T00:00:00.000Z',
  updated_at: '2019-03-01T00:00:00.000Z',
  ...overrides,
});

const newlyHired = (overrides: Row = {}): Row => ({
  id: 'hire-row-1',
  applicant_id: APP_JOB,
  first_name: 'Maria',
  last_name: 'Reyes',
  email: 'maria.reyes@example.test',
  phone: '',
  position: '',
  department: null,
  employment_type: 'Permanent',
  date_hired: '2024-07-15T00:00:00.000Z',
  status: 'Hired',
  employee_id: 'EMP-2026-001',
  created_at: '2024-07-15T00:00:00.000Z',
  updated_at: null,
  ...overrides,
});

beforeEach(() => {
  remote.tables = {};
  remote.operations = [];
  remote.failures = [];
  sessionStorage.clear();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('syncHiredApplicantStatus', () => {
  it('flips a stale external job application to Hired and leaves an already-hired row alone', async () => {
    setTable('applicants', [
      applicant({ id: APP_JOB, status: 'New Application' }),
      applicant({ id: APP_JOB_ALREADY_HIRED, status: 'Hired' }),
      applicant({
        id: APP_PROMO_OPEN,
        status: 'For Contract Signing',
        application_type: 'promotion',
      }),
    ]);
    setTable('newly_hired', [
      newlyHired({ applicant_id: APP_JOB }),
      newlyHired({ id: 'hire-row-2', applicant_id: APP_JOB_ALREADY_HIRED }),
      newlyHired({ id: 'hire-row-3', applicant_id: APP_PROMO_OPEN }),
    ]);

    await syncHiredApplicantStatus();

    expect(tableRows('applicants')[0].status).toBe('Hired');
    expect(tableRows('applicants')[1].status).toBe('Hired');
    expect(tableRows('applicants')[2].status).toBe('For Contract Signing');

    const update = findOperation('applicants', 'update');
    expect(update).toBeDefined();
    expect(inFilterValues(update).sort()).toEqual([APP_JOB, APP_JOB_ALREADY_HIRED].sort());
    expect(update?.filters).toContainEqual({ kind: 'neq', column: 'status', value: 'Hired' });

    const classification = remote.operations.find(
      (operation) => operation.table === 'applicants' && operation.action === 'select',
    );
    expect(classification?.columns).toContain('application_type');
    expect(classification).toBeDefined();
    expect(remote.operations.indexOf(classification!)).toBeLessThan(
      remote.operations.indexOf(update!),
    );
    expect(sessionStorage.getItem(STATUS_FLAG)).toBe('1');
  });

  it('does not set an unfinished promotion to a hire status', async () => {
    setTable('applicants', [
      applicant({
        id: APP_PROMO_OPEN,
        status: 'For Contract Signing',
        application_type: 'promotion',
        position: 'Administrative Officer III',
        office: 'Administrative Services',
      }),
    ]);
    setTable('newly_hired', [
      newlyHired({ applicant_id: APP_PROMO_OPEN, employee_id: 'EMP-STALE-001' }),
    ]);

    await syncHiredApplicantStatus();

    expect(tableRows('applicants')[0].status).toBe('For Contract Signing');
    expect(findOperation('applicants', 'update')).toBeUndefined();
    expect(
      infoSpy.mock.calls
        .map(([message]) => String(message))
        .some((message) => /promotional/i.test(message)),
    ).toBe(true);
    expect(sessionStorage.getItem(STATUS_FLAG)).toBe('1');
  });

  it('does not rewrite a completed promotion status', async () => {
    setTable('applicants', [
      applicant({
        id: APP_PROMO_DONE,
        status: 'Selected',
        application_type: 'promotion',
        position: 'City Government Department Head II',
      }),
    ]);
    setTable('newly_hired', [
      newlyHired({ applicant_id: APP_PROMO_DONE, employee_id: 'EMP-STALE-002' }),
    ]);

    await syncHiredApplicantStatus();

    expect(tableRows('applicants')[0].status).toBe('Selected');
    expect(findOperation('applicants', 'update')).toBeUndefined();
    expect(sessionStorage.getItem(STATUS_FLAG)).toBe('1');
  });

  it('skips duplicate source links for the same external applicant', async () => {
    setTable('applicants', [
      applicant({ id: APP_DUPLICATE, status: 'New Application' }),
    ]);
    setTable('newly_hired', [
      newlyHired({ applicant_id: APP_DUPLICATE }),
      newlyHired({
        id: 'hire-row-2',
        applicant_id: APP_DUPLICATE,
        employee_id: 'EMP-DUP-002',
      }),
    ]);

    await syncHiredApplicantStatus();

    expect(tableRows('applicants')[0].status).toBe('New Application');
    expect(findOperation('applicants', 'update')).toBeUndefined();
    const diagnostic = warnSpy.mock.calls
      .map(([message]) => String(message))
      .find((message) => /duplicate|unresolved|ambiguous/i.test(message));
    expect(diagnostic).toBeDefined();
    expect(diagnostic).not.toContain('maria.reyes@example.test');
    expect(diagnostic).not.toContain('Maria');
    expect(sessionStorage.getItem(STATUS_FLAG)).toBe('1');
  });

  it('updates only the uniquely resolved external jobs in a mixed batch', async () => {
    setTable('applicants', [
      applicant({ id: APP_JOB, status: 'New Application' }),
      applicant({
        id: APP_PROMO_OPEN,
        status: 'For Contract Signing',
        application_type: 'promotion',
      }),
      applicant({
        id: APP_PROMO_DONE,
        status: 'Selected',
        application_type: 'promotion',
      }),
      applicant({ id: APP_UNKNOWN, status: 'For Contract Signing', application_type: 'consultant' }),
      applicant({
        id: APP_SHARED_JOB,
        status: 'New Application',
        email: 'shared.person@example.test',
      }),
      applicant({
        id: APP_SHARED_PROMO,
        status: 'Selected',
        application_type: 'promotion',
        email: 'shared.person@example.test',
      }),
      applicant({ id: APP_DUPLICATE, status: 'New Application' }),
    ]);
    setTable('newly_hired', [
      newlyHired({ applicant_id: APP_JOB }),
      newlyHired({ id: 'hire-row-2', applicant_id: APP_PROMO_OPEN }),
      newlyHired({ id: 'hire-row-3', applicant_id: APP_PROMO_DONE }),
      newlyHired({ id: 'hire-row-4', applicant_id: APP_MISSING }),
      newlyHired({ id: 'hire-row-5', applicant_id: APP_UNKNOWN }),
      newlyHired({ id: 'hire-row-6', applicant_id: APP_SHARED_JOB }),
      newlyHired({ id: 'hire-row-7', applicant_id: APP_SHARED_PROMO }),
      newlyHired({ id: 'hire-row-8', applicant_id: APP_DUPLICATE }),
      newlyHired({ id: 'hire-row-9', applicant_id: APP_DUPLICATE }),
    ]);

    await syncHiredApplicantStatus();

    const statusById = new Map(
      tableRows('applicants').map((row) => [String(row.id), String(row.status)]),
    );
    expect(statusById.get(APP_JOB)).toBe('Hired');
    expect(statusById.get(APP_SHARED_JOB)).toBe('Hired');
    expect(statusById.get(APP_PROMO_OPEN)).toBe('For Contract Signing');
    expect(statusById.get(APP_PROMO_DONE)).toBe('Selected');
    expect(statusById.get(APP_UNKNOWN)).toBe('For Contract Signing');
    expect(statusById.get(APP_SHARED_PROMO)).toBe('Selected');
    expect(statusById.get(APP_DUPLICATE)).toBe('New Application');

    const update = findOperation('applicants', 'update');
    expect(inFilterValues(update).sort()).toEqual([APP_JOB, APP_SHARED_JOB].sort());
    const diagnostic = warnSpy.mock.calls
      .map(([message]) => String(message))
      .find((message) => /duplicate|unresolved|ambiguous/i.test(message));
    expect(diagnostic).toBeDefined();
    expect(diagnostic).not.toContain('maria.reyes@example.test');
    expect(diagnostic).not.toContain('Maria');
    expect(sessionStorage.getItem(STATUS_FLAG)).toBe('1');
  });

  it('leaves the sync retryable when the classification read fails', async () => {
    setTable('applicants', [applicant({ id: APP_JOB, status: 'New Application' })]);
    setTable('newly_hired', [newlyHired({ applicant_id: APP_JOB })]);
    remote.failures.push({
      table: 'applicants',
      action: 'select',
      error: { message: 'classification read unavailable' },
    });

    await syncHiredApplicantStatus();

    expect(tableRows('applicants')[0].status).toBe('New Application');
    expect(findOperation('applicants', 'update')).toBeUndefined();
    expect(sessionStorage.getItem(STATUS_FLAG)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    remote.failures = [];
    await syncHiredApplicantStatus();

    expect(tableRows('applicants')[0].status).toBe('Hired');
    expect(sessionStorage.getItem(STATUS_FLAG)).toBe('1');
  });

  it('honours the existing session flag', async () => {
    sessionStorage.setItem(STATUS_FLAG, '1');
    setTable('applicants', [applicant({ id: APP_JOB, status: 'New Application' })]);
    setTable('newly_hired', [newlyHired({ applicant_id: APP_JOB })]);

    await syncHiredApplicantStatus();

    expect(remote.operations).toHaveLength(0);
    expect(tableRows('applicants')[0].status).toBe('New Application');
  });
});

describe('syncNewlyHiredToEmployees', () => {
  it('backfills a missing external employee from the persisted job application', async () => {
    setTable('applicants', [applicant({ id: APP_JOB })]);
    setTable('employees', []);
    setTable('newly_hired', [
      newlyHired({
        applicant_id: APP_JOB,
        employee_id: 'EMP-2026-001',
        first_name: '',
        last_name: '',
        phone: '',
        position: '',
        department: null,
        employment_type: 'Permanent',
        date_hired: '2024-07-15T00:00:00.000Z',
      }),
    ]);

    await syncNewlyHiredToEmployees();

    const insert = findOperation('employees', 'insert');
    expect(insert).toBeDefined();
    expect(insert?.payload).toEqual([
      {
        id: APP_JOB,
        employee_number: 'EMP-2026-001',
        first_name: 'Maria',
        middle_name: 'Santos',
        last_name: 'Reyes',
        email: 'maria.reyes@example.test',
        phone: '+63 900 000 0001',
        department: 'Information Technology',
        position: 'Computer Science Specialist',
        employment_status: 'Regular',
        date_hired: '2024-07-15',
        status: 'Active',
        created_by: '00000000-0000-0000-0000-000000000000',
      },
    ]);

    const classification = remote.operations.find(
      (operation) => operation.table === 'applicants' && operation.action === 'select',
    );
    expect(classification?.columns).toContain('application_type');
    expect(classification).toBeDefined();
    expect(remote.operations.indexOf(classification!)).toBeLessThan(
      remote.operations.indexOf(insert!),
    );
    expect(sessionStorage.getItem(EMPLOYEE_FLAG)).toBe('1');
  });

  it('does not insert a second employee or reset hire information for a promotion', async () => {
    const originalEmployee = employee({
      id: 'employee-original-uuid',
      employee_number: 'EMP-2019-001',
      position: 'Administrative Officer I',
      department: 'Administrative Services',
      date_hired: '2019-03-01',
    });
    setTable('employees', [originalEmployee]);
    setTable('applicants', [
      applicant({
        id: APP_PROMO_OPEN,
        application_type: 'promotion',
        status: 'For Contract Signing',
        position: 'Administrative Officer III',
        office: 'Administrative Services',
      }),
    ]);
    setTable('newly_hired', [
      newlyHired({
        applicant_id: APP_PROMO_OPEN,
        employee_id: 'EMP-STALE-001',
        position: 'Administrative Officer III',
        department: 'Administrative Services',
        date_hired: '2019-03-01T00:00:00.000Z',
      }),
    ]);

    await syncNewlyHiredToEmployees();

    expect(findOperation('employees', 'insert')).toBeUndefined();
    expect(tableRows('employees')).toEqual([originalEmployee]);
    expect(sessionStorage.getItem(EMPLOYEE_FLAG)).toBe('1');
  });

  it('keeps valid external hires while skipping promotion, unresolved and duplicate links', async () => {
    setTable('applicants', [
      applicant({ id: APP_JOB }),
      applicant({
        id: APP_PROMO_OPEN,
        application_type: 'promotion',
        status: 'For Contract Signing',
        position: 'Administrative Officer III',
      }),
      applicant({ id: APP_UNKNOWN, application_type: 'consultant', status: 'For Contract Signing' }),
      applicant({
        id: APP_SHARED_JOB,
        email: 'shared.person@example.test',
      }),
      applicant({
        id: APP_SHARED_PROMO,
        application_type: 'promotion',
        status: 'Selected',
        email: 'shared.person@example.test',
      }),
      applicant({ id: APP_DUPLICATE }),
    ]);
    setTable('employees', [
      employee({ id: APP_EXISTING_ID, employee_number: 'EMP-EXISTING-ID' }),
      employee({ id: 'employee-other-uuid', employee_number: 'EMP-EXISTING-NUMBER' }),
    ]);
    setTable('newly_hired', [
      newlyHired({ applicant_id: APP_JOB }),
      newlyHired({ id: 'hire-row-2', applicant_id: APP_PROMO_OPEN, employee_id: 'EMP-STALE-001' }),
      newlyHired({ id: 'hire-row-3', applicant_id: APP_MISSING, employee_id: 'EMP-MISSING-001' }),
      newlyHired({ id: 'hire-row-4', applicant_id: APP_UNKNOWN, employee_id: 'EMP-UNKNOWN-001' }),
      newlyHired({ id: 'hire-row-5', applicant_id: APP_SHARED_JOB, employee_id: 'EMP-SHARED-JOB' }),
      newlyHired({
        id: 'hire-row-6',
        applicant_id: APP_SHARED_PROMO,
        employee_id: 'EMP-SHARED-PROMO',
      }),
      newlyHired({ id: 'hire-row-7', applicant_id: APP_DUPLICATE, employee_id: 'EMP-DUP-001' }),
      newlyHired({ id: 'hire-row-8', applicant_id: APP_DUPLICATE, employee_id: 'EMP-DUP-002' }),
      newlyHired({ id: 'hire-row-9', applicant_id: APP_EXISTING_ID, employee_id: 'EMP-EXISTING-ID' }),
      newlyHired({
        id: 'hire-row-10',
        applicant_id: APP_EXISTING_NUMBER,
        employee_id: 'EMP-EXISTING-NUMBER',
      }),
    ]);

    await syncNewlyHiredToEmployees();

    const insert = findOperation('employees', 'insert');
    expect(insert).toBeDefined();
    const insertedIds = (insert?.payload as Row[]).map((row) => row.id).sort();
    expect(insertedIds).toEqual([APP_JOB, APP_SHARED_JOB].sort());

    const employeeIds = tableRows('employees').map((row) => String(row.id));
    expect(employeeIds).not.toContain(APP_PROMO_OPEN);
    expect(employeeIds).not.toContain(APP_MISSING);
    expect(employeeIds).not.toContain(APP_UNKNOWN);
    expect(employeeIds).not.toContain(APP_DUPLICATE);
    expect(employeeIds).not.toContain(APP_SHARED_PROMO);

    const diagnostic = warnSpy.mock.calls
      .map(([message]) => String(message))
      .find((message) => /unresolved|ambiguous/i.test(message));
    expect(diagnostic).toBeDefined();
    expect(diagnostic).not.toContain('maria.reyes@example.test');
    expect(diagnostic).not.toContain('Maria');
    expect(sessionStorage.getItem(EMPLOYEE_FLAG)).toBe('1');
  });

  it('skips different applicant UUIDs that claim one employee number', async () => {
    setTable('applicants', [
      applicant({ id: APP_JOB }),
      applicant({ id: APP_JOB_ALREADY_HIRED, first_name: 'Ana', last_name: 'Mendoza' }),
      applicant({ id: APP_SHARED_JOB }),
    ]);
    setTable('employees', []);
    setTable('newly_hired', [
      newlyHired({ applicant_id: APP_JOB, employee_id: 'EMP-CONFLICT-001' }),
      newlyHired({
        id: 'hire-row-2',
        applicant_id: APP_JOB_ALREADY_HIRED,
        employee_id: 'EMP-CONFLICT-001',
        first_name: 'Ana',
        last_name: 'Mendoza',
      }),
      newlyHired({
        id: 'hire-row-3',
        applicant_id: APP_SHARED_JOB,
        employee_id: 'EMP-UNRELATED-001',
      }),
    ]);

    await syncNewlyHiredToEmployees();

    const insert = findOperation('employees', 'insert');
    expect(insert).toBeDefined();
    expect((insert?.payload as Row[]).map((row) => row.id).sort()).toEqual([APP_SHARED_JOB]);
    expect(tableRows('employees')).toHaveLength(1);
    expect(tableRows('employees')[0].employee_number).toBe('EMP-UNRELATED-001');

    const diagnostic = warnSpy.mock.calls
      .map(([message]) => String(message))
      .find((message) => /conflict|employee_number|employee number/i.test(message));
    expect(diagnostic).toBeDefined();
    expect(diagnostic).not.toContain('maria.reyes@example.test');
    expect(diagnostic).not.toContain('Maria');
    expect(sessionStorage.getItem(EMPLOYEE_FLAG)).toBe('1');
  });

  it('backfills distinct applicant UUIDs that share an email', async () => {
    setTable('applicants', [
      applicant({
        id: APP_JOB,
        first_name: 'Maria',
        last_name: 'Reyes',
        email: 'shared.person@example.test',
      }),
      applicant({
        id: APP_JOB_ALREADY_HIRED,
        first_name: 'Ana',
        last_name: 'Mendoza',
        email: 'shared.person@example.test',
      }),
    ]);
    setTable('employees', []);
    setTable('newly_hired', [
      newlyHired({ applicant_id: APP_JOB, employee_id: 'EMP-2026-001' }),
      newlyHired({
        id: 'hire-row-2',
        applicant_id: APP_JOB_ALREADY_HIRED,
        employee_id: 'EMP-2026-002',
        first_name: 'Ana',
        last_name: 'Mendoza',
        email: 'shared.person@example.test',
      }),
    ]);

    await syncNewlyHiredToEmployees();

    const insert = findOperation('employees', 'insert');
    expect((insert?.payload as Row[]).map((row) => row.id).sort()).toEqual(
      [APP_JOB, APP_JOB_ALREADY_HIRED].sort(),
    );
    expect(tableRows('employees')).toHaveLength(2);
  });

  it('leaves the sync retryable when the classification read fails', async () => {
    setTable('applicants', [applicant({ id: APP_JOB })]);
    setTable('employees', []);
    setTable('newly_hired', [newlyHired({ applicant_id: APP_JOB })]);
    remote.failures.push({
      table: 'applicants',
      action: 'select',
      error: { message: 'classification read unavailable' },
    });

    await syncNewlyHiredToEmployees();

    expect(findOperation('employees', 'insert')).toBeUndefined();
    expect(sessionStorage.getItem(EMPLOYEE_FLAG)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    remote.failures = [];
    await syncNewlyHiredToEmployees();

    expect(findOperation('employees', 'insert')).toBeDefined();
    expect(sessionStorage.getItem(EMPLOYEE_FLAG)).toBe('1');
  });

  it('honours the existing session flag', async () => {
    sessionStorage.setItem(EMPLOYEE_FLAG, '1');
    setTable('applicants', [applicant({ id: APP_JOB })]);
    setTable('employees', []);
    setTable('newly_hired', [newlyHired({ applicant_id: APP_JOB })]);

    await syncNewlyHiredToEmployees();

    expect(remote.operations).toHaveLength(0);
    expect(tableRows('employees')).toHaveLength(0);
  });
});

describe('repairDefaultedEmployeeRecords', () => {
  it('repairs defaulted external job employee fields from the application', async () => {
    setTable('employees', [
      employee({
        id: APP_JOB,
        position: 'Staff',
        department: 'Operations',
        middle_name: null,
      }),
    ]);
    setTable('applicants', [
      applicant({ id: APP_JOB, status: 'Hired' }),
    ]);

    await repairDefaultedEmployeeRecords();

    const update = findOperation('employees', 'update');
    expect(update).toBeDefined();
    expect(update?.payload).toEqual({
      position: 'Computer Science Specialist',
      department: 'Information Technology',
      middle_name: 'Santos',
    });
    expect(tableRows('employees')[0].position).toBe('Computer Science Specialist');
    expect(tableRows('employees')[0].department).toBe('Information Technology');
    expect(tableRows('employees')[0].middle_name).toBe('Santos');
    expect(sessionStorage.getItem(REPAIR_FLAG)).toBe('1');
  });

  it('leaves a promotion employee current role untouched', async () => {
    setTable('employees', [
      employee({
        id: APP_PROMO_DONE,
        position: 'Staff',
        department: 'Operations',
        middle_name: null,
      }),
    ]);
    setTable('applicants', [
      applicant({
        id: APP_PROMO_DONE,
        status: 'Hired',
        application_type: 'promotion',
        position: 'City Government Department Head II',
        office: 'City Administrator Office',
        middle_name: 'Cruz',
      }),
    ]);

    await repairDefaultedEmployeeRecords();

    expect(findOperation('employees', 'update')).toBeUndefined();
    expect(tableRows('employees')[0]).toEqual(
      employee({
        id: APP_PROMO_DONE,
        position: 'Staff',
        department: 'Operations',
        middle_name: null,
      }),
    );
    expect(sessionStorage.getItem(REPAIR_FLAG)).toBe('1');
  });

  it('leaves unknown-type, missing and duplicate application links untouched', async () => {
    setTable('employees', [
      employee({ id: APP_UNKNOWN, position: 'Staff', department: 'Operations' }),
      employee({ id: APP_MISSING, position: 'Staff', department: 'Operations' }),
      employee({ id: APP_DUPLICATE, position: 'Staff', department: 'Operations' }),
    ]);
    setTable('applicants', [
      applicant({ id: APP_UNKNOWN, status: 'Hired', application_type: 'consultant' }),
      applicant({
        id: APP_DUPLICATE,
        status: 'Hired',
        application_type: 'job',
        position: 'Computer Science Specialist',
        office: 'Information Technology',
      }),
      applicant({
        id: APP_DUPLICATE,
        status: 'Hired',
        application_type: 'promotion',
        position: 'Administrative Officer III',
      }),
    ]);

    await repairDefaultedEmployeeRecords();

    expect(findOperation('employees', 'update')).toBeUndefined();
    expect(tableRows('employees').map((row) => row.position)).toEqual(['Staff', 'Staff', 'Staff']);
    expect(sessionStorage.getItem(REPAIR_FLAG)).toBe('1');
  });

  it('leaves the repair retryable when the classification read fails', async () => {
    setTable('employees', [
      employee({ id: APP_JOB, position: 'Staff', department: 'Operations', middle_name: null }),
    ]);
    setTable('applicants', [applicant({ id: APP_JOB, status: 'Hired' })]);
    remote.failures.push({
      table: 'applicants',
      action: 'select',
      error: { message: 'classification read unavailable' },
    });

    await repairDefaultedEmployeeRecords();

    expect(findOperation('employees', 'update')).toBeUndefined();
    expect(sessionStorage.getItem(REPAIR_FLAG)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    remote.failures = [];
    await repairDefaultedEmployeeRecords();

    expect(findOperation('employees', 'update')).toBeDefined();
    expect(sessionStorage.getItem(REPAIR_FLAG)).toBe('1');
  });

  it('honours the existing session flag', async () => {
    sessionStorage.setItem(REPAIR_FLAG, '1');
    setTable('employees', [employee({ id: APP_JOB, position: 'Staff', department: 'Operations' })]);
    setTable('applicants', [applicant({ id: APP_JOB, status: 'Hired' })]);

    await repairDefaultedEmployeeRecords();

    expect(remote.operations).toHaveLength(0);
    expect(tableRows('employees')[0].position).toBe('Staff');
  });
});
