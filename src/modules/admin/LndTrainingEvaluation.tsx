/**
 * Page 6 (L&D) — Training Evaluation: pre-test / post-test learning verification.
 *
 * Pick a training; the board shows one row per attendee with pre/post scores,
 * the computed improvement (color-coded), and a completion status. Attendees
 * assessed by output submission instead of a quiz get an upload widget and a
 * Pending → Reviewed → Verified review control. An aggregate "average
 * improvement" at the top judges whether the training itself worked, and an
 * after-training report (training details + attendance + results + manual
 * recommendations) exports to a print/PDF view.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Award, FileDown, Upload, Users } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { CATEGORY_COLORS } from './trainingCategories';
import {
  completionOf,
  deltaOf,
  getEvaluationBoard,
  listEvaluableTrainings,
  saveReportNotes,
  saveScores,
  setAssessmentMode,
  setReviewStatus,
  uploadOutput,
  type AssessmentMode,
  type CompletionStatus,
  type EvalBoard,
  type EvalRow,
  type EvalTraining,
  type ReviewStatus,
} from '../../lib/api/trainingEvaluations';

const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const COMPLETION_STYLE: Record<CompletionStatus, string> = {
  'Not started': 'bg-gray-100 text-gray-500',
  'Pre-test done': 'bg-blue-100 text-blue-700',
  'Post-test done': 'bg-amber-100 text-amber-700',
  Complete: 'bg-emerald-100 text-emerald-700',
};

/** Green up, muted rose down, gray flat — a flat/negative delta is not the employee's fault. */
const deltaColor = (d: number | null): string => {
  if (d == null) return 'text-gray-300';
  if (d > 0) return 'text-emerald-600';
  if (d < 0) return 'text-rose-500';
  return 'text-gray-400';
};
const deltaLabel = (d: number | null): string => (d == null ? '—' : `${d > 0 ? '+' : ''}${d}`);

const CategoryTag = ({ category }: { category: string | null }) => {
  if (!category) return null;
  const color = CATEGORY_COLORS[category] ?? '#94a3b8';
  return (
    <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
      {category}
    </span>
  );
};

