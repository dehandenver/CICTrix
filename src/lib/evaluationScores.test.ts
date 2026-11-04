import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { buildEvaluationSnapshotMap, fetchLatestEvaluationForApplicantAnySource } from './evaluationScores';

const SNAPSHOT_KEY = 'cictrix_interviewer_score_snapshot';

describe('buildEvaluationSnapshotMap stored interviewer snapshots', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a snapshot saved for one application', () => {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ 'id:app-1': { pcptAverage: 4 } }));

    expect(buildEvaluationSnapshotMap([]).get('id:app-1')?.pcptRawScore).toBe(4);
  });

  it('ignores a stale snapshot saved under a shared email', () => {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ 'email:shared@example.com': { pcptAverage: 4 } }));

    expect(buildEvaluationSnapshotMap([]).has('email:shared@example.com')).toBe(false);
  });
});

describe('shared-email applications stay separate', () => {
  const EVALUATED_ID = '09e72c95-0e64-4199-8324-49e8dde07bc7';
  const SIBLING_ID = '3f0a7a56-2a3c-4f7e-9d7b-0b1f3c9a1111';
  const EMAIL = 'shared@example.com';
  const evaluation = { applicant_id: EVALUATED_ID, email: EMAIL, name: 'Ana Cruz', personality_score: 4 };

  const clientWith = (rows: Array<typeof evaluation>) => {
    const tables: string[] = [];
    const client = {
      tables,
      from: (table: string) => {
        tables.push(table);
        let applicantId = '';
        const chain: any = {
          select: () => chain,
          order: () => chain,
          limit: () => chain,
          eq: (_column: string, value: string) => {
            applicantId = value;
            return chain;
          },
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: rows.filter((row) => row.applicant_id === applicantId), error: null }).then(resolve),
        };
        return chain;
      },
    };
    return client;
  };

  beforeEach(() => localStorage.clear());

  it('files a database evaluation under its application only', () => {
    const map = buildEvaluationSnapshotMap([evaluation]);

    expect(map.get(EVALUATED_ID)?.pcptRawScore).toBe(4);
    expect(map.has(`email:${EMAIL}`)).toBe(false);
    expect(map.has('name:ana cruz')).toBe(false);
  });

  it('files a locally saved evaluation under its application only', () => {
    localStorage.setItem('cictrix_evaluations', JSON.stringify([evaluation]));

    const map = buildEvaluationSnapshotMap([]);

    expect(map.get(EVALUATED_ID)?.pcptRawScore).toBe(4);
    expect(map.has(`email:${EMAIL}`)).toBe(false);
    expect(map.has('name:ana cruz')).toBe(false);
  });

  it('finds no evaluation for an application when only its sibling has one', async () => {
    const client = clientWith([evaluation]);

    const latest = await fetchLatestEvaluationForApplicantAnySource(SIBLING_ID, client);

    expect(latest).toBeNull();
    expect(client.tables).not.toContain('applicants');
  });

  it('still finds the evaluation for its own application', async () => {
    const latest = await fetchLatestEvaluationForApplicantAnySource(EVALUATED_ID, clientWith([evaluation]));

    expect(latest?.pcptRawScore).toBe(4);
  });
});
