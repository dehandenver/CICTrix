import { describe, expect, it, vi } from 'vitest';

const rows: Record<string, unknown[]> = {};

vi.mock('../supabase', async () => {
  const { supabaseStub } = await import('../../test/supabaseStub');
  return { supabase: supabaseStub((table) => rows[table] ?? []) };
});

import { fetchApplicationsByReference } from './applicants';

const HIRE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SLOT_5 = '33333333-3333-4333-8333-333333333333';
const SLOT_2 = '44444444-4444-4444-8444-444444444444';

describe('fetchApplicationsByReference', () => {
  it('groups by normalised reference with plantilla labels, oldest first', async () => {
    rows.applicants = [
      { id: OTHER, reference_no: 'ABYAN-731-052', position: 'Administrative Aide I', status: 'Withdrawn - Hired Elsewhere',
        hired_elsewhere_application_id: HIRE, created_at: '2026-10-02T00:00:00Z' },
      { id: HIRE, reference_no: 'ABYAN-731-052', position: 'Records Officer I', status: 'Hired',
        hired_elsewhere_application_id: null, created_at: '2026-10-01T00:00:00Z' },
    ];
    rows.application_plantilla_slots = [
      { applicant_id: HIRE, plantilla_slot_id: SLOT_5, status: 'applied' },
      { applicant_id: OTHER, plantilla_slot_id: SLOT_2, status: 'applied' },
    ];
    rows.plantilla_slots = [
      { id: SLOT_5, job_posting_id: 'j1', slot_number: 5, item_number: 'X-5', status: 'filled' },
      { id: SLOT_2, job_posting_id: 'j2', slot_number: 2, label: 'Plantilla 2', item_number: 'X-2', status: 'open' },
    ];

    const result = await fetchApplicationsByReference(['abyan 731 052']);
    expect(result.error).toBeUndefined();
    const group = result.data?.get('ABYAN731052');
    expect(group?.map((app) => [app.id, app.plantillaLabel, app.hiredElsewhereApplicationId])).toEqual([
      [HIRE, 'Plantilla 5', null],
      [OTHER, 'Plantilla 2', HIRE],
    ]);
  });

  it('returns an empty map without querying when no reference is given', async () => {
    const result = await fetchApplicationsByReference(['', '  ']);
    expect(result).toEqual({ data: new Map() });
  });
});
