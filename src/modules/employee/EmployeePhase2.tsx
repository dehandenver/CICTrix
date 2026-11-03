/**
 * Employee Portal · Phase 2 (Accomplishments & Self-Ratings), per Success
 * Indicator, gated by the phase2_status lifecycle:
 *
 *   locked / not_started → ONLY the exact "finalized & locked" notice; NO form.
 *   open / in_progress    → editable per-indicator table (frozen SI text + an
 *                           achievement field + Q/E/T 1–5 + a per-row Average),
 *                           grouped Core/Strategic/Support like Phase 1.
 *   completed             → read-only submitted view (grayed), with the overall.
 *
 * Backed by loadEmployeeRatingSheet / saveEmployeeRatings (ipcrRatings.ts),
 * which unify on success_indicator_ratings (accomplishment + Q/E/T, rated_by).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, CheckCircle, Info, Loader2 } from 'lucide-react';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import {
  loadEmployeeRatingSheet,
  saveEmployeeRatings,
  type EmployeeRatingSheet,
  type Phase2Status,
} from '../../lib/api/ipcrRatings';
import { markEmployeeNotificationsRead } from '../../lib/api/employeeNotifications';
import { describeActionFailure } from '../../lib/friendlyErrors';
import { IPCR_LIMITS } from '../../lib/ipcrLimits';
import { CharacterCount } from '../../components/CharacterCount';
import { SkeletonList, useDelayedLoading } from '../../components/table-loading';
import { DEFAULT_RATING_SCALE, getRatingScale, type RatingScaleEntry } from '../../lib/api/ipcrRatingScale';
import './EmployeePhase2.css';

const LOCKED_NOTICE =
  'Notice: Your targets have been finalized and locked for this rating period. You will be able to encode your accomplishments and self-ratings for each Success Indicator here, but the submission opens during the rating period (about 4–5 months from now). We will notify you as soon as the IPCR self-rating submission is open.';

// Distinct meaning from LOCKED (window ended vs. not-yet-opened).
const CLOSED_NOTICE =
  'Notice: The self-rating period for this rating period has closed. Your saved accomplishments and self-ratings are shown below for your reference and can no longer be edited.';

const FUNCTION_GROUPS = [
  { key: 'core', label: 'Core Functions' },
  { key: 'strategic', label: 'Strategic Functions' },
  { key: 'support', label: 'Support Functions' },
] as const;

const LIKERT = [1, 2, 3, 4, 5];

/** Spec §G: what each rating means, shown while Phase 2 is being filled in. */
const ratingLabel = (scale: RatingScaleEntry[], value: number | null): RatingScaleEntry | null =>
  value == null ? null : (scale.find((s) => s.rating === value) ?? null);

type Entry = { accomplishment: string; remarks: string; quality: number | null; efficiency: number | null; timeliness: number | null };

const avgOf = (nums: Array<number | null>): number | null => {
  const f = nums.filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
  return f.length ? Number((f.reduce((a, b) => a + b, 0) / f.length).toFixed(2)) : null;
};

/** sessionStorage key for caching unsaved Phase 2 entries so they survive refresh. */
const draftCacheKey = (empId: string) => `cictrix_phase2_draft_${empId}`;

