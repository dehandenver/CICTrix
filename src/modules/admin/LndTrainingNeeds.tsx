/**
 * LND — Training Requests & Needs.
 *
 * Chrome matches RSP › Applicants: a white page header, a sticky sub-tab bar,
 * and bordered tables with uniform slate headers.
 *
 * Section 1: manual training requests submitted by office accounts, grouped by
 * office in a collapsible list; expanding an office reveals its request table
 * where the admin approves or dismisses each row.
 * Section 2: an AI-inferred training-needs assessment ranked by competency, each
 * row expanding to the offices driving that need (affected / total headcount).
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import {
  computeNeedsAssessment,
  decideRequest,
  listOfficeRequests,
  type CompetencyNeed,
  type NeedPriority,
  type OfficeRequest,
  type RequestStatus,
} from '../../lib/api/trainingNeeds';

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

const STATUS_TABS: ('All' | RequestStatus)[] = ['All', 'Pending', 'Approved', 'Dismissed'];
const STATUS_PILL: Record<RequestStatus, string> = {
  Pending: 'bg-slate-100 text-slate-600',
  Approved: 'bg-emerald-100 text-emerald-700',
  Dismissed: 'bg-rose-50 text-rose-600 border border-rose-200',
};

const TH = 'px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500';

/**
 * Approve / Dismiss pair. `variant="card"` is the narrow-screen form: full-width
 * buttons with 44px tap targets, stacked by the wrapping flex row.
 */
const RequestActions = ({
  request,
  busy,
  onDecide,
  variant,
}: {
  request: OfficeRequest;
  busy: boolean;
  onDecide: (r: OfficeRequest, decision: 'Approved' | 'Dismissed') => void;
  variant: 'row' | 'card';
}) => {
  if (request.status !== 'Pending') {
    return <span className="text-xs text-slate-400">—</span>;
  }

  const card = variant === 'card';
  const base = card
    ? 'min-h-[44px] flex-1 justify-center basis-[8rem]'
    : 'min-h-[36px] shrink-0';

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${card ? '' : 'justify-end sm:flex-nowrap'}`}>
      <button
        type="button"
        disabled={busy}
        onClick={() => onDecide(request, 'Approved')}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 ${base}`}
      >
        <Check className="h-3.5 w-3.5 shrink-0" /> Approve
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onDecide(request, 'Dismissed')}
        className={`inline-flex items-center whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:border-rose-300 hover:text-rose-600 disabled:opacity-60 ${base}`}
      >
        Dismiss
      </button>
    </div>
  );
};

