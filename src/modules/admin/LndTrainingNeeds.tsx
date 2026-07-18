/**
 * LND — Training Requests & Needs.
 *
 * Section 1: manual training requests submitted by office accounts, grouped by
 * office in a collapsible list; the admin approves or dismisses each.
 * Section 2: an AI-inferred training-needs assessment ranked by competency, each
 * expanding to the offices driving that need (affected / total headcount).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Sparkles, X } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
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

const STATUS_TABS: ('All' | RequestStatus)[] = ['All', 'Pending', 'Approved', 'Dismissed'];
const STATUS_PILL: Record<RequestStatus, string> = {
  Pending: 'bg-slate-100 text-slate-600',
  Approved: 'bg-emerald-100 text-emerald-700',
  Dismissed: 'bg-rose-50 text-rose-600 border border-rose-200',
};

export const LndTrainingNeeds = () => {
  const [requests, setRequests] = useState<OfficeRequest[]>([]);
  const [needs, setNeeds] = useState<CompetencyNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | RequestStatus>('Pending');
  const [openOffices, setOpenOffices] = useState<Set<string>>(new Set());
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

  // ── Section 1 grouping ──────────────────────────────────────────────────
  const officeGroups = useMemo(() => {
    const map = new Map<string, OfficeRequest[]>();
    for (const r of requests) {
      if (statusFilter !== 'All' && r.status !== statusFilter) continue;
      const list = map.get(r.office) ?? [];
      list.push(r);
      map.set(r.office, list);
    }
    return [...map.entries()]
      .map(([office, reqs]) => ({
        office,
        reqs: reqs.sort((a, b) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? '')),
        pending: reqs.filter((r) => r.status === 'Pending').length,
      }))
      .sort((a, b) => b.reqs.length - a.reqs.length || a.office.localeCompare(b.office));
  }, [requests, statusFilter]);

  const toggleOffice = (office: string) =>
    setOpenOffices((prev) => { const n = new Set(prev); n.has(office) ? n.delete(office) : n.add(office); return n; });
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
    <div className="space-y-8 p-8">
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Training Requests & Needs
        </p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Training Requests & Needs</h1>
        <p className="mt-1 text-sm text-gray-500">Act on office-submitted requests, and see the competencies the LGU most needs to invest in.</p>
      </section>

      {/* ── Section 1: Training requests ─────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Training requests</h2>
          <p className="text-sm text-gray-500">Manual requests submitted by office accounts</p>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setStatusFilter(t)}
              className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${statusFilter === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : officeGroups.length === 0 ? (
          <EmptyState
            title={requests.length === 0 ? 'No training requests yet' : `No ${statusFilter.toLowerCase()} requests`}
            description={requests.length === 0 ? 'Requests submitted by office accounts will appear here, grouped by office.' : 'Try another status tab.'}
          />
        ) : (
          <div className="space-y-2">
            {officeGroups.map((g) => {
              const open = openOffices.has(g.office);
              return (
                <div key={g.office} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => toggleOffice(g.office)}
                    className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50/60 transition"
                  >
                    <span className="flex items-center gap-2">
                      {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <span className="font-bold text-gray-900">{g.office}</span>
                    </span>
                    <span className="text-sm font-medium text-gray-500">{rowLabel(g.reqs.length)}</span>
                  </button>
                  {open && (
                    <ul className="divide-y divide-gray-100 border-t border-gray-100">
                      {g.reqs.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                            <p className="text-xs text-gray-500">
                              {r.requestedBy} · {fmtDate(r.requestedAt)}
                              {r.competency ? <span className="text-gray-400"> · {r.competency}</span> : null}
                            </p>
                            {r.justification && <p className="mt-0.5 max-w-xl text-xs text-gray-500 italic">“{r.justification}”</p>}
                          </div>
                          {r.status === 'Pending' ? (
                            <div className="flex items-center gap-1.5">
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
                                className="inline-flex items-center rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:border-rose-300 hover:text-rose-600 disabled:opacity-60"
                              >
                                Dismiss
                              </button>
                            </div>
                          ) : (
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[r.status]}`}>{r.status}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 2: Training needs assessment ─────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-500" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">Training needs assessment</h2>
            <p className="text-sm text-gray-500">Generated from summary of ratings and the competency framework, sorted by demand</p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : needs.length === 0 ? (
          <EmptyState
            title="No needs assessment yet"
            description="Once the AI competency matcher has run against the summary of ratings, the most-in-demand competencies and the offices driving them appear here."
          />
        ) : (
          <div className="space-y-2">
            {needs.map((n) => {
              const open = openComps.has(n.competency);
              return (
                <div key={n.competency} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => toggleComp(n.competency)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50/60 transition"
                  >
                    {open ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
                    <span className="min-w-0 flex-1 font-semibold text-gray-900">{n.competency}</span>
                    <span className={`hidden sm:inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${PRIORITY_BADGE[n.priority]}`}>
                      {PRIORITY_LABEL[n.priority]}
                    </span>
                    <div className="flex w-40 shrink-0 items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${n.demand}%` }} />
                      </div>
                      <span className="w-9 text-right text-sm font-semibold text-gray-700">{n.demand}%</span>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Offices driving this need</p>
                      <ul className="space-y-2">
                        {n.offices.map((o) => (
                          <li key={o.office} className="flex items-center gap-3">
                            <span className="w-44 shrink-0 truncate text-sm text-gray-700">{o.office}</span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200/70">
                              <div className="h-full rounded-full bg-blue-400" style={{ width: `${o.demand}%` }} />
                            </div>
                            <span className="w-16 shrink-0 text-right text-xs font-semibold text-gray-600">
                              {o.affected}/{o.total}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">{notice}</div>
      )}
    </div>
  );
};

export default LndTrainingNeeds;