export const EmployeePhase2: React.FC<{
  employeeId: string | null;
  cycleId?: number | null;
  targetSettingId?: string | null;
  phaseOpen?: boolean;
}> = ({ employeeId, cycleId, targetSettingId, phaseOpen }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const showLoader = useDelayedLoading(loading);
  const [sheet, setSheet] = useState<EmployeeRatingSheet | null>(null);
  const [status, setStatus] = useState<Phase2Status>('locked');
  // The rating scale the employee is rating themselves against (§G). Starts
  // on the built-in wording so the legend is never briefly empty while the
  // configured scale loads.
  const [ratingScale, setRatingScale] = useState<RatingScaleEntry[]>(DEFAULT_RATING_SCALE);
  useEffect(() => {
    let cancelled = false;
    void getRatingScale().then((s) => { if (!cancelled) setRatingScale(s); });
    return () => { cancelled = true; };
  }, []);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState<'draft' | 'submit' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [hasNewerData, setHasNewerData] = useState(false);

  const isDirty = useMemo(() => {
    if (!sheet) return false;
    for (const m of sheet.mfos) {
      for (const si of m.indicators) {
        const e = entries[si.successIndicatorId];
        if (!e) continue;
        if (
          (e.accomplishment ?? '') !== (si.accomplishment ?? '') ||
          e.remarks !== si.remarks ||
          (e.quality ?? null) !== (si.quality ?? null) ||
          (e.efficiency ?? null) !== (si.efficiency ?? null) ||
          (e.timeliness ?? null) !== (si.timeliness ?? null)
        ) {
          return true;
        }
      }
    }
    return false;
  }, [sheet, entries]);

  const loadSheet = useCallback(async (isSilent = false) => {
    if (!employeeId) { setLoading(false); return; }
    if (!isSilent) {
      setLoading(true);
    }
    try {
      setLoadError(null);
      const res = await loadEmployeeRatingSheet(employeeId, cycleId, targetSettingId);
      if (res.ok === false) { setLoadError(res.error); return; }
      const s = res.data;
      setSheet(s);
      if (s) {
        setStatus(s.phase2Status);
        const init: Record<string, Entry> = {};
        for (const m of s.mfos) for (const si of m.indicators)
          init[si.successIndicatorId] = { accomplishment: si.accomplishment, remarks: si.remarks, quality: si.quality, efficiency: si.efficiency, timeliness: si.timeliness };

        // Restore any unsaved draft from sessionStorage so edits survive refresh.
        let merged = init;
        try {
          const cached = sessionStorage.getItem(draftCacheKey(employeeId));
          if (cached && s.phase2Status !== 'completed' && s.phase2Status !== 'closed') {
            const draft: Record<string, Entry> = JSON.parse(cached);
            // Only merge entries whose keys exist in the DB result (guards
            // against stale/orphaned keys from a previous rating period).
            let hasDiff = false;
            const result = { ...init };
            for (const id of Object.keys(init)) {
              if (draft[id]) {
                const db = init[id];
                const dr = draft[id];
                if (
                  (dr.accomplishment ?? '') !== (db.accomplishment ?? '') ||
                  (dr.remarks ?? '') !== (db.remarks ?? '') ||
                  (dr.quality ?? null) !== (db.quality ?? null) ||
                  (dr.efficiency ?? null) !== (db.efficiency ?? null) ||
                  (dr.timeliness ?? null) !== (db.timeliness ?? null)
                ) {
                  result[id] = dr;
                  hasDiff = true;
                }
              }
            }
            if (hasDiff) merged = result;
          }
        } catch { /* corrupt / unavailable cache — ignore */ }

        setEntries(merged);
      }
      // Opening Phase 2 clears the "self-rating opened" notification badge.
      void markEmployeeNotificationsRead(employeeId);
    } catch (err) {
      const described = describeActionFailure('load your rating sheet', err);
      setLoadError(`${described.message} ${described.nextStep}`);
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, [employeeId, cycleId, targetSettingId]);

  useEffect(() => {
    void loadSheet();
  }, [loadSheet]);

  // Debounce-save entries to sessionStorage so unsaved edits survive refresh.
  const cacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!employeeId || !sheet) return;
    if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current);
    cacheTimerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(draftCacheKey(employeeId), JSON.stringify(entries));
      } catch { /* storage full or unavailable */ }
    }, 800);
    return () => { if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current); };
  }, [entries, employeeId, sheet]);

  useRealtimeRefresh({
    channel: `employee-phase2-${employeeId || 'anon'}`,
    tables: ['target_settings', 'success_indicator_ratings', 'ipcr_workspace', 'phase_schedules'],
    onChange: useCallback(() => {
      if (isDirty) {
        setHasNewerData(true);
      } else {
        void loadSheet(true);
      }
    }, [isDirty, loadSheet]),
    enabled: !!employeeId,
  });

  const allIds = useMemo(
    () => (sheet ? sheet.mfos.flatMap((m) => m.indicators.map((si) => si.successIndicatorId)) : []),
    [sheet],
  );
  const isLocked = status === 'locked' || status === 'not_started';
  // A sheet the reviewer sent back stays open until the employee resubmits,
  // even after the rating window closes (same rule as a returned Phase 1).
  const isReturned = status === 'in_progress' && Boolean(sheet?.returnedAt);
  const windowClosed = phaseOpen === false && !isReturned;
  const readOnly = Boolean(loadError) || status === 'completed' || status === 'closed' || windowClosed;
  // Locked, open and in_progress can all be typed into (prepared). Only open /
  // in_progress can SUBMIT — submission is gated to the rating period.
  const editable = !readOnly;
  const canSubmit = !loadError && (status === 'open' || status === 'in_progress') && !windowClosed;
  const expectedOpen = sheet?.phase2OpenTargetDate
    ? new Date(sheet.phase2OpenTargetDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const groupAverages = useMemo(() => {
    const out: Record<string, number | null> = {};
    if (!sheet) return out;
    for (const g of FUNCTION_GROUPS) {
      const siAvgs: Array<number | null> = [];
      for (const m of sheet.mfos.filter((x) => x.functionType === g.key))
        for (const si of m.indicators) {
          const e = entries[si.successIndicatorId];
          siAvgs.push(e ? avgOf([e.quality, e.efficiency, e.timeliness]) : null);
        }
      out[g.key] = avgOf(siAvgs);
    }
    return out;
  }, [sheet, entries]);

  const overall = useMemo(() => avgOf(FUNCTION_GROUPS.map((g) => groupAverages[g.key] ?? null)), [groupAverages]);

  const isComplete =
    allIds.length > 0 &&
    allIds.every((id) => {
      const e = entries[id];
      return e && (e.quality != null || e.efficiency != null || e.timeliness != null);
    });

  const setField = (id: string, field: keyof Entry, value: string | number | null) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const persist = async (submit: boolean) => {
    if (!sheet) return;
    setSaving(true);
    setSavingAction(submit ? 'submit' : 'draft');
    setNotice(null);
    const res = await saveEmployeeRatings({
      targetSettingId: sheet.targetSettingId,
      employeeId: employeeId!,
      entries: allIds.map((id) => ({
        successIndicatorId: id,
        accomplishment: entries[id]?.accomplishment ?? '',
        remarks: entries[id]?.remarks ?? '',
        quality: entries[id]?.quality ?? null,
        efficiency: entries[id]?.efficiency ?? null,
        timeliness: entries[id]?.timeliness ?? null,
      })),
      submit,
    });
    setSaving(false);
    setSavingAction(null);
    if (res.ok === false) { setNotice({ tone: 'err', text: res.error }); return; }
    setStatus(res.data.phase2Status);
    setNotice({
      tone: 'ok',
      text: submit ? `Submitted. Overall rating: ${res.data.overallScore ?? '—'} (${res.data.adjectival ?? '—'}).` : 'Draft saved.',
    });
    setHasNewerData(false);
    // Clear the sessionStorage draft cache — data is now persisted in the DB.
    try { if (employeeId) sessionStorage.removeItem(draftCacheKey(employeeId)); } catch { /* ignore */ }
    void loadSheet(true);
  };

  if (loading || showLoader) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-busy="true">
        <SkeletonList show={showLoader} label="Loading your rating sheet…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="abyan-ds space-y-3 rounded-xl border p-6" role="alert" style={{ background: 'var(--bg-surface)', borderColor: 'var(--error-300)', color: 'var(--error-700)' }}>
        <p>Could not load your Phase 2 details: {loadError}</p>
        <button className="btn btn-sm btn-secondary" onClick={() => void loadSheet()}>Retry loading Phase 2</button>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500 shadow-sm" style={{ borderColor: '#C8D1FF' }}>
        You don’t have an approved (frozen) Phase 1 record yet for this period, so the self-rating module isn’t available.
      </div>
    );
  }

  // The form is always accessible (frozen targets + accomplishment + Q/E/T). The
  // gating is on the SUBMIT action + the locked/closed notices below.
  return (
    <div className="space-y-4">
      {hasNewerData && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs flex items-center justify-between">
          <span className="text-indigo-900 font-medium">Newer data is available on the server.</span>
          <button
            onClick={() => {
              setHasNewerData(false);
              void loadSheet(false);
            }}
            className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-indigo-700"
          >
            Refresh
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            {readOnly && <Lock className="h-4 w-4 text-slate-400" />}
            Accomplishments &amp; Self-Ratings
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {status === 'closed'
              ? 'The self-rating period has closed — your saved ratings are read-only.'
              : status === 'completed'
              ? 'Your self-ratings have been submitted and are locked.'
              : isLocked
              ? 'You can prepare your achievements and ratings now — submission opens during the rating period.'
              : 'For each Success Indicator, detail your achievement and rate Quality (Q), Efficiency (E) & Timeliness (T), 1–5. Averages compute automatically.'}
          </p>
        </div>
        <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">Overall</p>
          <p className="text-lg font-extrabold text-indigo-700 leading-none">{overall != null ? overall.toFixed(2) : '—'}</p>
        </div>
      </div>

      {notice && (
        <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
          {notice.text}
        </div>
      )}

      {isReturned && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-[11px] font-bold text-amber-900">Revision Requested by Supervisor{sheet?.reviewComment ? ':' : ''}</p>
              {sheet?.reviewComment ? (
                <p className="mt-0.5 text-[11px] font-semibold text-amber-800 italic">“{sheet.reviewComment}”</p>
              ) : (
                <p className="mt-0.5 text-[11px] font-semibold text-amber-800">Update your accomplishments and self-ratings, then submit them again.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {windowClosed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-[11px] font-semibold leading-relaxed text-amber-900 font-bold">
                ⚠️ Phase 2 (Accomplishment Rating) is not yet open. The PM Division will notify you when it opens.
              </p>
            </div>
          </div>
        </div>
      )}

      {phaseOpen !== false && isLocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-[11px] font-semibold leading-relaxed text-amber-900">{LOCKED_NOTICE}</p>
              {expectedOpen && (
                <p className="mt-1 text-[10px] font-medium text-amber-700">Expected to open around {expectedOpen}.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {phaseOpen !== false && status === 'closed' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[11px] font-semibold text-amber-800">{CLOSED_NOTICE}</p>
        </div>
      )}

      <div className="abyan-tokens abyan-table-wrap">
        <table className="abyan-table employee-phase2-table">
          <colgroup>
            <col className="employee-phase2-indicator-column" />
            <col />
            <col span={3} className="employee-phase2-rating-column" />
            <col className="employee-phase2-average-column" />
          </colgroup>
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] font-bold text-slate-600">
              <th className="border-b px-3 py-2" style={{ borderColor: '#C8D1FF' }}>Success Indicator (frozen)</th>
              <th className="border-b px-3 py-2" style={{ borderColor: '#C8D1FF' }}>Achievement</th>
              <th className="border-b px-2 py-2 text-center" style={{ borderColor: '#C8D1FF' }}>Q</th>
              <th className="border-b px-2 py-2 text-center" style={{ borderColor: '#C8D1FF' }}>E</th>
              <th className="border-b px-2 py-2 text-center" style={{ borderColor: '#C8D1FF' }}>T</th>
              <th className="border-b px-2 py-2 text-center" style={{ borderColor: '#C8D1FF' }}>A</th>
            </tr>
          </thead>
          <tbody>
            {FUNCTION_GROUPS.map((g) => {
              const mfos = sheet.mfos.filter((m) => m.functionType === g.key);
              if (mfos.length === 0) return null;
              return (
                <React.Fragment key={g.key}>
                  <tr className="bg-indigo-50/60">
                    <td colSpan={5} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-700">{g.label}</td>
                    <td className="px-2 py-1.5 text-center text-[11px] font-bold text-indigo-700">{groupAverages[g.key] != null ? groupAverages[g.key]!.toFixed(2) : '—'}</td>
                  </tr>
                  {mfos.map((m) => (
                    <React.Fragment key={m.id}>
                      <tr>
                        <td colSpan={6} className="bg-slate-50/70 px-3 py-1 text-[11px] font-semibold text-slate-600">{m.title || '(untitled MFO)'}</td>
                      </tr>
                      {m.indicators.map((si) => {
                        const e = entries[si.successIndicatorId] ?? { accomplishment: '', remarks: '', quality: null, efficiency: null, timeliness: null };
                        const a = avgOf([e.quality, e.efficiency, e.timeliness]);
                        return (
                          <tr key={si.successIndicatorId} className="align-top">
                            <td className="border-b px-3 py-2" style={{ borderColor: '#EEF0FD' }}>
                              <div className="rounded-md bg-slate-100 px-2 py-1.5 text-[11px] text-slate-500 shadow-inner">{si.description}</div>
                            </td>
                            <td className="border-b px-3 py-2" style={{ borderColor: '#EEF0FD' }}>
                              <textarea
                                aria-label={`Achievement for ${si.description}`}
                                value={e.accomplishment}
                                onChange={(ev) => setField(si.successIndicatorId, 'accomplishment', ev.target.value)}
                                disabled={!editable}
                                maxLength={IPCR_LIMITS.accomplishment}
                                placeholder="Detail your achievement matching this target..."
                                rows={4}
                                className="employee-phase2-achievement"
                              />
                              {editable && <CharacterCount value={e.accomplishment} max={IPCR_LIMITS.accomplishment} />}
                            </td>
                            {(['quality', 'efficiency', 'timeliness'] as const).map((dim) => (
                              <td key={dim} className="border-b px-1 py-2 text-center" style={{ borderColor: '#EEF0FD' }}>
                                <select
                                  value={e[dim] ?? ''}
                                  onChange={(ev) => setField(si.successIndicatorId, dim, ev.target.value === '' ? null : Number(ev.target.value))}
                                  disabled={!editable}
                                  style={{ borderColor: '#C8D1FF' }}
                                  className="w-14 rounded border px-1 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#363EE8] disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-default"
                                >
                                  <option value="">—</option>
                                  {LIKERT.map((n) => (<option key={n} value={n}>{n}</option>))}
                                </select>
                                {/* §G: the meaning of the value just chosen, against
                                    the field itself, so the scale does not have to be
                                    held in the head while filling the row in. */}
                                {(() => {
                                  const meaning = ratingLabel(ratingScale, e[dim]);
                                  return meaning ? (
                                    <div
                                      className="mt-1 text-[9px] leading-tight text-slate-500"
                                      title={meaning.description}
                                    >
                                      {meaning.label}
                                    </div>
                                  ) : null;
                                })()}
                              </td>
                            ))}
                            <td className="border-b px-2 py-2 text-center font-bold text-slate-700" style={{ borderColor: '#EEF0FD' }}>{a != null ? a.toFixed(2) : '—'}</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* §G: the scale itself, below the ratings. Employees should not have to
          guess what a rating means, and the wording is the PM Administrator's
          to set — this falls back to the built-in text if none is configured,
          because an empty legend reads as a fault rather than an explanation. */}
      <div className="mt-3 rounded-lg border px-3 py-2.5" style={{ borderColor: '#EEF0FD', background: '#F8FAFF' }}>
        <p className="!mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          What each rating means
        </p>
        <ul className="!mb-0 space-y-0.5">
          {ratingScale.map((r) => (
            <li key={r.rating} className="flex gap-2 text-[10px] leading-snug">
              <span className="shrink-0 font-bold tabular-nums text-slate-700">{r.rating}</span>
              <span className="shrink-0 font-semibold text-slate-700">{r.label}</span>
              <span className="text-slate-500">{r.description}</span>
            </li>
          ))}
        </ul>
      </div>

      {readOnly ? (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${status === 'closed' ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-emerald-100 bg-emerald-50 text-emerald-800'}`}>
          <CheckCircle className="h-4 w-4" />
          {status === 'closed'
            ? `Rating period closed — overall ${overall != null ? overall.toFixed(2) : '—'} from your saved ratings.`
            : status === 'completed'
            ? `Submitted — overall rating ${overall != null ? overall.toFixed(2) : '—'}.`
            : 'The rating window is closed. Your saved details are read-only.'}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-[10px] text-slate-400">
            <Info className="h-3 w-3" />
            {isLocked ? 'You can save a draft now; Submit opens during the rating period.' : 'Q = Quality · E = Efficiency · T = Timeliness · A = Average'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void persist(false)}
              disabled={saving}
              aria-busy={savingAction === 'draft' || undefined}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
            >
              {savingAction === 'draft' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Save Draft
            </button>
            <button
              onClick={() => void persist(true)}
              disabled={saving || !isComplete || !canSubmit}
              aria-busy={savingAction === 'submit' || undefined}
              title={!canSubmit ? 'Submission opens during the rating period.' : isComplete ? '' : 'Please rate at least one dimension (Q, E, or T) for each indicator.'}
              className="inline-flex items-center gap-1 rounded-lg bg-[#363EE8] hover:bg-[#2e35d4] text-white px-4 py-2 text-xs font-semibold shadow transition disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
              {savingAction === 'submit'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                : canSubmit ? <CheckCircle className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} Submit Self-Ratings
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
