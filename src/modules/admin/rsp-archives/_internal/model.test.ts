import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS, badgeVariant, countRows, filterRecords, formatDate, pageList, toCsv, toPositionRows, typeLabel,
  type ArchiveRecord,
} from './model';

let seq = 0;
const rec = (over: Partial<ArchiveRecord>): ArchiveRecord => ({
  key: over.key ?? `k${seq++}`,
  group: 'applicants', type: 'Disqualified', name: 'Ana Reyes', ref: 'REF-2026-0141',
  position: 'Administrative Aide IV', department: 'HRMO', date: '2026-10-24T08:00:00Z',
  ...over,
});

const records: ArchiveRecord[] = [
  rec({ key: 'a', name: 'Ana Reyes', date: '2026-10-24T08:00:00Z' }),
  rec({ key: 'b', name: 'Mark Lim', ref: 'REF-2026-0098', type: 'Not Selected', position: 'Engineer II', department: 'CEO', date: '2026-10-21T08:00:00Z' }),
  rec({ key: 'c', name: 'Liza Tan', ref: 'REF-2026-0102', type: 'Not Selected', position: 'Engineer II', department: 'CEO', date: '2026-10-22T08:00:00Z' }),
  rec({ key: 'd', group: 'employees', type: 'Resigned', name: 'Eduardo Lacson', ref: 'EMP-2015-0310', date: '2026-08-15' }),
];

describe('filterRecords', () => {
  it('keeps only the group and matches name, ref or position, not department', () => {
    expect(filterRecords(records, 'applicants', EMPTY_FILTERS).map((r) => r.key)).toEqual(['a', 'b', 'c']);
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, query: '0098' }).map((r) => r.key)).toEqual(['b']);
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, query: 'engineer' }).map((r) => r.key)).toEqual(['b', 'c']);
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, query: 'hrmo' })).toEqual([]);
  });

  it('matches people listed inside a record', () => {
    const ranking = rec({ group: 'evaluations', type: 'Ranking', name: 'Nurse I', ref: '', people: [{ name: 'Joy Santos' }] });
    expect(filterRecords([ranking], 'evaluations', { ...EMPTY_FILTERS, query: 'santos' })).toHaveLength(1);
  });

  it('filters by type, department and an inclusive date range', () => {
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, type: 'Not Selected' }).map((r) => r.key)).toEqual(['b', 'c']);
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, department: 'HRMO' }).map((r) => r.key)).toEqual(['a']);
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, from: '2026-10-21', to: '2026-10-21' }).map((r) => r.key)).toEqual(['b']);
  });
});

describe('toPositionRows', () => {
  const apps = filterRecords(records, 'applicants', EMPTY_FILTERS);

  it('makes one row per department + position, Department A–Z by default', () => {
    const rows = toPositionRows(apps);
    expect(rows.map((r) => [r.department, r.position, r.count])).toEqual([['CEO', 'Engineer II', 2], ['HRMO', 'Administrative Aide IV', 1]]);
    expect(rows[0].statuses).toEqual([['Not Selected', 2]]);
    expect(rows[0].date).toBe('2026-10-22T08:00:00Z');
    expect(rows[0].records.map((r) => r.key)).toEqual(['c', 'b']);
  });

  it('sorts by latest date when asked', () => {
    expect(toPositionRows(apps, 'new').map((r) => r.department)).toEqual(['HRMO', 'CEO']);
    expect(toPositionRows(apps, 'old').map((r) => r.department)).toEqual(['CEO', 'HRMO']);
  });

  it('counts ranked people for evaluation rows', () => {
    const ranking = rec({ group: 'evaluations', type: 'Ranking', people: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    expect(toPositionRows([ranking])[0].count).toBe(3);
  });

  it('counts position rows per tab under the search', () => {
    expect(countRows(records, 'applicants', '')).toBe(2);
    expect(countRows(records, 'applicants', 'lim')).toBe(1);
    expect(countRows(records, 'employees', 'reyes')).toBe(0);
  });
});

describe('labels and badges', () => {
  it('maps §10 variants and keeps categories as tint', () => {
    expect(badgeVariant('Disqualified')).toBe('error');
    // §10: the shared application map. Not Selected is a rejection.
    expect(badgeVariant('Not Selected')).toBe('error');
    expect(badgeVariant('Withdrawn - Hired Elsewhere')).toBe('neutral');
    expect(badgeVariant('For Contract Signing')).toBe('success');
    expect(badgeVariant('Resigned')).toBe('neutral');
    expect(badgeVariant('Promoted')).toBe('tint');
    expect(badgeVariant('Qualified')).toBe('success');
    expect(badgeVariant('Submitted')).toBe('info');
    expect(badgeVariant('For Evaluation')).toBe('warning');
  });

  it('shows the en dash for the hyphenated DB value', () => {
    expect(typeLabel('Withdrawn - Hired Elsewhere')).toBe('Withdrawn – Hired Elsewhere');
  });

  it('formats dates as MMM DD, YYYY and tolerates blanks', () => {
    expect(formatDate('2026-10-24T08:00:00Z')).toBe('Oct 24, 2026');
    expect(formatDate('')).toBe('—');
  });
});

describe('pageList', () => {
  it('lists every page up to 7, then first, last and current ±1', () => {
    expect(pageList(0, 3)).toEqual([0, 1, 2]);
    expect(pageList(5, 12)).toEqual([0, null, 4, 5, 6, null, 11]);
    expect(pageList(0, 12)).toEqual([0, 1, null, 11]);
  });
});

describe('toCsv', () => {
  it('puts department and position first and quotes cells with commas and quotes', () => {
    const csv = toCsv([rec({ name: 'Reyes, Ana', reason: 'Said "no"' })]);
    expect(csv.split('\n')[0]).toBe('Department,Position,Name,Reference,Status,Reason,Date');
    expect(csv.split('\n')[1]).toBe('HRMO,Administrative Aide IV,"Reyes, Ana",REF-2026-0141,Disqualified,"Said ""no""","Oct 24, 2026"');
  });
});
