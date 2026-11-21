import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
type RpcError = { code?: string; hint?: string | null; message?: string };
type Scripted = 'ok' | 'drop' | 'empty' | { error: RpcError };

// A stateful stand-in for the database: the real services and the real dialog run
// against it, so assertions are about what was actually written, not about mocks
// that always say yes. It mirrors the contract of the two RPCs in
// 20261121…_training_calendar_transaction.sql: create is idempotent per request id,
// update is guarded by the revision, and tag sets are reconciled with the content.
const db = vi.hoisted(() => ({
  seq: 0,
  sessions: new Map<string, Row>(),
  tags: [] as Row[],
  rpcCalls: [] as Array<{ fn: string; params: Record<string, any> }>,
  directWrites: [] as Array<{ table: string; op: string }>,
  fromReads: [] as string[],
  saveScript: [] as Scripted[],
  readScript: [] as Scripted[],
  /** When set, the calendar list returns these rows instead of the live sessions. */
  staleList: null as Row[] | null,
}));

vi.mock('../supabase', () => {
  const tagRow = (id: string) => db.tags.find((t) => t.id === id);

  const toListRow = (s: Row) => ({
    id: s.id,
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
    roster_finalized_at: null,
    updated_at: s.updated_at,
    last_viewed_by_office: s.last_viewed_by_office ?? null,
    training_enrollments: [],
    training_competencies: s.tagIds.map((id: string) => ({
      competency_id: id,
      training_competency_tags: { id, name: tagRow(id)?.name },
    })),
  });

  const snapshotOf = (s: Row) => ({
    event: {
      id: s.id,
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
      roster_finalized_at: null,
    },
    competencies: [...s.tagIds]
      .sort()
      .map((id: string) => ({ id, name: tagRow(id)?.name, name_key: tagRow(id)?.name_key, category: null })),
    competency_ids: [...s.tagIds].sort(),
    revision: s.revision,
  });

  const from = (table: string) => {
    let selectCols = '';
    const chain: any = {
      select: (cols: string) => {
        selectCols = cols;
        db.fromReads.push(table);
        return chain;
      },
      order: () => chain,
      lt: () => chain,
      or: () => chain,
      in: () => chain,
      eq: () => chain,
      insert: () => {
        db.directWrites.push({ table, op: 'insert' });
        return chain;
      },
      update: () => {
        db.directWrites.push({ table, op: 'update' });
        return chain;
      },
      upsert: () => {
        db.directWrites.push({ table, op: 'upsert' });
        return chain;
      },
      delete: () => {
        db.directWrites.push({ table, op: 'delete' });
        return chain;
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
        let data: Row[] = [];
        if (table === 'training_sessions') data = (db.staleList ?? [...db.sessions.values()]).map(toListRow);
        else if (table === 'training_competency_tags') data = db.tags;
        void selectCols;
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };
    return chain;
  };

  const rpc = async (fn: string, params: Record<string, any>) => {
    db.rpcCalls.push({ fn, params: JSON.parse(JSON.stringify(params)) });

    if (fn === 'read_training_calendar_event') {
      const step = db.readScript.shift() ?? 'ok';
      if (step === 'drop') throw new TypeError('Failed to fetch');
      if (step === 'empty') return { data: null, error: null };
      if (typeof step === 'object') return { data: null, error: step.error };
      const s = db.sessions.get(params.p_session_id);
      if (!s) return { data: null, error: { code: 'P0002', hint: 'session_not_found', message: 'Training not found.' } };
      return { data: snapshotOf(s), error: null };
    }

    if (fn === 'save_training_calendar_event') {
      const step = db.saveScript.shift() ?? 'ok';
      if (typeof step === 'object') return { data: null, error: step.error };

      let result: Row;
      const ev = params.p_event as Row | null;
      const tagIds = params.p_competency_ids as string[] | null;
      if (params.p_session_id == null) {
        const existing = [...db.sessions.values()].find((s) => s.client_request_id === params.p_request_id);
        if (existing) {
          result = { id: existing.id, revision: existing.revision };
        } else {
          const id = `sess-${++db.seq}`;
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
            updated_at: null,
            last_viewed_by_office: null,
            tagIds: [...new Set((tagIds ?? []).filter(Boolean))],
            revision: `rev-${++db.seq}`,
          };
          db.sessions.set(id, session);
          result = { id, revision: session.revision };
        }
      } else {
        const s = db.sessions.get(params.p_session_id);
        if (!s) return { data: null, error: { code: 'P0002', hint: 'session_not_found', message: 'Training not found.' } };
        if (s.revision !== params.p_expected_revision) {
          return {
            data: null,
            error: { code: '40001', hint: 'revision_conflict', message: 'This training changed since it was loaded.' },
          };
        }
        if (ev) Object.assign(s, ev);
        if (tagIds) s.tagIds = [...new Set(tagIds.filter(Boolean))];
        if (ev || tagIds) {
          const prev = s.updated_at ? Date.parse(s.updated_at) : 0;
          s.updated_at = new Date(Math.max(Date.now(), prev + 1)).toISOString();
        }
        s.revision = `rev-${++db.seq}`;
        result = { id: s.id, revision: s.revision };
      }

      if (step === 'drop') throw new TypeError('Failed to fetch');
      if (step === 'empty') return { data: null, error: null };
      return { data: result, error: null };
    }

    return { data: null, error: { code: 'PGRST202', message: `Unexpected rpc ${fn}` } };
  };

  return { supabase: { from, rpc }, isMockModeEnabled: false };
});

