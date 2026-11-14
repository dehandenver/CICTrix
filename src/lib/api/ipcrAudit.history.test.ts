import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAuditHistory } from './ipcrAudit';

type Row = Record<string, any>;
const { tables, failTables } = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  failTables: new Set<string>(),
}));

const { inSizes } = vi.hoisted(() => ({ inSizes: [] as number[] }));

// Just enough of the query builder for a read: select / in / eq / ilike / or / order / limit.
vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      let sortDesc: string | null = null;
      let max = Infinity;
      const builder: any = {
        select: () => builder,
        in: (col: string, vals: unknown[]) => { inSizes.push(vals.length); filters.push((r) => vals.includes(r[col])); return builder; },
        eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return builder; },
        ilike: (col: string, pattern: string) => {
          const needle = pattern.replace(/%/g, '').toLowerCase();
          filters.push((r) => String(r[col] ?? '').toLowerCase().includes(needle));
          return builder;
        },
        // The only .or() the reader sends: rows with no reason, or a reason outside the draft list.
        or: (expr: string) => {
          expect(expr).toMatch(/^reason\.is\.null,reason\.not\.in\.\(/);
          const drafts = [...expr.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
          filters.push((r) => r.reason == null || !drafts.includes(r.reason));
          return builder;
        },
        order: (col: string, o: { ascending: boolean }) => { if (!o.ascending) sortDesc = col; return builder; },
        limit: (n: number) => { max = n; return builder; },
        maybeSingle: () => builder,
        then: (resolve: (v: unknown) => void) => {
          if (failTables.has(table)) return resolve({ data: null, error: { message: 'boom' } });
          let out = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          if (sortDesc) out = [...out].sort((a, b) => String(b[sortDesc!]).localeCompare(String(a[sortDesc!])));
          resolve({ data: out.slice(0, max), error: null });
        },
      };
      return builder;
    },
  },
}));

const log = (id: string, action: string, ts: string, extra: Row = {}): Row => ({
  id, action, target_setting_id: 'ts-a', performed_by: 'head-1', performed_by_role: 'office_account',
  reason: null, created_at: `2026-11-0${ts}T08:00:00Z`, ...extra,
});

const seed = () => {
  tables['ipcr_audit_log'] = [
    log('1', 'submit', '1', { performed_by: 'emp-a', performed_by_role: 'employee' }),
    log('2', 'return', '2', { reason: 'Fix the indicators' }),
    log('3', 'approve', '3'),
    log('4', 'approve', '4', { target_setting_id: 'ts-b', performed_by: 'head-2' }),
    log('5', 'rate', '5', { reason: 'Phase 2 rating completed' }),
    log('6', 'rate', '6', { reason: 'Phase 2 partial save' }),
    log('7', 'rate', '7', { performed_by: 'emp-a', performed_by_role: 'employee', reason: 'Phase 2 self-rating draft' }),
    log('8', 'return_phase2', '8', { reason: 'Add evidence' }),
    log('9', 'approve', '9', { target_setting_id: 'ts-x', performed_by: 'ghost' }),
  ];
  tables['target_settings'] = [
    { id: 'ts-a', employee_id: 'emp-a' },
    { id: 'ts-b', employee_id: 'emp-b' },
    { id: 'ts-x', employee_id: 'emp-x' },
  ];
  tables['employees_with_department'] = [
    { id: 'emp-a', full_name: ' Ana Cruz ', current_department: 'Engineering Office' },
    { id: 'emp-b', full_name: 'Ben Reyes', current_department: 'Budget Office' },
    { id: 'head-1', full_name: 'Hilda Head', current_department: 'Engineering Office' },
    { id: 'head-2', full_name: 'Hugo Head', current_department: 'Budget Office' },
  ];
};

afterEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  failTables.clear();
  inSizes.length = 0;
});

const ids = async (p: Parameters<typeof listAuditHistory>[0]) => {
  const res = await listAuditHistory(p);
  if (res.ok === false) throw new Error(res.error);
  return res.data.map((e) => e.id);
};

