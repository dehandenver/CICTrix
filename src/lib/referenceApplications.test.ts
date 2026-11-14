import { describe, expect, it } from 'vitest';
import { groupByReference, withdrawnLabel, type ReferenceApplication } from './referenceApplications';

const app = (overrides: Partial<ReferenceApplication>): ReferenceApplication => ({
  id: 'a1',
  referenceNo: 'ABYAN-731-052',
  position: 'Administrative Aide I',
  plantillaLabel: 'Plantilla 2',
  status: 'Qualified',
  hiredElsewhereApplicationId: null,
  createdAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

describe('groupByReference', () => {
  it('groups rows whose references differ only in case and punctuation', () => {
    const groups = groupByReference([
      app({ id: 'a1', referenceNo: 'ABYAN-731-052' }),
      app({ id: 'a2', referenceNo: 'abyan 731 052' }),
    ]);
    expect([...groups.keys()]).toEqual(['ABYAN731052']);
    expect(groups.get('ABYAN731052')?.map((row) => row.id)).toEqual(['a1', 'a2']);
  });

  it('orders each group oldest first', () => {
    const groups = groupByReference([
      app({ id: 'new', createdAt: '2026-10-20T00:00:00Z' }),
      app({ id: 'old', createdAt: '2026-10-02T00:00:00Z' }),
    ]);
    expect(groups.get('ABYAN731052')?.map((row) => row.id)).toEqual(['old', 'new']);
  });

  it('skips rows with no reference, so blank-email rows are never merged', () => {
    const groups = groupByReference([
      app({ id: 'a1', referenceNo: '' }),
      app({ id: 'a2', referenceNo: '  ' }),
      app({ id: 'a3', referenceNo: '---' }),
    ]);
    expect(groups.size).toBe(0);
  });
});

describe('withdrawnLabel', () => {
  it('names the plantilla the person was hired on', () => {
    const hire = app({ id: 'hire', position: 'Records Officer I', plantillaLabel: 'Plantilla 5', status: 'Selected' });
    const withdrawn = app({ id: 'w', status: 'Withdrawn - Hired Elsewhere', hiredElsewhereApplicationId: 'hire' });
    expect(withdrawnLabel(withdrawn, [hire, withdrawn])).toBe('Withdrawn: hired on Plantilla 5');
  });

  it('falls back when the hiring row is not in the group', () => {
    const withdrawn = app({ id: 'w', status: 'Withdrawn - Hired Elsewhere', hiredElsewhereApplicationId: 'gone' });
    expect(withdrawnLabel(withdrawn, [withdrawn])).toBe('Withdrawn: hired elsewhere');
  });

  it('falls back when the hiring row has no plantilla label', () => {
    const hire = app({ id: 'hire', plantillaLabel: null, status: 'Selected' });
    const withdrawn = app({ id: 'w', status: 'Withdrawn - Hired Elsewhere', hiredElsewhereApplicationId: 'hire' });
    expect(withdrawnLabel(withdrawn, [hire, withdrawn])).toBe('Withdrawn: hired elsewhere');
  });
});
