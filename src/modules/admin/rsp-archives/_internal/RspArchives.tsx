import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Printer, Search, SlidersHorizontal, X } from 'lucide-react';
import { useBackClosesView } from '../../../../hooks/useHistoryBack';
import { getAdminEmail } from '../../../../lib/adminSession';
import {
  fetchClosedApplications, fetchFormerEmployees, fetchPreviousPositions, restoreApplication,
} from '../../../../lib/api/rspArchives';
import type { ApplicantWorkflowStatus } from '../../../../lib/api/applicantStatus';
import {
  EMPTY_FILTERS, GROUPS, countFor, countRows, filterRecords, formatDate, pageList, toCsv, toPositionRows,
  type ArchiveFilters, type ArchiveGroup, type ArchiveRecord, type ArchiveSort,
} from './model';
import { StatusBadge } from './StatusBadge';
import { ArchiveListModal } from './ArchiveListModal';
import { PurgeDialog, RestoreDialog } from './ArchiveDialogs';

const PAGE_SIZES = [10, 25, 50];
const TOAST_MS = 5000;

export interface RspArchivesProps {
  /** Records the dashboard already holds: deleted job posts and evaluation records. */
  records: ArchiveRecord[];
  /** Permanently remove a deleted job post's preserved data. */
  onPurge: (key: string) => void;
  /** Open the existing per-position assessment forms modal. */
  onOpenAssessment: (position: string) => void;
}

