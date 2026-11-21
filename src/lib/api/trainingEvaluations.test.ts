import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data?: any; error?: any };

const db = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; op: string; payload?: any; filters: Array<[string, string, any]> }>,
  listSessions: { data: [], error: null } as QueryResult,
  boardSession: { data: null, error: null } as QueryResult,
  enrollments: { data: [], error: null } as QueryResult,
  identities: { data: [], error: null } as QueryResult,
  evalsSelect: { data: [], error: null } as QueryResult,
  evalReread: { data: null, error: null } as QueryResult,
  notesSelect: { data: null, error: null } as QueryResult,
  evalInsert: { data: null, error: null } as QueryResult,
  evalUpdate: { data: null, error: null } as QueryResult,
  evalUpsertCalled: false,
  notesUpsert: { data: null, error: null } as QueryResult,
  storageUpload: { error: null as any },
  publicUrl: 'https://cdn.local/training-outputs/file.pdf',
}));

vi.mock('../supabase', () => {
  const from = (table: string) => {
    let op = 'select';
    let selectCols = '';
    let payload: any;
    const filters: Array<[string, string, any]> = [];
    let singleMode: 'maybeSingle' | null = null;

    const execute = async (): Promise<QueryResult> => {
      db.ops.push({ table, op, payload, filters: [...filters] });
      if (table === 'training_sessions') {
        if (singleMode === 'maybeSingle') return db.boardSession;
        return db.listSessions;
      }
      if (table === 'training_enrollments') return db.enrollments;
      if (table === 'employees_with_department') return db.identities;
      if (table === 'training_report_notes') {
        if (op === 'upsert') return db.notesUpsert;
        return db.notesSelect;
      }
      if (table === 'training_evaluations') {
        if (op === 'insert') return db.evalInsert;
        if (op === 'update') return db.evalUpdate;
        if (op === 'upsert') {
          db.evalUpsertCalled = true;
          return { data: null, error: null };
        }
        if (singleMode === 'maybeSingle') return db.evalReread;
        return db.evalsSelect;
      }
      return { data: [], error: null };
    };

    const chain: any = {
      select: (cols: string) => {
        selectCols = cols;
        void selectCols;
        return chain;
      },
      insert: (rows: any) => {
        op = 'insert';
        payload = rows;
        return chain;
      },
      update: (patch: any) => {
        op = 'update';
        payload = patch;
        return chain;
      },
      upsert: (rows: any) => {
        op = 'upsert';
        payload = rows;
        return chain;
      },
      eq: (col: string, val: any) => {
        filters.push(['eq', col, val]);
        return chain;
      },
      neq: (col: string, val: any) => {
        filters.push(['neq', col, val]);
        return chain;
      },
      in: (col: string, val: any) => {
        filters.push(['in', col, val]);
        return chain;
      },
      order: () => chain,
      maybeSingle: () => {
        singleMode = 'maybeSingle';
        return execute();
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        execute().then(onFulfilled, onRejected),
    };
    return chain;
  };

  const storage = {
    from: () => ({
      upload: async () => db.storageUpload,
      getPublicUrl: () => ({ data: { publicUrl: db.publicUrl } }),
    }),
  };

  return { supabase: { from, storage }, isMockModeEnabled: false };
});

import {
  getEvaluationBoard,
  listEvaluableTrainings,
  saveReportNotes,
  saveScores,
  saveSubmission,
  setAssessmentMode,
  setReviewStatus,
  uploadOutput,
} from './trainingEvaluations';

const RAW_TS = '2026-11-21 08:00:00.123456+00';
const NEXT_TS = '2026-11-21 08:01:00.654321+00';

const seedBoard = (evalRow?: any) => {
  db.boardSession = {
    data: {
      id: 'sess-1',
      title: 'Ethics Training',
      category: 'Technical',
      scheduled_date: '2026-09-01T01:00:00Z',
      end_date: null,
      location: 'Hall A',
      instructor_name: 'Dr. Cruz',
      status: 'Scheduled',
    },
    error: null,
  };
  db.enrollments = {
    data: [
      { id: 'enr-1', employee_id: 'emp-1', enrollment_status: 'Enrolled', attendance_status: 'Present', is_active: true },
    ],
    error: null,
  };
  db.identities = {
    data: [{ id: 'emp-1', full_name: 'Maria Santos', current_position: 'Analyst', department: 'HRMO' }],
    error: null,
  };
  db.evalsSelect = { data: evalRow ? [evalRow] : [], error: null };
  db.notesSelect = { data: { recommendations: 'Good session' }, error: null };
};

describe('trainingEvaluations', () => {
  beforeEach(() => {
    db.ops = [];
    db.listSessions = { data: [], error: null };
    db.boardSession = { data: null, error: null };
    db.enrollments = { data: [], error: null };
    db.identities = { data: [], error: null };
    db.evalsSelect = { data: [], error: null };
    db.evalReread = { data: null, error: null };
    db.notesSelect = { data: null, error: null };
    db.evalInsert = { data: [{ updated_at: NEXT_TS }], error: null };
    db.evalUpdate = { data: [{ updated_at: NEXT_TS }], error: null };
    db.evalUpsertCalled = false;
    db.notesUpsert = { data: [{ session_id: 'sess-1' }], error: null };
    db.storageUpload = { error: null };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('honest reads', () => {
    it('listEvaluableTrainings throws on query error and returns [] only on empty success', async () => {
      expect(await listEvaluableTrainings()).toEqual([]);

      db.listSessions = { data: null, error: { message: 'db down' } };
      await expect(listEvaluableTrainings()).rejects.toThrow(/db down/i);
    });

    it('getEvaluationBoard returns null only when session is confirmed absent', async () => {
      db.boardSession = { data: null, error: null };
      await expect(getEvaluationBoard('missing')).resolves.toBeNull();
    });

    it.each([
      ['training_sessions', () => { db.boardSession = { data: null, error: { message: 'session read err' } }; }],
      ['training_enrollments', () => { db.enrollments = { data: null, error: { message: 'enroll read err' } }; }],
      ['employees_with_department', () => { db.identities = { data: null, error: { message: 'identity read err' } }; }],
      ['training_evaluations', () => { db.evalsSelect = { data: null, error: { message: 'eval read err' } }; }],
      ['training_report_notes', () => { db.notesSelect = { data: null, error: { message: 'notes read err' } }; }],
    ])('getEvaluationBoard throws on %s failure', async (_table, breakIt) => {
      seedBoard();
      breakIt();

      await expect(getEvaluationBoard('sess-1')).rejects.toThrow(/read err/i);
    });

    it('preserves opaque raw updated_at string verbatim and uses updatedAt=null only when evaluation row is absent', async () => {
      seedBoard();
      const missingRowBoard = await getEvaluationBoard('sess-1');
      expect(missingRowBoard?.rows[0]).toMatchObject({
        mode: 'test',
        pre: null,
        post: null,
        reviewStatus: 'Pending',
        updatedAt: null,
      });

      seedBoard({
        enrollment_id: 'enr-1',
        assessment_mode: 'test',
        pre_test_score: 75,
        post_test_score: 90,
        review_status: 'Pending',
        updated_at: RAW_TS,
      });
      const existingRowBoard = await getEvaluationBoard('sess-1');
      expect(existingRowBoard?.rows[0].updatedAt).toBe(RAW_TS);
    });
  });

  describe('patchEvaluation & mutators', () => {
    it('supports explicit zero score 0 and intentional null clear', async () => {
      const zeroRes = await saveScores('enr-1', { pre: 0 }, null);
      expect(zeroRes).toEqual({ ok: true, updatedAt: NEXT_TS });
      expect(db.ops.find((o) => o.op === 'insert')?.payload[0]).toMatchObject({
        enrollment_id: 'enr-1',
        pre_test_score: 0,
      });

      db.ops = [];
      const clearRes = await saveScores('enr-1', { post: null }, RAW_TS);
      expect(clearRes).toEqual({ ok: true, updatedAt: NEXT_TS });
      const updateOp = db.ops.find((o) => o.op === 'update');
      expect(updateOp?.payload).toMatchObject({ post_test_score: null });
      expect('pre_test_score' in updateOp!.payload).toBe(false);
    });

    it('sends single-field partial patch without overwriting untouched score', async () => {
      const res = await saveScores('enr-1', { post: 88 }, RAW_TS);

      expect(res).toEqual({ ok: true, updatedAt: NEXT_TS });
      const updateOp = db.ops.find((o) => o.op === 'update')!;
      expect(updateOp.payload).toMatchObject({ post_test_score: 88 });
      expect('pre_test_score' in updateOp.payload).toBe(false);
      expect(updateOp.filters).toContainEqual(['eq', 'updated_at', RAW_TS]);
    });

    it('rejects invalid scores and empty patches without calling DB', async () => {
      expect((await saveScores('enr-1', { pre: -1 }, RAW_TS)).ok).toBe(false);
      expect((await saveScores('enr-1', { post: 101 }, RAW_TS)).ok).toBe(false);
      expect((await saveScores('enr-1', { pre: Number.NaN }, RAW_TS)).ok).toBe(false);
      expect((await saveScores('enr-1', {}, RAW_TS)).ok).toBe(false);
      expect(db.ops).toEqual([]);
    });

    it('advances updated_at by at least +2ms over expectedUpdatedAt even if server clock is behind', async () => {
      const futureRaw = new Date(Date.now() + 60_000).toISOString();
      await saveScores('enr-1', { pre: 85 }, futureRaw);

      const updateOp = db.ops.find((o) => o.op === 'update')!;
      expect(Date.parse(String(updateOp.payload.updated_at))).toBeGreaterThanOrEqual(Date.parse(futureRaw) + 2);
    });

    it('uses pure insert when expectedUpdatedAt is null (never upsert) and maps 23505 race to conflict without overwriting', async () => {
      db.evalInsert = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      db.evalReread = { data: { updated_at: RAW_TS }, error: null };

      const res = await saveScores('enr-1', { pre: 80 }, null);

      expect(db.evalUpsertCalled).toBe(false);
      expect(res.ok).toBe(false);
      expect(res.conflict).toBe(true);
      expect(db.ops.some((o) => o.op === 'update')).toBe(false);
    });

    it('returns conflict when update affects zero rows', async () => {
      db.evalUpdate = { data: [], error: null };

      const res = await setAssessmentMode('enr-1', 'output', RAW_TS);

      expect(res.ok).toBe(false);
      expect(res.conflict).toBe(true);
    });

    it('threads expectedUpdatedAt and returned updatedAt through setReviewStatus and saveSubmission', async () => {
      const r1 = await setReviewStatus('enr-1', 'Verified', RAW_TS);
      expect(r1).toEqual({ ok: true, updatedAt: NEXT_TS });

      const r2 = await saveSubmission('enr-1', { url: 'https://x/a.pdf', name: 'a.pdf' }, NEXT_TS);
      expect(r2).toEqual({ ok: true, updatedAt: NEXT_TS });
      expect(db.ops.filter((o) => o.op === 'update')[1].filters).toContainEqual(['eq', 'updated_at', NEXT_TS]);
    });

    it('uploadOutput reports partialFailure when storage succeeds but evaluation save fails', async () => {
      const file = new File(['hello'], 'report.pdf', { type: 'application/pdf' });
      db.evalUpdate = { data: [], error: null };

      const res = await uploadOutput('sess-1', 'enr-1', file, RAW_TS);

      expect(res.ok).toBe(false);
      expect(res.partialFailure).toBe(true);
      expect(res.conflict).toBe(true);
      expect(res.url).toBe(db.publicUrl);
      expect(res.name).toBe('report.pdf');
    });

    it('uploadOutput returns updatedAt on full success and fails cleanly on storage error', async () => {
      const file = new File(['hello'], 'report.pdf', { type: 'application/pdf' });
      const okRes = await uploadOutput('sess-1', 'enr-1', file, RAW_TS);
      expect(okRes).toEqual({ ok: true, url: db.publicUrl, name: 'report.pdf', updatedAt: NEXT_TS });

      db.storageUpload = { error: { message: 'bucket full' } };
      const errRes = await uploadOutput('sess-1', 'enr-1', file, NEXT_TS);
      expect(errRes).toEqual({ ok: false, error: 'bucket full' });
    });

    it('saveReportNotes chains .select(session_id) and fails on empty rows or DB error', async () => {
      expect(await saveReportNotes('sess-1', 'Notes')).toEqual({ ok: true });

      db.notesUpsert = { data: [], error: null };
      expect((await saveReportNotes('sess-1', 'Notes')).ok).toBe(false);

      db.notesUpsert = { data: null, error: { message: 'denied' } };
      expect(await saveReportNotes('sess-1', 'Notes')).toEqual({ ok: false, error: 'denied' });
    });
  });
});
