import { AlertTriangle, Check, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { POSITIONS } from '../../constants/positions';
import {
  analyzeCompetencies,
  deleteMatch,
  listFlaggedMatches,
  resolveMatch,
  type CompetencyMatchResponse,
  type CompetencyMatchRow,
} from '../../lib/api/competencyMatching';

/**
 * L&D — IPCR Competency Analysis.
 *
 * An HR admin pastes an employee's IPCR targets (one per line), and the
 * server-side Claude analysis maps each to the LGU's 12 canonical competencies
 * with a confidence score and justification. Matches are persisted to
 * ipcr_competency_matches; anything the model couldn't classify confidently is
 * flagged and shows up in the Review Queue below for human confirmation.
 */

const pct = (c: number) => `${Math.round(c * 100)}%`;

const confidencePill = (c: number) =>
  c >= 0.6
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-amber-100 text-amber-700';

export const LndCompetencyAnalysis = () => {
  const [position, setPosition] = useState('');
  const [ratingPeriod, setRatingPeriod] = useState('');
  const [targetsText, setTargetsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CompetencyMatchResponse | null>(null);

  const [queue, setQueue] = useState<CompetencyMatchRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const targets = useMemo(
    () => targetsText.split('\n').map(t => t.trim()).filter(Boolean),
    [targetsText]
  );

  const loadQueue = async () => {
    setQueueLoading(true);
    try {
      setQueue(await listFlaggedMatches());
    } catch (e) {
      console.error('Failed to load review queue:', e);
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  const runAnalysis = async () => {
    if (!position || targets.length === 0) return;
    setBusy(true);
    setError('');
    setResult(null);

    const res = await analyzeCompetencies({
      job_position: position,
      rating_period: ratingPeriod.trim() || null,
      targets,
    });

    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Analysis failed.');
      return;
    }
    setResult(res.data);
    // A run may have persisted new flagged rows — refresh the queue.
    void loadQueue();
  };

  const onResolve = async (id: string) => {
    setRowBusy(id);
    const res = await resolveMatch(id);
    setRowBusy(null);
    if (res.ok) setQueue(q => q.filter(r => r.id !== id));
  };

  const onDelete = async (id: string) => {
    setRowBusy(id);
    const res = await deleteMatch(id);
    setRowBusy(null);
    if (res.ok) setQueue(q => q.filter(r => r.id !== id));
  };

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&amp;D</span>
          <span className="mx-1 text-gray-400">/</span>
          <span>Competency Analysis</span>
        </p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">IPCR Competency Analysis</h1>
        <p className="mt-1 text-sm text-gray-500">
          Map an employee's IPCR targets to the organization's 12 competencies, weighing their
          position. Low-confidence or ambiguous matches are flagged for review.
        </p>
      </section>

      {/* Analyzer */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-700">
              Job Position <span className="text-red-500">*</span>
            </label>
            <input
              list="lnd-ca-positions"
              value={position}
              onChange={e => setPosition(e.target.value)}
              placeholder="e.g. Budget Officer II"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <datalist id="lnd-ca-positions">
              {POSITIONS.map(p => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-700">
              Rating Period
            </label>
            <input
              value={ratingPeriod}
              onChange={e => setRatingPeriod(e.target.value)}
              placeholder="e.g. Jan–Jun 2026 (optional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-semibold text-gray-700">
            IPCR Targets / Success Indicators <span className="text-red-500">*</span>
            <span className="ml-1 font-normal text-gray-400">— one per line</span>
          </label>
          <textarea
            value={targetsText}
            onChange={e => setTargetsText(e.target.value)}
            rows={6}
            placeholder={
              'Prepared and submitted the FY Annual Budget proposal within the CSC deadline…\nConducted quarterly barangay consultations on proposed ordinances…'
            }
            className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            {targets.length} target{targets.length !== 1 ? 's' : ''} detected
          </p>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={runAnalysis}
            disabled={busy || !position || targets.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? 'Analyzing…' : 'Analyze targets'}
          </button>
          {result && (
            <span className="text-xs text-gray-400">
              {result.model} · prompt {result.prompt_version} · {result.persisted} row
              {result.persisted !== 1 ? 's' : ''} recorded
            </span>
          )}
        </div>
      </section>

      {/* Results */}
      {result && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Results</h2>
          {result.results.map((r, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-gray-800">{r.target_text}</p>
                {r.flag_for_review && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> Review
                  </span>
                )}
              </div>
              {r.matched_competencies.length === 0 ? (
                <p className="mt-2 text-xs italic text-gray-400">
                  No competency matched this target.
                </p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {r.matched_competencies.map(m => (
                    <div
                      key={m.competency}
                      className="flex items-start justify-between gap-2 rounded-md bg-gray-50 px-2.5 py-1.5"
                    >
                      <span className="min-w-0">
                        <span className="text-xs font-semibold text-gray-800">{m.competency}</span>
                        <span className="mt-0.5 block text-[11px] text-gray-500">
                          {m.justification}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${confidencePill(
                          m.confidence
                        )}`}
                      >
                        {pct(m.confidence)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Review queue */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Review Queue{' '}
            {!queueLoading && queue.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                {queue.length}
              </span>
            )}
          </h2>
        </div>

        {queueLoading ? (
          <p className="px-1 text-sm text-gray-400">Loading…</p>
        ) : queue.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-10">
            <EmptyState
              title="Nothing to review"
              description="Flagged competency matches will appear here for confirmation."
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {queue.map(row => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{row.target_text}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {row.employee_position}
                    {row.rating_period ? ` · ${row.rating_period}` : ''}
                    {' · '}
                    {row.competency ? (
                      <span className="font-semibold text-gray-700">
                        {row.competency}
                        {row.confidence !== null ? ` (${pct(row.confidence)})` : ''}
                      </span>
                    ) : (
                      <span className="italic text-gray-400">no competency matched</span>
                    )}
                  </p>
                  {row.justification && (
                    <p className="mt-0.5 text-[11px] text-gray-400">{row.justification}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onResolve(row.id)}
                    disabled={rowBusy === row.id}
                    title="Confirm this match (clear flag)"
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {rowBusy === row.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(row.id)}
                    disabled={rowBusy === row.id}
                    title="Discard this match"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
