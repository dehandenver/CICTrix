/**
 * L&D Recommendations page (§6, L&D side).
 *
 * Three subtabs mirror the pipeline:
 *   - System suggestions : IPCR-driven candidates (SUGGESTED). Approve → sends to
 *                          the Office Account; or Dismiss.
 *   - Sent to office     : LND_APPROVED + OFFICE_ADDED — waiting on the dept head.
 *   - Ready to enroll     : OFFICE_FINALIZED — "Enroll final attendees" enrolls the
 *                          list and opens the §7 notify modal.
 *
 * Polls every 12s (no realtime channel, per the infra decision), so the office's
 * finalize shows up here on its own.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, Check, Sparkles, UserPlus, Users, X } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { CATEGORY_COLORS } from './trainingCategories';
import {
  dismissRecommendation,
  enrollFinalAttendees,
  generateRecommendations,
  listPipeline,
  lndApproveRecommendation,
  type PipelineRec,
  type Priority,
} from '../../lib/api/trainingRecommendations';
import { TrainingEnrollmentEmailModal } from './TrainingEnrollmentEmailModal';
import type { EnrolledRecipient } from '../../lib/api/trainingEmail';

const POLL_MS = 12000;

const PRIORITY_BADGE: Record<Priority, string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-slate-100 text-slate-600',
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const CategoryTag = ({ category }: { category: string | null }) => {
  if (!category) return null;
  const color = CATEGORY_COLORS[category] ?? '#94a3b8';
  return <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${color}1a`, color }}>{category}</span>;
};

type Group = { sessionId: string; title: string; category: string | null; start: string; capacity: number; recs: PipelineRec[] };

const groupBySession = (recs: PipelineRec[]): Group[] => {
  const map = new Map<string, Group>();
  for (const r of recs) {
    let g = map.get(r.sessionId);
    if (!g) {
      g = { sessionId: r.sessionId, title: r.sessionTitle, category: r.sessionCategory, start: r.sessionStart, capacity: r.sessionCapacity, recs: [] };
      map.set(r.sessionId, g);
    }
    g.recs.push(r);
  }
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
};

export const LndRecommendations = () => {
  const [pipeline, setPipeline] = useState<PipelineRec[]>([]);
  const [subtab, setSubtab] = useState<'suggestions' | 'sent' | 'ready'>('suggestions');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailModal, setEmailModal] = useState<{ sessionId: string; title: string; dates: string; recipients: EnrolledRecipient[] } | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const p = await listPipeline();
    setPipeline(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    timer.current = window.setInterval(() => void load(), POLL_MS);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [load]);

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice((c) => (c === m ? null : c)), 3500); };

  const suggestions = useMemo(() => groupBySession(pipeline.filter((r) => r.status === 'SUGGESTED')), [pipeline]);
  const sent = useMemo(() => groupBySession(pipeline.filter((r) => r.status === 'LND_APPROVED' || r.status === 'OFFICE_ADDED')), [pipeline]);
  const ready = useMemo(() => groupBySession(pipeline.filter((r) => r.status === 'OFFICE_FINALIZED')), [pipeline]);

  const approve = async (id: string) => {
    setBusy(id);
    const res = await lndApproveRecommendation(id);
    setBusy(null);
    if (!res.ok) { flash(`Could not approve: ${res.error}`); return; }
    setPipeline((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'LND_APPROVED' } : r)));
  };

  const dismiss = async (id: string) => {
    setBusy(id);
    const res = await dismissRecommendation(id);
    setBusy(null);
    if (!res.ok) { flash(`Could not dismiss: ${res.error}`); return; }
    setPipeline((prev) => prev.filter((r) => r.id !== id));
  };

  const enroll = async (g: Group) => {
    setBusy(g.sessionId);
    const res = await enrollFinalAttendees(g.sessionId, 'LND Admin');
    setBusy(null);
    if (!res.ok) { flash(`Could not enroll: ${res.error}`); return; }
    await load();
    setEmailModal({ sessionId: g.sessionId, title: g.title, dates: fmtDate(g.start), recipients: res.enrolled ?? [] });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await generateRecommendations();
    setGenerating(false);
    if (!res.ok) { flash(`Could not generate: ${res.error}`); return; }
    await load();
    flash(`Generated ${res.upserted ?? 0} suggestion(s) across ${res.employeesConsidered ?? 0} employee(s) with IPCR gaps.`);
  };

  const subtabs: { id: typeof subtab; label: string; count: number }[] = [
    { id: 'suggestions', label: 'System suggestions', count: suggestions.length },
    { id: 'sent', label: 'Sent to office', count: sent.length },
    { id: 'ready', label: 'Ready to enroll', count: ready.length },
  ];

  const groups = subtab === 'suggestions' ? suggestions : subtab === 'sent' ? sent : ready;

  return (
    <div className="space-y-6 p-8">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500"><span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Recommendations</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Recommendations</h1>
          <p className="mt-1 text-sm text-gray-500">IPCR-driven candidates → dept-head review → enrollment. Updates every few seconds.</p>
        </div>
        <button type="button" onClick={() => void handleGenerate()} disabled={generating} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60 transition">
          <Sparkles className="h-4 w-4" /> {generating ? 'Generating…' : 'Generate from IPCR'}
        </button>
      </section>

      {/* Subtabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {subtabs.map((s) => (
          <button key={s.id} type="button" onClick={() => setSubtab(s.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-semibold transition ${subtab === s.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {s.label}
            {s.count > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${subtab === s.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{s.count}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : groups.length === 0 ? (
        <EmptyState
          title={subtab === 'suggestions' ? 'No system suggestions' : subtab === 'sent' ? 'Nothing waiting on the office' : 'Nothing ready to enroll'}
          description={subtab === 'suggestions' ? 'Click "Generate from IPCR" to build candidate lists from finalized IPCR gaps.' : subtab === 'sent' ? 'Approved candidates you send to department heads appear here until they respond.' : 'Lists that department heads finalize appear here for enrollment.'}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.sessionId} className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900">{g.title}</h2>
                  <CategoryTag category={g.category} />
                  <span className="text-xs text-gray-400">· {fmtDate(g.start)} · {g.recs.length}{g.capacity ? ` / ${g.capacity}` : ''} candidate{g.recs.length === 1 ? '' : 's'}</span>
                </div>
                {subtab === 'ready' && (
                  <button type="button" disabled={busy === g.sessionId} onClick={() => void enroll(g)}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                    <CalendarPlus className="h-4 w-4" /> {busy === g.sessionId ? 'Enrolling…' : 'Enroll final attendees'}
                  </button>
                )}
              </div>

              <div className="divide-y divide-gray-100">
                {g.recs.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{r.employeeName}</p>
                        {r.status === 'OFFICE_ADDED' && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600"><UserPlus className="h-2.5 w-2.5" /> office-added</span>}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_BADGE[r.priority]}`}>{r.priority}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{r.department ?? '—'} · {r.competency}{r.triggerScoreLabel !== '—' ? ` · IPCR ${r.triggerScoreLabel}` : ''}</p>
                    </div>
                    {subtab === 'suggestions' && (
                      <div className="flex items-center gap-1.5">
                        <button type="button" disabled={busy === r.id} onClick={() => void approve(r.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button type="button" disabled={busy === r.id} onClick={() => void dismiss(r.id)} title="Dismiss"
                          className="inline-flex items-center rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-500 hover:border-rose-300 hover:text-rose-600 disabled:opacity-60">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {subtab === 'sent' && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400"><Users className="h-3.5 w-3.5" /> waiting on dept head</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {emailModal && (
        <TrainingEnrollmentEmailModal
          sessionId={emailModal.sessionId}
          trainingTitle={emailModal.title}
          dates={emailModal.dates}
          venue={null}
          objectives={[]}
          recipients={emailModal.recipients}
          onClose={() => setEmailModal(null)}
        />
      )}

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">{notice}</div>
      )}
    </div>
  );
};

export default LndRecommendations;
