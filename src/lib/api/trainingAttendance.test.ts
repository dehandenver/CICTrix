import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  selectResult: { data: [] as any[], error: null as any },
  upsertResult: { error: null as any },
  queries: [] as Array<{ table: string; op: string; payload?: any }>,
}));

vi.mock('../supabase', () => {
  const from = (table: string) => {
    const chain: any = {
      select: () => {
        mockState.queries.push({ table, op: 'select' });
        return chain;
      },
      in: () => Promise.resolve(mockState.selectResult),
      upsert: (payload: any) => {
        mockState.queries.push({ table, op: 'upsert', payload });
        return Promise.resolve(mockState.upsertResult);
      },
    };
    return chain;
  };
  return { supabase: { from }, isMockModeEnabled: false };
});

import { cellKey, listAttendance, setDayAttendance } from './trainingAttendance';

describe('trainingAttendance', () => {
  beforeEach(() => {
    mockState.selectResult = { data: [], error: null };
    mockState.upsertResult = { error: null };
    mockState.queries = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('listAttendance', () => {
    it('returns an empty Map without querying when enrollmentIds is empty', async () => {
      const result = await listAttendance([]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockState.queries).toEqual([]);
    });

    it('returns an empty Map when the query succeeds with zero rows', async () => {
      mockState.selectResult = { data: [], error: null };

      const result = await listAttendance(['enr-1']);

      expect(result.size).toBe(0);
      expect(mockState.queries).toHaveLength(1);
    });

    it('throws an Error when training_attendance_days fails instead of returning an empty Map', async () => {
      mockState.selectResult = {
        data: null,
        error: { message: 'connection refused' },
      };

      await expect(listAttendance(['enr-1'])).rejects.toThrow(/connection refused/i);
    });

    it('maps AM/PM slots and defaults legacy rows without session to AM', async () => {
      mockState.selectResult = {
        data: [
          { enrollment_id: 'enr-1', day_date: '2026-08-10', session: null, status: 'Present', excuse_note: null },
          { enrollment_id: 'enr-1', day_date: '2026-08-10', session: 'PM', status: 'Excused', excuse_note: 'Clinic' },
        ],
        error: null,
      };

      const result = await listAttendance(['enr-1']);

      expect(result.get('enr-1')?.get(cellKey('2026-08-10', 'AM'))).toEqual({ status: 'Present', note: null });
      expect(result.get('enr-1')?.get(cellKey('2026-08-10', 'PM'))).toEqual({ status: 'Excused', note: 'Clinic' });
    });
  });

  describe('setDayAttendance', () => {
    it('rejects Excused without a non-blank excuse note', async () => {
      const res = await setDayAttendance({
        enrollmentId: 'enr-1',
        dayKey: '2026-08-10',
        session: 'AM',
        status: 'Excused',
        note: '   ',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/excuse note/i);
      expect(mockState.queries).toEqual([]);
    });

    it('returns { ok: false, error } on DB error', async () => {
      mockState.upsertResult = { error: { message: 'rls denied' } };

      const res = await setDayAttendance({
        enrollmentId: 'enr-1',
        dayKey: '2026-08-10',
        session: 'AM',
        status: 'Present',
      });

      expect(res).toEqual({ ok: false, error: 'rls denied' });
    });

    it('persists Excused with trimmed note and returns { ok: true }', async () => {
      const res = await setDayAttendance({
        enrollmentId: 'enr-1',
        dayKey: '2026-08-10',
        session: 'PM',
        status: 'Excused',
        note: '  Doctor visit  ',
      });

      expect(res).toEqual({ ok: true });
      expect(mockState.queries[0].payload[0]).toMatchObject({
        enrollment_id: 'enr-1',
        day_date: '2026-08-10',
        session: 'PM',
        status: 'Excused',
        excuse_note: 'Doctor visit',
      });
    });
  });
});
