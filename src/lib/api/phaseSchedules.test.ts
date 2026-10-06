import { beforeEach, describe, expect, it, vi } from 'vitest';

// Per-table result queues; each query chain resolves to the next queued result
// (or throws it, when the queued value is an Error).
const { fromMock, results, orMock, eqMock, calls } = vi.hoisted(() => {
  const results: Record<string, Array<{ data?: unknown; error?: unknown } | Error>> = {};
  const calls: string[] = [];
  const orMock = vi.fn();
  const eqMock = vi.fn();
  const fromMock = vi.fn((table: string) => {
    calls.push(table);
    const next = async () => {
      const r = results[table]?.shift() ?? { data: null, error: null };
      if (r instanceof Error) throw r;
      return r;
    };
    const chain: any = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        eqMock(table, column, value);
        return chain;
      },
      or: (filter: string) => {
        orMock(filter);
        return next();
      },
      maybeSingle: next,
    };
    return chain;
  });
  return { fromMock, results, orMock, eqMock, calls };
});

vi.mock('../supabase', () => ({ supabase: { from: fromMock } }));

import { loadEffectiveSchedules, type PhaseSchedule } from './phaseSchedules';

const row = (over: Partial<PhaseSchedule>): PhaseSchedule => ({
  id: 'x',
  scope: 'system',
  office_id: null,
  office_name: null,
  phase: 'target_setting',
  mode: 'Open',
  start_date: null,
  deadline_date: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
  ...over,
});

const systemTarget = row({ id: 'sys-t', phase: 'target_setting', mode: 'Open' });
const systemRating = row({ id: 'sys-r', phase: 'rating', mode: 'Open' });

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  calls.length = 0;
  orMock.mockClear();
  eqMock.mockClear();
  fromMock.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('loadEffectiveSchedules', () => {
  it('lets an office override win for its phase and falls back to system for the rest', async () => {
    const legalRating = row({ id: 'legal-r', scope: 'office', office_id: 'dep-legal', phase: 'rating', mode: 'Closed' });
    results.employees_with_department = [{ data: { department: ' Legal ' } }];
    results.departments = [{ data: { id: 'dep-legal' } }];
    results.phase_schedules = [{ data: [systemTarget, systemRating, legalRating] }];

    const out = await loadEffectiveSchedules('emp-1');

    expect(out.rating?.id).toBe('legal-r');
    expect(out.rating?.mode).toBe('Closed');
    expect(out.target?.id).toBe('sys-t');
    expect(eqMock.mock.calls).toEqual([
      ['employees_with_department', 'id', 'emp-1'],
      ['departments', 'name', 'Legal'],
    ]);
    expect(orMock).toHaveBeenCalledWith('scope.eq.system,office_id.eq.dep-legal');
  });

  it('uses system rows when the department has no matching departments row', async () => {
    results.employees_with_department = [{ data: { department: 'Unknown Office' } }];
    results.departments = [{ data: null }];
    results.phase_schedules = [{ data: [systemTarget, systemRating] }];

    const out = await loadEffectiveSchedules('emp-1');

    expect(out).toEqual({ target: systemTarget, rating: systemRating });
    expect(orMock).toHaveBeenCalledWith('scope.eq.system');
  });

  it('uses system rows for a null employeeId without any employee or department lookup', async () => {
    results.phase_schedules = [{ data: [systemTarget, systemRating] }];

    const out = await loadEffectiveSchedules(null);

    expect(out).toEqual({ target: systemTarget, rating: systemRating });
    expect(calls).toEqual(['phase_schedules']);
    expect(orMock).toHaveBeenCalledWith('scope.eq.system');
  });

  it('falls back to system rows when the office lookup throws', async () => {
    results.employees_with_department = [new Error('network down')];
    results.phase_schedules = [{ data: [systemTarget, systemRating] }];

    const out = await loadEffectiveSchedules('emp-1');

    expect(out).toEqual({ target: systemTarget, rating: systemRating });
    expect(orMock).toHaveBeenCalledWith('scope.eq.system');
  });

  it('falls back to system rows when the office lookup returns an error', async () => {
    results.employees_with_department = [{ data: { department: 'Legal' } }];
    results.departments = [{ data: null, error: { message: 'rls denied' } }];
    results.phase_schedules = [{ data: [systemTarget, systemRating] }];

    const out = await loadEffectiveSchedules('emp-1');

    expect(out).toEqual({ target: systemTarget, rating: systemRating });
    expect(orMock).toHaveBeenCalledWith('scope.eq.system');
  });

  it('returns null phases when the schedules query errors', async () => {
    results.phase_schedules = [{ data: null, error: { message: 'boom' } }];

    expect(await loadEffectiveSchedules(null)).toEqual({ target: null, rating: null });
  });

  it('returns null phases when the schedules query throws', async () => {
    results.phase_schedules = [new Error('network down')];

    expect(await loadEffectiveSchedules(null)).toEqual({ target: null, rating: null });
  });
});
