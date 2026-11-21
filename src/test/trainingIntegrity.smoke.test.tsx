import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const COMP_A = '00000000-0000-4000-8000-0000000c0001';
const COMP_B = '00000000-0000-4000-8000-0000000c0002';
const COMP_C = '00000000-0000-4000-8000-0000000c0003';
const COMP_MISSING = '00000000-0000-4000-8000-0000000c9999';

const store = vi.hoisted(() => ({
  seq: 0,
  sessions: [] as Row[],
  tags: [] as Row[],
  sessionCompetencies: [] as Row[],
  enrollments: [] as Row[],
  employees: [] as Row[],
  employeeTrainings: [] as Row[],
  employeeTrainingCompetencies: [] as Row[],
  attendanceDays: [] as Row[],
  evaluations: [] as Row[],
  reportNotes: [] as Row[],
  storageUploads: [] as Array<{ path: string; name: string }>,
  dropNextSaveRpcResponse: false,
  failNextAttendanceRead: false,
  failNextEvaluationRead: false,
  failNextEvaluationWrite: false,
}));

vi.mock('../lib/supabase', () => {
  const revisionFor = (s: Row) => {
    const joins = store.sessionCompetencies
      .filter((c) => c.session_id === s.id)
      .sort((a, b) => String(a.competency_id).localeCompare(String(b.competency_id)))
      .map((c) => `${c.competency_id}:${c.weight}`);
    return JSON.stringify({
      title: s.title,
      category: s.category,
      scheduled_date: s.scheduled_date,
      end_date: s.end_date,
      instructor_name: s.instructor_name,
      location: s.location,
      objectives: s.objectives,
      description: s.description,
      materials: s.materials,
      prerequisites: s.prerequisites,
      status: s.status,
      capacity: s.capacity,
      updated_at: s.updated_at,
      joins,
    });
  };

  const tagById = (id: string) => store.tags.find((t) => t.id === id);

  const tableRows = (table: string): Row[] => {
    switch (table) {
      case 'training_sessions':
        return store.sessions;
      case 'training_competency_tags':
        return store.tags;
      case 'training_competencies':
        return store.sessionCompetencies;
      case 'training_enrollments':
        return store.enrollments;
      case 'employees':
        return store.employees;
      case 'employees_with_department':
        return store.employees.map((e) => ({
          id: e.id,
          full_name: [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' '),
          current_position: e.position ?? null,
          department: e.department ?? null,
        }));
      case 'employee_training':
        return store.employeeTrainings;
      case 'employee_training_competencies':
        return store.employeeTrainingCompetencies;
      case 'training_attendance_days':
        return store.attendanceDays;
      case 'training_evaluations':
        return store.evaluations;
      case 'training_report_notes':
        return store.reportNotes;
      default:
        return [];
    }
  };

  const applyProjection = (row: Row, cols: string, table: string): Row => {
    if (table === 'training_sessions' && cols.includes('training_enrollments')) {
      return {
        ...row,
        training_enrollments: store.enrollments.filter((e) => e.session_id === row.id),
        training_competencies: store.sessionCompetencies
          .filter((c) => c.session_id === row.id)
          .map((c) => ({ competency_id: c.competency_id, training_competency_tags: tagById(c.competency_id) })),
      };
    }
    if (!cols || cols.trim() === '*') return { ...row };
    return { ...row };
  };

  const from = (table: string) => {
    let mode: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let selectedCols = '*';
    let payloadRows: Row[] = [];
    let updatePatch: Row = {};
    let upsertOnConflict = '';
    const filters: Array<{ op: 'eq' | 'neq' | 'in' | 'lt' | 'or'; col: string; val: any }> = [];
    let singleMode: 'maybeSingle' | null = null;

    const matchRows = (rows: Row[]) =>
      rows.filter((row) =>
        filters.every((f) => {
          if (f.op === 'eq') return String(row[f.col] ?? '') === String(f.val ?? '');
          if (f.op === 'neq') return String(row[f.col] ?? '') !== String(f.val ?? '');
          if (f.op === 'in') return (f.val as any[]).map(String).includes(String(row[f.col] ?? ''));
          if (f.op === 'lt') return String(row[f.col] ?? '') < String(f.val ?? '');
          return true;
        }),
      );

    const execute = async () => {
      if (mode === 'select') {
        if (table === 'training_attendance_days' && store.failNextAttendanceRead) {
          store.failNextAttendanceRead = false;
          return { data: null, error: { message: 'attendance read unavailable' } };
        }
        if (table === 'training_evaluations' && store.failNextEvaluationRead) {
          store.failNextEvaluationRead = false;
          return { data: null, error: { message: 'evaluations read unavailable' } };
        }
        const matched = matchRows(tableRows(table)).map((r) => applyProjection(r, selectedCols, table));
        if (singleMode === 'maybeSingle') return { data: matched[0] ?? null, error: null };
        return { data: matched, error: null };
      }

      if (mode === 'insert') {
        if (table === 'training_evaluations' && store.failNextEvaluationWrite) {
          store.failNextEvaluationWrite = false;
          return { data: null, error: { message: 'evaluation DB write failed' } };
        }
        const target = tableRows(table);
        const inserted: Row[] = [];
        for (const r of payloadRows) {
          if (
            table === 'training_evaluations' &&
            target.some((existing) => existing.enrollment_id === r.enrollment_id)
          ) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          const next = { ...r };
          target.push(next);
          inserted.push({ ...next });
        }
        return { data: inserted, error: null };
      }

      if (mode === 'update') {
        if (table === 'training_evaluations' && store.failNextEvaluationWrite) {
          store.failNextEvaluationWrite = false;
          return { data: null, error: { message: 'evaluation DB write failed' } };
        }
        const matched = matchRows(tableRows(table));
        for (const row of matched) Object.assign(row, updatePatch);
        return { data: matched.map((r) => ({ ...r })), error: null };
      }

      if (mode === 'upsert') {
        const target = tableRows(table);
        const conflictCols = upsertOnConflict.split(',').map((c) => c.trim()).filter(Boolean);
        const out: Row[] = [];
        for (const r of payloadRows) {
          const existing = conflictCols.length
            ? target.find((row) => conflictCols.every((c) => String(row[c] ?? '') === String(r[c] ?? '')))
            : undefined;
          if (existing) {
            Object.assign(existing, r);
            out.push({ ...existing });
          } else {
            const next = { ...r };
            target.push(next);
            out.push({ ...next });
          }
        }
        return { data: out, error: null };
      }

      return { data: [], error: null };
    };

    const chain: any = {
      select: (cols = '*') => {
        selectedCols = cols;
        return chain;
      },
      insert: (rows: Row[]) => {
        mode = 'insert';
        payloadRows = rows;
        return chain;
      },
      update: (patch: Row) => {
        mode = 'update';
        updatePatch = patch;
        return chain;
      },
      upsert: (rows: Row[], opts?: { onConflict?: string }) => {
        mode = 'upsert';
        payloadRows = rows;
        upsertOnConflict = opts?.onConflict ?? '';
        return chain;
      },
      eq: (col: string, val: any) => {
        filters.push({ op: 'eq', col, val });
        return chain;
      },
      neq: (col: string, val: any) => {
        filters.push({ op: 'neq', col, val });
        return chain;
      },
      in: (col: string, val: any[]) => {
        filters.push({ op: 'in', col, val });
        return chain;
      },
      lt: (col: string, val: any) => {
        filters.push({ op: 'lt', col, val });
        return chain;
      },
      or: () => chain,
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

  const rpc = async (fn: string, params: Record<string, any>) => {
    if (fn === 'read_training_calendar_event') {
      const s = store.sessions.find((x) => x.id === params.p_session_id);
      if (!s) return { data: null, error: { code: 'P0002', hint: 'session_not_found', message: 'Not found' } };
      const joins = store.sessionCompetencies
        .filter((c) => c.session_id === s.id)
        .map((c) => tagById(c.competency_id))
        .filter(Boolean)
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
      return {
        data: {
          event: { ...s },
          competencies: joins,
          competency_ids: joins.map((t: any) => t.id).sort(),
          revision: revisionFor(s),
        },
        error: null,
      };
    }

    if (fn === 'save_training_calendar_event') {
      const ev = params.p_event as Row | null;
      const rawTagIds = params.p_competency_ids as string[] | null;
      const targetTags = rawTagIds === null ? null : [...new Set(rawTagIds.filter(Boolean))].sort();

      if (targetTags && targetTags.some((id) => !tagById(id))) {
        return { data: null, error: { code: '23503', hint: 'invalid_competency', message: 'Invalid competency.' } };
      }

      if (params.p_session_id == null) {
        const existing = store.sessions.find((s) => s.client_request_id === params.p_request_id);
        if (existing) {
          return { data: { id: existing.id, revision: revisionFor(existing) }, error: null };
        }
        const id = `sess-${++store.seq}`;
        const session: Row = {
          id,
          client_request_id: params.p_request_id,
          title: ev?.title,
          category: ev?.category ?? null,
          scheduled_date: ev?.scheduled_date,
          end_date: ev?.end_date ?? null,
          instructor_name: ev?.instructor_name ?? null,
          location: ev?.location ?? null,
          objectives: ev?.objectives ?? [],
          description: ev?.description ?? null,
          materials: ev?.materials ?? null,
          prerequisites: ev?.prerequisites ?? null,
          status: ev?.status ?? 'Scheduled',
          capacity: ev?.capacity ?? 0,
          roster_finalized_at: null,
          updated_at: null,
          last_viewed_by_office: null,
        };
        store.sessions.push(session);
        for (const tagId of targetTags ?? []) {
          store.sessionCompetencies.push({
            id: `join-${++store.seq}`,
            session_id: id,
            competency_id: tagId,
            weight: 1,
          });
        }
        if (store.dropNextSaveRpcResponse) {
          store.dropNextSaveRpcResponse = false;
          throw new TypeError('Failed to fetch');
        }
        return { data: { id, revision: revisionFor(session) }, error: null };
      }

      const s = store.sessions.find((x) => x.id === params.p_session_id);
      if (!s) return { data: null, error: { code: 'P0002', hint: 'session_not_found', message: 'Not found' } };
      if (revisionFor(s) !== params.p_expected_revision) {
        return {
          data: null,
          error: { code: '40001', hint: 'revision_conflict', message: 'Training changed concurrently.' },
        };
      }

      const currentTags = store.sessionCompetencies
        .filter((c) => c.session_id === s.id)
        .map((c) => String(c.competency_id))
        .sort();
      const tagsChanged =
        targetTags !== null && JSON.stringify(targetTags) !== JSON.stringify(currentTags);

      const lockCutoffMs = Date.parse(s.scheduled_date) - 3 * 86_400_000;
      const isLocked = Date.now() >= lockCutoffMs;
      const contentChanged = Boolean(
        ev &&
          (ev.title !== s.title ||
            ev.description !== s.description ||
            ev.scheduled_date !== s.scheduled_date ||
            ev.instructor_name !== s.instructor_name ||
            ev.location !== s.location),
      );
      if (isLocked && (tagsChanged || contentChanged)) {
        return {
          data: null,
          error: { code: '23514', hint: 'training_locked', message: 'Training is locked: editing closes 3 days before start.' },
        };
      }

      if (ev) Object.assign(s, ev);
      if (tagsChanged && targetTags) {
        store.sessionCompetencies = store.sessionCompetencies.filter(
          (c) => c.session_id !== s.id || targetTags.includes(c.competency_id),
        );
        for (const tagId of targetTags) {
          if (!store.sessionCompetencies.some((c) => c.session_id === s.id && c.competency_id === tagId)) {
            store.sessionCompetencies.push({
              id: `join-${++store.seq}`,
              session_id: s.id,
              competency_id: tagId,
              weight: 1,
            });
          }
        }
      }
      if (ev || tagsChanged) {
        const prevMs = s.updated_at ? Date.parse(s.updated_at) : 0;
        s.updated_at = new Date(Math.max(Date.now(), prevMs + 2)).toISOString();
      }
      return { data: { id: s.id, revision: revisionFor(s) }, error: null };
    }

    return { data: null, error: { code: 'PGRST202', message: `Unknown RPC ${fn}` } };
  };

  const storage = {
    from: () => ({
      upload: async (path: string, file: File) => {
        store.storageUploads.push({ path, name: file.name });
        return { error: null };
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://storage.local/${path}` },
      }),
    }),
  };

  return { supabase: { from, rpc, storage }, isMockModeEnabled: false };
});

import {
  createCalendarEvent,
  getCalendarEventSnapshot,
  listCalendarEvents,
  updateCalendarEvent,
} from '../lib/api/trainingCalendar';
import { setSessionCompetencies } from '../lib/api/trainingCompetencies';
import { listOfficeTrainings, markTrainingViewedByOffice } from '../lib/api/officeTrainingCourses';
import { listAttendance, setDayAttendance } from '../lib/api/trainingAttendance';
import {
  getEvaluationBoard,
  saveReportNotes,
  saveScores,
  uploadOutput,
} from '../lib/api/trainingEvaluations';
import { listTrainingArchive } from '../lib/api/lndArchive';

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('Release Unit 2 Training Integrity Smoke Suite', () => {
  beforeEach(() => {
    store.seq = 0;
    store.sessions = [];
    store.tags = [
      { id: COMP_A, name: 'Public Ethics', name_key: 'public ethics', category: null },
      { id: COMP_B, name: 'Records Management', name_key: 'records management', category: null },
      { id: COMP_C, name: 'Data Governance', name_key: 'data governance', category: null },
    ];
    store.sessionCompetencies = [];
    store.enrollments = [];
    store.employees = [];
    store.employeeTrainings = [];
    store.employeeTrainingCompetencies = [];
    store.attendanceDays = [];
    store.evaluations = [];
    store.reportNotes = [];
    store.storageUploads = [];
    store.dropNextSaveRpcResponse = false;
    store.failNextAttendanceRead = false;
    store.failNextEvaluationRead = false;
    store.failNextEvaluationWrite = false;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('keeps calendar + competency saves atomic, propagates Office Training Courses updates, and enforces the 3-day lock', async () => {
    const requestId = crypto.randomUUID();
    const baseInput = {
      title: 'Procurement Integrity Workshop',
      category: 'Technical' as const,
      startDate: daysFromNow(14),
      endDate: null,
      speaker: 'Dr. Maria Santos',
      location: 'Main Conference Room',
      objectives: ['Understand RA 9184'],
      description: 'Procurement rules and controls.',
      materials: 'Workbook',
      prerequisites: 'None',
      status: 'Scheduled' as const,
      capacity: 30,
      competencyIds: [COMP_A, COMP_B],
    };

    store.dropNextSaveRpcResponse = true;
    const lost = await createCalendarEvent(baseInput, requestId);
    expect(lost).toMatchObject({ ok: false, kind: 'uncertain' });
    expect(store.sessions).toHaveLength(1);

    const replayed = await createCalendarEvent(baseInput, requestId);
    expect(replayed.ok).toBe(true);
    expect(store.sessions).toHaveLength(1);
    const sessionId = replayed.id!;

    const calendarList = await listCalendarEvents(new Date(baseInput.startDate).getUTCFullYear());
    expect(calendarList.map((e) => e.id)).toContain(sessionId);

    // First L&D edit advances updated_at -> Office view sees published & updatedByLnd=true, then clears on view.
    const snap1 = await getCalendarEventSnapshot(sessionId);
    const edit1 = await updateCalendarEvent(
      sessionId,
      { ...baseInput, description: 'Updated workbook notes.' },
      snap1.revision,
    );
    expect(edit1.ok).toBe(true);

    let office = await listOfficeTrainings();
    expect(office[0]).toMatchObject({ id: sessionId, status: 'published', updatedByLnd: true });

    await new Promise((r) => setTimeout(r, 5));
    expect((await markTrainingViewedByOffice(sessionId)).ok).toBe(true);
    office = await listOfficeTrainings();
    expect(office[0].updatedByLnd).toBe(false);

    // Customize weight on COMP_A join to verify unchanged join ID & weight survive swap COMP_B -> COMP_C.
    const compAJoin = store.sessionCompetencies.find((c) => c.session_id === sessionId && c.competency_id === COMP_A)!;
    compAJoin.weight = 3;
    const snap2 = await getCalendarEventSnapshot(sessionId);
    await new Promise((r) => setTimeout(r, 5));

    const edit2 = await updateCalendarEvent(
      sessionId,
      { ...baseInput, title: 'Procurement Integrity v2', description: 'Updated workbook notes.', competencyIds: [COMP_A, COMP_C] },
      snap2.revision,
    );
    expect(edit2.ok).toBe(true);
    const retainedJoin = store.sessionCompetencies.find((c) => c.session_id === sessionId && c.competency_id === COMP_A)!;
    expect(retainedJoin.id).toBe(compAJoin.id);
    expect(retainedJoin.weight).toBe(3);

    office = await listOfficeTrainings();
    expect(office[0]).toMatchObject({ title: 'Procurement Integrity v2', updatedByLnd: true });

    // Invalid competency ID rolls back leaving title & joins unchanged; stale revision refuses without clobbering.
    const badTag = await updateCalendarEvent(
      sessionId,
      { ...baseInput, title: 'Should Roll Back', competencyIds: [COMP_A, COMP_MISSING] },
      edit2.revision!,
    );
    expect(badTag).toMatchObject({ ok: false, kind: 'validation' });
    expect(store.sessions[0].title).toBe('Procurement Integrity v2');
    expect(store.sessionCompetencies.filter((c) => c.session_id === sessionId).map((c) => c.competency_id).sort()).toEqual([
      COMP_A,
      COMP_C,
    ]);

    const staleSave = await updateCalendarEvent(
      sessionId,
      { ...baseInput, title: 'Stale Overwrite' },
      snap2.revision,
    );
    expect(staleSave).toMatchObject({ ok: false, kind: 'conflict' });
    expect(store.sessions[0].title).toBe('Procurement Integrity v2');

    // Moving into the 3-day lock window reports status='locked' and refuses competency/content edits.
    store.sessions[0].scheduled_date = daysFromNow(2);
    office = await listOfficeTrainings();
    expect(office[0].status).toBe('locked');

    const snapLocked = await getCalendarEventSnapshot(sessionId);
    const lockedCompRes = await setSessionCompetencies(sessionId, [COMP_A], snapLocked.revision);
    expect(lockedCompRes).toMatchObject({ ok: false, kind: 'locked' });
  });

  it('propagates live half-day attendance to Archive and rejects on attendance read failure', async () => {
    store.employees.push({
      id: 'emp-eng-1',
      employee_number: 'E-101',
      first_name: 'Liza',
      last_name: 'Diaz',
      position: 'Engineer II',
      department: 'Engineering',
      date_hired: '2022-05-01',
    });
    store.employeeTrainings.push(
      {
        id: 'tr-linked',
        employee_id: 'emp-eng-1',
        training_title: 'CAD Safety',
        conducted_by: 'DPWH',
        from_date: '2026-08-10',
        to_date: '2026-08-10',
        enrollment_id: 'enr-eng-1',
        attendance_percentage: 100,
      },
      {
        id: 'tr-unlinked',
        employee_id: 'emp-eng-1',
        training_title: 'Legacy Orientation',
        conducted_by: 'LGU',
        from_date: '2024-02-01',
        to_date: '2024-02-01',
        enrollment_id: null,
        attendance_percentage: 80,
      },
    );

    expect((await setDayAttendance({ enrollmentId: 'enr-eng-1', dayKey: '2026-08-10', session: 'AM', status: 'Present' })).ok).toBe(true);
    expect((await setDayAttendance({ enrollmentId: 'enr-eng-1', dayKey: '2026-08-10', session: 'PM', status: 'Absent' })).ok).toBe(true);

    const liveMap = await listAttendance(['enr-eng-1']);
    expect(liveMap.get('enr-eng-1')?.size).toBe(2);

    const archive = await listTrainingArchive('Engineering');
    expect(archive).toHaveLength(1);
    const byId = Object.fromEntries(archive[0].trainings.map((t) => [t.id, t]));
    expect(byId['tr-linked'].attendancePercent).toBe(50);
    expect(byId['tr-unlinked'].attendancePercent).toBe(80);

    // Inject read failures for both listAttendance and listTrainingArchive.
    store.failNextAttendanceRead = true;
    await expect(listAttendance(['enr-eng-1'])).rejects.toThrow(/attendance read unavailable/i);

    store.failNextAttendanceRead = true;
    await expect(listTrainingArchive('Engineering')).rejects.toThrow(/attendance read unavailable/i);
  });

  it('enforces honest evaluation reads, single-field score patches, raw updated_at CAS, 23505 races, and upload partialFailure', async () => {
    const rawMicroTs = '2026-11-21T00:00:00.123456+00:00';
    store.sessions.push({
      id: 'sess-eval-1',
      title: 'Cybersecurity Basics',
      category: 'Technical',
      scheduled_date: daysFromNow(-5),
      end_date: null,
      location: 'Room B',
      instructor_name: 'Engr. Reyes',
      status: 'Completed',
    });
    store.employees.push({
      id: 'emp-eval-1',
      first_name: 'Marco',
      last_name: 'Tan',
      position: 'IT Officer',
      department: 'CICT',
    });
    store.enrollments.push({
      id: 'enr-eval-1',
      session_id: 'sess-eval-1',
      employee_id: 'emp-eval-1',
      enrollment_status: 'Enrolled',
      attendance_status: 'Present',
      is_active: true,
    });
    store.evaluations.push({
      enrollment_id: 'enr-eval-1',
      assessment_mode: 'test',
      pre_test_score: 76,
      post_test_score: null,
      review_status: 'Pending',
      updated_at: rawMicroTs,
    });

    store.failNextEvaluationRead = true;
    await expect(getEvaluationBoard('sess-eval-1')).rejects.toThrow(/evaluations read unavailable/i);

    const board = await getEvaluationBoard('sess-eval-1');
    expect(board?.rows[0]).toMatchObject({ pre: 76, post: null, updatedAt: rawMicroTs });

    // Single-field post-test update preserves pre_test_score=76 and returns new updatedAt.
    const r1 = await saveScores('enr-eval-1', { post: 91 }, board!.rows[0].updatedAt);
    expect(r1.ok).toBe(true);
    expect(store.evaluations[0].pre_test_score).toBe(76);
    expect(store.evaluations[0].post_test_score).toBe(91);

    // Explicit zero on pre preserves post=91.
    const r2 = await saveScores('enr-eval-1', { pre: 0 }, r1.updatedAt!);
    expect(r2.ok).toBe(true);
    expect(store.evaluations[0].pre_test_score).toBe(0);
    expect(store.evaluations[0].post_test_score).toBe(91);

    // Stale CAS update & concurrent 23505 insert both return conflict without overwriting.
    const stale = await saveScores('enr-eval-1', { post: 55 }, rawMicroTs);
    expect(stale).toMatchObject({ ok: false, conflict: true });
    expect(store.evaluations[0].post_test_score).toBe(91);

    const dupInsert = await saveScores('enr-eval-1', { pre: 99 }, null);
    expect(dupInsert).toMatchObject({ ok: false, conflict: true });
    expect(store.evaluations[0].pre_test_score).toBe(0);
    expect(store.evaluations[0].post_test_score).toBe(91);

    // uploadOutput partialFailure when storage succeeds and DB write fails.
    store.failNextEvaluationWrite = true;
    const file = new File(['evidence'], 'output.pdf', { type: 'application/pdf' });
    const partial = await uploadOutput('sess-eval-1', 'enr-eval-1', file, r2.updatedAt!);
    expect(partial.ok).toBe(false);
    expect(partial.partialFailure).toBe(true);
    expect(store.storageUploads).toHaveLength(1);

    // Clean report notes write.
    expect(await saveReportNotes('sess-eval-1', 'Verified learning gains.')).toEqual({ ok: true });
  });
});
