/**
 * Page 5 (L&D admin view) — Training Requests review queue.
 *
 * Department heads submit next-year training requests from the Office Account
 * Console; this is where L&D reviews the incoming volume across every
 * department, filters it, and decides. Approving optionally pushes the request
 * straight into Page 4's planning calendar as a Proposed entry, pre-filled,
 * rather than re-typing it.
 *
 * Status vocabulary: the DB models three states (pending / approved / rejected).
 * The spec's "Submitted" and "Under review" both collapse onto `pending` — a
 * request sitting in this queue is by definition awaiting L&D review, so it
 * renders as the amber "Under review" pill. `approved` → "Approved" (green),
 * `rejected` → "Declined" (muted rose, not an alarming red).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarPlus,
  Check,
  ClipboardList,
  Eye,
  Search,
  X,
} from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import {
  listTrainingRequestsDetailed,
  updateTrainingRequestStatus,
  type TrainingRequest,
} from '../../lib/api/trainingRequests';
import { createPlanEntry } from '../../lib/api/trainingPlan';
import {
  CATEGORY_COLORS,
  TRAINING_CATEGORIES,
  type TrainingCategory,
} from './trainingCategories';

type UiStatus = 'under-review' | 'approved' | 'declined';

const dbToUi = (status: TrainingRequest['status']): UiStatus =>
  status === 'approved' ? 'approved' : status === 'rejected' ? 'declined' : 'under-review';

const STATUS_META: Record<UiStatus, { label: string; className: string }> = {
  'under-review': { label: 'Under review', className: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'Declined', className: 'bg-rose-50 text-rose-600 border border-rose-200' },
};

const employeeName = (r: TrainingRequest): string =>
  [r.employees?.first_name, r.employees?.last_name].filter(Boolean).join(' ').trim() || 'Unknown employee';

const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/** Colored tag using the shared 4-category palette, so Page 1 aggregates cleanly. */
const CategoryTag = ({ category }: { category: string | null | undefined }) => {
  if (!category) return <span className="text-xs text-gray-400">Uncategorized</span>;
  const color = CATEGORY_COLORS[category] ?? '#94a3b8';
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {category}
    </span>
  );
};

const StatusPill = ({ status }: { status: UiStatus }) => {
  const meta = STATUS_META[status];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span>;
};

