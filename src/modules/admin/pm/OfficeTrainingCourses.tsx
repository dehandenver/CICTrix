/**
 * Office Account — Training Courses page (§3).
 *
 * Read-only, system-wide list of every training for department heads. Four
 * subtabs: All trainings (this file's focus), plus L&D recommendations, Pending
 * enrollment, and Attendance history — scaffolded here and filled in by the
 * recommendation/attendance work (§5/§6). Department heads cannot edit any
 * training from this page; the Details drawer is read-only and, on open, clears
 * the "Updated by L&D" tag (§4).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, Send, UserPlus, X } from 'lucide-react';
import {
  listOfficeTrainings,
  markTrainingViewedByOffice,
  type OfficeTraining,
} from '../../../lib/api/officeTrainingCourses';
import {
  listAllRecommendations,
  officeAddCandidateAudited,
  officeRemoveCandidate,
  returnBatchToLnd,
  type PipelineRecFull,
} from '../../../lib/api/trainingRecommendations';
import { supabase as supabaseClient } from '../../../lib/supabase';
import { CATEGORY_COLORS } from '../trainingCategories';
import type { LifecycleStatus } from '../../../lib/api/trainingLifecycle';

const supabase = supabaseClient as any;
const POLL_MS = 12000;
const OFFICE_ACTOR = 'Department Head';

type EmployeePick = { id: string; name: string; department: string | null };
type RecGroup = { sessionId: string; title: string; category: string | null; start: string; recs: PipelineRecFull[] };
/** A batch is the unit L&D sends and the office returns; it may span courses. */
type BatchGroup = { batchId: string | null; courses: RecGroup[] };

const groupRecs = (recs: PipelineRecFull[]): RecGroup[] => {
  const map = new Map<string, RecGroup>();
  for (const r of recs) {
    let g = map.get(r.sessionId);
    if (!g) { g = { sessionId: r.sessionId, title: r.sessionTitle, category: r.sessionCategory, start: r.sessionStart, recs: [] }; map.set(r.sessionId, g); }
    g.recs.push(r);
  }
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
};