export const LndTrainingNeeds = () => {
  const [requests, setRequests] = useState<OfficeRequest[]>([]);
  const [needs, setNeeds] = useState<CompetencyNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | RequestStatus>('Pending');
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

  // ── Section 1: a single flat, filterable request table ──────────────────
  const filteredRequests = useMemo(
    () =>
      requests
        .filter((r) => statusFilter === 'All' || r.status === statusFilter)
        .sort(
          (a, b) =>
            a.office.localeCompare(b.office) ||
            (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''),
        ),
    [requests, statusFilter],
  );

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

  const rowLabel = (n: number) =>
    `${n} ${statusFilter === 'Pending' ? 'pending ' : statusFilter === 'All' ? '' : `${statusFilter.toLowerCase()} `}request${n === 1 ? '' : 's'}`;

  return (
    <div className="bg-slate-50">
      {/* Page header — matches RSP › Applicants */}
      <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <h1 className="!mb-1 !text-xl font-bold sm:!text-2xl">Training Requests &amp; Needs</h1>
        <p className="!mb-0 text-sm text-slate-500 sm:text-base">
          Office requests and Training Needs Assessment
        </p>
      </div>

      {/* Status sub-tabs */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm">
        <nav className="flex overflow-x-auto px-2 sm:px-6" aria-label="Request status tabs">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setStatusFilter(t)}
              className={`relative -mb-px min-h-[44px] shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition-colors sm:px-6 sm:py-4 sm:text-base ${
                statusFilter === t
                  ? 'border-[#363EE8] text-[#363EE8]'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      <div className="space-y-8 p-4 sm:p-6">
        {/* ── Section 1: Training requests, grouped by office ─────────────── */}
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Training requests</h2>
            <p className="text-sm text-slate-500">Manual requests submitted by office accounts — click an office to expand</p>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-slate-500">
              Loading requests…
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-slate-500">
              <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="font-medium">
                {requests.length === 0 ? 'No training requests yet.' : `No ${statusFilter.toLowerCase()} requests.`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {requests.length === 0
                  ? 'Requests submitted by office accounts will appear here.'
                  : 'Try another status tab.'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-2.5 text-xs font-medium text-slate-500">
                {rowLabel(filteredRequests.length)}
              </div>
              {/* Under lg the six columns become one stacked card per request, so
                  nothing needs a sideways scroll to reach Approve / Dismiss. */}
              <ul className="divide-y divide-slate-100 lg:hidden">
                {filteredRequests.map((r) => (
                  <li key={r.id} className="space-y-2 px-4 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{r.title}</p>
                      <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[r.status]}`}>
                        {r.status}
                      </span>
                    </div>
                    {r.justification && (
                      <p className="break-words text-xs italic text-slate-500">“{r.justification}”</p>
                    )}
                    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="font-semibold uppercase tracking-wider text-slate-400">Office</dt>
                      <dd className="min-w-0 break-words text-slate-700">{r.office}</dd>
                      <dt className="font-semibold uppercase tracking-wider text-slate-400">By</dt>
                      <dd className="min-w-0 break-words text-slate-700">{r.requestedBy || '—'}</dd>
                      <dt className="font-semibold uppercase tracking-wider text-slate-400">Comp.</dt>
                      <dd className="min-w-0 break-words text-slate-700">{r.competency || '—'}</dd>
                    </dl>
                    <RequestActions request={r} busy={busy === r.id} onDecide={decide} variant="card" />
                  </li>
                ))}
              </ul>

              {/* Six columns can't compress below ~44rem and stay readable, so the
                  table scrolls inside its own card rather than widening the page. */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[44rem]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className={TH}>Office</th>
                      <th className={TH}>Training Requested</th>
                      <th className={TH}>Requested By</th>
                      <th className={TH}>Competency</th>
                      <th className={TH}>Status</th>
                      <th className={`${TH} text-right`}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50">
                        <td className="px-5 py-4 text-sm font-semibold text-slate-900">{r.office}</td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                          {r.justification && (
                            <p className="mt-0.5 max-w-xl text-xs italic text-slate-500">“{r.justification}”</p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{r.requestedBy || '—'}</td>
                        <td className="px-5 py-4 text-sm text-slate-700">{r.competency || '—'}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[r.status]}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <RequestActions request={r} busy={busy === r.id} onDecide={decide} variant="row" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── Section 2: Training needs assessment ────────────────────────── */}
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Training needs assessment</h2>
            <p className="text-sm text-slate-500">
              Generated from summary of ratings and the competency framework, sorted by demand — click a row for the offices driving it
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[21rem]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={TH}>Competency</th>
                  <th className={TH}>Priority</th>
                  <th className={TH}>Offices</th>
                  <th className={TH}>Demand</th>
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
                          <div className="flex w-full min-w-[7rem] max-w-[10rem] items-center gap-2">
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
                                  <span
                                    className="w-28 shrink-0 truncate text-sm text-slate-700 sm:w-40 lg:w-52"
                                    title={o.office}
                                  >
                                    {o.office}
                                  </span>
                                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200/70">
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
          </div>
        </section>
      </div>

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">{notice}</div>
      )}
    </div>
  );
};

export default LndTrainingNeeds;
