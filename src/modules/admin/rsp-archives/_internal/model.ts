/**
 * Pure archive model: record shape, groups, filtering, position rows and CSV.
 * No React and no Supabase, so Vitest covers it directly.
 */

import { APPLICANT_STATUSES, applicationStatusVariant } from '../../../../lib/api/applicantStatus';

export type ArchiveGroup = 'employees' | 'applicants' | 'jobs' | 'evaluations';

export type ArchiveAction =
  | { kind: 'restore'; previousReason: string }
  | { kind: 'purge'; applicants: number; documents: number }
  | { kind: 'assessment'; position: string };

export interface ArchiveFact {
  label: string;
  value: string;
}

/** Someone listed inside a record: a ranked applicant, a preserved applicant. */
export interface ArchivePerson {
  name: string;
  status?: string;
  score?: string;
  detail?: string;
}

export interface ArchiveRecord {
  /** Unique across groups, e.g. "app:42". */
  key: string;
  group: ArchiveGroup;
  /** Status shown as a §10 badge, or a category tag. */
  type: string;
  name: string;
  /** Employee ID, REF number or plantilla. */
  ref: string;
  position: string;
  department: string;
  /** ISO date the record ended or was archived. */
  date: string;
  reason?: string;
  facts?: ArchiveFact[];
  /** Ranked applicants (evaluations) or preserved applicants (deleted posts). */
  people?: ArchivePerson[];
  action?: ArchiveAction;
}

export interface GroupDef {
  id: ArchiveGroup;
  label: string;
  /** Header of the count column. */
  countLabel: string;
  /** Singular and plural noun for the modal subtitle ("1 applicant", "3 applicants"). */
  noun: [string, string];
  /** Type options; `section` groups them in the Type select. Fewer than two hides the select. */
  types: { value: string; section?: string }[];
}

export const GROUPS: GroupDef[] = [
  {
    id: 'employees', label: 'Employees', countLabel: 'People', noun: ['person', 'people'],
    types: [
      { value: 'Resigned', section: 'Former employees' },
      { value: 'Terminated', section: 'Former employees' },
      { value: 'Separated', section: 'Former employees' },
      { value: 'Promoted', section: 'Previous positions' },
      { value: 'Transferred', section: 'Previous positions' },
    ],
  },
  {
    id: 'applicants', label: 'Applicants', countLabel: 'Applicants', noun: ['applicant', 'applicants'],
    types: [{ value: 'Disqualified' }, { value: 'Not Selected' }, { value: 'Withdrawn - Hired Elsewhere' }],
  },
  { id: 'jobs', label: 'Job posts', countLabel: 'Posts', noun: ['post', 'posts'], types: [{ value: 'Deleted' }] },
  // One record per position: its ranking and its assessment forms together.
  { id: 'evaluations', label: 'Evaluation records', countLabel: 'Applicants', noun: ['applicant', 'applicants'], types: [{ value: 'Ranking' }] },
];

/** Category tags (§10: non-status, brand tint) rather than status badges. */
export const CATEGORY_TYPES = new Set(['Promoted', 'Transferred', 'Ranking', 'Assessment forms']);

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'tint';


/** §10 badge variant for a status type. */
export const badgeVariant = (type: string): BadgeVariant => {
  if (CATEGORY_TYPES.has(type)) return 'tint';
  // Application statuses use the shared §10 map; everything else (employee
  // endings, deleted posts) is neutral.
  return (APPLICANT_STATUSES as readonly string[]).includes(type) ? applicationStatusVariant(type) : 'neutral';
};

/** Display form: en dash for the hyphenated DB value. */
export const typeLabel = (type: string): string => type.replace(' - ', ' – ');

export type ArchiveSort = 'dept' | 'new' | 'old';

export interface ArchiveFilters {
  query: string;
  type: string;
  department: string;
  from: string;
  to: string;
  sort: ArchiveSort;
}

export const EMPTY_FILTERS: ArchiveFilters = { query: '', type: '', department: '', from: '', to: '', sort: 'dept' };

