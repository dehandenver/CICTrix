import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_FAILED_NOTE, withAuditNote, writeAuditEntry } from './ipcrAudit';

const { state } = vi.hoisted(() => ({
  state: { inserted: [] as any[], result: { error: null } as any, throws: false },
}));

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: async (row: unknown) => {
        if (state.throws) throw new Error('network down');
        state.inserted.push({ table, row });
        return state.result;
      },
    }),
  },
}));

afterEach(() => {
  state.inserted = [];
  state.result = { error: null };
  state.throws = false;
  vi.restoreAllMocks();
});

const entry = {
  target_setting_id: 'ts-1',
  action: 'return',
  performed_by: 'head-1',
  performed_by_role: 'office_account' as const,
  reason: 'Fix the indicators',
};

describe('writeAuditEntry', () => {
  it('writes the row to ipcr_audit_log and reports success', async () => {
    expect(await writeAuditEntry(entry)).toBe(true);
    expect(state.inserted).toEqual([{ table: 'ipcr_audit_log', row: entry }]);
  });

  it('stores a missing reason as null', async () => {
    await writeAuditEntry({ ...entry, reason: undefined });
    expect(state.inserted[0].row.reason).toBeNull();
  });

  it('reports failure, without throwing, when the insert returns an error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.result = { error: { message: 'permission denied' } };
    expect(await writeAuditEntry(entry)).toBe(false);
  });

  it('reports failure, without throwing, when the request itself throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.throws = true;
    expect(await writeAuditEntry(entry)).toBe(false);
  });
});

describe('withAuditNote', () => {
  it('leaves the text alone when the audit row saved', () => {
    expect(withAuditNote('Approved.', {})).toBe('Approved.');
  });

  it('adds the warning when the audit row was lost', () => {
    expect(withAuditNote('Approved.', { auditFailed: true })).toBe(`Approved.${AUDIT_FAILED_NOTE}`);
  });
});
