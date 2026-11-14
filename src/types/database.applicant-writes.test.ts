import { describe, expect, it } from 'vitest';
import type { Database } from './database.types';

type ApplicantUpdate = Database['public']['Tables']['applicants']['Update'];

describe('applicants write type', () => {
  it('accepts a status-only update', () => {
    const update: ApplicantUpdate = { status: 'For Evaluation' };
    expect(update.status).toBe('For Evaluation');
  });

  it('rejects total_score, which public.applicants does not have', () => {
    // `tsc --noEmit` is the real assertion: this directive fails the type-check
    // if the column comes back to the Update type.
    // @ts-expect-error total_score is not a column of public.applicants.
    const update: ApplicantUpdate = { total_score: 80 };
    expect(update).toEqual({ total_score: 80 });
  });
});