export const LndTrainingEvaluation = () => {
  const [trainings, setTrainings] = useState<EvalTraining[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [board, setBoard] = useState<EvalBoard | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [reportNotes, setReportNotes] = useState('');

  // Per-row score input overlay so typing doesn't fight number formatting.
  const [edits, setEdits] = useState<Record<string, { pre: string; post: string }>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 4000);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listEvaluableTrainings();
      if (cancelled) return;
      setTrainings(list);
      if (list.length > 0) setSelectedId(list[0].id);
      setLoadingList(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId) { setBoard(null); return; }
    let cancelled = false;
    setLoadingBoard(true);
    (async () => {
      const b = await getEvaluationBoard(selectedId);
      if (cancelled) return;
      setBoard(b);
      setReportNotes(b?.reportNotes ?? '');
      setEdits(
        Object.fromEntries(
          (b?.rows ?? []).map((r) => [r.enrollmentId, {
            pre: r.pre != null ? String(r.pre) : '',
            post: r.post != null ? String(r.post) : '',
          }])
        )
      );
      setLoadingBoard(false);
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  const updateRow = (enrollmentId: string, patch: Partial<EvalRow>) =>
    setBoard((prev) => (prev ? { ...prev, rows: prev.rows.map((r) => (r.enrollmentId === enrollmentId ? { ...r, ...patch } : r)) } : prev));

  const aggregate = useMemo(() => {
    const rows = board?.rows ?? [];
    const deltas = rows.map((r) => deltaOf(r)).filter((d): d is number => d != null);
    const avg = deltas.length ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10 : null;
    const complete = rows.filter((r) => completionOf(r) === 'Complete').length;
    const awaitingReview = rows.filter((r) => r.mode === 'output' && (r.submissionUrl || r.submissionName) && r.reviewStatus !== 'Verified').length;
    return { avg, complete, awaitingReview, total: rows.length };
  }, [board]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const parseScore = (s: string): { ok: boolean; value: number | null } => {
    const t = s.trim();
    if (t === '') return { ok: true, value: null };
    const n = Number(t);
    if (Number.isNaN(n) || n < 0 || n > 100) return { ok: false, value: null };
    return { ok: true, value: n };
  };

  const commitScores = async (row: EvalRow) => {
    const edit = edits[row.enrollmentId] ?? { pre: '', post: '' };
    const pre = parseScore(edit.pre);
    const post = parseScore(edit.post);
    if (!pre.ok || !post.ok) { flash('Scores must be between 0 and 100.'); return; }
    if (pre.value === row.pre && post.value === row.post) return; // no change
    const res = await saveScores(row.enrollmentId, { pre: pre.value, post: post.value });
    if (!res.ok) { flash(`Could not save scores: ${res.error}`); return; }
    updateRow(row.enrollmentId, { pre: pre.value, post: post.value });
  };

  const changeMode = async (row: EvalRow, mode: AssessmentMode) => {
    const res = await setAssessmentMode(row.enrollmentId, mode);
    if (!res.ok) { flash(`Could not change mode: ${res.error}`); return; }
    updateRow(row.enrollmentId, { mode });
  };

  const changeReview = async (row: EvalRow, status: ReviewStatus) => {
    const res = await setReviewStatus(row.enrollmentId, status);
    if (!res.ok) { flash(`Could not update review: ${res.error}`); return; }
    updateRow(row.enrollmentId, { reviewStatus: status });
  };

  const handleFile = async (row: EvalRow, file: File | undefined) => {
    if (!file || !board) return;
    setUploadingId(row.enrollmentId);
    const res = await uploadOutput(board.training.id, row.enrollmentId, file);
    setUploadingId(null);
    if (!res.ok) { flash(`Upload failed: ${res.error}`); return; }
    updateRow(row.enrollmentId, { mode: 'output', submissionUrl: res.url ?? null, submissionName: res.name ?? file.name });
    flash(`Uploaded “${file.name}”.`);
  };

  const commitReportNotes = async () => {
    if (!board) return;
    if (reportNotes === (board.reportNotes ?? '')) return;
    const res = await saveReportNotes(board.training.id, reportNotes);
    if (!res.ok) { flash(`Could not save recommendations: ${res.error}`); return; }
    setBoard((prev) => (prev ? { ...prev, reportNotes } : prev));
  };

  const exportReport = () => {
    if (!board) return;
    const t = board.training;
    const present = board.rows.filter((r) => r.attendanceStatus === 'Present').length;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const rowsHtml = board.rows
      .map((r) => {
        const d = deltaOf(r);
        const comp = completionOf(r);
        return `<tr>
          <td>${esc(r.name)}</td><td>${esc(r.department)}</td>
          <td style="text-align:center">${r.mode === 'output' ? '—' : r.pre ?? '—'}</td>
          <td style="text-align:center">${r.mode === 'output' ? '—' : r.post ?? '—'}</td>
          <td style="text-align:center">${d == null ? '—' : (d > 0 ? '+' : '') + d}</td>
          <td>${r.mode === 'output' ? 'Output: ' + r.reviewStatus : comp}</td>
        </tr>`;
      })
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Training Report — ${esc(t.title)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:13px}
        h1{font-size:20px;margin:0 0 4px} .muted{color:#666}
        table{border-collapse:collapse;width:100%;margin-top:16px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f3f4f6;font-size:12px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-top:12px}
        .k{color:#666}.card{border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-top:16px}
        .big{font-size:22px;font-weight:700}
      </style></head><body>
      <h1>After-Training Report</h1>
      <div class="muted">${esc(t.title)}</div>
      <div class="grid">
        <div><span class="k">Category:</span> ${esc(t.category ?? '—')}</div>
        <div><span class="k">Status:</span> ${esc(t.status)}</div>
        <div><span class="k">Dates:</span> ${fmtDate(t.startDate)}${t.endDate ? ' – ' + fmtDate(t.endDate) : ''}</div>
        <div><span class="k">Location:</span> ${esc(t.location ?? '—')}</div>
        <div><span class="k">Facilitator:</span> ${esc(t.instructorName ?? '—')}</div>
      </div>
      <div class="card">
        <div class="k">Attendance</div>
        <div>${present} present of ${board.rows.length} on roster</div>
        <div class="k" style="margin-top:8px">Average improvement (pre→post)</div>
        <div class="big">${aggregate.avg == null ? '—' : (aggregate.avg > 0 ? '+' : '') + aggregate.avg + ' pts'}</div>
      </div>
      <table><thead><tr><th>Attendee</th><th>Department</th><th>Pre</th><th>Post</th><th>Δ</th><th>Completion</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <div class="card"><div class="k">Recommendations / notes</div><div style="white-space:pre-wrap;margin-top:6px">${esc(reportNotes || '—')}</div></div>
      <div class="muted" style="margin-top:24px">Prepared by L&amp;D · ${fmtDate(new Date().toISOString())}</div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { flash('Allow pop-ups to export the report.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const inputClass = 'w-14 rounded-md border border-gray-300 px-1.5 py-1 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">
            <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Training Evaluation
          </p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Training Evaluation</h1>
          <p className="mt-1 text-sm text-gray-500">Pre-test / post-test results and output submissions — verify learning, not just attendance.</p>
        </div>
        {board && board.rows.length > 0 && (
          <button
            type="button"
            onClick={exportReport}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-600 transition"
          >
            <FileDown className="h-4 w-4" /> Export training report
          </button>
        )}
      </section>

      {/* Training selector */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        {loadingList ? (
          <p className="text-sm text-gray-400">Loading trainings…</p>
        ) : trainings.length === 0 ? (
          <EmptyState title="No trainings to evaluate" description="A training needs a finalized attendee roster before its learning can be evaluated." />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-gray-500">Training</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="min-w-[280px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {trainings.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {fmtDate(t.startDate)} · {t.attendeeCount} attendee{t.attendeeCount === 1 ? '' : 's'}
                </option>
              ))}
            </select>
            {board?.training.category && <CategoryTag category={board.training.category} />}
          </div>
        )}
      </section>

      {board && (
        <>
          {/* Aggregate cards */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <article className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Average improvement</p>
                  <p className={`mt-1 text-3xl font-bold ${deltaColor(aggregate.avg)}`}>
                    {aggregate.avg == null ? '—' : `${aggregate.avg > 0 ? '+' : ''}${aggregate.avg}`}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">pre → post, points</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><Award className="h-6 w-6" /></div>
              </div>
            </article>
            <article className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-sm font-medium text-gray-500">Attendees</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{aggregate.total}</p>
            </article>
            <article className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-sm font-medium text-gray-500">Complete</p>
              <p className="mt-1 text-3xl font-bold text-emerald-600">{aggregate.complete}</p>
            </article>
            <article className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-sm font-medium text-gray-500">Awaiting review</p>
              <p className="mt-1 text-3xl font-bold text-amber-600">{aggregate.awaitingReview}</p>
            </article>
          </section>

          {/* Attendee board */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 relative min-h-[200px]">
            {loadingBoard && <div className="absolute inset-0 z-10 rounded-2xl bg-white/50 backdrop-blur-[1px]" />}
            {board.rows.length === 0 ? (
              <EmptyState title="No attendees" description="This training has no active attendees on its roster." />
            ) : (
              <>
                <div className="grid grid-cols-12 items-center px-3 py-2.5 text-xs font-medium text-gray-500 border-b border-gray-100">
                  <div className="col-span-3">Attendee</div>
                  <div className="col-span-2">Assessment</div>
                  <div className="col-span-3">Pre / Post / Improvement</div>
                  <div className="col-span-2">Completion</div>
                  <div className="col-span-2">Output / review</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {board.rows.map((r) => {
                    const d = deltaOf(r);
                    const comp = completionOf(r);
                    const edit = edits[r.enrollmentId] ?? { pre: '', post: '' };
                    return (
                      <div key={r.enrollmentId} className="grid grid-cols-12 items-center px-3 py-3.5">
                        <div className="col-span-3 min-w-0 pr-2">
                          <p className="text-sm font-bold text-gray-900 truncate">{r.name}</p>
                          <p className="text-xs text-gray-500 truncate">{r.department}</p>
                        </div>
                        <div className="col-span-2 pr-2">
                          <select
                            value={r.mode}
                            onChange={(e) => void changeMode(r, e.target.value as AssessmentMode)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
                          >
                            <option value="test">Pre/Post test</option>
                            <option value="output">Output submission</option>
                          </select>
                        </div>
                        <div className="col-span-3">
                          {r.mode === 'test' ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number" min={0} max={100} placeholder="pre" className={inputClass}
                                value={edit.pre}
                                onChange={(e) => setEdits((p) => ({ ...p, [r.enrollmentId]: { ...edit, pre: e.target.value } }))}
                                onBlur={() => void commitScores(r)}
                              />
                              <span className="text-gray-300">→</span>
                              <input
                                type="number" min={0} max={100} placeholder="post" className={inputClass}
                                value={edit.post}
                                onChange={(e) => setEdits((p) => ({ ...p, [r.enrollmentId]: { ...edit, post: e.target.value } }))}
                                onBlur={() => void commitScores(r)}
                              />
                              <span className={`ml-1 text-sm font-bold ${deltaColor(d)}`}>{deltaLabel(d)}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Scored by output submission</span>
                          )}
                        </div>
                        <div className="col-span-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${COMPLETION_STYLE[comp]}`}>{comp}</span>
                        </div>
                        <div className="col-span-2">
                          {r.mode === 'output' ? (
                            <div className="flex flex-col items-start gap-1.5">
                              {r.submissionUrl ? (
                                <a href={r.submissionUrl} target="_blank" rel="noreferrer" className="max-w-full truncate text-xs font-medium text-blue-600 hover:underline">
                                  {r.submissionName ?? 'View submission'}
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  disabled={uploadingId === r.enrollmentId}
                                  onClick={() => fileInputs.current[r.enrollmentId]?.click()}
                                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-60"
                                >
                                  <Upload className="h-3.5 w-3.5" /> {uploadingId === r.enrollmentId ? 'Uploading…' : 'Upload'}
                                </button>
                              )}
                              <input
                                ref={(el) => { fileInputs.current[r.enrollmentId] = el; }}
                                type="file" className="hidden"
                                onChange={(e) => { void handleFile(r, e.target.files?.[0]); e.target.value = ''; }}
                              />
                              <select
                                value={r.reviewStatus}
                                onChange={(e) => void changeReview(r, e.target.value as ReviewStatus)}
                                className="rounded-md border border-gray-300 px-1.5 py-0.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
                              >
                                <option value="Pending">Pending</option>
                                <option value="Reviewed">Reviewed</option>
                                <option value="Verified">Verified</option>
                              </select>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* Report recommendations */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-700">Recommendations / notes for the after-training report</h2>
            </div>
            <textarea
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              onBlur={() => void commitReportNotes()}
              rows={4}
              placeholder="L&D's assessment of the training's effectiveness, follow-up actions, whether to run it again…"
              className="w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">Included in the exported training report. Saved when you click away.</p>
          </section>
        </>
      )}

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {notice}
        </div>
      )}
    </div>
  );
};

export default LndTrainingEvaluation;
