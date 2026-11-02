/**
 * History tab for the Office Account console: who submitted, approved,
 * returned or edited which IPCR, and when. One component serves both phases;
 * the caller passes the phase and the reviewer's office.
 *
 * Toolbar, table, pager and badges follow DESIGN_IDENTITY.md §9.4 to §9.6 and §10.
 */
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TableStateRows, getTableView } from '../../../components/data-table';
import { TableRefreshBar, tableBodyClass, useTableLoading } from '../../../components/table-loading';
import {
  AUDIT_ACTIONS,
  type AuditHistoryEntry,
  type AuditPhase,
  listAuditHistory,
} from '../../../lib/api/ipcrAudit';
import type { OfficeScope } from '../../../lib/api/officeScope';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/** The words and badge colour for one audit entry, per the §10 status map. */
export function describeAuditEntry(entry: Pick<AuditHistoryEntry, 'action' | 'actorRole'>): {
  label: string;
  variant: BadgeVariant;
} {
  switch (entry.action) {
    case 'submit': return { label: 'Submitted', variant: 'info' };
    case 'approve': return { label: 'Approved', variant: 'success' };
    case 'return':
    case 'return_phase2': return { label: 'Returned for revision', variant: 'warning' };
    case 'admin_edit': return { label: 'Targets edited', variant: 'neutral' };
    case 'admin_edit_ratings': return { label: 'Ratings edited', variant: 'neutral' };
    case 'rate':
      return entry.actorRole === 'employee'
        ? { label: 'Self-rating submitted', variant: 'info' }
        : { label: 'Ratings approved', variant: 'success' };
    default: return { label: entry.action, variant: 'neutral' };
  }
}

/** Filter-menu words for each action. Rating sheets have two kinds of `rate`. */
const ACTION_FILTER_LABEL: Record<string, string> = {
  submit: 'Submitted',
  approve: 'Approved',
  return: 'Returned for revision',
  admin_edit: 'Targets edited',
  rate: 'Rated',
  return_phase2: 'Returned for revision',
  admin_edit_ratings: 'Ratings edited',
};

/** Page buttons to show: all of them up to 7 pages, else first, last and current ±1 with gaps (§9.6). */
export function pageNumbers(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const shown = new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...shown].sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

const PAGE_SIZES = [5, 10, 25] as const;
const DEFAULT_PAGE_SIZE = 10;
const ALL_ACTIONS = 'all';

const formatWhen = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

const ROLE_LABEL: Record<string, string> = { employee: 'Employee', office_account: 'Reviewer' };

const toolbarControl =
  'h-9 rounded-lg border border-[var(--neutral-200)] bg-white px-3 text-sm font-medium text-[color:var(--color-primary-900)] hover:border-[var(--color-primary-200)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[rgba(54,62,232,.15)]';
const pagerButton =
  'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-3 text-sm font-medium border-[var(--neutral-200)] bg-white text-[color:var(--neutral-800)] hover:border-[var(--color-primary-200)] hover:bg-[var(--color-primary-50)] disabled:cursor-not-allowed disabled:border-[var(--neutral-200)] disabled:bg-[var(--bg-disabled)] disabled:text-[color:var(--neutral-400)] disabled:hover:bg-[var(--bg-disabled)]';