/** Employees and applicants come from the archive service; jobs and evaluations from the dashboard. */
const useFetchedRecords = () => {
  const [rows, setRows] = useState<ArchiveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [former, moves, closed] = await Promise.all([
      fetchFormerEmployees(), fetchPreviousPositions(), fetchClosedApplications(),
    ]);
    setRows([
      ...former.map((e): ArchiveRecord => ({
        key: `emp:${e.id}`, group: 'employees', type: e.status, name: e.fullName, ref: e.employeeId,
        position: e.position, department: e.department, date: e.date,
        reason: e.hireDate ? `Hired ${formatDate(e.hireDate)}` : undefined,
      })),
      ...moves.map((m): ArchiveRecord => ({
        key: `move:${m.id}`, group: 'employees', type: m.action, name: m.fullName, ref: m.employeeId,
        position: m.fromPosition, department: m.fromDepartment, date: m.date, reason: m.reason,
        facts: [{ label: 'Moved to', value: m.toValue || '—' }],
      })),
      ...closed.map((a): ArchiveRecord => ({
        key: `app:${a.id}`, group: 'applicants', type: a.status, name: a.fullName, ref: a.referenceNo,
        position: a.position, department: a.department, date: a.date, reason: a.reason,
        action: a.status === 'Disqualified' ? { kind: 'restore', previousReason: a.reason } : undefined,
      })),
    ]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { rows, loading, setRows };
};

const SORTS: { value: ArchiveSort; label: string }[] = [
  { value: 'dept', label: 'Department A–Z' },
  { value: 'new', label: 'Newest first' },
  { value: 'old', label: 'Oldest first' },
];

export const RspArchives = ({ records, onPurge, onOpenAssessment }: RspArchivesProps) => {
  const fetched = useFetchedRecords();
  const all = useMemo(() => [...fetched.rows, ...records], [fetched.rows, records]);

  const [group, setGroup] = useState<ArchiveGroup>('employees');
  const [filters, setFilters] = useState<ArchiveFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);
  const [popover, setPopover] = useState<'' | 'filters' | 'export'>('');
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'restore' | 'purge'; record: ArchiveRecord } | null>(null);
  const [toast, setToast] = useState('');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastRow = useRef<HTMLElement | null>(null);

  const def = GROUPS.find((g) => g.id === group)!;
  const matched = useMemo(() => filterRecords(all, group, filters), [all, group, filters]);
  const rows = useMemo(() => toPositionRows(matched, filters.sort), [matched, filters.sort]);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages - 1);
  const slice = rows.slice(current * perPage, (current + 1) * perPage);
  const openRow = rows.find((r) => r.key === openRowKey) ?? null;
  const departments = useMemo(
    () => [...new Set(all.filter((r) => r.group === group).map((r) => r.department))].filter((d) => d && d !== '—').sort(),
    [all, group],
  );
  const activeFilterCount = [filters.department, filters.from, filters.to].filter(Boolean).length;
  const loadingGroup = fetched.loading && (group === 'employees' || group === 'applicants');

  const closeModal = useCallback(() => { setOpenRowKey(null); setDialog(null); lastRow.current?.focus(); }, []);
  useBackClosesView(openRowKey !== null, closeModal, 'archive-position');

  // A row whose last record was restored or purged disappears; close its modal.
  useEffect(() => { if (openRowKey && !openRow) setOpenRowKey(null); }, [openRowKey, openRow]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(''), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!popover) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopover(''); };
    const onClick = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-archive-pop]')) setPopover(''); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [popover]);

  const update = (patch: Partial<ArchiveFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(0); };
  const selectGroup = (id: ArchiveGroup, focus = false) => {
    setGroup(id); setFilters((f) => ({ ...EMPTY_FILTERS, query: f.query, sort: f.sort })); setPage(0); setPopover('');
    if (focus) tabRefs.current[id]?.focus();
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    const ids = GROUPS.map((g) => g.id);
    const i = ids.indexOf(group);
    const next = { ArrowRight: (i + 1) % ids.length, ArrowLeft: (i - 1 + ids.length) % ids.length, Home: 0, End: ids.length - 1 }[e.key];
    if (next !== undefined) { e.preventDefault(); selectGroup(ids[next], true); }
  };
  const open = (key: string, el: HTMLElement) => { lastRow.current = el; setOpenRowKey(key); };

  const exportCsv = () => {
    const blob = new Blob([toCsv(matched)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `archives-${group}-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
    setPopover('');
    setToast(`Exported ${matched.length} ${matched.length === 1 ? 'record' : 'records'}`);
  };

  const doRestore = async (status: ApplicantWorkflowStatus, reason: string) => {
    const record = dialog?.record;
    if (!record || record.action?.kind !== 'restore') return false;
    const res = await restoreApplication({
      id: record.key.replace(/^app:/, ''), status, reason,
      previousReason: record.action.previousReason, restoredBy: getAdminEmail('RSP'),
    });
    if (!res.ok) return false;
    fetched.setRows((prev) => prev.filter((r) => r.key !== record.key));
    setToast(`${record.name} restored to ${status}. They're back in Applications.`);
    setDialog(null);
    return true;
  };

  const doPurge = () => {
    const record = dialog?.record;
    if (!record) return;
    onPurge(record.key);
    setToast(`${record.name} permanently deleted`);
    setDialog(null);
  };

  const clearAll = () => { setFilters((f) => ({ ...EMPTY_FILTERS, sort: f.sort })); setPage(0); };

  return (
    <section className="rounded-xl border border-[var(--neutral-200)] bg-white px-5 pb-5">
      {/* Tabs + archive-wide search */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-[var(--neutral-200)]">
        <div role="tablist" aria-label="Archive groups" className="scrollbar-hidden -mb-px flex gap-7 overflow-x-auto" onKeyDown={onTabKey}>
          {GROUPS.map((g) => {
            const selected = g.id === group;
            return (
              <button
                key={g.id}
                ref={(el) => { tabRefs.current[g.id] = el; }}
                type="button"
                role="tab"
                id={`archive-tab-${g.id}`}
                aria-selected={selected}
                aria-controls="archive-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => selectGroup(g.id)}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-4 text-sm transition-colors ${selected ? 'border-[var(--color-primary)] font-semibold text-[var(--color-primary)]' : 'border-transparent font-medium text-[var(--neutral-600)] hover:text-[var(--color-primary-900)]'}`}
              >
                {g.label}
                <span className={`text-[13px] tabular-nums ${selected ? 'text-[var(--color-primary)]' : 'text-[var(--neutral-500)]'}`}>
                  {fetched.loading && (g.id === 'employees' || g.id === 'applicants') ? '…' : countRows(all, g.id, filters.query)}
                </span>
              </button>
            );
          })}
        </div>
        <label className="relative mb-3 w-full sm:w-[340px]">
          <span className="sr-only">Search all archives</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--neutral-400)]" strokeWidth={1.75} aria-hidden="true" />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Name, employee ID or REF number"
            className="h-10 w-full rounded-lg border border-[var(--neutral-200)] bg-white pl-10 pr-3 text-sm font-medium text-[var(--neutral-800)] placeholder:text-[var(--neutral-600)] hover:border-[var(--color-primary-200)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[rgba(54,62,232,.15)]"
          />
        </label>
      </div>

      <div role="tabpanel" id="archive-panel" aria-labelledby={`archive-tab-${group}`}>
        {/* One-line toolbar (§9.4) */}
        <div className="flex flex-wrap items-center gap-3 pb-3 pt-4">
          {def.types.length > 1 && (
            <select
              aria-label="Type"
              value={filters.type}
              onChange={(e) => update({ type: e.target.value })}
              className="h-9 max-w-[240px] rounded-lg border border-[var(--neutral-200)] bg-white px-2.5 text-sm font-medium text-[var(--color-primary-900)] hover:border-[var(--color-primary-200)]"
            >
              <option value="">All types · {countFor(all, group, filters.query)}</option>
              {[...new Set(def.types.map((t) => t.section ?? ''))].map((section) => {
                const opts = def.types.filter((t) => (t.section ?? '') === section).map((t) => (
                  <option key={t.value} value={t.value}>{t.value.replace(' - ', ' – ')} · {countFor(all, group, filters.query, t.value)}</option>
                ));
                return section ? <optgroup key={section} label={section}>{opts}</optgroup> : opts;
              })}
            </select>
          )}

          <div className="relative" data-archive-pop>
            <button type="button" className="btn btn-secondary btn-md" aria-expanded={popover === 'filters'} onClick={() => setPopover(popover === 'filters' ? '' : 'filters')}>
              <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Filters
              {activeFilterCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] font-semibold text-white">{activeFilterCount}</span>}
            </button>
            {popover === 'filters' && (
              <div role="dialog" aria-label="Filters" className="absolute left-0 top-[calc(100%+6px)] z-20 grid w-[300px] gap-3 rounded-lg border border-[var(--neutral-200)] bg-white p-4 shadow-[shadow:var(--shadow-2)]">
                <label className="grid gap-1.5 text-[13px] font-medium text-[var(--neutral-800)]">
                  Department
                  <select value={filters.department} onChange={(e) => update({ department: e.target.value })} className="h-9 w-full rounded-lg border border-[var(--neutral-200)] px-2.5 text-sm font-medium text-[var(--neutral-800)]">
                    <option value="">All departments</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1.5 text-[13px] font-medium text-[var(--neutral-800)]">
                    From
                    <input type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} className="h-9 w-full rounded-lg border border-[var(--neutral-200)] px-2 text-sm text-[var(--neutral-800)]" />
                  </label>
                  <label className="grid gap-1.5 text-[13px] font-medium text-[var(--neutral-800)]">
                    To
                    <input type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} className="h-9 w-full rounded-lg border border-[var(--neutral-200)] px-2 text-sm text-[var(--neutral-800)]" />
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ department: '', from: '', to: '' })}>Clear</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setPopover('')}>Done</button>
                </div>
              </div>
            )}
          </div>

          <span className="hidden flex-1 sm:block" />

          <select
            aria-label="Sort"
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as ArchiveSort })}
            className="h-9 rounded-lg border border-[var(--neutral-200)] bg-white px-2.5 text-sm font-medium text-[var(--color-primary-900)] hover:border-[var(--color-primary-200)]"
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <div className="relative" data-archive-pop>
            <button type="button" className="btn btn-secondary btn-md" aria-haspopup="menu" aria-expanded={popover === 'export'} onClick={() => setPopover(popover === 'export' ? '' : 'export')}>
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Export
            </button>
            {popover === 'export' && (
              <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-20 w-[200px] rounded-lg border border-[var(--neutral-200)] bg-white p-1.5 shadow-[shadow:var(--shadow-2)]">
                <button type="button" role="menuitem" onClick={exportCsv} className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-[var(--neutral-800)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary)]">
                  <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Download CSV
                </button>
                <button type="button" role="menuitem" onClick={() => { setPopover(''); window.print(); }} className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-[var(--neutral-800)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary)]">
                  <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Print
                </button>
              </div>
            )}
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="-mt-1 mb-3 flex flex-wrap gap-2">
            {filters.department && (
              <button type="button" onClick={() => update({ department: '' })} aria-label={`Remove filter ${filters.department}`} className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--color-primary-50)] pl-3 pr-1.5 text-xs font-medium text-[var(--color-primary-700)] hover:bg-[var(--color-primary-200)]">
                {filters.department}<X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
            {(filters.from || filters.to) && (
              <button type="button" onClick={() => update({ from: '', to: '' })} aria-label="Remove date filter" className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--color-primary-50)] pl-3 pr-1.5 text-xs font-medium text-[var(--color-primary-700)] hover:bg-[var(--color-primary-200)]">
                {filters.from ? formatDate(filters.from) : 'Any date'} – {filters.to ? formatDate(filters.to) : 'today'}<X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* Flat table (§9.5): one row per department + position */}
        <div className="abyan-table-wrap relative">
          <table className="abyan-table w-full min-w-[720px]">
            <caption className="sr-only">{def.label}, one row per department and position</caption>
            <thead>
              <tr className="bg-[var(--bg-page)]">
                {['Department', 'Position', def.countLabel, 'Status', 'Date'].map((h) => (
                  <th key={h} scope="col" className={`whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-[var(--color-primary-900)] ${h === def.countLabel ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
                <th scope="col" className="w-10 px-4 py-2.5"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {loadingGroup ? (
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={i} className="border-t border-[var(--neutral-200)]">
                    {Array.from({ length: 5 }, (__, j) => (
                      <td key={j} className="px-4 py-3"><span className="block h-4 w-3/4 animate-pulse rounded bg-[var(--neutral-100)]" /></td>
                    ))}
                    <td />
                  </tr>
                ))
              ) : slice.length === 0 ? (
                <tr className="border-t border-[var(--neutral-200)]">
                  <td colSpan={6} className="px-4 py-10 text-center">
                    {filters.query || filters.type || activeFilterCount ? (
                      <>
                        <p className="!mb-1 text-base font-semibold text-[var(--color-primary-900)]">No records match</p>
                        <p className="!mb-3 text-sm text-[var(--neutral-600)]">Try another type, widen the dates, or clear the search.</p>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={clearAll}>Clear all</button>
                      </>
                    ) : (
                      <>
                        <p className="!mb-1 text-base font-semibold text-[var(--color-primary-900)]">Nothing archived here yet</p>
                        <p className="!mb-0 text-sm text-[var(--neutral-600)]">Records appear here once they end.</p>
                      </>
                    )}
                  </td>
                </tr>
              ) : slice.map((row) => (
                <tr
                  key={row.key}
                  tabIndex={0}
                  aria-haspopup="dialog"
                  aria-label={`Open ${row.position}, ${row.department}`}
                  onClick={(e) => open(row.key, e.currentTarget)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(row.key, e.currentTarget); } }}
                  className="cursor-pointer border-t border-[var(--neutral-200)] hover:bg-[var(--bg-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                >
                  <td className="px-4 py-3 text-sm font-medium text-[var(--neutral-800)]">{row.department}</td>
                  <td className="px-4 py-3 text-sm font-medium text-[var(--color-primary-900)]">{row.position}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[var(--color-primary-900)]">{row.count}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {group === 'evaluations' ? (
                        <><StatusBadge type="Ranking" /><StatusBadge type="Assessment forms" /></>
                      ) : row.statuses.map(([type, n]) => (
                        <span key={type} className="inline-flex items-center gap-1">
                          <StatusBadge type={type} />
                          {row.statuses.length > 1 || n > 1 ? <span className="text-xs font-medium tabular-nums text-[var(--neutral-600)]">×{n}</span> : null}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-[var(--neutral-800)]">{formatDate(row.date)}</td>
                  <td className="px-4 py-3 text-[var(--neutral-400)]"><ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination (§9.6) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[var(--neutral-600)]">
              Showing {rows.length ? current * perPage + 1 : 0}–{current * perPage + slice.length} of {rows.length} entries
            </span>
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--neutral-600)]">
              Show
              <select aria-label="Entries per page" value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }} className="h-9 rounded-lg border border-[var(--neutral-200)] bg-white px-2 text-sm font-medium text-[var(--color-primary-900)]">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <nav aria-label="Pagination" className="flex gap-2">
            <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--neutral-200)] bg-white px-3 text-sm font-medium text-[var(--neutral-800)] hover:border-[var(--color-primary-200)] hover:bg-[var(--color-primary-50)] disabled:cursor-not-allowed disabled:bg-[var(--bg-disabled)] disabled:text-[var(--neutral-400)]">
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Previous
            </button>
            {pageList(current, pages).map((p, i) => (p === null ? (
              <span key={`gap-${i}`} className="grid h-9 w-6 place-items-center text-sm text-[var(--neutral-600)]" aria-hidden="true">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === current ? 'page' : undefined}
                className={`grid h-9 min-w-9 place-items-center rounded-lg px-3 text-sm font-medium ${p === current ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--neutral-200)] bg-white text-[var(--neutral-800)] hover:border-[var(--color-primary-200)] hover:bg-[var(--color-primary-50)]'}`}
              >
                {p + 1}
              </button>
            )))}
            <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--neutral-200)] bg-white px-3 text-sm font-medium text-[var(--neutral-800)] hover:border-[var(--color-primary-200)] hover:bg-[var(--color-primary-50)] disabled:cursor-not-allowed disabled:bg-[var(--bg-disabled)] disabled:text-[var(--neutral-400)]">
              Next<ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>

      {openRow && (
        <ArchiveListModal
          row={openRow}
          group={def}
          onClose={closeModal}
          onRestore={(record) => setDialog({ kind: 'restore', record })}
          onPurge={(record) => setDialog({ kind: 'purge', record })}
          onOpenAssessment={onOpenAssessment}
        />
      )}
      {dialog?.kind === 'restore' && <RestoreDialog record={dialog.record} onCancel={() => setDialog(null)} onConfirm={doRestore} />}
      {dialog?.kind === 'purge' && <PurgeDialog record={dialog.record} onCancel={() => setDialog(null)} onConfirm={doPurge} />}

      <div aria-live="polite" className="pointer-events-none fixed right-6 top-20 z-[1100]">
        {toast && (
          <div role="status" className="pointer-events-auto w-[min(360px,calc(100vw-32px))] rounded-xl border-l-4 border-[var(--success-500)] bg-white p-4 text-sm font-medium text-[var(--neutral-800)] shadow-[shadow:var(--shadow-3)]">
            {toast}
          </div>
        )}
      </div>
    </section>
  );
};
