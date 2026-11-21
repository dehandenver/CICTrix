import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: client }));

import { getSuccessionDashboardOverview } from './succession';

type Row = Record<string, unknown>;
type Filter = { column: string; values: unknown[] };
type Query = { table: string; filters: Filter[] };
type QueryResult = { data: Row[] | null; error: { message: string } | null };

let tables: Record<string, Row[]>;
let batchPositions: Row[] | undefined;
let errors: Map<string, string>;
let queries: Query[];

function queryFor(table: string) {
  const filters: Filter[] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push({ column, values: [value] });
      return query;
    },
    in: (column: string, values: unknown[]) => {
      filters.push({ column, values });
      return query;
    },
    order: () => query,
    then: (resolve: (result: QueryResult) => unknown) => {
      queries.push({ table, filters });
      const isBatch = table === 'critical_positions' && filters.some((f) => f.column === 'id');
      const message = errors.get(isBatch ? 'batch' : table);
      const source = isBatch ? batchPositions ?? tables[table] : tables[table];
      const data = (source ?? []).filter((row) =>
        filters.every((f) => f.values.includes(row[f.column])),
      );
      return Promise.resolve(
        resolve({
          data: message ? null : data,
          error: message ? { message } : null,
        }),
      );
    },
  };
  return query;
}

const position = (id: string, departmentId: string, overrides: Row = {}): Row => ({
  id,
  title: 'Engineer III',
  department_id: departmentId,
  incumbent_employee_id: null,
  incumbent_leaving_date: null,
  min_years_experience: 2,
  required_training_hours: 20,
  required_education: 'Bachelor of Science in Civil Engineering',
  required_eligibility: 'None',
  ...overrides,
});

const employee = (id: string, department: string, overrides: Row = {}): Row => ({
  id,
  first_name: 'Ana',
  last_name: 'Cruz',
  position: 'Engineer I',
  department,
  employment_status: 'Regular',
  status: 'Active',
  highest_educational_attainment: 'Bachelor of Science in Civil Engineering',
  date_hired: '2018-01-01',
  ...overrides,
});

const training = (id: string, employeeId: string, hours = 40): Row => ({
  id,
  employee_id: employeeId,
  training_title: 'Engineering Seminar',
  number_of_hours: hours,
  from_date: '2024-01-01',
  to_date: '2024-01-05',
  conducted_by: 'LGU',
});

const counts = async () => {
  const result = await getSuccessionDashboardOverview();
  expect(result.ok).toBe(true);
  if ('error' in result) throw new Error(result.error);
  return result.data.positions.map((p) => [p.id, p.successorCount]);
};

describe('getSuccessionDashboardOverview (V2)', () => {
  beforeEach(() => {
    queries = [];
    errors = new Map();
    batchPositions = undefined;
    tables = {
      critical_positions: [
        position('p-eng', 'd-eng', {
          incumbent_employee_id: 'incumbent',
          incumbent_leaving_date: '2027-03-01',
        }),
        position('p-fin', 'd-fin'),
        position('p-zero', 'd-eng', { required_training_hours: 100 }),
      ],
      departments: [
        { id: 'd-eng', name: 'Engineering' },
        { id: 'd-fin', name: 'Finance' },
      ],
      employees: [
        employee('emp-eng', 'Engineering'),
        employee('incumbent', 'Engineering'),
        employee('emp-fin-1', 'Finance'),
        employee('emp-fin-2', 'Finance'),
      ],
      employee_training: [
        training('tr-1', 'emp-eng', 40),
        training('tr-2', 'emp-fin-1', 40),
        training('tr-3', 'emp-fin-2', 40),
      ],
      employees_with_department: [{ id: 'incumbent', full_name: '  Maria Santos  ' }],
    };
    client.from.mockReset().mockImplementation(queryFor);
  });

  it('loads shared inputs once for all positions via V2 and preserves department-scoped counts and metadata', async () => {
    const result = await getSuccessionDashboardOverview();

    expect(result).toEqual({
      ok: true,
      data: {
        positions: [
          {
            id: 'p-eng',
            title: 'Engineer III',
            departmentId: 'd-eng',
            departmentName: 'Engineering',
            incumbentName: 'Maria Santos',
            incumbentLeavingDate: '2027-03-01',
            successorCount: 1,
          },
          {
            id: 'p-fin',
            title: 'Engineer III',
            departmentId: 'd-fin',
            departmentName: 'Finance',
            incumbentName: null,
            incumbentLeavingDate: null,
            successorCount: 2,
          },
          {
            id: 'p-zero',
            title: 'Engineer III',
            departmentId: 'd-eng',
            departmentName: 'Engineering',
            incumbentName: null,
            incumbentLeavingDate: null,
            successorCount: 0,
          },
        ],
      },
    });

    const batchReads = queries.filter((q) => q.table === 'critical_positions' && q.filters.length);
    expect(batchReads).toEqual([
      {
        table: 'critical_positions',
        filters: [{ column: 'id', values: ['p-eng', 'p-fin', 'p-zero'] }],
      },
    ]);
    for (const table of [
      'employees',
      'employee_training',
      'employee_education',
      'employee_eligibility',
      'employee_work_experience',
      'target_settings',
      'succession_candidates',
    ]) {
      expect(queries.filter((q) => q.table === table), table).toHaveLength(1);
    }
  });

  it('keeps manual candidates outside the active pool in the right position', async () => {
    tables.employees.push(employee('emp-manual', 'Another office', { status: 'Resigned' }));
    tables.employee_training.push(training('tr-manual', 'emp-manual', 120));
    tables.succession_candidates = [
      { id: 'mc-1', critical_position_id: 'p-zero', employee_id: 'emp-manual' },
    ];

    expect(await counts()).toEqual([
      ['p-eng', 1],
      ['p-fin', 2],
      ['p-zero', 1],
    ]);
  });

  it('keeps a missing position unknown without discarding successful counts or zero', async () => {
    batchPositions = tables.critical_positions.filter((p) => p.id !== 'p-fin');

    expect(await counts()).toEqual([
      ['p-eng', 1],
      ['p-fin', null],
      ['p-zero', 0],
    ]);
  });

  it.each(['employees', 'batch'])(
    'keeps every count unknown when the shared %s read fails',
    async (table) => {
      errors.set(table, 'Read failed');

      expect(await counts()).toEqual([
        ['p-eng', null],
        ['p-fin', null],
        ['p-zero', null],
      ]);
    },
  );

  it('does not load the engine or incumbents when there are no positions', async () => {
    tables.critical_positions = [];

    expect(await getSuccessionDashboardOverview()).toEqual({ ok: true, data: { positions: [] } });
    expect(queries.map((q) => q.table)).toEqual(['critical_positions', 'departments']);
  });

  it.each(['critical_positions', 'departments'])(
    'reports the initial %s failure instead of an empty overview',
    async (table) => {
      errors.set(table, 'Permission denied');

      expect(await getSuccessionDashboardOverview()).toEqual({
        ok: false,
        error: 'Permission denied',
      });
      expect(queries).toHaveLength(2);
    },
  );
});