import {
  createCalendarEvent,
  getCalendarEventSnapshot,
  updateCalendarEvent,
  type CalendarEventInput,
} from './trainingCalendar';
import { setSessionCompetencies } from './trainingCompetencies';
import { listOfficeTrainings } from './officeTrainingCourses';
import { TrainingCalendar } from '../../modules/admin/TrainingCalendar';

const TAG_A = '00000000-0000-4000-8000-0000000d0001';
const TAG_B = '00000000-0000-4000-8000-0000000d0002';
const TAG_C = '00000000-0000-4000-8000-0000000d0003';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const makeInput = (overrides: Partial<CalendarEventInput> = {}): CalendarEventInput => ({
  title: '  Ethics Seminar  ',
  category: 'Technical',
  startDate: daysFromNow(45),
  endDate: null,
  speaker: 'Dr. Cruz',
  location: 'Room 1',
  objectives: ['Goal A', '   ', 'Goal B'],
  description: ' Desc ',
  materials: '',
  prerequisites: '',
  status: 'Scheduled',
  capacity: 25,
  ...overrides,
});

const seedSession = (overrides: Row = {}): Row => {
  const id = overrides.id ?? `sess-seed-${++db.seq}`;
  const session: Row = {
    id,
    client_request_id: null,
    title: 'Seeded Training',
    category: 'Technical',
    scheduled_date: daysFromNow(45),
    end_date: null,
    instructor_name: 'Dr. Cruz',
    location: 'Room 1',
    objectives: ['Goal A'],
    description: 'Desc',
    materials: 'Mats',
    prerequisites: 'None',
    status: 'Scheduled',
    capacity: 20,
    updated_at: null,
    last_viewed_by_office: null,
    tagIds: [TAG_A],
    revision: `rev-${++db.seq}`,
    ...overrides,
  };
  db.sessions.set(id, session);
  return { ...session, objectives: [...session.objectives], tagIds: [...session.tagIds] };
};

const saveCalls = () => db.rpcCalls.filter((c) => c.fn === 'save_training_calendar_event');
const readCalls = () => db.rpcCalls.filter((c) => c.fn === 'read_training_calendar_event');

