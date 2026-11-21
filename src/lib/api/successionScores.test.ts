import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: client }));

import {
  fetchSuccessionPoolV2,
  fetchSuccessionPoolsV2,
  getLatestOverallScores,
  getSuccessionDashboardOverview,
} from './succession';

type Row = Record<string, any>;
type Query = { table: string; columns: string; count?: string; filters: { column: string; values: unknown[] }[] };
let tables: Record<string, Row[]>;
let queries: Query[];
let errors: Set<string>;
let rejections: Set<string>;
let configCount: number | null | undefined;

const config = (departmentId: string, core: unknown, strategic: unknown, support: unknown) => ({
  department_id: departmentId, is_active: true,
  weighting_schema_options: { core_weight: core, strategic_weight: strategic, support_weight: support },
});
const mfo = (settingId: string, fn: string, score: number | null) => ({
  target_setting_id: settingId, function_type: fn,
  success_indicators: [{ success_indicator_ratings: [{ quality: score, efficiency: score, timeliness: score }] }],
});

beforeEach(() => {
  queries = [];
  errors = new Set();
  rejections = new Set();
  configCount = undefined;
  tables = {
    target_settings: ['a', 'b', 'c'].map((id) => ({
      id: `s-${id}`, employee_id: id, cycle_id: 1, approved_at: '2026-10-01', status: 'approved', phase2_status: 'completed',
    })),
    employees: ['a', 'b', 'c'].map((id) => ({
      id, department: id === 'a' ? ' Office A ' : `Office ${id.toUpperCase()}`,
      first_name: 'Test', last_name: id, position: 'Engineer I', employment_status: 'Regular', status: 'Active',
      highest_educational_attainment: 'Bachelor of Science in Civil Engineering', date_hired: '2018-01-01',
    })),
    departments: ['a', 'b', 'c'].map((id) => ({ id: `d-${id}`, name: `Office ${id.toUpperCase()}`, is_active: id !== 'c' })),
    department_weighting_configs: [config('d-a', 50, 50, 0), config('d-b', 60, 0, 40), config('d-c', 50, 30, 20)],
    mfos: ['a', 'b', 'c'].flatMap((id) => [mfo(`s-${id}`, 'core', 5), mfo(`s-${id}`, 'strategic', 2), mfo(`s-${id}`, 'support', 3)]),
    performance_cycles: [{ id: 1, title: '2026' }],
  };
  client.from.mockReset().mockImplementation((table: string) => {
    const entry: Query = { table, columns: '', filters: [] };
    let ordering: string | undefined;
    const query = {
      select: (columns: string, options?: { count: string }) => {
        entry.columns = columns;
        if (options) entry.count = options.count;
        return query;
      },
      in: (column: string, values: unknown[]) => { entry.filters.push({ column, values }); return query; },
      eq: (column: string, value: unknown) => { entry.filters.push({ column, values: [value] }); return query; },
      order: (column: string) => { ordering = column; return query; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        queries.push(entry);
        if (rejections.has(table)) return Promise.reject(new Error('Private network detail')).then(resolve, reject);
        const failed = errors.has(table) || (table === 'employees' && entry.columns.includes('department_id'));
        let data = (tables[table] ?? []).filter((row) => entry.filters.every((f) => f.values.includes(row[f.column])));
        if (ordering) data = [...data].sort((a, b) => String(b[ordering!]).localeCompare(String(a[ordering!])));
        return Promise.resolve(resolve({
          data: failed ? null : data,
          error: failed ? { code: '42703', message: 'Private database detail' } : null,
          count: table === 'department_weighting_configs' && configCount !== undefined ? configCount : data.length,
        }));
      },
    };
    return query;
  });
});