export function IpcrHistory({ phase, scope }: { phase: AuditPhase; scope: OfficeScope | null }) {
  const [entries, setEntries] = useState<AuditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState(ALL_ACTIONS);
  const [perPage, setPerPage] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const officeId = scope?.officeId ?? null;
  const officeName = scope?.officeName ?? null;
  const load = useCallback(async () => {
    setLoading(true);
    const res = await listAuditHistory({
      phase,
      scope: officeId || officeName ? { officeId, officeName } : null,
    });
    setLoading(false);
    if (res.ok === false) { setError(res.error); return; }
    setError(null);
    setEntries(res.data);
  }, [phase, officeId, officeName]);

  useEffect(() => { void load(); }, [load]);

  const { initialLoading, showSkeleton, refreshing } = useTableLoading(loading, entries.length > 0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (action !== ALL_ACTIONS && e.action !== action) return false;
      if (!needle) return true;
      return [e.employeeName, e.actorName, e.department, e.reason].some((v) => (v ?? '').toLowerCase().includes(needle));
    });
  }, [entries, query, action]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * perPage;
  const rows = filtered.slice(start, start + perPage);
  const view = getTableView({ loading: initialLoading, error, rowCount: filtered.length });
  const filtering = query.trim() !== '' || action !== ALL_ACTIONS;

  return (
    <div className="abyan-ds space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-title-s">{phase === 'target' ? 'Target review history' : 'Rating review history'}</h3>
          <p className="text-body-l" style={{ color: 'var(--neutral-600)' }}>
            {phase === 'target'
              ? 'Submissions, approvals, returns and edits for your office’s Phase 1 targets.'
              : 'Self-ratings, ratings, returns and edits for your office’s Phase 2 accomplishments.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <span className="sr-only">Search history</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--neutral-400)]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search employee, reviewer, reason…"
              className={`${toolbarControl} w-[260px] pl-9`}
            />
          </label>
          <label>
            <span className="sr-only">Filter by action</span>
            <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className={toolbarControl}>
              <option value={ALL_ACTIONS}>All actions</option>
              {AUDIT_ACTIONS[phase].map((a) => (
                <option key={a} value={a}>{ACTION_FILTER_LABEL[a] ?? a}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-body-m" style={{ color: 'var(--color-primary-900)' }}>
            Show
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className={toolbarControl}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            entries
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={loading} aria-busy={loading || undefined}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      <div className="abyan-table-wrap">
        <table className="abyan-table" aria-busy={loading}>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Employee</th>
              <th scope="col">Action</th>
              <th scope="col">By</th>
              <th scope="col">Reason</th>
            </tr>
            <TableRefreshBar active={refreshing} colSpan={5} />
          </thead>
          <tbody className={tableBodyClass(refreshing)}>
            <TableStateRows
              view={view}
              columns={['text', 'two-line', 'badge', 'two-line', 'text']}
              showSkeleton={showSkeleton}
              loadingLabel="Loading history…"
              error={error}
              errorAction="load the review history"
              onRetry={() => void load()}
              emptyTitle={filtering ? 'No matching history' : 'No history yet'}
              emptyMessage={
                filtering
                  ? 'Nothing matches your search or filter. Clear them to see every entry.'
                  : 'Entries appear here as employees submit and as your office approves, returns or edits an IPCR.'
              }
            />
            {view === 'rows' && rows.map((e) => {
              const { label, variant } = describeAuditEntry(e);
              return (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{formatWhen(e.createdAt)}</td>
                  <td>
                    <div className="abyan-cell-primary">{e.employeeName}</div>
                    {e.department && <div className="abyan-cell-secondary">{e.department}</div>}
                  </td>
                  <td><span className={`badge badge-${variant}`}><span className="badge-dot" aria-hidden="true" />{label}</span></td>
                  <td>
                    <div className="abyan-cell-primary">{e.actorName}</div>
                    {e.actorRole && <div className="abyan-cell-secondary">{ROLE_LABEL[e.actorRole] ?? e.actorRole}</div>}
                  </td>
                  <td>{e.reason ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-s" style={{ color: 'var(--neutral-600)' }}>
            Showing {start + 1}–{Math.min(start + perPage, filtered.length)} of {filtered.length} entries
          </p>
          <nav aria-label="History pages" className="flex items-center gap-2">
            <button type="button" className={pagerButton} disabled={current <= 1} onClick={() => setPage(current - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
            </button>
            {pageNumbers(current, pageCount).map((n, i) =>
              n === 'gap' ? (
                <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-[color:var(--neutral-600)]">…</span>
              ) : (
                <button
                  key={n}
                  type="button"
                  aria-current={n === current ? 'page' : undefined}
                  aria-label={`Page ${n}`}
                  className={n === current ? `${pagerButton} !border-transparent !bg-[var(--color-primary)] !text-white` : pagerButton}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ),
            )}
            <button type="button" className={pagerButton} disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
              Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
