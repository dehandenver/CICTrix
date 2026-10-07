import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { toTime, useTableSort } from './tableSort';

interface Row {
  name: string;
  position: string;
  applied: string;
}

const rows: Row[] = [
  { name: 'Bautista', position: 'Nurse II', applied: '2026-10-01' },
  { name: 'Abad', position: 'Nurse X', applied: '2026-10-05' },
  { name: 'Cruz', position: '', applied: '' },
  { name: 'Diaz', position: 'Engineer I', applied: '2026-09-20' },
];

type Key = 'name' | 'position' | 'applied';
const ACCESSORS: Record<Key, (r: Row) => string | number> = {
  name: (r) => r.name,
  position: (r) => r.position,
  applied: (r) => toTime(r.applied),
};
const DEFAULT = { key: 'applied', dir: 'desc' } as const;

const names = (list: Row[]) => list.map((r) => r.name);

describe('useTableSort', () => {
  it('defaults to newest first, with missing dates last', () => {
    const { result } = renderHook(() => useTableSort<Row, Key>(rows, ACCESSORS, DEFAULT, ['applied']));
    expect(names(result.current.sorted)).toEqual(['Abad', 'Bautista', 'Diaz', 'Cruz']);
  });

  it('starts a new column ascending and flips on a second click', () => {
    const { result } = renderHook(() => useTableSort<Row, Key>(rows, ACCESSORS, DEFAULT, ['applied']));
    act(() => result.current.toggle('name'));
    expect(names(result.current.sorted)).toEqual(['Abad', 'Bautista', 'Cruz', 'Diaz']);
    act(() => result.current.toggle('name'));
    expect(names(result.current.sorted)).toEqual(['Diaz', 'Cruz', 'Bautista', 'Abad']);
  });

  it('keeps blank values last in both directions and compares numbers naturally', () => {
    const { result } = renderHook(() => useTableSort<Row, Key>(rows, ACCESSORS, DEFAULT, ['applied']));
    act(() => result.current.toggle('position'));
    expect(names(result.current.sorted)).toEqual(['Diaz', 'Bautista', 'Abad', 'Cruz']);
    act(() => result.current.toggle('position'));
    expect(names(result.current.sorted)).toEqual(['Abad', 'Bautista', 'Diaz', 'Cruz']);
  });
});