/**
 * The search box promises "Name, employee ID or REF number", so it matches
 * those plus the position, and the people listed inside a record. Department
 * is left to the Filters popover: matching it here made "engineer" return
 * every record in the City Engineer's office.
 */
export const matchesQuery = (r: ArchiveRecord, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [r.name, r.ref, r.position, ...(r.people ?? []).map((p) => p.name)].some((v) => v.toLowerCase().includes(q));
};

/** yyyy-mm-dd of an ISO value, for comparing with <input type="date">. */
export const dayOf = (iso: string): string => (iso || '').slice(0, 10);

export const filterRecords = (records: ArchiveRecord[], group: ArchiveGroup, f: ArchiveFilters): ArchiveRecord[] =>
  records.filter((r) =>
    r.group === group
    && matchesQuery(r, f.query)
    && (!f.type || r.type === f.type)
    && (!f.department || r.department === f.department)
    && (!f.from || dayOf(r.date) >= f.from)
    && (!f.to || dayOf(r.date) <= f.to));

/** One table row: every archived record under a department + position. */
export interface PositionRow {
  key: string;
  department: string;
  position: string;
  records: ArchiveRecord[];
  /** People or posts: ranked applicants for evaluations, records otherwise. */
  count: number;
  /** [type, how many] in first-seen order. */
  statuses: [string, number][];
  /** Latest record date (ISO). */
  date: string;
}

export const toPositionRows = (records: ArchiveRecord[], sort: ArchiveSort = 'dept'): PositionRow[] => {
  const byKey = new Map<string, ArchiveRecord[]>();
  records.forEach((r) => {
    const key = `${r.department}\u0000${r.position}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  });
  const rows = [...byKey.entries()].map(([key, list]): PositionRow => {
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
    const statuses = new Map<string, number>();
    sorted.forEach((r) => statuses.set(r.type, (statuses.get(r.type) ?? 0) + 1));
    return {
      key,
      department: sorted[0].department,
      position: sorted[0].position,
      records: sorted,
      count: sorted[0].group === 'evaluations' ? sorted.reduce((n, r) => n + (r.people?.length ?? 0), 0) : sorted.length,
      statuses: [...statuses.entries()],
      date: sorted[0].date,
    };
  });
  return rows.sort((a, b) =>
    sort === 'new' ? b.date.localeCompare(a.date)
      : sort === 'old' ? a.date.localeCompare(b.date)
        : a.department.localeCompare(b.department) || a.position.localeCompare(b.position));
};

/** Position rows in a group under the search (tab counts). */
export const countRows = (records: ArchiveRecord[], group: ArchiveGroup, query: string): number =>
  toPositionRows(records.filter((r) => r.group === group && matchesQuery(r, query))).length;

/** Records of one type in a group under the search (Type select counts). */
export const countFor = (records: ArchiveRecord[], group: ArchiveGroup, query: string, type?: string): number =>
  records.filter((r) => r.group === group && matchesQuery(r, query) && (!type || r.type === type)).length;

/** §9.5 date format: MMM DD, YYYY. */
export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

/** §9.6 page buttons (0-based); null is an ellipsis. First, last and current ±1 past 7 pages. */
export const pageList = (current: number, pages: number): (number | null)[] => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const keep = [...new Set([0, current - 1, current, current + 1, pages - 1])].filter((p) => p >= 0 && p < pages).sort((a, b) => a - b);
  return keep.flatMap((p, i) => (i > 0 && p - keep[i - 1] > 1 ? [null, p] : [p]));
};

const csvCell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** One line per archived record, department and position first. */
export const toCsv = (rows: ArchiveRecord[]): string => {
  const head = ['Department', 'Position', 'Name', 'Reference', 'Status', 'Reason', 'Date'];
  const body = rows.map((r) => [r.department, r.position, r.name, r.ref, typeLabel(r.type), r.reason ?? '', formatDate(r.date)]);
  return [head, ...body].map((line) => line.map(csvCell).join(',')).join('\n');
};
