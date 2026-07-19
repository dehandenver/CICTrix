/**
 * LND — Training Requests & Needs.
 *
 * Laid out to match RSP › Applicants: a white page header, a sticky sub-tab bar,
 * a filter card, and a bordered table.
 *
 * Tab 1: manual training requests submitted by office accounts, one row each;
 * the admin approves or dismisses from the row.
 * Tab 2: an AI-inferred training-needs assessment ranked by competency, each row
 * expanding to the offices driving that need (affected / total headcount).
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, Sparkles } from 'lucide-react';
import {
  computeNeedsAssessment,
  decideRequest,
  listOfficeRequests,
  type CompetencyNeed,
  type NeedPriority,
  type OfficeRequest,
  type RequestStatus,
} from '../../lib/api/trainingNeeds';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const PRIORITY_BADGE: Record<NeedPriority, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Emerging: 'bg-blue-100 text-blue-700',
};
const PRIORITY_LABEL: Record<NeedPriority, string> = {
  High: 'High priority',
  Medium: 'Medium priority',
  Emerging: 'Emerging need',
};

const STATUS_PILL: Record<RequestStatus, string> = {
  Pending: 'bg-slate-100 text-slate-600',
  Approved: 'bg-emerald-100 text-emerald-700',
  Dismissed: 'bg-rose-50 text-rose-600 border border-rose-200',
};

const TABS = [
  { id: 'requests', label: 'Training Requests' },
  { id: 'needs', label: 'Needs Assessment' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const STATUS_OPTIONS: ('All' | RequestStatus)[] = ['All', 'Pending', 'Approved', 'Dismissed'];

const ITEMS_PER_PAGE = 10;

export const LndTrainingNeeds = () => {
  const [requests, setRequests] = useState<OfficeRequest[]>([]);
  const [needs, setNeeds] = useState<CompetencyNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('requests');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | RequestStatus>('Pending');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [openComps, setOpenComps] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [reqs, na] = await Promise.all([listOfficeRequests(), computeNeedsAssessment()]);
    setRequests(reqs);
    setNeeds(na);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice((c) => (c === m ? null : c)), 3500); };

  // ── Requests filtering ──────────────────────────────────────────────────
  const offices = useMemo(
    () => [...new Set(requests.map((r) => r.office).filter(Boolean))].sort(),
    [requests],
  );

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests
      .filter((r) => {
        if (statusFilter !== 'All' && r.status !== statusFilter) return false;
        if (officeFilter !== 'all' && r.office !== officeFilter) return false;
        if (term
          && !r.title.toLowerCase().includes(term)
          && !r.office.toLowerCase().includes(term)
          && !(r.requestedBy ?? '').toLowerCase().includes(term)
          && !(r.competency ?? '').toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''));
  }, [requests, search, statusFilter, officeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedRequests = filteredRequests.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const toggleComp = (c: string) =>
    setOpenComps((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const decide = async (r: OfficeRequest, decision: 'Approved' | 'Dismissed') => {
    setBusy(r.id);
    const res = await decideRequest(r.id, decision);
    setBusy(null);
    if (!res.ok) { flash(`Could not ${decision === 'Approved' ? 'approve' : 'dismiss'}: ${res.error}`); return; }
    setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: decision } : x)));
    flash(`${decision} “${r.title}”.`);
  };

  return (
    <div className="bg-slate-50">
      {/* Page header — matches RSP › Applicants */}
      <div className="border-b border-slate-200 bg-white px-8 py-6">
        <h1 className="!mb-1 !text-2xl font-bold">Training Requests &amp; Needs</h1>
        <p className="!mb-0 text-base text-slate-500">
          Act on office-submitted requests, and see the competencies the LGU most needs to invest in
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm">
        <nav className="flex overflow-x-auto px-6" aria-label="Training needs tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative -mb-px whitespace-nowrap border-b-2 px-6 py-4 text-base font-bold transition-colors ${
                tab === t.id
                  ? 'border-[#363EE8] text-[#363EE8]'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {tab === 'requests' ? (
          <>
            {/* Filters */}
            <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search training, office, requester…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-[#363EE8] focus:outline-none"
                  />
                </div>
                <select
                  value={officeFilter}
                  onChange={(e) => { setOfficeFilter(e.target.value); setPage(1); }}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none"
                >
                  <option value="all">All Offices</option>
                  {offices.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value as 'All' | RequestStatus); setPage(1); }}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
                  ))}
                </select>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                <span>{filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''} found</span>
                <button
                  type="button"
                  className="text-[#363EE8] hover:underline"
                  onClick={() => { setSearch(''); setOfficeFilter('all'); setStatusFilter('All'); setPage(1); }}
                >
                  Clear filters
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Training Requested</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Office</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Competency</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Requested</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-500">Loading requests…</td>
                    </tr>
                  )}

                  {!loading && pagedRequests.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{r.requestedBy || '—'}</p>
                        {r.justification && (
                          <p className="mt-1 max-w-xl text-xs italic text-slate-500">“{r.justification}”</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{r.office || '—'}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">{r.competency || '—'}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[r.status]}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{fmtDate(r.requestedAt)}</td>
                      <td className="px-5 py-4 text-right">
                        {r.status === 'Pending' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void decide(r, 'Approved')}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              <Check className="h-3.5 w-3.5" /> Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void decide(r, 'Dismissed')}
                              className="inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:border-rose-300 hover:text-rose-600 disabled:opacity-60"
                            >
                              Dismiss
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {!loading && pagedRequests.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                        <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                        <p className="font-medium">
                          {requests.length === 0
                            ? 'No training requests yet.'
                            : 'No requests found for the selected filters.'}
                        </p>
                        {requests.length === 0 && (
                          <p className="mt-1 text-xs text-slate-400">
                            Requests submitted by office accounts will appear here.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-3 flex items-center justify-between px-1 text-sm text-slate-600">
              <p>
                {filteredRequests.length === 0 ? 'No results'
                  : `Showing ${(safePage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(safePage * ITEMS_PER_PAGE, filteredRequests.length)} of ${filteredRequests.length}`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-medium">Page {safePage} of {totalPages}</span>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Sparkles className="h-5 w-5 shrink-0 text-[#363EE8]" />
              <p className="text-sm text-slate-500">
                Generated from summary of ratings and the competency framework, sorted by demand.
                Click a row to see the offices driving that need.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Competency</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Priority</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Offices</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Demand</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center text-slate-500">Loading needs assessment…</td>
                    </tr>
                  )}

                  {!loading && needs.map((n) => {
                    const open = openComps.has(n.competency);
                    return (
                      <Fragment key={n.competency}>
                        <tr
                          onClick={() => toggleComp(n.competency)}
                          className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                        >
                          <td className="px-5 py-4">
                            <span className="flex items-center gap-2">
                              {open
                                ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                                : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                              <span className="text-sm font-semibold text-slate-900">{n.competency}</span>
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_BADGE[n.priority]}`}>
                              {PRIORITY_LABEL[n.priority]}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-700">{n.offices.length}</td>
                          <td className="px-5 py-4">
                            <div className="flex w-40 items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-[#363EE8]" style={{ width: `${n.demand}%` }} />
                              </div>
                              <span className="w-9 text-right text-sm font-semibold text-slate-700">{n.demand}%</span>
                            </div>
                          </td>
                        </tr>

                        {open && (
                          <tr className="border-b border-slate-100 last:border-0">
                            <td colSpan={4} className="bg-slate-50/60 px-5 py-4">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                                Offices driving this need
                              </p>
                              <ul className="space-y-2">
                                {n.offices.map((o) => (
                                  <li key={o.office} className="flex items-center gap-3">
                                    <span className="w-52 shrink-0 truncate text-sm text-slate-700">{o.office}</span>
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70">
                                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${o.demand}%` }} />
                                    </div>
                                    <span className="w-16 shrink-0 text-right text-xs font-semibold text-slate-600">
                                      {o.affected}/{o.total}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}

                  {!loading && needs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center text-slate-500">
                        <p className="font-medium">No needs assessment yet.</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Once the AI competency matcher has run against the summary of ratings, the
                          most-in-demand competencies appear here.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">{notice}</div>
      )}
    </div>
  );
};

export default LndTrainingNeeds;
