import { afterEach, describe, expect, it, vi } from 'vitest';
import { approveTargets, returnForRevision } from './ipcrApproval';

type Call = { table: string; op: string; payload?: any; eq: Record<string, unknown> };
const { calls, failTables, state, workspaceRow, notify } = vi.hoisted(() => ({
  calls: [] as any[],
  failTables: new Set<string>(),
  state: { noRowsMatch: false },
  workspaceRow: { current: null as any },
  notify: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, op: 'select', eq: {} };
      calls.push(call);
      const builder: any = {
        update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return builder; },
        insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; },
        eq: (column: string, value: unknown) => { call.eq[column] = value; return builder; },
        select: () => builder,
        then: (resolve: (v: unknown) => void) => {
          const failed = failTables.has(table);
          // A status update reports the rows it changed; none means another reviewer got there first.
          const changed = table === 'target_settings' && call.op === 'update' && !state.noRowsMatch ? [{ id: 'ts-1' }] : [];
          resolve({ data: failed ? null : call.op === 'update' ? changed : null, error: failed ? { message: 'boom' } : null });
        },
      };
      return builder;
    },
  },
}));
vi.mock('./ipcrSubmissions', () => ({
  setSubmissionStage: vi.fn(),
  resolveTargetSettingMeta: async () => ({
    employeeId: 'emp-1', employeeName: 'Ana Cruz', officeId: null, officeName: null, period: 'July–December 2026',
  }),
}));
vi.mock('./ipcrWorkspace', () => ({ getWorkspace: async () => workspaceRow.current }));
vi.mock('./employeeNotifications', () => ({ createNotifications: notify }));

afterEach(() => {
  calls.length = 0;
  failTables.clear();
  state.noRowsMatch = false;
  workspaceRow.current = { id: 'w-1', employee_id: 'emp-1', period: 'July–December 2026', status: 'Targets Submitted' };
  notify.mockClear();
});
// The row the employee page would read for this return.
workspaceRow.current = { id: 'w-1', employee_id: 'emp-1', period: 'July–December 2026', status: 'Targets Submitted' };

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
    expect(update.eq).toEqual({ id: 'w-1', status: 'Targets Submitted' });
  });

  it('resets only the row the employee page reads, never the employee’s other periods', async () => {
    workspaceRow.current = { id: 'w-2', employee_id: 'emp-1', period: 'Jul-Dec 2026', status: 'Targets Submitted' };
    await returnIt();
    const updates = callsTo('ipcr_workspace', 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].eq).toEqual({ id: 'w-2', status: 'Targets Submitted' });
  });

  it('leaves a workspace row alone when it is no longer submitted', async () => {
    workspaceRow.current = { id: 'w-1', employee_id: 'emp-1', period: 'July–December 2026', status: 'Accomplishments Submitted' };
    await returnIt();
    expect(callsTo('ipcr_workspace', 'update')).toHaveLength(0);
  });

  it('does nothing and says so when the IPCR is no longer pending', async () => {
    state.noRowsMatch = true;
    expect(await returnIt()).toEqual({ ok: false, error: 'This IPCR is no longer pending approval. Refresh the list.' });
    expect(callsTo('ipcr_audit_log', 'insert')).toHaveLength(0);
    expect(callsTo('ipcr_workspace', 'update')).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
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

describe('audit trail', () => {
  const approveIt = () =>
    approveTargets({ targetSettingId: 'ts-1', approverEmployeeId: 'head-1', submitterEmployeeId: 'emp-1' });

  it('records a return and an approval in the audit log', async () => {
    await returnIt();
    await approveIt();
    const actions = callsTo('ipcr_audit_log', 'insert').map((c) => c.payload);
    expect(actions).toEqual([
      expect.objectContaining({ action: 'return', performed_by: 'head-1', reason: 'Fix the indicators' }),
      expect.objectContaining({ action: 'approve', performed_by: 'head-1', performed_by_role: 'office_account' }),
    ]);
  });

  it('does nothing and says so when an approval finds the IPCR no longer pending', async () => {
    state.noRowsMatch = true;
    expect(await approveIt()).toEqual({ ok: false, error: 'This IPCR is no longer pending approval. Refresh the list.' });
    expect(callsTo('ipcr_audit_log', 'insert')).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports nothing wrong when the audit row saved', async () => {
    expect(await returnIt()).toEqual({ ok: true, data: null });
    expect(await approveIt()).toEqual({ ok: true, data: null });
  });

  it.each([
    ['return', returnIt],
    ['approval', approveIt],
  ])('still completes a %s and flags it when the audit row is lost', async (_name, act) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    failTables.add('ipcr_audit_log');
    expect(await act()).toEqual({ ok: true, data: null, auditFailed: true });
  });
});