const groupByBatch = (recs: PipelineRecFull[]): BatchGroup[] => {
  const map = new Map<string, PipelineRecFull[]>();
  for (const r of recs) {
    const k = r.batchId ?? 'unbatched';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return [...map.entries()].map(([k, rs]) => ({
    batchId: k === 'unbatched' ? null : k,
    courses: groupRecs(rs),
  }));
};

type Subtab = 'all' | 'recommendations' | 'pending' | 'attendance';
type SortKey = 'title' | 'date' | 'status';

const STATUS_BADGE: Record<LifecycleStatus, string> = {
  planning: 'bg-gray-100 text-gray-600 border border-dashed border-gray-400',
  published: 'bg-emerald-100 text-emerald-700',
  locked: 'bg-slate-200 text-slate-700',
};

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
const fmtRange = (t: OfficeTraining) => {
  const year = new Date(t.startDate).getFullYear();
  if (t.endDate && !sameDay(t.startDate, t.endDate)) return `${fmtDay(t.startDate)} – ${fmtDay(t.endDate)}, ${year}`;
  return `${fmtDay(t.startDate)}, ${year}`;
};

const UpdatedTag = () => (
  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
    <RefreshCw className="h-2.5 w-2.5" /> Updated by L&D
  </span>
);

const CategoryTag = ({ category }: { category: string | null }) => {
  if (!category) return <span className="text-xs text-slate-400">—</span>;
  const color = CATEGORY_COLORS[category] ?? '#94a3b8';
  return (
    <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
      {category}
    </span>
  );
};

const StatusBadge = ({ status }: { status: LifecycleStatus }) => (
  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_BADGE[status]}`}>{status}</span>
);

type Props = {
  /** Signed-in office. Scopes recommendations and the add-candidate list. */
  officeName?: string | null;
  /** Which subtab to open on. Lets the console link straight to the round-trip. */
  initialSubtab?: Subtab;
};

export const OfficeTrainingCourses = ({ officeName = null, initialSubtab = 'all' }: Props) => {
  const [subtab, setSubtab] = useState<Subtab>(initialSubtab);
  const [trainings, setTrainings] = useState<OfficeTraining[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LifecycleStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [detail, setDetail] = useState<OfficeTraining | null>(null);

  const [pipeline, setPipeline] = useState<PipelineRecFull[]>([]);
  const [removeTarget, setRemoveTarget] = useState<PipelineRecFull | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [employees, setEmployees] = useState<EmployeePick[]>([]);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [busySession, setBusySession] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const data = await listOfficeTrainings();
      if (cancelled) return;
      setTrainings(data);
      setLoading(false);
    };
    void load();
    // Poll so newly published courses appear without a manual reload —
    // mirrors the recommendation pipeline's existing 12-second cycle.
    const interval = window.setInterval(() => void load(), POLL_MS);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  // A department head reviews their own office's candidates, not the LGU's.
  const inOffice = useCallback(
    (recs: PipelineRecFull[]) => {
      const want = officeName?.trim().toLowerCase();
      if (!want) return recs;
      return recs.filter((r) => (r.department ?? '').trim().toLowerCase() === want);
    },
    [officeName],
  );

  // Poll the recommendation pipeline so L&D approvals appear without a refresh.
  useEffect(() => {
    const load = async () => setPipeline(inOffice(await listAllRecommendations()));
    void load();
    timer.current = window.setInterval(() => void load(), POLL_MS);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [inOffice]);

  // Candidates a head may add are their own staff — the same scope as the
  // recommendations they are added to.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = supabase
        .from('employees_with_department')
        .select('id, full_name, department, status')
        .eq('status', 'Active')
        .order('full_name', { ascending: true });
      if (officeName) query = query.eq('department', officeName);
      const { data } = await query;
      if (cancelled) return;
      setEmployees((data ?? []).map((e: any) => ({ id: String(e.id), name: (e.full_name ?? '').trim() || 'Unnamed', department: e.department ?? null })));
    })();
    return () => { cancelled = true; };
  }, [officeName]);

  const reloadPipeline = async () => setPipeline(inOffice(await listAllRecommendations()));

  const reviewBatches = useMemo(
    () => groupByBatch(pipeline.filter((r) => r.status === 'LND_APPROVED' || r.status === 'OFFICE_ADDED')),
    [pipeline],
  );
  const recGroups = useMemo(() => reviewBatches.flatMap((b) => b.courses), [reviewBatches]);
  const pendingGroups = useMemo(() => groupRecs(pipeline.filter((r) => r.status === 'OFFICE_FINALIZED')), [pipeline]);

  const addCandidate = async (sessionId: string, employeeId: string, batchId: string | null) => {
    setBusySession(sessionId);
    const res = await officeAddCandidateAudited({
      sessionId,
      employeeId,
      actor: OFFICE_ACTOR,
      actorDepartment: officeName,
      batchId,
    });
    setBusySession(null);
    if (!res.ok) { alert(res.error); return; }
    setAddingTo(null);
    setEmpSearch('');
    await reloadPipeline();
  };

  /**
   * Removals need a reason — it is what the audit trail is for, and the database
   * rejects a blank one. Hence the modal rather than a bare button.
   */
  const confirmRemove = async () => {
    if (!removeTarget) return;
    if (!removeReason.trim()) { alert('Please give a reason for removing this employee.'); return; }
    setBusySession(removeTarget.sessionId);
    const res = await officeRemoveCandidate({
      recommendationId: removeTarget.id,
      sessionId: removeTarget.sessionId,
      employeeId: removeTarget.employeeId,
      reason: removeReason,
      actor: OFFICE_ACTOR,
      actorDepartment: officeName,
    });
    setBusySession(null);
    if (!res.ok) { alert(res.error); return; }
    setRemoveTarget(null);
    setRemoveReason('');
    await reloadPipeline();
  };

  /** The office returns a whole batch at once, which is how L&D sent it. */
  const sendBatchBack = async (batchId: string | null, sessionIds: string[]) => {
    if (!batchId) { alert('This list has no batch reference and cannot be returned automatically.'); return; }
    setBusySession(sessionIds[0] ?? batchId);
    const res = await returnBatchToLnd(batchId, OFFICE_ACTOR);
    setBusySession(null);
    if (!res.ok) { alert(res.error); return; }
    await reloadPipeline();
  };

  const updatedCount = useMemo(() => trainings.filter((t) => t.updatedByLnd).length, [trainings]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = trainings.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (term) {
        const hay = `${t.title} ${t.category ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const order: Record<LifecycleStatus, number> = { planning: 0, published: 1, locked: 2 };
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'title') cmp = a.title.localeCompare(b.title);
      else if (sortKey === 'date') cmp = a.startDate.localeCompare(b.startDate);
      else cmp = order[a.status] - order[b.status];
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [trainings, search, statusFilter, sortKey, sortDir]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const clampedPage = Math.min(page, pageCount);
  const start = (clampedPage - 1) * perPage;
  const pageRows = filtered.slice(start, start + perPage);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'title' ? 'asc' : 'desc'); }
    setPage(1);
  };

  const openDetail = async (t: OfficeTraining) => {
    setDetail(t);
    if (t.updatedByLnd) {
      await markTrainingViewedByOffice(t.id);
      setTrainings((prev) => prev.map((x) => (x.id === t.id ? { ...x, updatedByLnd: false } : x)));
      setDetail((cur) => (cur && cur.id === t.id ? { ...cur, updatedByLnd: false } : cur));
    }
  };

  const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <th className={`px-4 py-3 font-semibold ${className ?? ''}`}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-slate-700">
        {label}
        {sortKey === k && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );

  const subtabs: { id: Subtab; label: string; badge?: number }[] = [
    { id: 'all', label: 'All trainings' },
    { id: 'recommendations', label: 'L&D recommendations', badge: recGroups.length },
    { id: 'pending', label: 'Pending enrollment', badge: pendingGroups.length },
    { id: 'attendance', label: 'Attendance history' },
  ];

  return (
    <div>
      {/* Subtabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50/50 px-4 py-2">
        {subtabs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubtab(s.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-bold transition ${
              subtab === s.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {s.label}
            {s.badge ? <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">{s.badge}</span> : null}
          </button>
        ))}
      </div>

      {subtab === 'recommendations' ? (
        <div className="space-y-5 p-4">
          {reviewBatches.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-semibold text-slate-600">No pending recommendations</p>
              <p className="mt-1 text-xs text-slate-400">When L&D sends candidates for your office, they appear here to review, adjust, and send back.</p>
            </div>
          ) : (
            reviewBatches.map((batch) => {
              const sessionIds = batch.courses.map((c) => c.sessionId);
              const totalRecs = batch.courses.reduce((n, c) => n + c.recs.length, 0);
              const batchBusy = sessionIds.some((id) => busySession === id);
              return (
                <div key={batch.batchId ?? 'unbatched'} className="rounded-xl border border-indigo-200 bg-indigo-50/30">
                  {/* A batch is what L&D sent and what the office returns — it may
                      cover several courses, so the send-back action lives here. */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 px-4 py-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-indigo-800">
                        Batch from L&amp;D
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {batch.courses.length} course{batch.courses.length === 1 ? '' : 's'} · {totalRecs} candidate{totalRecs === 1 ? '' : 's'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={batchBusy}
                      onClick={() => void sendBatchBack(batch.batchId, sessionIds)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" /> {batchBusy ? 'Sending…' : 'Send back to L&D'}
                    </button>
                  </div>

                  <div className="space-y-3 p-3">
                    {batch.courses.map((g) => {
                      const term = empSearch.trim().toLowerCase();
                      const existingIds = new Set(g.recs.map((r) => r.employeeId));
                      const filteredEmps = employees
                        .filter((e) => !term || e.name.toLowerCase().includes(term) || (e.department ?? '').toLowerCase().includes(term))
                        .slice(0, 30);
                      return (
                        <section key={g.sessionId} className="rounded-xl border border-slate-200 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900">{g.title}</h3>
                              <CategoryTag category={g.category} />
                              <span className="text-xs text-slate-400">· {g.recs.length} candidate{g.recs.length === 1 ? '' : 's'}</span>
                            </div>
                            <button type="button" onClick={() => { setAddingTo(addingTo === g.sessionId ? null : g.sessionId); setEmpSearch(''); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
                              <UserPlus className="h-3.5 w-3.5" /> Add employee
                            </button>
                          </div>
                          {addingTo === g.sessionId && (
                            <div className="border-b border-slate-100 bg-slate-50/60 p-3">
                              <div className="relative mb-2">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search employee…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none" />
                              </div>
                              <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                                {filteredEmps.map((e) => (
                                  <li key={e.id}>
                                    <button type="button" disabled={existingIds.has(e.id) || busySession === g.sessionId} onClick={() => void addCandidate(g.sessionId, e.id, batch.batchId)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40">
                                      <span className="text-slate-800">{e.name}</span>
                                      <span className="text-xs text-slate-400">{existingIds.has(e.id) ? 'already listed' : e.department}</span>
                                    </button>
                                  </li>
                                ))}
                                {filteredEmps.length === 0 && (
                                  <li className="px-3 py-3 text-center text-xs text-slate-400">
                                    No employees in your office match that search.
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                          <ul className="divide-y divide-slate-100">
                            {g.recs.map((r) => (
                              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-900">{r.employeeName}</span>
                                    {r.source === 'office_account_added' && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600"><UserPlus className="h-2.5 w-2.5" /> you added</span>}
                                  </div>
                                  <p className="truncate text-[11px] text-slate-400">{r.department ?? '—'} · {r.competency}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => { setRemoveTarget(r); setRemoveReason(''); }}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-rose-400 hover:text-rose-600"
                                >
                                  <X className="h-3 w-3" /> Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {/* Removal needs a recorded reason — the audit trail is the whole point,
              and the database rejects a blank one. */}
          {removeTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
              <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
                <h3 className="text-sm font-bold text-slate-900">Remove {removeTarget.employeeName}?</h3>
                <p className="mt-1 text-xs text-slate-500">
                  From <strong>{removeTarget.sessionTitle}</strong>. L&amp;D will see this removal and
                  your reason when the batch comes back.
                </p>
                <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Reason (required)
                </label>
                <textarea
                  rows={3}
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="e.g. On extended leave during the training dates."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setRemoveTarget(null); setRemoveReason(''); }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!removeReason.trim() || busySession === removeTarget.sessionId}
                    onClick={() => void confirmRemove()}
                    className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : subtab === 'pending' ? (
        <div className="space-y-4 p-4">
          {pendingGroups.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-semibold text-slate-600">Nothing pending enrollment</p>
              <p className="mt-1 text-xs text-slate-400">Lists you send to L&D appear here until L&D enrolls the attendees.</p>
            </div>
          ) : (
            pendingGroups.map((g) => (
              <section key={g.sessionId} className="rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-2"><h3 className="text-sm font-bold text-slate-900">{g.title}</h3><CategoryTag category={g.category} /></div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"><Check className="h-3.5 w-3.5" /> Sent — awaiting L&D enrollment</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.recs.map((r) => (
                    <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="font-semibold text-slate-900">{r.employeeName}</span>
                      <span className="text-xs text-slate-400">{r.department ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      ) : subtab === 'attendance' ? (
        <div className="p-10 text-center">
          <p className="text-sm font-semibold text-slate-600">Attendance history</p>
          <p className="mt-1 text-xs text-slate-400">Attendance records appear here once your office's trainings have taken place.</p>
        </div>
      ) : (
        <div className="p-4">
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search title or category…"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as 'all' | LifecycleStatus); setPage(1); }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All status</option>
              <option value="published">Published</option>
              <option value="locked">Locked</option>
            </select>
            {updatedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600">
                <RefreshCw className="h-3.5 w-3.5" /> {updatedCount} updated by L&D
              </span>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortHeader label="Training title" k="title" />
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <SortHeader label="Dates" k="date" />
                  <SortHeader label="Status" k="status" />
                  <th className="px-4 py-3 font-semibold text-right">Attendees</th>
                  <th className="px-4 py-3 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">Loading trainings…</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">No published trainings match your filters.</td></tr>
                ) : (
                  pageRows.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{t.title}</p>
                        {t.updatedByLnd && <div><UpdatedTag /></div>}
                      </td>
                      <td className="px-4 py-3"><CategoryTag category={t.category} /></td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">{fmtRange(t)}</td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="font-medium text-indigo-600">{t.attendeeCount}</span>
                        <span className="text-xs text-slate-400"> / {t.capacity || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void openDetail(t)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition"
                        >
                          <Eye className="h-3.5 w-3.5" /> Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                {[5, 10, 25].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span>
                {total === 0 ? 'Showing 0 of 0' : `Showing ${start + 1} to ${Math.min(start + perPage, total)} of ${total}`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={clampedPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-slate-300 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1">{clampedPage} / {pageCount}</span>
                <button
                  type="button"
                  disabled={clampedPage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  className="rounded-md border border-slate-300 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Read-only detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg max-h-[86vh] overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-start justify-between bg-white px-6 pt-6 pb-3">
              <div className="min-w-0 pr-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <CategoryTag category={detail.category} />
                  <StatusBadge status={detail.status} />
                  {detail.updatedByLnd && <UpdatedTag />}
                </div>
                <h2 className="text-xl font-bold text-slate-900">{detail.title}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{fmtRange(detail)}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 px-6 pb-6 pt-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs font-medium text-slate-400">Facilitator</p><p className="text-slate-800">{detail.speaker || '—'}</p></div>
                <div><p className="text-xs font-medium text-slate-400">Venue</p><p className="text-slate-800">{detail.location || '—'}</p></div>
                <div><p className="text-xs font-medium text-slate-400">Attendees</p><p className="text-slate-800">{detail.attendeeCount}{detail.capacity ? ` / ${detail.capacity}` : ''}</p></div>
                <div><p className="text-xs font-medium text-slate-400">Roster</p><p className="text-slate-800">{detail.rosterFinalizedAt ? 'Finalized' : 'Not finalized'}</p></div>
              </div>
              {detail.description && (
                <div><p className="text-xs font-medium text-slate-400">Description</p><p className="whitespace-pre-wrap text-slate-800">{detail.description}</p></div>
              )}
              <div>
                <p className="text-xs font-medium text-slate-400">Objectives</p>
                {detail.objectives.length === 0 ? (
                  <p className="text-slate-400">Not recorded yet.</p>
                ) : (
                  <ul className="list-disc pl-5 text-slate-800">{detail.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs font-medium text-slate-400">Materials</p><p className="text-slate-800">{detail.materials || '—'}</p></div>
                <div><p className="text-xs font-medium text-slate-400">Prerequisites</p><p className="text-slate-800">{detail.prerequisites || '—'}</p></div>
              </div>
              {detail.attendees.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-400">Roster</p>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {detail.attendees.map((a, i) => (
                      <li key={i} className="flex items-center justify-between px-3 py-2">
                        <span className="text-slate-800">{a.name}</span>
                        <span className="text-xs text-slate-400">{a.department}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">Read-only — trainings are managed by L&D.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficeTrainingCourses;