describe('getLatestOverallScores query boundary', () => {
  it('resolves employee names in bulk and uses each office split, including inactive offices', async () => {
    const scores = await getLatestOverallScores(['a', 'b', 'c', 'a']);
    expect([...scores.values()].map((s) => s.overallScore)).toEqual([3.5, 4.2, 3.7]);
    expect(scores.get('b')).toEqual({ overallScore: 4.2, adjectival: 'Very Satisfactory', period: '2026', cycleId: 1 });
    expect(queries.filter((q) => q.table === 'employees')).toEqual([{
      table: 'employees', columns: 'id, department', filters: [{ column: 'id', values: ['a', 'b', 'c'] }],
    }]);
    expect(queries.filter((q) => q.table === 'departments')).toEqual([{
      table: 'departments', columns: 'id, name', filters: [{ column: 'name', values: ['Office A', 'Office B', 'Office C'] }],
    }]);
    expect(queries.filter((q) => q.table === 'department_weighting_configs')).toHaveLength(1);
    expect(queries.find((q) => q.table === 'department_weighting_configs')?.count).toBe('exact');
  });

  it('falls back only when a successfully mapped office has no active config', async () => {
    tables.department_weighting_configs = [config('d-b', 60, 0, 40), { ...config('d-a', 50, 50, 0), is_active: false }];
    expect((await getLatestOverallScores(['a'])).get('a')?.overallScore).toBe(3.33);
  });

  it('accepts numeric database strings and excludes unrated categories without changing rounding', async () => {
    tables.department_weighting_configs = [config('d-b', '60', '0', '40')];
    tables.mfos = [mfo('s-b', 'core', 4.33), mfo('s-b', 'support', null)];
    expect((await getLatestOverallScores(['b'])).get('b')?.overallScore).toBe(4.33);
  });

  it('preserves latest completed selection and optional cycle pin', async () => {
    tables.target_settings.push(
      { ...tables.target_settings[0], id: 'old', cycle_id: 2, approved_at: '2025-01-01' },
      { ...tables.target_settings[0], id: 'unfinished', approved_at: '2027-01-01', phase2_status: 'submitted' },
    );
    tables.performance_cycles.push({ id: 2, title: '2025' });
    tables.mfos.push(mfo('old', 'core', 2));
    expect((await getLatestOverallScores(['a'])).get('a')?.overallScore).toBe(3.5);
    expect((await getLatestOverallScores(['a'], 2)).get('a')).toMatchObject({ overallScore: 2, period: '2025', cycleId: 2 });
  });

  it('does not look up departments for unrated employees or empty input', async () => {
    expect(await getLatestOverallScores([])).toEqual(new Map());
    expect(queries).toHaveLength(0);
    expect(await getLatestOverallScores(['unknown'])).toEqual(new Map());
    expect(queries.map((q) => q.table)).toEqual(['target_settings']);
  });

  it.each(['employees', 'departments', 'department_weighting_configs'])('rejects a failed %s read with a safe contextual error', async (table) => {
    errors.add(table);
    await expect(getLatestOverallScores(['a'])).rejects.toThrow(/IPCR/);
    await expect(getLatestOverallScores(['a'])).rejects.not.toThrow('Private database detail');
  });

  it.each(['employees', 'departments', 'department_weighting_configs'])('sanitizes a rejected %s request too', async (table) => {
    rejections.add(table);
    await expect(getLatestOverallScores(['a'])).rejects.toThrow(/IPCR/);
    await expect(getLatestOverallScores(['a'])).rejects.not.toThrow('Private network detail');
  });

  it.each([null, '', 'Unknown office', 'office a'])('rejects an unresolved department %s rather than guessing or averaging', async (name) => {
    tables.employees[0].department = name;
    await expect(getLatestOverallScores(['a'])).rejects.toThrow(/department/i);
  });

  it('rejects a missing employee row', async () => {
    tables.employees = [];
    await expect(getLatestOverallScores(['a'])).rejects.toThrow(/department/i);
  });

  it('rejects duplicate employee rows', async () => {
    tables.employees.push(tables.employees[0]);
    await expect(getLatestOverallScores(['a'])).rejects.toThrow(/department/i);
  });

  it('rejects an ambiguous exact department match', async () => {
    tables.departments.push({ id: 'duplicate', name: 'Office A' });
    await expect(getLatestOverallScores(['a'])).rejects.toThrow(/department/i);
  });

  it.each([null, [], {}, { core_weight: null, strategic_weight: 50, support_weight: 50 },
    { core_weight: '', strategic_weight: 50, support_weight: 50 },
    { core_weight: -10, strategic_weight: 60, support_weight: 50 },
    { core_weight: 'bad', strategic_weight: 50, support_weight: 50 },
    { core_weight: 0, strategic_weight: 0, support_weight: 0 },
    { core_weight: 50, strategic_weight: 30, support_weight: 30 },
  ])('rejects malformed active weights %#', async (weights) => {
    tables.department_weighting_configs[0].weighting_schema_options = weights as any;
    await expect(getLatestOverallScores(['a'])).rejects.toThrow(/weight/i);
  });

  it('rejects duplicate active configs', async () => {
    tables.department_weighting_configs.push(config('d-a', 60, 0, 40));
    await expect(getLatestOverallScores(['a'])).rejects.toThrow(/weight/i);
  });

  it('does not mistake truncated config results for unconfigured offices', async () => {
    configCount = 2;
    await expect(getLatestOverallScores(['a'])).rejects.toThrow(/weight/i);
  });

  it('rejects config responses without a completeness count', async () => {
    configCount = null;
    await expect(getLatestOverallScores(['a'])).rejects.toThrow(/weight/i);
  });
});

describe('succession scoring integration (V2)', () => {
  beforeEach(() => {
    tables.critical_positions = [
      {
        id: 'p',
        title: 'Engineer III',
        department_id: 'd-b',
        min_years_experience: 1,
        required_training_hours: 10,
        required_education: 'Bachelor of Science in Civil Engineering',
        required_eligibility: 'None',
      },
    ];
    tables.employee_training = [
      { id: 't-a', employee_id: 'a', training_title: 'Engineering Seminar', number_of_hours: 20, from_date: '2024-01-01', to_date: '2024-01-02' },
      { id: 't-b', employee_id: 'b', training_title: 'Engineering Seminar', number_of_hours: 20, from_date: '2024-01-01', to_date: '2024-01-02' },
    ];
    // This manual candidate is from a different office and outside the active pool.
    tables.employees[0].status = 'Resigned';
    tables.succession_candidates = [{ id: 'manual', employee_id: 'a', critical_position_id: 'p' }];
  });

  it('uses corrected employee-specific scores consistently in single and batch V2 results', async () => {
    const single = await fetchSuccessionPoolV2('p', '2026-10-28');
    const batch = await fetchSuccessionPoolsV2(['p'], '2026-10-28');
    expect(single).toEqual(batch.get('p'));
    expect(single.ranked.map((r) => [r.candidate.employeeId, r.audit.performanceRating])).toEqual([
      ['b', 4.2],
      ['a', 3.5],
    ]);
  });

  it('rejects pool fetch and leaves overview count unknown, not empty, when scores cannot be loaded', async () => {
    errors.add('department_weighting_configs');
    await expect(fetchSuccessionPoolV2('p', '2026-10-28')).rejects.toThrow(/IPCR|weight/i);
    const overview = await getSuccessionDashboardOverview();
    expect(overview).toMatchObject({ ok: true, data: { positions: [{ id: 'p', successorCount: null }] } });
  });
});
