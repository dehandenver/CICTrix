import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyTargets, saveTargetSetting, type TargetsByFunction } from './ipcrTargets';

type Row = Record<string, any>;
const { db, failTables } = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Row[]>, next: 1 },
  failTables: new Set<string>(),
}));

vi.mock('./phaseSchedules', async (importActual) => ({
  ...(await importActual<typeof import('./phaseSchedules')>()),
  loadEffectiveSchedules: async () => ({ target: { mode: 'Open' }, rating: null }),
}));

// A small in-memory table store: just enough of the query builder for saveTargetSetting.
vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const rows = (db.tables[table] ??= []);
      let op = 'select';
      let payload: any;
      let single: 'single' | 'maybe' | null = null;
      let returning = false;
      const filters: Array<(r: Row) => boolean> = [];
      const matching = () => rows.filter((r) => filters.every((f) => f(r)));
      const run = () => {
        if (failTables.has(table)) return { data: null, error: { message: 'boom' } };
        let result: Row[] = [];
        if (op === 'insert') {
          result = [].concat(payload).map((p: Row) => ({ id: `${table}-${db.next++}`, ...p }));
          rows.push(...result);
        } else if (op === 'upsert') {
          const existing = rows.find((r) => r.employee_id === payload.employee_id && r.cycle_id === payload.cycle_id);
          if (existing) Object.assign(existing, payload);
          else rows.push({ id: `${table}-${db.next++}`, ...payload });
          result = [existing ?? rows[rows.length - 1]];
        } else if (op === 'update') {
          result = matching();
          result.forEach((r) => Object.assign(r, payload));
        } else if (op === 'delete') {
          matching().forEach((r) => rows.splice(rows.indexOf(r), 1));
        } else {
          result = matching();
        }
        if (single) return { data: result[0] ?? null, error: single === 'single' && !result[0] ? { message: 'no row' } : null };
        return { data: result, error: null };
      };
      const builder: any = {
        select: () => { returning = true; return builder; },
        insert: (p: unknown) => { op = 'insert'; payload = p; return builder; },
        upsert: (p: unknown) => { op = 'upsert'; payload = p; return builder; },
        update: (p: unknown) => { op = 'update'; payload = p; return builder; },
        delete: () => { op = 'delete'; return builder; },
        eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return builder; },
        in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return builder; },
        order: () => builder,
        limit: () => builder,
        single: () => { single = 'single'; return builder; },
        maybeSingle: () => { single = 'maybe'; return builder; },
        then: (resolve: (v: unknown) => void) => { void returning; resolve(run()); },
      };
      return builder;
    },
  },
}));

afterEach(() => {
  db.tables = {};
  db.next = 1;
  failTables.clear();
  vi.restoreAllMocks();
});

const targets = (): TargetsByFunction => {
  const t = emptyTargets();
  t.core[0].title = 'Payroll';
  t.core[0].indicators[0].description = 'Pay on time';
  return t;
};
const save = (submit: boolean) =>
  saveTargetSetting({ employeeId: 'emp-1', cycleId: 1, targets: targets(), submit });
const audits = () => db.tables['ipcr_audit_log'] ?? [];

describe('saveTargetSetting audit entry', () => {
  it('logs the employee’s submit', async () => {
    const res = await save(true);
    expect(res.ok).toBe(true);
    expect(audits()).toEqual([
      expect.objectContaining({ action: 'submit', performed_by: 'emp-1', performed_by_role: 'employee', reason: null }),
    ]);
    expect(audits()[0].target_setting_id).toBe(db.tables['target_settings'][0].id);
  });

  it('does not log a draft save', async () => {
    expect((await save(false)).ok).toBe(true);
    expect(audits()).toHaveLength(0);
  });

  it('labels a resubmit after a return', async () => {
    db.tables['target_settings'] = [{ id: 'ts-9', employee_id: 'emp-1', cycle_id: 1, status: 'returned_for_revision' }];
    const res = await save(true);
    expect(res.ok).toBe(true);
    expect(audits()).toEqual([expect.objectContaining({ action: 'submit', reason: 'Resubmitted after revision' })]);
  });

  it('keeps a returned record returned when the employee only saves a draft', async () => {
    db.tables['target_settings'] = [{ id: 'ts-9', employee_id: 'emp-1', cycle_id: 1, status: 'returned_for_revision' }];
    expect((await save(false)).ok).toBe(true);
    expect(db.tables['target_settings'][0].status).toBe('returned_for_revision');
  });

  it('still submits when the audit row cannot be saved', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    failTables.add('ipcr_audit_log');
    const res = await save(true);
    expect(res.ok).toBe(true);
    expect(db.tables['target_settings'][0].status).toBe('submitted_for_approval');
  });
});
