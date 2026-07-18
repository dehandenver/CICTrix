/**
 * Phase 2 · Per-Success-Indicator QET rating panel (Office Account Console).
 *
 * Lists every APPROVED / frozen Phase 1 record and lets the rater score each
 * Success Indicator on Quality / Efficiency / Timeliness (1–5). The frozen MFO +
 * Success Indicator text is shown read-only as context. Supports partial saves
 * (in_progress) and completion, and blocks a rater from scoring their own IPCR.
 *
 * Backed by src/lib/api/ipcrRatings.ts.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Lock, Loader2, Star, ChevronDown } from 'lucide-react';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh';
import { type OfficeScope } from '../../../lib/api/officeScope';
import {
  listRatableTargets,
  loadRatingSheet,
  saveRatings,
  openSelfRatingPeriod,
  closeSelfRatingPeriod,
  type RatableTarget,
  type RatingSheet,
} from '../../../lib/api/ipcrRatings';
import { createNotifications } from '../../../lib/api/employeeNotifications';

const FUNCTION_LABEL: Record<string, string> = {
  core: 'Core Functions',
  strategic: 'Strategic Functions',
  support: 'Support Functions',
};

const DIMENSIONS = [
  { key: 'quality', label: 'Q', full: 'Quality' },
  { key: 'efficiency', label: 'E', full: 'Efficiency' },
  { key: 'timeliness', label: 'T', full: 'Timeliness' },
] as const;

type LocalScore = { quality: number | null; efficiency: number | null; timeliness: number | null };

const statusChip = (s: string) => {
  const map: Record<string, string> = {
    not_started: 'bg-slate-100 text-slate-600',
    in_progress: 'bg-amber-50 text-amber-800',
    completed: 'bg-emerald-50 text-emerald-800',
  };
  const label: Record<string, string> = {
    not_started: 'Not started',
    in_progress: 'In progress',
    completed: 'Completed',
  };
  return { cls: map[s] ?? map.not_started, text: label[s] ?? s };
};
export const Phase2RatingPanel: React.FC<{
  currentEmployeeId: string | null;
  officeScope?: OfficeScope | null;
}> = ({ currentEmployeeId, officeScope }) => {
  const [targets, setTargets] = useState<RatableTarget[]>([]);
  const [collapsedPositions, setCollapsedPositions] = useState<Set<string>>(new Set());

  const togglePositionCollapse = (pos: string) => {
    setCollapsedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) {
        next.delete(pos);
      } else {
        next.add(pos);
      }
      return next;
    });
  };

  const groupedTargets = useMemo(() => {
    const groups: Record<string, RatableTarget[]> = {};
    for (const t of targets) {
      const pos = t.position || 'Other Positions';
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(t);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Other Positions') return 1;
      if (b === 'Other Positions') return -1;
      return a.localeCompare(b);
    });
  }, [targets]);

  const [loadingList, setLoadingList] = useState(false);
  const [sheet, setSheet] = useState<RatingSheet | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [scores, setScores] = useState<Record<string, LocalScore>>({});
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [hasNewerData, setHasNewerData] = useState(false);

  // Keep the currently-selected target's group auto-expanded
  useEffect(() => {
    if (sheet?.targetSettingId) {
      const currentTarget = targets.find(t => t.targetSettingId === sheet.targetSettingId);
      if (currentTarget) {
        const pos = currentTarget.position || 'Other Positions';
        if (collapsedPositions.has(pos)) {
          setCollapsedPositions((prev) => {
            const next = new Set(prev);
            next.delete(pos);
            return next;
          });
        }
      }
    }
  }, [sheet?.targetSettingId, targets]);

  const isDirty = useMemo(() => {
    if (!sheet) return false;
    for (const m of sheet.mfos) {
      for (const si of m.indicators) {
        const s = scores[si.successIndicatorId];
        if (!s) continue;
        if (
          (s.quality ?? null) !== (si.quality ?? null) ||
          (s.efficiency ?? null) !== (si.efficiency ?? null) ||
          (s.timeliness ?? null) !== (si.timeliness ?? null)
        ) {
          return true;
        }
      }
    }
    return false;
  }, [sheet, scores]);

  const refreshList = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingList(true);
    const res = await listRatableTargets(officeScope);
    if (!isSilent) setLoadingList(false);
    if (res.ok === false) { setNotice({ tone: 'err', text: res.error }); return; }
    setTargets(res.data);
  }, [officeScope]);

  useEffect(() => { void refreshList(); }, [refreshList]);

  const loadCurrentSheet = useCallback(async (targetSettingId: string, isSilent = false) => {
    if (!isSilent) setLoadingSheet(true);
    const res = await loadRatingSheet(targetSettingId);
    if (!isSilent) setLoadingSheet(false);
    if (res.ok === false) { setNotice({ tone: 'err', text: res.error }); return; }
    setSheet(res.data);
    const initial: Record<string, LocalScore> = {};
    for (const m of res.data.mfos)
      for (const si of m.indicators)
        initial[si.successIndicatorId] = { quality: si.quality, efficiency: si.efficiency, timeliness: si.timeliness };
    setScores(initial);
  }, []);

  const openSheet = async (t: RatableTarget) => {
    setNotice(null);
    setHasNewerData(false);
    setSheet(null);
    void loadCurrentSheet(t.targetSettingId, false);
  };

  useRealtimeRefresh({
    channel: 'pm-phase2-rating-panel',
    tables: ['target_settings', 'success_indicator_ratings', 'ipcr_workspace'],
    onChange: useCallback(() => {
      void refreshList(true);
      if (sheet) {
        if (isDirty) {
          setHasNewerData(true);
        } else {
          void loadCurrentSheet(sheet.targetSettingId, true);
        }
      }
    }, [isDirty, refreshList, sheet, loadCurrentSheet]),
  });

  const isOwn = !!sheet && !!currentEmployeeId && sheet.employeeId === currentEmployeeId;

  const allIndicatorIds = sheet ? sheet.mfos.flatMap((m) => m.indicators.map((si) => si.successIndicatorId)) : [];
  const isComplete =
    allIndicatorIds.length > 0 &&
    allIndicatorIds.every((id) => {
      const s = scores[id];
      return s && s.quality != null && s.efficiency != null && s.timeliness != null;
    });

  const setScore = (siId: string, dim: keyof LocalScore, value: number | null) =>
    setScores((prev) => ({ ...prev, [siId]: { ...prev[siId], [dim]: value } }));

  const persist = async (complete: boolean) => {
    if (!sheet) return;
    setSaving(true);
    setNotice(null);
    const res = await saveRatings({
      targetSettingId: sheet.targetSettingId,
      raterEmployeeId: currentEmployeeId,
      ratings: allIndicatorIds.map((id) => ({
        successIndicatorId: id,
        quality: scores[id]?.quality ?? null,
        efficiency: scores[id]?.efficiency ?? null,
        timeliness: scores[id]?.timeliness ?? null,
      })),
      complete,
    });
    setSaving(false);
    if (res.ok === false) { setNotice({ tone: 'err', text: res.error }); return; }
    setNotice({
      tone: 'ok',
      text: complete
        ? `Rating completed and forwarded to PM Division. Overall: ${res.data.overallScore ?? '—'} (${res.data.adjectival ?? '—'}).`
        : 'Progress saved.',
    });
    setSheet({ ...sheet, phase2Status: res.data.phase2Status });
    setHasNewerData(false);
    void loadCurrentSheet(sheet.targetSettingId, true);
    void refreshList();
  };

  const openWindow = async () => {
    if (!window.confirm('Open the self-rating period for ALL employees with locked, approved IPCRs? They will be notified and able to submit their Phase 2 self-ratings.')) return;
    setOpening(true);
    setNotice(null);
    const res = await openSelfRatingPeriod({ openedBy: currentEmployeeId ?? 'office_account' });
    if (res.ok === false) { setOpening(false); setNotice({ tone: 'err', text: res.error }); return; }
    const ids = res.data.employeeIds;
    if (ids.length) {
      await createNotifications(ids.map((id) => ({
        employeeId: id,
        type: 'phase2_open',
        title: 'Self-rating period is now open',
        message: 'The Accomplishments & Self-Ratings module is now available. Please encode your achievements and self-ratings for this rating period.',
        link: '/employee/ipcr-workspace',
      })));
    }
    setOpening(false);
    setNotice({ tone: 'ok', text: ids.length ? `Self-rating period opened for ${ids.length} employee(s); notifications sent.` : 'No locked records to open (all already open or submitted).' });
    void refreshList();
  };

  const closeWindow = async () => {
    if (!window.confirm('Close the self-rating period? Employees with open/in-progress ratings will switch to a read-only view of what they saved (unsubmitted work is preserved). They will be notified.')) return;
    setClosing(true);
    setNotice(null);
    const res = await closeSelfRatingPeriod({ closedBy: currentEmployeeId ?? 'office_account' });
    if (res.ok === false) { setClosing(false); setNotice({ tone: 'err', text: res.error }); return; }
    const ids = res.data.employeeIds;
    if (ids.length) {
      await createNotifications(ids.map((id) => ({
        employeeId: id,
        type: 'phase2_closed',
        title: 'Self-rating period has closed',
        message: 'The Accomplishments & Self-Ratings window has closed. Your saved ratings are now read-only for this rating period.',
        link: '/employee/ipcr-workspace',
      })));
    }
    setClosing(false);
    setNotice({ tone: 'ok', text: ids.length ? `Self-rating period closed for ${ids.length} employee(s); notifications sent.` : 'No open records to close.' });
    void refreshList();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Phase 2 · QET Rating (per Success Indicator)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Score each Success Indicator of a frozen IPCR on Quality, Efficiency, and Timeliness (1–5). Save progress
            any time; complete once every indicator is fully scored.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => void openWindow()}
            disabled={opening || closing}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-semibold text-white shadow disabled:opacity-50"
          >
            {opening ? 'Opening…' : 'Open Rating Period'}
          </button>
          <button
            onClick={() => void closeWindow()}
            disabled={opening || closing}
            className="rounded-lg border border-amber-300 bg-white hover:bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50"
          >
            {closing ? 'Closing…' : 'Close Rating Period'}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Record list */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-bold text-slate-700">Frozen IPCRs</span>
            <button onClick={() => void refreshList()} className="text-[11px] font-semibold text-indigo-600 hover:underline">Refresh</button>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
            {loadingList ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">Loading…</p>
            ) : targets.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-400">No approved IPCRs to rate yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {groupedTargets.map(([pos, items]) => {
                  const isCollapsed = collapsedPositions.has(pos);
                  return (
                    <div key={pos} className="bg-white">
                      <button
                        type="button"
                        onClick={() => togglePositionCollapse(pos)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left bg-slate-50/50 hover:bg-slate-50/80 transition"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[11px] font-bold text-slate-700 truncate tracking-tight">{pos}</span>
                          <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                            {items.length}
                          </span>
                        </div>
                        <ChevronDown
                          size={12}
                          className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                            isCollapsed ? '-rotate-90' : ''
                          }`}
                        />
                      </button>

                      {!isCollapsed && (
                        <div className="divide-y divide-slate-100">
                          {items.map((t) => {
                            const chip = statusChip(t.phase2Status);
                            const active = sheet?.targetSettingId === t.targetSettingId;
                            const progressPercent = t.indicatorCount > 0
                              ? Math.round((t.ratedCount / t.indicatorCount) * 100)
                              : 0;
                            return (
                              <button
                                key={t.targetSettingId}
                                onClick={() => void openSheet(t)}
                                className={`w-full px-3 py-2.5 text-left transition ${
                                  active ? 'bg-indigo-50/85' : 'hover:bg-slate-50/50'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <p className="text-xs font-bold text-slate-800 truncate">{t.employeeName}</p>
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${chip.cls}`}>{chip.text}</span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 truncate">{t.period}</p>
                                
                                <div className="mt-2 space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-slate-400">
                                    <span>Progress</span>
                                    <span>{t.ratedCount}/{t.indicatorCount} ({progressPercent}%)</span>
                                  </div>
                                  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-indigo-600 transition-all duration-300"
                                      style={{ width: `${progressPercent}%` }}
                                    />
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Rating sheet */}
        <div className="rounded-xl border border-slate-200 bg-white min-h-[520px]">
          {loadingSheet ? (
            <div className="flex h-full items-center justify-center py-20 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !sheet ? (
            <div className="flex h-full flex-col items-center justify-center py-20 text-center text-slate-400">
              <Star className="h-8 w-8 mb-2 text-slate-300" />
              <p className="text-xs font-semibold">Select a frozen IPCR to begin rating.</p>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">{sheet.employeeName}</p>
                  <p className="text-[11px] text-slate-500">{sheet.period}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusChip(sheet.phase2Status).cls}`}>{statusChip(sheet.phase2Status).text}</span>
              </div>

              {hasNewerData && (
                <div className="m-4 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs">
                  <span className="text-indigo-900 font-medium">Newer data is available on the server.</span>
                  <button
                    onClick={() => {
                      setHasNewerData(false);
                      void loadCurrentSheet(sheet.targetSettingId, false);
                    }}
                    className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-indigo-700"
                  >
                    Refresh
                  </button>
                </div>
              )}

              {isOwn ? (
                <div className="m-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <Lock className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <p className="text-[11px] font-semibold text-amber-800">This is your own IPCR. It must be rated by another Office Account, not by you.</p>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                    {(['core', 'strategic', 'support'] as const).map((ft) => {
                      const group = sheet.mfos.filter((m) => m.functionType === ft);
                      if (group.length === 0) return null;
                      return (
                        <div key={ft}>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">{FUNCTION_LABEL[ft]}</p>
                          <div className="mt-1.5 space-y-2">
                            {group.map((m) => (
                              <div key={m.id} className="rounded-lg border border-slate-150 bg-slate-50/50 p-3">
                                <p className="text-xs font-bold text-slate-800">{m.title || '(untitled MFO)'}</p>
                                <div className="mt-2 space-y-2">
                                  {m.indicators.map((si) => (
                                    <div key={si.successIndicatorId} className="rounded-md bg-white border border-slate-150 px-3 py-2">
                                      <p className="text-[11px] text-slate-700">{si.description}</p>
                                      <div className="mt-2 flex flex-wrap gap-3">
                                        {DIMENSIONS.map((d) => (
                                          <label key={d.key} className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-bold text-slate-500" title={d.full}>{d.label}</span>
                                            <select
                                              value={scores[si.successIndicatorId]?.[d.key] ?? ''}
                                              onChange={(e) => setScore(si.successIndicatorId, d.key, e.target.value === '' ? null : Number(e.target.value))}
                                              className="rounded border border-slate-300 px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            >
                                              <option value="">—</option>
                                              {[1, 2, 3, 4, 5].map((n) => (<option key={n} value={n}>{n}</option>))}
                                            </select>
                                          </label>
                                        ))}
                                        {si.overriddenByOffice && (
                                          <span className="text-[9px] font-bold text-indigo-600 self-center">edited by office</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
                    <p className="text-[10px] text-slate-400">Q = Quality · E = Efficiency · T = Timeliness (1–5)</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void persist(false)}
                        disabled={saving}
                        className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save Progress'}
                      </button>
                      <button
                        onClick={() => void persist(true)}
                        disabled={saving || !isComplete}
                        title={isComplete ? '' : 'Score every indicator on all three dimensions first.'}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Complete Rating
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
