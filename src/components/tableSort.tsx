// Click-to-sort column headers shared by the RSP applicant tables.
// Same ▲▼ header pattern as OfficeTrainingCourses.

import { useMemo, useState, type ReactNode } from 'react';

export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** A sortable value. Text compares naturally ("Nurse II" < "Nurse X"); empty values always sort last. */
type SortValue = string | number | null | undefined;

const isEmpty = (v: SortValue) =>
  v == null || (typeof v === 'number' && Number.isNaN(v)) || (typeof v === 'string' && v.trim() === '');

const compareValues = (a: SortValue, b: SortValue): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
};

/** Milliseconds for a date string, or NaN (sorted last) when missing or unparseable. */
export const toTime = (iso: string | null | undefined): number =>
  iso ? new Date(iso).getTime() : Number.NaN;

/**
 * Sorts `rows` by the active column. `accessors` maps each column key to the
 * value it sorts on; keep it a module-level constant so the memo holds.
 * A newly clicked column starts ascending, except keys listed in `descFirst`
 * (dates, scores) which start newest/highest first.
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  accessors: Record<K, (row: T) => SortValue>,
  initial: SortState<K>,
  descFirst: readonly K[] = [],
) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sorted = useMemo(() => {
    const get = accessors[sort.key];
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = get(left);
      const b = get(right);
      const aEmpty = isEmpty(a);
      const bEmpty = isEmpty(b);
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
      return sign * compareValues(a, b);
    });
  }, [rows, accessors, sort]);

  const toggle = (key: K) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: descFirst.includes(key) ? 'desc' : 'asc' },
    );

  return { sorted, sort, toggle };
}

interface SortHeaderProps<K extends string> {
  label: ReactNode;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
}

/** The clickable label alone, for a header cell that sorts on more than one value. */
export function SortButton<K extends string>({ label, sortKey, sort, onSort }: Omit<SortHeaderProps<K>, 'className'>) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-800 ${active ? 'text-slate-800' : ''}`}
      title={`Sort by ${typeof label === 'string' ? label.toLowerCase() : 'this column'}`}
    >
      {label}
      <span aria-hidden="true" className={`text-[10px] ${active ? '' : 'text-slate-300'}`}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▲▼'}
      </span>
    </button>
  );
}

export function SortHeader<K extends string>({ label, sortKey, sort, onSort, className }: SortHeaderProps<K>) {
  const active = sort.key === sortKey;
  return (
    <th
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className ?? 'px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500'}
    >
      <SortButton label={label} sortKey={sortKey} sort={sort} onSort={onSort} />
    </th>
  );
}