beforeEach(() => {
  db.seq = 0;
  db.sessions.clear();
  db.rpcCalls = [];
  db.directWrites = [];
  db.fromReads = [];
  db.saveScript = [];
  db.readScript = [];
  db.staleList = null;
  db.tags = [
    { id: TAG_A, name: 'Alpha Competency', name_key: 'alpha competency', category: null },
    { id: TAG_B, name: 'Beta Competency', name_key: 'beta competency', category: null },
    { id: TAG_C, name: 'Gamma Competency', name_key: 'gamma competency', category: null },
  ];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('getCalendarEventSnapshot', () => {
  it('reads one snapshot through read_training_calendar_event and maps it to the calendar event shape', async () => {
    const seeded = seedSession({
      title: 'Fresh Snapshot Title',
      objectives: ['One', 'Two'],
      tagIds: [TAG_B, TAG_A],
    });

    const snapshot = await getCalendarEventSnapshot(seeded.id);

    expect(readCalls()).toEqual([{ fn: 'read_training_calendar_event', params: { p_session_id: seeded.id } }]);
    expect(db.fromReads).toEqual([]);
    expect(snapshot.revision).toBe(seeded.revision);
    expect(snapshot.competencyIds).toEqual([TAG_A, TAG_B]);
    expect(snapshot.competencyTags.map((t) => t.name)).toEqual(['Alpha Competency', 'Beta Competency']);
    expect(snapshot.competencyTags[0]).toMatchObject({ id: TAG_A, nameKey: 'alpha competency' });
    expect(snapshot.event).toMatchObject({
      id: seeded.id,
      title: 'Fresh Snapshot Title',
      category: 'Technical',
      startDate: seeded.scheduled_date,
      endDate: null,
      speaker: 'Dr. Cruz',
      location: 'Room 1',
      objectives: ['One', 'Two'],
      description: 'Desc',
      materials: 'Mats',
      prerequisites: 'None',
      status: 'Scheduled',
      capacity: 20,
      rosterFinalizedAt: null,
      competencies: ['Alpha Competency', 'Beta Competency'],
    });
  });

  it.each<[string, Scripted]>([
    ['an RPC error', { error: { code: 'P0002', hint: 'session_not_found', message: 'Training not found.' } }],
    ['a permission error', { error: { code: '42501', hint: 'not_authorized', message: 'nope' } }],
    ['an empty response', 'empty'],
    ['a dropped connection', 'drop'],
  ])('throws on %s and never invents a revision', async (_label, step) => {
    const seeded = seedSession();
    db.readScript = [step];

    await expect(getCalendarEventSnapshot(seeded.id)).rejects.toBeInstanceOf(Error);
  });

  it('throws when the snapshot has no revision', async () => {
    const seeded = seedSession();
    const real = db.sessions.get(seeded.id)!;
    real.revision = '';

    await expect(getCalendarEventSnapshot(seeded.id)).rejects.toThrow(/revision/i);
  });
});

describe('createCalendarEvent', () => {
  it('writes the whitelisted event and tags in one save_training_calendar_event call with the request id', async () => {
    const requestId = crypto.randomUUID();
    const input = makeInput({ competencyIds: [TAG_A, TAG_B] });

    const result = await createCalendarEvent(input, requestId);

    expect(result.ok).toBe(true);
    expect(result.id).toBeTruthy();
    expect(result.revision).toBeTruthy();
    expect(saveCalls()).toHaveLength(1);
    expect(saveCalls()[0].params).toEqual({
      p_session_id: null,
      p_event: {
        title: 'Ethics Seminar',
        category: 'Technical',
        scheduled_date: input.startDate,
        end_date: null,
        instructor_name: 'Dr. Cruz',
        location: 'Room 1',
        objectives: ['Goal A', 'Goal B'],
        description: 'Desc',
        materials: null,
        prerequisites: null,
        status: 'Scheduled',
        capacity: 25,
      },
      p_competency_ids: [TAG_A, TAG_B],
      p_expected_revision: null,
      p_request_id: requestId,
    });
    expect(db.directWrites).toEqual([]);
  });

  it('sends NULL tags when the caller did not choose any, and an empty array when they chose none', async () => {
    await createCalendarEvent(makeInput(), crypto.randomUUID());
    await createCalendarEvent(makeInput({ competencyIds: [] }), crypto.randomUUID());

    expect(saveCalls()[0].params.p_competency_ids).toBeNull();
    expect(saveCalls()[1].params.p_competency_ids).toEqual([]);
  });

  it('retrying with the same request id after a lost response returns the original session without creating another', async () => {
    const requestId = crypto.randomUUID();
    db.saveScript = ['drop'];

    const first = await createCalendarEvent(makeInput({ competencyIds: [TAG_A] }), requestId);
    expect(first).toMatchObject({ ok: false, kind: 'uncertain' });
    expect(first.id).toBeUndefined();
    expect(db.sessions.size).toBe(1);

    const retry = await createCalendarEvent(makeInput({ competencyIds: [TAG_A] }), requestId);
    expect(retry.ok).toBe(true);
    expect(db.sessions.size).toBe(1);
    expect(retry.id).toBe([...db.sessions.keys()][0]);
    expect(saveCalls().map((c) => c.params.p_request_id)).toEqual([requestId, requestId]);
  });

  it('treats a success response with no id or revision as uncertain, not as success', async () => {
    db.saveScript = ['empty'];

    const result = await createCalendarEvent(makeInput(), crypto.randomUUID());

    expect(result).toMatchObject({ ok: false, kind: 'uncertain' });
    expect(result.id).toBeUndefined();
  });
});

describe('updateCalendarEvent', () => {
  it('saves content and tags in one call guarded by the loaded revision, with no direct table writes', async () => {
    const seeded = seedSession();
    const input = makeInput({ competencyIds: [TAG_B] });

    const result = await updateCalendarEvent(seeded.id, input, seeded.revision);

    expect(result.ok).toBe(true);
    expect(result.id).toBe(seeded.id);
    expect(result.revision).toBeTruthy();
    expect(result.revision).not.toBe(seeded.revision);
    expect(saveCalls()).toHaveLength(1);
    expect(saveCalls()[0].params).toMatchObject({
      p_session_id: seeded.id,
      p_competency_ids: [TAG_B],
      p_expected_revision: seeded.revision,
      p_request_id: null,
    });
    expect(Object.keys(saveCalls()[0].params.p_event).sort()).toEqual([
      'capacity', 'category', 'description', 'end_date', 'instructor_name', 'location', 'materials',
      'objectives', 'prerequisites', 'scheduled_date', 'status', 'title',
    ]);
    expect(db.directWrites).toEqual([]);
    expect(db.sessions.get(seeded.id)?.tagIds).toEqual([TAG_B]);
  });

  it('leaves tags alone when competencyIds is undefined and clears them when it is empty', async () => {
    const seeded = seedSession({ tagIds: [TAG_A, TAG_B] });

    const untouched = await updateCalendarEvent(seeded.id, makeInput(), seeded.revision);
    expect(saveCalls()[0].params.p_competency_ids).toBeNull();
    expect(db.sessions.get(seeded.id)?.tagIds).toEqual([TAG_A, TAG_B]);

    const cleared = await updateCalendarEvent(seeded.id, makeInput({ competencyIds: [] }), untouched.revision!);
    expect(saveCalls()[1].params.p_competency_ids).toEqual([]);
    expect(cleared.ok).toBe(true);
    expect(db.sessions.get(seeded.id)?.tagIds).toEqual([]);
  });

  it('refuses a stale revision without changing the session', async () => {
    const seeded = seedSession({ title: 'Original' });
    const winner = await updateCalendarEvent(seeded.id, makeInput({ title: 'Winner' }), seeded.revision);
    expect(winner.ok).toBe(true);

    const loser = await updateCalendarEvent(seeded.id, makeInput({ title: 'Loser' }), seeded.revision);

    expect(loser).toMatchObject({ ok: false, kind: 'conflict' });
    expect(db.sessions.get(seeded.id)?.title).toBe('Winner');
  });

  it.each<[string, RpcError, string]>([
    ['revision conflict', { code: '40001', hint: 'revision_conflict', message: 'changed' }, 'conflict'],
    ['training lock', { code: '23514', hint: 'training_locked', message: 'locked' }, 'locked'],
    ['unhinted lock trigger', { code: '23514', message: 'Training is locked: editing closes 3 days before start.' }, 'locked'],
    ['missing permission', { code: '42501', hint: 'not_authorized', message: 'nope' }, 'not_authorized'],
    ['invalid competency', { code: '23503', hint: 'invalid_competency', message: 'bad tag' }, 'validation'],
    ['invalid event', { code: '22023', hint: 'invalid_event', message: 'Title is required.' }, 'validation'],
    ['missing revision', { code: '22023', hint: 'missing_revision', message: 'revision' }, 'validation'],
    ['removed session', { code: 'P0002', hint: 'session_not_found', message: 'gone' }, 'conflict'],
    ['missing RPC', { code: 'PGRST202', message: 'function not found' }, 'unavailable'],
    ['undefined function', { code: '42883', message: 'undefined function' }, 'unavailable'],
    ['unexpected database error', { code: 'XX000', message: 'boom' }, 'unavailable'],
    ['transport failure', { message: 'Failed to fetch' }, 'uncertain'],
  ])('classifies %s as %s and reports no success', async (_label, error, kind) => {
    const seeded = seedSession();
    db.saveScript = [{ error }];

    const result = await updateCalendarEvent(seeded.id, makeInput(), seeded.revision);

    expect(result.ok).toBe(false);
    expect(result.kind).toBe(kind);
    expect(typeof result.error).toBe('string');
    expect(result.error).not.toMatch(/PGRST|XX000|23514|40001/);
    expect(result.revision).toBeUndefined();
  });

  it('classifies a dropped connection on update as uncertain', async () => {
    const seeded = seedSession();
    db.saveScript = ['drop'];

    const result = await updateCalendarEvent(seeded.id, makeInput(), seeded.revision);

    expect(result).toMatchObject({ ok: false, kind: 'uncertain' });
  });
});

describe('setSessionCompetencies', () => {
  it('routes through the same save transaction with no event and no direct join-table writes', async () => {
    const seeded = seedSession({ tagIds: [TAG_A] });

    const result = await setSessionCompetencies(seeded.id, [TAG_A, TAG_C], seeded.revision);

    expect(result.ok).toBe(true);
    expect(saveCalls()).toHaveLength(1);
    expect(saveCalls()[0].params).toEqual({
      p_session_id: seeded.id,
      p_event: null,
      p_competency_ids: [TAG_A, TAG_C],
      p_expected_revision: seeded.revision,
      p_request_id: null,
    });
    expect(db.directWrites).toEqual([]);
    expect(db.sessions.get(seeded.id)?.tagIds).toEqual([TAG_A, TAG_C]);
  });

  it('reports a stale revision as a conflict', async () => {
    const seeded = seedSession({ tagIds: [TAG_A] });

    const result = await setSessionCompetencies(seeded.id, [TAG_B], 'rev-stale');

    expect(result).toMatchObject({ ok: false, kind: 'conflict' });
    expect(db.sessions.get(seeded.id)?.tagIds).toEqual([TAG_A]);
  });
});

describe('Office Training Courses after L&D saves', () => {
  it('shows published and locked trainings, hides planning ones, and flags Updated by L&D only after an edit', async () => {
    const published = await createCalendarEvent(
      makeInput({ title: 'Published One', description: 'Full', materials: 'Mats', prerequisites: 'None', competencyIds: [TAG_A] }),
      crypto.randomUUID(),
    );
    const locked = await createCalendarEvent(
      makeInput({
        title: 'Locked One',
        startDate: daysFromNow(2),
        description: 'Full',
        materials: 'Mats',
        prerequisites: 'None',
      }),
      crypto.randomUUID(),
    );
    await createCalendarEvent(makeInput({ title: 'Planning One' }), crypto.randomUUID());

    let office = await listOfficeTrainings();
    expect(office.map((t) => `${t.title}:${t.status}`).sort()).toEqual(['Locked One:locked', 'Published One:published']);
    expect(office.every((t) => t.updatedByLnd === false)).toBe(true);

    // Office opens the drawer, then L&D edits only the tags.
    db.sessions.get(published.id!)!.last_viewed_by_office = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const edited = await setSessionCompetencies(published.id!, [TAG_A, TAG_B], published.revision!);
    expect(edited.ok).toBe(true);

    office = await listOfficeTrainings();
    const byTitle = Object.fromEntries(office.map((t) => [t.title, t]));
    expect(byTitle['Published One'].updatedByLnd).toBe(true);
    expect(byTitle['Locked One'].updatedByLnd).toBe(false);
    expect(byTitle['Locked One'].status).toBe('locked');
    expect(locked.ok).toBe(true);
  });
});

// ── The edit/create dialog ──────────────────────────────────────────────────

const openList = async () => {
  render(createElement(TrainingCalendar));
  fireEvent.click(await screen.findByRole('button', { name: 'List' }));
};

const openEditorFor = async (listTitle: string) => {
  await openList();
  fireEvent.click(await screen.findByText(listTitle));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
};

const titleInput = () => screen.getByPlaceholderText('e.g. Ethical Conduct in Public Service') as HTMLInputElement;
const form = () => document.getElementById('training-form');

describe('TrainingCalendar new-training dialog', () => {
  const openNewTraining = async () => {
    render(createElement(TrainingCalendar));
    fireEvent.click(await screen.findByRole('button', { name: 'New Training' }));
    await screen.findByPlaceholderText('e.g. Ethical Conduct in Public Service');
  };

  const fillRequired = (title: string) => {
    fireEvent.change(titleInput(), { target: { value: title } });
    const category = document.querySelector('#training-form select') as HTMLSelectElement;
    fireEvent.change(category, { target: { value: 'Technical' } });
  };

  it('creates through the RPC with one request id and closes only on confirmed success', async () => {
    await openNewTraining();
    fillRequired('Brand New Training');

    fireEvent.click(screen.getByRole('button', { name: 'Create Training' }));

    await waitFor(() => expect(form()).toBeNull());
    expect(saveCalls()).toHaveLength(1);
    expect(saveCalls()[0].params.p_session_id).toBeNull();
    expect(saveCalls()[0].params.p_request_id).toMatch(UUID_PATTERN);
    expect(saveCalls()[0].params.p_event.title).toBe('Brand New Training');
    expect(db.sessions.size).toBe(1);
    expect(db.directWrites).toEqual([]);
  });

  it('keeps the dialog open with the draft when the save is refused', async () => {
    db.saveScript = [{ error: { code: '42501', hint: 'not_authorized', message: 'nope' } }];
    await openNewTraining();
    fillRequired('Refused Training');

    fireEvent.click(screen.getByRole('button', { name: 'Create Training' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/L&D or Admin/i);
    expect(form()).not.toBeNull();
    expect(titleInput().value).toBe('Refused Training');
    expect(db.sessions.size).toBe(0);
  });

  it('after a lost response keeps the draft and retries with the same request id, creating no duplicate', async () => {
    db.saveScript = ['drop'];
    await openNewTraining();
    fillRequired('Lost Response Training');

    fireEvent.click(screen.getByRole('button', { name: 'Create Training' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.?t confirm/i);
    expect(form()).not.toBeNull();
    expect(titleInput().value).toBe('Lost Response Training');
    expect(db.sessions.size).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Create Training' }));

    await waitFor(() => expect(form()).toBeNull());
    expect(saveCalls()).toHaveLength(2);
    expect(saveCalls()[1].params.p_request_id).toBe(saveCalls()[0].params.p_request_id);
    expect(db.sessions.size).toBe(1);
  });

  it('uses a new request id for each time the dialog is opened', async () => {
    await openNewTraining();
    fillRequired('First Open');
    fireEvent.click(screen.getByRole('button', { name: 'Create Training' }));
    await waitFor(() => expect(form()).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'New Training' }));
    await screen.findByPlaceholderText('e.g. Ethical Conduct in Public Service');
    fillRequired('Second Open');
    fireEvent.click(screen.getByRole('button', { name: 'Create Training' }));
    await waitFor(() => expect(form()).toBeNull());

    expect(saveCalls()).toHaveLength(2);
    expect(saveCalls()[1].params.p_request_id).not.toBe(saveCalls()[0].params.p_request_id);
    expect(db.sessions.size).toBe(2);
  });
});

describe('TrainingCalendar edit dialog', () => {
  it('initializes the form from one snapshot, not from the stale list row or separate tag requests', async () => {
    const seeded = seedSession({ title: 'Fresh Snapshot Title', tagIds: [TAG_A, TAG_B] });
    // The calendar list was loaded before another editor changed the title and tags.
    db.staleList = [{ ...seeded, title: 'Stale List Title', tagIds: [TAG_C] }];

    await openEditorFor('Stale List Title');

    expect(await screen.findByDisplayValue('Fresh Snapshot Title')).toBeInTheDocument();
    expect(readCalls()).toHaveLength(1);
    expect(readCalls()[0].params).toEqual({ p_session_id: seeded.id });
    expect(screen.getByText('Alpha Competency')).toBeInTheDocument();
    expect(screen.getByText('Beta Competency')).toBeInTheDocument();
    expect(db.fromReads.filter((t) => t === 'training_competencies')).toEqual([]);
  });

  it('saves with the snapshot revision and tag ids and closes on success', async () => {
    const seeded = seedSession({ title: 'Edit Me', tagIds: [TAG_A, TAG_B] });
    await openEditorFor('Edit Me');
    await screen.findByDisplayValue('Edit Me');

    fireEvent.change(titleInput(), { target: { value: 'Edited Title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(form()).toBeNull());
    expect(saveCalls()).toHaveLength(1);
    expect(saveCalls()[0].params).toMatchObject({
      p_session_id: seeded.id,
      p_expected_revision: seeded.revision,
      p_competency_ids: [TAG_A, TAG_B],
      p_request_id: null,
    });
    expect(saveCalls()[0].params.p_event.title).toBe('Edited Title');
    expect(db.sessions.get(seeded.id)?.title).toBe('Edited Title');
    expect(db.directWrites).toEqual([]);
  });

  it('blocks editing with a retryable error when the snapshot cannot be read, and never invents a revision', async () => {
    const seeded = seedSession({ title: 'Needs Snapshot' });
    db.readScript = [{ error: { code: 'XX000', message: 'database unavailable' } }];

    await openEditorFor('Needs Snapshot');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/load/i);
    expect(form()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    expect(saveCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByDisplayValue('Needs Snapshot')).toBeInTheDocument();
    expect(readCalls()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(form()).toBeNull());
    expect(saveCalls()[0].params.p_expected_revision).toBe(seeded.revision);
  });

  it('blocks editing when the snapshot comes back empty', async () => {
    seedSession({ title: 'Empty Snapshot' });
    db.readScript = ['empty'];

    await openEditorFor('Empty Snapshot');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(form()).toBeNull();
    expect(saveCalls()).toHaveLength(0);
  });

  it('on a revision conflict keeps the draft, offers Reload, and saves again with the new revision', async () => {
    const seeded = seedSession({ title: 'Contended' });
    await openEditorFor('Contended');
    await screen.findByDisplayValue('Contended');

    // Someone else saves first.
    const other = await updateCalendarEvent(seeded.id, makeInput({ title: 'Changed Elsewhere' }), seeded.revision);
    expect(other.ok).toBe(true);
    db.rpcCalls = [];

    fireEvent.change(titleInput(), { target: { value: 'My Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/changed while you were editing/i);
    expect(form()).not.toBeNull();
    expect(titleInput().value).toBe('My Draft');
    expect(db.sessions.get(seeded.id)?.title).toBe('Changed Elsewhere');

    fireEvent.click(screen.getByRole('button', { name: /reload latest/i }));

    expect(await screen.findByDisplayValue('Changed Elsewhere')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const revisionBeforeSave = db.sessions.get(seeded.id)!.revision;
    fireEvent.change(titleInput(), { target: { value: 'Second Attempt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(form()).toBeNull());
    const finalSave = saveCalls()[saveCalls().length - 1];
    expect(finalSave.params.p_expected_revision).toBe(revisionBeforeSave);
    expect(finalSave.params.p_expected_revision).not.toBe(seeded.revision);
    expect(db.sessions.get(seeded.id)?.title).toBe('Second Attempt');
  });

  it('keeps the dialog and draft when the training has locked, and says status changes are still allowed', async () => {
    seedSession({ title: 'Lock Race' });
    await openEditorFor('Lock Race');
    await screen.findByDisplayValue('Lock Race');
    db.saveScript = [{ error: { code: '23514', hint: 'training_locked', message: 'Training is locked' } }];

    fireEvent.change(titleInput(), { target: { value: 'Too Late' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/locked/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/status/i);
    expect(form()).not.toBeNull();
    expect(titleInput().value).toBe('Too Late');
  });

  it('after a lost update response keeps the draft and sends the user to Reload before saving again', async () => {
    const seeded = seedSession({ title: 'Lost Update' });
    await openEditorFor('Lost Update');
    await screen.findByDisplayValue('Lost Update');
    db.saveScript = ['drop'];

    fireEvent.change(titleInput(), { target: { value: 'Maybe Saved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.?t confirm/i);
    expect(form()).not.toBeNull();
    expect(titleInput().value).toBe('Maybe Saved');
    // The write did commit: reloading shows it, and no duplicate was created.
    fireEvent.click(screen.getByRole('button', { name: /reload latest/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByDisplayValue('Maybe Saved')).toBeInTheDocument();
    expect(db.sessions.size).toBe(1);
    expect(db.sessions.get(seeded.id)?.title).toBe('Maybe Saved');
  });
});
