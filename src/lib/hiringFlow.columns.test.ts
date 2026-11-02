import { beforeEach, describe, expect, it, vi } from 'vitest';

// Columns public.applicants does not have. Naming any of them makes PostgREST
// reject the whole select with 42703, which is what broke Generate Employee
// Credentials: the page could only report "the server couldn't return this
// data". ForHiringPage carries the same list.
const MISSING_COLUMNS = ['full_name', 'department', 'qualification_score', 'total_score'];

const selected: string[] = [];

vi.mock('./supabase', () => {
  const result = { data: [], error: null };
  const builder: any = {
    select: (cols: string) => { selected.push(cols); return builder; },
    eq: () => builder,
    in: () => builder,
    is: () => builder,
    not: () => builder,
    order: () => builder,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return { supabase: { from: () => builder } };
});

vi.mock('./plantillaSlots', () => ({
  fetchSlotsByJobPosting: async () => new Map(),
  plantillaLabel: () => '',
}));

beforeEach(() => { selected.length = 0; });

describe('hiringFlow applicant reads', () => {
  it('never asks public.applicants for a column it lacks', async () => {
    const { fetchReservedApplicants, fetchArchivedApplicants } = await import('./hiringFlow');

    await fetchReservedApplicants();
    await fetchArchivedApplicants().catch(() => undefined);

    // Prove the reads actually ran, so an empty capture can't pass this test.
    expect(selected.some((cols) => cols.includes('signing_deadline'))).toBe(true);
    expect(selected.some((cols) => cols.includes('archived_at'))).toBe(true);
    const requested = selected.flatMap((cols) => cols.split(',').map((c) => c.trim()));
    expect(requested.filter((c) => MISSING_COLUMNS.includes(c))).toEqual([]);
    // Promotions are told apart by these two real columns.
    expect(requested).toEqual(expect.arrayContaining(['application_type', 'employee_id']));
  });
});
