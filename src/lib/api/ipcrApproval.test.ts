import { afterEach, describe, expect, it, vi } from 'vitest';
import { returnForRevision } from './ipcrApproval';

type Call = { table: string; op: string; payload?: any; eq: Record<string, unknown> };
const { calls, failTables } = vi.hoisted(() => ({ calls: [] as any[], failTables: new Set<string>() }));

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, op: 'select', eq: {} };
      calls.push(call);
      const builder: any = {
        update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return builder; },
        insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; },
        eq: (column: string, value: unknown) => { call.eq[column] = value; return builder; },
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
});

const returnIt = () =>
  returnForRevision({
    targetSettingId: 'ts-1',
    approverEmployeeId: 'head-1',
    submitterEmployeeId: 'emp-1',
    comment: 'Fix the indicators',
  });
const callsTo = (table: string, op: string): Call[] =>
  calls.filter((c: Call) => c.table === table && c.op === op);

describe('returnForRevision', () => {
  it('marks the target setting returned', async () => {
    expect((await returnIt()).ok).toBe(true);
    const [update] = callsTo('target_settings', 'update');
    expect(update.payload.status).toBe('returned_for_revision');
    expect(update.eq).toMatchObject({ id: 'ts-1', status: 'submitted_for_approval' });
  });

  it("puts the employee's submitted workspace row back to Draft Targets", async () => {
    await returnIt();
    const [update] = callsTo('ipcr_workspace', 'update');
    expect(update.payload.status).toBe('Draft Targets');
    expect(update.eq).toEqual({ employee_id: 'emp-1', status: 'Targets Submitted' });
  });

  it('still succeeds when the workspace reset fails', async () => {
    failTables.add('ipcr_workspace');
    expect((await returnIt()).ok).toBe(true);
  });

  it('does not touch the workspace when the return itself fails', async () => {
    failTables.add('target_settings');
    expect((await returnIt()).ok).toBe(false);
    expect(callsTo('ipcr_workspace', 'update')).toHaveLength(0);
  });
});
