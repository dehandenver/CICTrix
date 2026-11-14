import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; status: string | null };
type Result = { data: unknown; error: { message: string } | null };

const db = vi.hoisted(() => ({
  reads: [] as Result[],
  update: { data: [], error: null } as Result | Error,
  updates: [] as Array<{ payload: unknown; filters: Array<[string, unknown]> }>,
}));

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => db.reads.shift() ?? { data: null, error: null } }),
      }),
      update: (payload: unknown) => {
        const filters: Array<[string, unknown]> = [];
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return chain;
          },
          select: async () => {
            db.updates.push({ payload, filters });
            if (db.update instanceof Error) throw db.update;
            return db.update;
          },
        };
        return chain;
      },
    }),
  },
}));

import { transitionApplicantStatus } from './applicantStatusTransition';

const ID = '11111111-1111-1111-1111-111111111111';
const row = (status: string | null): Result => ({ data: { id: ID, status } satisfies Row, error: null });

beforeEach(() => {
  db.reads = [];
  db.updates = [];
  db.update = { data: [{ id: ID }], error: null };
});

describe('transitionApplicantStatus', () => {
  it('advances a scheduled applicant, filtering on the UUID and the exact status read', async () => {
    db.reads = [row('Interview/Exam Scheduled')];

    const result = await transitionApplicantStatus(ID, 'For Evaluation');

    expect(result).toEqual({ kind: 'advanced', status: 'For Evaluation' });
    expect(db.updates).toEqual([{
      payload: { status: 'For Evaluation' },
      filters: [['id', ID], ['status', 'Interview/Exam Scheduled']],
    }]);
  });

  it('filters on the raw stored value, not its normalized form', async () => {
    db.reads = [row('For Interview')];

    await transitionApplicantStatus(ID, 'For Evaluation');

    expect(db.updates[0].filters).toContainEqual(['status', 'For Interview']);
  });

  it('stores the given value when it differs from the workflow target', async () => {
    db.reads = [row('For Evaluation')];

    const result = await transitionApplicantStatus(ID, 'Disqualified', 'Not Qualified');

    expect(result).toEqual({ kind: 'advanced', status: 'Not Qualified' });
    expect(db.updates[0].payload).toEqual({ status: 'Not Qualified' });
  });

  it.each([
    'Hired',
    'Selected',
    'Qualified',
    'For Contract Signing',
    'Disqualified',
    'Not Qualified',
    'Not Selected',
    'Withdrawn - Hired Elsewhere',
    'For Evaluation',
    'Shortlisted',
    'Submitted',
  ])('leaves %s unchanged when moving to For Evaluation', async (status) => {
    db.reads = [row(status)];

    const result = await transitionApplicantStatus(ID, 'For Evaluation');

    expect(result).toEqual({ kind: 'unchanged', reason: 'transition-not-allowed' });
    expect(db.updates).toEqual([]);
  });

  it.each(['Hired', 'Not Selected', 'Withdrawn - Hired Elsewhere', 'Interview/Exam Scheduled'])(
    'refuses to qualify an applicant at %s',
    async (status) => {
      db.reads = [row(status)];

      const result = await transitionApplicantStatus(ID, 'Qualified');

      expect(result).toEqual({ kind: 'unchanged', reason: 'transition-not-allowed' });
      expect(db.updates).toEqual([]);
    },
  );

  it.each([null, '', 'Some Unknown Status'])('leaves the unrecognised status %s unchanged', async (status) => {
    db.reads = [row(status)];

    const result = await transitionApplicantStatus(ID, 'For Evaluation');

    expect(result).toEqual({ kind: 'unchanged', reason: 'transition-not-allowed' });
    expect(db.updates).toEqual([]);
  });

  it('reports a missing row as not found', async () => {
    db.reads = [{ data: null, error: null }];

    expect(await transitionApplicantStatus(ID, 'For Evaluation')).toEqual({ kind: 'unchanged', reason: 'not-found' });
  });

  it('reports a failed read without writing', async () => {
    db.reads = [{ data: null, error: { message: 'read denied' } }];

    expect(await transitionApplicantStatus(ID, 'For Evaluation')).toEqual({ kind: 'failed', error: 'read denied' });
    expect(db.updates).toEqual([]);
  });

  it('reports a returned update error', async () => {
    db.reads = [row('Interview/Exam Scheduled')];
    db.update = { data: null, error: { message: 'write rejected' } };

    expect(await transitionApplicantStatus(ID, 'For Evaluation')).toEqual({ kind: 'failed', error: 'write rejected' });
  });

  it('reports a thrown network failure', async () => {
    db.reads = [row('Interview/Exam Scheduled')];
    db.update = new Error('Failed to fetch');

    expect(await transitionApplicantStatus(ID, 'For Evaluation')).toEqual({ kind: 'failed', error: 'Failed to fetch' });
  });

  describe('when the update touches no rows', () => {
    beforeEach(() => {
      db.update = { data: [], error: null };
    });

    it('reports a concurrent change when the status moved on', async () => {
      db.reads = [row('Interview/Exam Scheduled'), row('Hired')];

      expect(await transitionApplicantStatus(ID, 'For Evaluation')).toEqual({ kind: 'unchanged', reason: 'concurrent-change' });
    });

    it('reports not found when the row disappeared', async () => {
      db.reads = [row('Interview/Exam Scheduled'), { data: null, error: null }];

      expect(await transitionApplicantStatus(ID, 'For Evaluation')).toEqual({ kind: 'unchanged', reason: 'not-found' });
    });

    it('reports a failure when the status did not change, as an RLS denial leaves it', async () => {
      db.reads = [row('Interview/Exam Scheduled'), row('Interview/Exam Scheduled')];

      const result = await transitionApplicantStatus(ID, 'For Evaluation');

      expect(result.kind).toBe('failed');
    });

    it('reports a failure when the re-read fails', async () => {
      db.reads = [row('Interview/Exam Scheduled'), { data: null, error: { message: 'gone away' } }];

      expect(await transitionApplicantStatus(ID, 'For Evaluation')).toEqual({ kind: 'failed', error: 'gone away' });
    });
  });
});
