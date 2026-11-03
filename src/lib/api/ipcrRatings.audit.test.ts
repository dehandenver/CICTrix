import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminEditRatings, returnPhase2ForRevision } from './ipcrRatings';

type Call = { table: string; op: string; payload?: any };
const { calls, failTables } = vi.hoisted(() => ({ calls: [] as any[], failTables: new Set<string>() }));

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, op: 'select' };
      calls.push(call);
      const builder: any = {
        update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return builder; },
        insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; },
        eq: () => builder,
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: null, error: failTables.has(table) ? { message: 'boom' } : null }),
      };
      return builder;
    },
  },
}));
vi.mock('./ipcrSubmissions', () => ({
  setSubmissionStage: vi.fn(),
  resolveTargetSettingMeta: async () => null,
}));
vi.mock('./employeeNotifications', () => ({ createNotifications: vi.fn() }));

afterEach(() => {
  calls.length = 0;
  failTables.clear();
  vi.restoreAllMocks();
});

const returnIt = () =>
  returnPhase2ForRevision({
    targetSettingId: 'ts-1',
    approverEmployeeId: 'head-1',
    submitterEmployeeId: 'emp-1',
    comment: 'Add evidence',
  });
const editIt = () =>
  adminEditRatings({
    targetSettingId: 'ts-1',
    approverEmployeeId: 'head-1',
    submitterEmployeeId: 'emp-1',
    accomplishments: [],
  });
const audits = () => calls.filter((c: Call) => c.table === 'ipcr_audit_log' && c.op === 'insert').map((c: Call) => c.payload);

describe('Phase 2 audit entries', () => {
  it('records a Phase 2 return with its reason', async () => {
    expect(await returnIt()).toEqual({ ok: true, data: null });
    expect(audits()).toEqual([
      expect.objectContaining({ action: 'return_phase2', performed_by: 'head-1', reason: 'Add evidence' }),
    ]);
  });

  it('records an office edit of the ratings', async () => {
    expect(await editIt()).toEqual({ ok: true, data: null });
    expect(audits()).toEqual([expect.objectContaining({ action: 'admin_edit_ratings', performed_by: 'head-1' })]);
  });

  it.each([
    ['return', returnIt],
    ['edit', editIt],
  ])('still completes a Phase 2 %s and flags it when the audit row is lost', async (_name, act) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    failTables.add('ipcr_audit_log');
    expect(await act()).toEqual({ ok: true, data: null, auditFailed: true });
  });
});