export const LndTrainingRequests = () => {
  const [requests, setRequests] = useState<TrainingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [filterDept, setFilterDept] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | UiStatus>('all');
  const [search, setSearch] = useState('');

  const [detail, setDetail] = useState<TrainingRequest | null>(null);
  const [pushCandidate, setPushCandidate] = useState<TrainingRequest | null>(null);
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listTrainingRequestsDetailed();
        if (!cancelled) setRequests(data);
      } catch (err) {
        console.error('Training requests load error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 4000);
  };

  const departments = useMemo(
    () => Array.from(new Set(requests.map((r) => r.employees?.department).filter(Boolean))).sort() as string[],
    [requests]
  );

  const counts = useMemo(() => {
    const c = { total: requests.length, 'under-review': 0, approved: 0, declined: 0 } as Record<string, number>;
    for (const r of requests) c[dbToUi(r.status)]++;
    return c;
  }, [requests]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests
      .filter((r) => {
        if (filterDept !== 'all' && r.employees?.department !== filterDept) return false;
        if (filterCategory !== 'all' && r.category !== filterCategory) return false;
        if (filterStatus !== 'all' && dbToUi(r.status) !== filterStatus) return false;
        if (term) {
          const hay = [employeeName(r), r.title, r.competency, r.employees?.department].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      // Actionable (under review) first, then most recently requested.
      .sort((a, b) => {
        const ap = a.status === 'pending' ? 0 : 1;
        const bp = b.status === 'pending' ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (b.requested_at ?? '').localeCompare(a.requested_at ?? '');
      });
  }, [requests, filterDept, filterCategory, filterStatus, search]);

  const applyStatus = (id: string, status: TrainingRequest['status']) =>
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));

  const handleDecision = async (r: TrainingRequest, status: 'approved' | 'rejected') => {
    setBusyId(r.id);
    const res = await updateTrainingRequestStatus(r.id, status);
    setBusyId(null);
    if (!res.ok) {
      flash(`Could not update request: ${res.error}`);
      return;
    }
    applyStatus(r.id, status);
    setDetail((cur) => (cur && cur.id === r.id ? { ...cur, status } : cur));
    if (status === 'approved') {
      // Offer the pre-filled hand-off to Page 4 rather than re-typing (spec).
      if (r.category) setPushCandidate({ ...r, status });
      else flash('Approved. Tag a category to add it to next year’s plan.');
    } else {
      flash(`Declined “${r.title}”.`);
    }
  };

  const nextYear = new Date().getFullYear() + 1;

  const handlePush = async () => {
    if (!pushCandidate || !pushCandidate.category) return;
    setPushing(true);
    const res = await createPlanEntry(
      {
        planYear: nextYear,
        title: pushCandidate.title,
        category: pushCandidate.category as TrainingCategory,
        // Tentative — Page 4 lets L&D drag it to a real date. Start of the plan
        // year is the safe pre-fill (a plan entry requires a start date).
        startDate: `${nextYear}-01-01T00:00:00.000Z`,
        endDate: null,
        speaker: '',
        location: '',
        objectives: [],
        capacity: 0,
        departmentId: null,
        planStatus: 'Proposed',
        recommendedFrom: 'Training Request',
        sourceRequestId: pushCandidate.id,
      },
      'LND Admin'
    );
    setPushing(false);
    if (!res.ok) {
      // The unique index on source_request_id makes a second push a no-op.
      flash(/duplicate|unique/i.test(res.error ?? '')
        ? 'This request is already on next year’s plan.'
        : `Could not add to plan: ${res.error}`);
      setPushCandidate(null);
      return;
    }
    flash(`Added “${pushCandidate.title}” to the ${nextYear} plan.`);
    setPushCandidate(null);
  };

  const selectClass =
    'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Training Requests
        </p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Training Requests</h1>
        <p className="mt-1 text-sm text-gray-500">Department-head submissions across every office — review, decide, and roll approvals into next year’s plan.</p>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4 relative">
        {loading && <div className="absolute inset-0 z-10 rounded-2xl bg-white/50 backdrop-blur-[1px]" />}
        {[
          { label: 'Total requests', value: counts.total, tone: 'text-gray-900' },
          { label: 'Under review', value: counts['under-review'], tone: 'text-amber-600' },
          { label: 'Approved', value: counts.approved, tone: 'text-emerald-600' },
          { label: 'Declined', value: counts.declined, tone: 'text-rose-500' },
        ].map((k) => (
          <article key={k.label} className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-500">{k.label}</p>
            <p className={`mt-1 text-3xl font-bold ${k.tone}`}>{k.value}</p>
          </article>
        ))}
      </section>

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee, topic, or department…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className={selectClass}>
          <option value="all">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={selectClass}>
          <option value="all">All categories</option>
          {TRAINING_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'all' | UiStatus)} className={selectClass}>
          <option value="all">All statuses</option>
          <option value="under-review">Under review</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
        </select>
      </section>

      {/* Table */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 relative min-h-[200px]">
        {loading && <div className="absolute inset-0 z-10 rounded-2xl bg-white/50 backdrop-blur-[1px]" />}
        {filtered.length === 0 && !loading ? (
          <EmptyState
            title={requests.length === 0 ? 'No training requests' : 'No matching requests'}
            description={requests.length === 0
              ? 'Department heads have not submitted any training requests yet.'
              : 'Try clearing a filter or search term.'}
          />
        ) : (
          <>
            <div className="grid grid-cols-12 items-center px-3 py-2.5 text-xs font-medium text-gray-500 border-b border-gray-100">
              <div className="col-span-3">Employee / department</div>
              <div className="col-span-3">Requested topic</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            <div className="divide-y divide-gray-100">
              {filtered.map((r) => {
                const ui = dbToUi(r.status);
                const busy = busyId === r.id;
                return (
                  <div key={r.id} className="grid grid-cols-12 items-center px-3 py-3.5 hover:bg-gray-50/50 transition">
                    <div className="col-span-3 min-w-0 pr-3">
                      <p className="text-sm font-bold text-gray-900 truncate">{employeeName(r)}</p>
                      <p className="text-xs text-gray-500 truncate">{r.employees?.department ?? 'Unassigned'}</p>
                    </div>
                    <div className="col-span-3 min-w-0 pr-3">
                      <p className="text-sm text-gray-800 truncate">{r.title}</p>
                      {r.competency && <p className="text-xs text-gray-400 truncate">{r.competency}</p>}
                    </div>
                    <div className="col-span-2"><CategoryTag category={r.category} /></div>
                    <div className="col-span-2">
                      <StatusPill status={ui} />
                      <p className="mt-1 text-[11px] text-gray-400">{fmtDate(r.requested_at)}</p>
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1.5">
                      {ui === 'under-review' && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDecision(r, 'approved')}
                            title="Approve"
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDecision(r, 'rejected')}
                            title="Decline"
                            className="inline-flex items-center rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setDetail(r)}
                        title="View details"
                        className="inline-flex items-center rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-start justify-between bg-white px-6 pt-6 pb-3">
              <div className="min-w-0 pr-3">
                <h2 className="text-xl font-bold text-slate-900">{detail.title}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{employeeName(detail)} · {detail.employees?.department ?? 'Unassigned'}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 pb-6 pt-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryTag category={detail.category} />
                <StatusPill status={dbToUi(detail.status)} />
              </div>
              {detail.competency && (
                <div>
                  <p className="text-xs font-medium text-gray-400">Competency</p>
                  <p className="text-gray-800">{detail.competency}</p>
                </div>
              )}
              {detail.justification && (
                <div>
                  <p className="text-xs font-medium text-gray-400">Justification</p>
                  <p className="whitespace-pre-wrap text-gray-800">{detail.justification}</p>
                </div>
              )}
              {Array.isArray(detail.rationales) && detail.rationales.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400">Rationale</p>
                  <ul className="list-disc pl-5 text-gray-800">
                    {detail.rationales.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              )}
              {(detail.current_proficiency != null || detail.desired_proficiency != null) && (
                <div className="flex gap-6">
                  <div><p className="text-xs font-medium text-gray-400">Current</p><p className="text-gray-800">{detail.current_proficiency ?? '—'}</p></div>
                  <div><p className="text-xs font-medium text-gray-400">Target</p><p className="text-gray-800">{detail.desired_proficiency ?? '—'}</p></div>
                </div>
              )}
              <div className="flex gap-6 border-t border-gray-100 pt-3 text-xs text-gray-400">
                <span>Requested {fmtDate(detail.requested_at)}</span>
                {detail.decided_at && <span>Decided {fmtDate(detail.decided_at)}</span>}
              </div>
              {detail.status === 'pending' && (
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyId === detail.id}
                    onClick={() => void handleDecision(detail, 'rejected')}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={busyId === detail.id}
                    onClick={() => void handleDecision(detail, 'approved')}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approve → push to Page 4 prompt */}
      {pushCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !pushing && setPushCandidate(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <CalendarPlus className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Add to next year’s plan?</h2>
              <p className="mt-1 text-sm text-slate-500">
                “{pushCandidate.title}” is approved. Add it to the <span className="font-semibold">{nextYear}</span> planning calendar as a
                Proposed entry, pre-filled — you can set the date and details on the Training Plan page.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-5">
              <button
                type="button"
                disabled={pushing}
                onClick={() => setPushCandidate(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Not now
              </button>
              <button
                type="button"
                disabled={pushing}
                onClick={() => void handlePush()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <CalendarPlus className="h-4 w-4" /> {pushing ? 'Adding…' : `Add to ${nextYear} plan`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {notice && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {notice}
        </div>
      )}
    </div>
  );
};

export default LndTrainingRequests;
