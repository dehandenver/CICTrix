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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type BoardStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

export const LndTrainingEvaluation = () => {
  const [trainings, setTrainings] = useState<EvalTraining[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [boardStatus, setBoardStatus] = useState<BoardStatus>('idle');
  const [board, setBoard] = useState<EvalBoard | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [savingNotes, setSavingNotes] = useState(false);
  const [reportNotes, setReportNotes] = useState('');

  // Per-row score input overlay so typing doesn't fight number formatting.
  const [edits, setEdits] = useState<Record<string, { pre: string; post: string }>>({});
  const editsRef = useRef<Record<string, { pre: string; post: string }>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const listGenRef = useRef(0);
  const boardGenRef = useRef(0);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const boardRef = useRef<EvalBoard | null>(board);
  boardRef.current = board;
  const savingRowsRef = useRef<Record<string, boolean>>({});

  const setRowSaving = (enrollmentId: string, active: boolean) => {
    if (active) {
      savingRowsRef.current = { ...savingRowsRef.current, [enrollmentId]: true };
    } else {
      const next = { ...savingRowsRef.current };
      delete next[enrollmentId];
      savingRowsRef.current = next;
    }
    setSavingRows(savingRowsRef.current);
  };

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 4000);
  };

  const loadTrainings = useCallback(async () => {
    const gen = ++listGenRef.current;
    setLoadingList(true);
    setListError(null);
    try {
      const list = await listEvaluableTrainings();
      if (gen !== listGenRef.current) return;
      setTrainings(list);
      setSelectedId((cur) => {
        const next = cur && list.some((t) => t.id === cur) ? cur : (list[0]?.id ?? '');
        selectedIdRef.current = next;
        return next;
      });
    } catch (err) {
      if (gen !== listGenRef.current) return;
      setListError(err instanceof Error && err.message ? err.message : 'Could not load evaluable trainings.');
    } finally {
      if (gen === listGenRef.current) setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadTrainings();
    return () => {
      listGenRef.current += 1;
    };
  }, [loadTrainings]);

  const loadBoard = useCallback(async (sessionId: string, mode: 'initial' | 'refresh') => {
    const gen = ++boardGenRef.current;
    setLoadingBoard(true);
    if (mode === 'initial') {
      setBoardStatus('loading');
      setBoardError(null);
      setRefreshError(null);
      setConflictError(null);
    }
    try {
      const b = await getEvaluationBoard(sessionId);
      if (gen !== boardGenRef.current || selectedIdRef.current !== sessionId) return;
      if (b === null) {
        boardRef.current = null;
        editsRef.current = {};
        setBoard(null);
        setEdits({});
        setReportNotes('');
        setBoardStatus('missing');
        setBoardError(null);
        setRefreshError(null);
        setConflictError(null);
        return;
      }
      const nextEdits = Object.fromEntries(
        b.rows.map((r) => [r.enrollmentId, {
          pre: r.pre != null ? String(r.pre) : '',
          post: r.post != null ? String(r.post) : '',
        }]),
      );
      boardRef.current = b;
      editsRef.current = nextEdits;
      savingRowsRef.current = {};
      setSavingRows({});
      setUploadingId(null);
      setSavingNotes(false);
      setBoard(b);
      setReportNotes(b.reportNotes ?? '');
      setEdits(nextEdits);
      setBoardStatus('ready');
      setBoardError(null);
      setRefreshError(null);
      setConflictError(null);
    } catch (err) {
      if (gen !== boardGenRef.current || selectedIdRef.current !== sessionId) return;
      const msg = err instanceof Error && err.message ? err.message : 'Could not load evaluation board.';
      if (mode === 'refresh' && boardRef.current) {
        setRefreshError(msg);
      } else {
        boardRef.current = null;
        setBoard(null);
        setBoardStatus('error');
        setBoardError(msg);
      }
    } finally {
      if (gen === boardGenRef.current) setLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    boardGenRef.current += 1;
    boardRef.current = null;
    editsRef.current = {};
    savingRowsRef.current = {};
    setSavingRows({});
    setUploadingId(null);
    setSavingNotes(false);
    setBoard(null);
    setEdits({});
    setReportNotes('');
    setBoardError(null);
    setRefreshError(null);
    setConflictError(null);
    if (!selectedId) {
      setBoardStatus('idle');
      setLoadingBoard(false);
      return;
    }
    void loadBoard(selectedId, 'initial');
    return () => {
      boardGenRef.current += 1;
    };
  }, [selectedId, loadBoard]);

  const updateRow = (enrollmentId: string, patch: Partial<EvalRow>) => {
    const apply = (prev: EvalBoard | null) =>
      prev ? { ...prev, rows: prev.rows.map((r) => (r.enrollmentId === enrollmentId ? { ...r, ...patch } : r)) } : prev;
    boardRef.current = apply(boardRef.current);
    setBoard(apply);
  };

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

  const mutationsDisabled = boardStatus !== 'ready' || Boolean(refreshError);

  const setScoreDraft = (row: EvalRow, field: 'pre' | 'post', value: string) => {
    setEdits((p) => {
      const base = p[row.enrollmentId] ?? {
        pre: row.pre != null ? String(row.pre) : '',
        post: row.post != null ? String(row.post) : '',
      };
      const nextRow = { ...base, [field]: value };
      const next = { ...p, [row.enrollmentId]: nextRow };
      editsRef.current = next;
      return next;
    });
  };

  type RowMutationResult = {
    ok: boolean;
    error?: string;
    conflict?: boolean;
    partialFailure?: boolean;
    updatedAt?: string;
  };

  /** Guard per-row mutations against stale boards, refreshes, and session switches. */
  const runRowMutation = async <T extends RowMutationResult>(
    row: EvalRow,
    opts: {
      isUpload?: boolean;
      execute: (currentRow: EvalRow, sessionId: string) => Promise<T>;
      onSuccess: (res: T) => { patch: Partial<EvalRow>; notice?: string };
      errorMessage: (res: T) => string;
      conflictFallback?: string;
    },
  ) => {
    if (boardStatus !== 'ready' || refreshError || !boardRef.current) return;
    if (savingRowsRef.current[row.enrollmentId]) return;

    const gen = boardGenRef.current;
    const sessionId = selectedIdRef.current;
    const currentRow = boardRef.current.rows.find((x) => x.enrollmentId === row.enrollmentId) ?? row;

    setRowSaving(row.enrollmentId, true);
    if (opts.isUpload) setUploadingId(row.enrollmentId);
    try {
      const res = await opts.execute(currentRow, sessionId);
      if (gen !== boardGenRef.current || sessionId !== selectedIdRef.current) return;
      if (res.ok !== true) {
        if (res.conflict) {
          setConflictError(
            res.error || opts.conflictFallback || 'This evaluation changed concurrently. Refresh to see the latest record.',
          );
        } else {
          flash(opts.errorMessage(res));
        }
        return;
      }
      const { patch, notice: successNotice } = opts.onSuccess(res);
      updateRow(row.enrollmentId, {
        ...patch,
        ...(res.updatedAt !== undefined ? { updatedAt: res.updatedAt } : {}),
      });
      if (successNotice) flash(successNotice);
    } finally {
      if (gen === boardGenRef.current && sessionId === selectedIdRef.current) {
        setRowSaving(row.enrollmentId, false);
        if (opts.isUpload) setUploadingId(null);
      }
    }
  };

  const commitScores = async (row: EvalRow, field?: 'pre' | 'post') => {
    if (boardStatus !== 'ready' || refreshError) return;
    if (savingRowsRef.current[row.enrollmentId]) return;

    const currentRow = boardRef.current?.rows.find((x) => x.enrollmentId === row.enrollmentId) ?? row;
    const edit = editsRef.current[row.enrollmentId] ?? {
      pre: currentRow.pre != null ? String(currentRow.pre) : '',
      post: currentRow.post != null ? String(currentRow.post) : '',
    };

    const patch: Partial<{ pre: number | null; post: number | null }> = {};
    if (!field || field === 'pre') {
      const pre = parseScore(edit.pre);
      if (!pre.ok) { flash('Scores must be between 0 and 100.'); return; }
      if (pre.value !== currentRow.pre) patch.pre = pre.value;
    }
    if (!field || field === 'post') {
      const post = parseScore(edit.post);
      if (!post.ok) { flash('Scores must be between 0 and 100.'); return; }
      if (post.value !== currentRow.post) patch.post = post.value;
    }
    if (Object.keys(patch).length === 0) return;

    await runRowMutation(row, {
      execute: (cur) => saveScores(row.enrollmentId, patch, cur.updatedAt),
      onSuccess: () => ({ patch }),
      errorMessage: (res) => `Could not save scores: ${res.error}`,
    });
  };

  const changeMode = (row: EvalRow, mode: AssessmentMode) =>
    runRowMutation(row, {
      execute: (cur) => setAssessmentMode(row.enrollmentId, mode, cur.updatedAt),
      onSuccess: () => ({ patch: { mode } }),
      errorMessage: (res) => `Could not change mode: ${res.error}`,
    });

  const changeReview = (row: EvalRow, status: ReviewStatus) =>
    runRowMutation(row, {
      execute: (cur) => setReviewStatus(row.enrollmentId, status, cur.updatedAt),
      onSuccess: () => ({ patch: { reviewStatus: status } }),
      errorMessage: (res) => `Could not update review: ${res.error}`,
    });

  const handleFile = (row: EvalRow, file: File | undefined) => {
    if (!file) return Promise.resolve();
    return runRowMutation(row, {
      isUpload: true,
      execute: (cur, sessionId) => uploadOutput(sessionId, row.enrollmentId, file, cur.updatedAt),
      onSuccess: (res) => ({
        patch: {
          mode: 'output',
          submissionUrl: res.url ?? null,
          submissionName: res.name ?? file.name,
        },
        notice: `Uploaded “${file.name}”.`,
      }),
      errorMessage: (res) => (res.partialFailure ? (res.error || 'Partial upload failure.') : `Upload failed: ${res.error}`),
      conflictFallback: 'File uploaded, but updating the evaluation conflicted. Refresh before retrying.',
    });
  };

  const commitReportNotes = async () => {
    if (!boardRef.current || boardStatus !== 'ready' || refreshError || savingNotes) return;
    if (reportNotes === (boardRef.current.reportNotes ?? '')) return;
    const gen = boardGenRef.current;
    const sessionId = selectedIdRef.current;
    if (!sessionId) return;
    setSavingNotes(true);
    try {
      const res = await saveReportNotes(sessionId, reportNotes);
      if (gen !== boardGenRef.current || sessionId !== selectedIdRef.current) return;
      if (res.ok !== true) { flash(`Could not save recommendations: ${res.error}`); return; }
      const updateNotes = (prev: EvalBoard | null) => (prev && prev.training.id === sessionId ? { ...prev, reportNotes } : prev);
      boardRef.current = updateNotes(boardRef.current);
      setBoard(updateNotes);
    } finally {
      if (gen === boardGenRef.current && sessionId === selectedIdRef.current) {
        setSavingNotes(false);
      }
    }
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
    <div className="abyan-tokens space-y-6 p-8">
      {/* Header */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">
            <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Training Evaluation
          </p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Training Evaluation</h1>
          <p className="mt-1 text-sm text-gray-500">Pre-test / post-test results and output submissions — verify learning, not just attendance.</p>
        </div>
        {boardStatus === 'ready' && board && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadBoard(board.training.id, 'refresh')}
              disabled={loadingBoard}
              className="btn btn-sm btn-secondary"
            >
              {loadingBoard ? 'Refreshing…' : 'Refresh'}
            </button>
            {board.rows.length > 0 && (
              <button
                type="button"
                disabled={mutationsDisabled}
                onClick={exportReport}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileDown className="h-4 w-4" /> Export training report
              </button>
            )}
          </div>
        )}
      </section>

      {/* Training selector */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        {loadingList ? (
          <p className="text-sm text-gray-400">Loading trainings…</p>
        ) : listError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--error-300)] bg-[var(--error-100)] p-3 text-sm text-[var(--error-700)]"
          >
            <span>Could not load trainings: {listError}</span>
            <button type="button" onClick={() => void loadTrainings()} className="btn btn-sm btn-secondary">
              Retry
            </button>
          </div>
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

      {boardStatus === 'loading' && !board && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <p role="status" className="text-sm text-[var(--neutral-500)]">Loading evaluation board…</p>
        </section>
      )}

      {boardStatus === 'error' && boardError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--error-300)] bg-[var(--error-100)] p-4 text-sm text-[var(--error-700)]"
        >
          <span>Could not load evaluation board: {boardError}</span>
          <button
            type="button"
            onClick={() => selectedId && void loadBoard(selectedId, 'initial')}
            className="btn btn-sm btn-secondary"
          >
            Retry
          </button>
        </div>
      )}

      {boardStatus === 'missing' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <EmptyState title="Training not found" description="This training session is no longer available." />
        </section>
      )}

      {boardStatus === 'ready' && board && (
        <>
          {refreshError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--warning-300)] bg-[var(--warning-100)] p-3 text-sm text-[var(--warning-700)]"
            >
              <span>Showing stale evaluation data — refresh failed ({refreshError}). Editing and export are disabled until refreshed.</span>
              <button
                type="button"
                onClick={() => void loadBoard(board.training.id, 'refresh')}
                disabled={loadingBoard}
                className="btn btn-sm btn-secondary"
              >
                Retry refresh
              </button>
            </div>
          )}

          {conflictError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--warning-300)] bg-[var(--warning-100)] p-3 text-sm text-[var(--warning-700)]"
            >
              <span>{conflictError}</span>
              <button
                type="button"
                onClick={() => void loadBoard(board.training.id, 'refresh')}
                disabled={loadingBoard}
                className="btn btn-sm btn-secondary"
              >
                Refresh
              </button>
            </div>
          )}
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
                    const rowBusy = Boolean(savingRows[r.enrollmentId]);
                    const rowDisabled = mutationsDisabled || rowBusy;
                    return (
                      <div key={r.enrollmentId} className="grid grid-cols-12 items-center px-3 py-3.5">
                        <div className="col-span-3 min-w-0 pr-2">
                          <p className="text-sm font-bold text-gray-900 truncate">{r.name}</p>
                          <p className="text-xs text-gray-500 truncate">{r.department}</p>
                        </div>
                        <div className="col-span-2 pr-2">
                          <select
                            value={r.mode}
                            disabled={rowDisabled}
                            onChange={(e) => void changeMode(r, e.target.value as AssessmentMode)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
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
                                aria-label={`Pre-test score for ${r.name}`}
                                disabled={rowDisabled}
                                value={edit.pre}
                                onChange={(e) => setScoreDraft(r, 'pre', e.target.value)}
                                onBlur={() => void commitScores(r, 'pre')}
                              />
                              <span className="text-gray-300">→</span>
                              <input
                                type="number" min={0} max={100} placeholder="post" className={inputClass}
                                aria-label={`Post-test score for ${r.name}`}
                                disabled={rowDisabled}
                                value={edit.post}
                                onChange={(e) => setScoreDraft(r, 'post', e.target.value)}
                                onBlur={() => void commitScores(r, 'post')}
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
                                  disabled={rowDisabled || uploadingId === r.enrollmentId}
                                  onClick={() => fileInputs.current[r.enrollmentId]?.click()}
                                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-60"
                                >
                                  <Upload className="h-3.5 w-3.5" /> {uploadingId === r.enrollmentId ? 'Uploading…' : 'Upload'}
                                </button>
                              )}
                              <input
                                ref={(el) => { fileInputs.current[r.enrollmentId] = el; }}
                                type="file" className="hidden"
                                disabled={rowDisabled}
                                onChange={(e) => { void handleFile(r, e.target.files?.[0]); e.target.value = ''; }}
                              />
                              <select
                                value={r.reviewStatus}
                                disabled={rowDisabled}
                                onChange={(e) => void changeReview(r, e.target.value as ReviewStatus)}
                                className="rounded-md border border-gray-300 px-1.5 py-0.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
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
              disabled={mutationsDisabled || savingNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              onBlur={() => void commitReportNotes()}
              rows={4}
              placeholder="L&D's assessment of the training's effectiveness, follow-up actions, whether to run it again…"
              className="w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
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