describe('listAuditHistory', () => {
  it('lists only Phase 1 actions for the target phase, newest first', async () => {
    seed();
    expect(await ids({ phase: 'target' })).toEqual(['9', '4', '3', '2', '1']);
  });

  it('lists only Phase 2 actions for the rating phase and hides draft saves', async () => {
    seed();
    expect(await ids({ phase: 'rating' })).toEqual(['8', '5']);
  });

  it('limits entries to the reviewer’s office, ignoring case and spacing', async () => {
    seed();
    expect(await ids({ phase: 'target', scope: { officeId: null, officeName: ' ENGINEERING office ' } })).toEqual(['3', '2', '1']);
  });

  it('shows every office when no scope is given', async () => {
    seed();
    expect(await ids({ phase: 'target', scope: null })).toContain('4');
  });

  it('resolves the employee and the acting reviewer by name', async () => {
    seed();
    const res = await listAuditHistory({ phase: 'target', scope: { officeId: null, officeName: 'Engineering Office' } });
    if (res.ok === false) throw new Error(res.error);
    const returned = res.data.find((e) => e.id === '2')!;
    expect(returned).toMatchObject({
      employeeName: 'Ana Cruz', department: 'Engineering Office', actorName: 'Hilda Head',
      actorRole: 'office_account', reason: 'Fix the indicators', targetSettingId: 'ts-a',
    });
    expect(res.data.find((e) => e.id === '1')).toMatchObject({ actorName: 'Ana Cruz', actorRole: 'employee' });
  });

  it('shows a dash when the employee or reviewer cannot be found', async () => {
    seed();
    const res = await listAuditHistory({ phase: 'target' });
    if (res.ok === false) throw new Error(res.error);
    expect(res.data.find((e) => e.id === '9')).toMatchObject({ employeeName: '—', actorName: '—' });
  });

  it('returns an empty list when the log has nothing for the phase', async () => {
    tables['ipcr_audit_log'] = [];
    expect(await ids({ phase: 'target' })).toEqual([]);
  });

  it('reports a failed read instead of an empty history', async () => {
    seed();
    failTables.add('ipcr_audit_log');
    expect(await listAuditHistory({ phase: 'target' })).toEqual({ ok: false, error: 'boom' });
  });

  it('finds an office’s entries even when other offices have more than a thousand newer ones', async () => {
    seed();
    const noise = Array.from({ length: 1100 }, (_, i) =>
      log(`n${i}`, 'approve', '9', { target_setting_id: 'ts-b', performed_by: 'head-2', created_at: `2026-12-01T00:${String(i % 60).padStart(2, '0')}:00Z` }));
    tables['ipcr_audit_log'].push(...noise);
    const found = await ids({ phase: 'target', scope: { officeId: null, officeName: 'Engineering Office' } });
    expect(found).toEqual(['3', '2', '1']);
  });

  it('never sends more than 100 ids in one lookup, however many entries there are', async () => {
    const settings = Array.from({ length: 450 }, (_, i) => ({ id: `ts-${i}`, employee_id: `emp-${i}` }));
    tables['target_settings'] = settings;
    tables['employees_with_department'] = settings.map((s, i) => ({ id: s.employee_id, full_name: `Person ${i}`, current_department: 'Engineering Office' }));
    tables['ipcr_audit_log'] = settings.map((s, i) => log(`l${i}`, 'approve', '1', { target_setting_id: s.id, performed_by: s.employee_id }));
    const found = await ids({ phase: 'target', scope: { officeId: null, officeName: 'Engineering Office' } });
    expect(found).toHaveLength(450);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(100);
    inSizes.length = 0;
    expect(await ids({ phase: 'target' })).toHaveLength(450);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(100);
  });

  it('does not let draft saves use up the row limit', async () => {
    seed();
    tables['ipcr_audit_log'].push(
      ...Array.from({ length: 1100 }, (_, i) =>
        log(`d${i}`, 'rate', '9', { performed_by: 'emp-a', performed_by_role: 'employee', reason: 'Phase 2 self-rating draft', created_at: '2026-12-01T00:00:00Z' })),
    );
    expect(await ids({ phase: 'rating' })).toEqual(['8', '5']);
  });
});
