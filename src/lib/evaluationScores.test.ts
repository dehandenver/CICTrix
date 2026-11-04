import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { buildEvaluationSnapshotMap } from './evaluationScores';

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
