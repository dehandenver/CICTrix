import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeSelfRatingPeriod,
  loadEmployeeRatingSheet,
  returnPhase2ForRevision,
  saveEmployeeRatings,
} from './ipcrRatings';

type Filter = [string, string, unknown];
type Call = { table: string; op: string; payload?: any; filters: Filter[]; single: boolean };
const { calls, respond, notify, stage } = vi.hoisted(() => ({
  calls: [] as any[],
  respond: { fn: (_c: any): unknown => null },
  notify: vi.fn(),
  stage: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [], single: false };
      calls.push(call);
      const builder: any = {
        select: () => builder,
        update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return builder; },
        insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; },
        upsert: (payload: unknown) => { call.op = 'upsert'; call.payload = payload; return builder; },
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => { call.single = true; return builder; },
        then: (resolve: (v: unknown) => void) => resolve({ data: respond.fn(call), error: null }),
      };
      for (const f of ['eq', 'is', 'in', 'neq']) {
        builder[f] = (col: string, val: unknown) => { call.filters.push([f, col, val]); return builder; };
      }
      return builder;
    },
  },
}));
vi.mock('./ipcrSubmissions', () => ({
  setSubmissionStage: stage,
  resolveTargetSettingMeta: async () => ({ employeeId: 'emp-1', employeeName: 'Ana', officeId: 'o', officeName: 'O', period: 'P' }),
}));
vi.mock('./employeeNotifications', () => ({ createNotifications: notify }));

afterEach(() => {
  calls.length = 0;
  respond.fn = () => null;
  vi.clearAllMocks();
});

const settingsUpdate = () => calls.find((c: Call) => c.table === 'target_settings' && c.op === 'update') as Call;
const audits = () => calls.filter((c: Call) => c.table === 'ipcr_audit_log' && c.op === 'insert');

describe('returnPhase2ForRevision', () => {
  const returnIt = () => returnPhase2ForRevision({
    targetSettingId: 'ts-1', approverEmployeeId: 'head-1', submitterEmployeeId: 'emp-1', comment: '',
  });

  it('marks the sheet returned and only touches a sheet still waiting for review', async () => {
    respond.fn = (c) => (c.table === 'target_settings' && c.op === 'update' ? [{ id: 'ts-1' }] : null);
    expect((await returnIt()).ok).toBe(true);
    const up = settingsUpdate();
    expect(up.payload).toEqual(expect.objectContaining({ phase2_status: 'in_progress', phase2_returned_at: expect.any(String) }));
    expect(up.filters).toEqual(expect.arrayContaining([
      ['eq', 'id', 'ts-1'], ['eq', 'phase2_status', 'completed'], ['is', 'phase2_approved_at', null],
    ]));
  });

  it('does nothing else when the sheet is no longer pending', async () => {
    respond.fn = (c) => (c.table === 'target_settings' && c.op === 'update' ? [] : null);
    expect(await returnIt()).toEqual({ ok: false, error: 'This IPCR is no longer pending approval. Refresh the list.' });
    expect(audits()).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
    expect(stage).not.toHaveBeenCalled();
  });
});

describe('closeSelfRatingPeriod', () => {
  it('leaves returned sheets open', async () => {
    respond.fn = (c) => (c.table === 'target_settings' && c.op === 'select' ? [{ id: 'ts-2', employee_id: 'emp-2' }] : null);
    await closeSelfRatingPeriod({ closedBy: 'head-1' });
    const select = calls.find((c: Call) => c.table === 'target_settings' && c.op === 'select') as Call;
    expect(select.filters).toContainEqual(['is', 'phase2_returned_at', null]);
  });
});

describe('saveEmployeeRatings', () => {
  const save = (submit: boolean) => {
    respond.fn = (c) => (c.table === 'target_settings' && c.single
      ? { id: 'ts-1', employee_id: 'emp-1', cycle_id: 2, status: 'approved', phase2_status: 'in_progress' }
      : null);
    return saveEmployeeRatings({ targetSettingId: 'ts-1', employeeId: 'emp-1', entries: [], submit });
  };

  it('clears the return marker and comment on submit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await save(true);
    expect(settingsUpdate().payload).toEqual(expect.objectContaining({
      phase2_status: 'completed', phase2_returned_at: null, review_comment: null,
    }));
  });

  it('keeps them on a draft save', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await save(false);
    const payload = settingsUpdate().payload;
    expect(payload).not.toHaveProperty('phase2_returned_at');
    expect(payload).not.toHaveProperty('review_comment');
  });
});

describe('loadEmployeeRatingSheet', () => {
  it('exposes when the sheet was returned', async () => {
    const setting = {
      id: 'ts-1', employee_id: 'emp-1', cycle_id: 2, status: 'approved', phase2_status: 'in_progress',
      review_comment: null, phase2_returned_at: '2026-11-03T02:00:00Z',
    };
    respond.fn = (c) => (c.table === 'target_settings' ? (c.single ? setting : [setting]) : c.single ? null : []);
    const res = await loadEmployeeRatingSheet('emp-1', null, 'ts-1');
    expect(res.ok && res.data?.returnedAt).toBe('2026-11-03T02:00:00Z');
  });
});
