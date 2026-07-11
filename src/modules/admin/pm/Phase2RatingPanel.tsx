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
import React, { useEffect, useState } from 'react';
import { CheckCircle, Lock, Loader2, Star } from 'lucide-react';
import {
  listRatableTargets,
  loadRatingSheet,
  saveRatings,
  type RatableTarget,
  type RatingSheet,
} from '../../../lib/api/ipcrRatings';

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

export const Phase2RatingPanel: React.FC<{ currentEmployeeId: string | null }> = ({ currentEmployeeId }) => {
  const [targets, setTargets] = useState<RatableTarget[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [sheet, setSheet] = useState<RatingSheet | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [scores, setScores] = useState<Record<string, LocalScore>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const refreshList = async () => {
    setLoadingList(true);
    const res = await listRatableTargets();
    setLoadingList(false);
    if (res.ok === false) { setNotice({ tone: 'err', text: res.error }); return; }
    setTargets(res.data);
  };

  useEffect(() => { void refreshList(); }, []);

  const openSheet = async (t: RatableTarget) => {
    setNotice(null);
    setLoadingSheet(true);
    setSheet(null);
    const res = await loadRatingSheet(t.targetSettingId);
    setLoadingSheet(false);
    if (res.ok === false) { setNotice({ tone: 'err', text: res.error }); return; }
    setSheet(res.data);
    const initial: Record<string, LocalScore> = {};
    for (const m of res.data.mfos)
      for (const si of m.indicators)
        initial[si.successIndicatorId] = { quality: si.quality, efficiency: si.efficiency, timeliness: si.timeliness };
    setScores(initial);
  };

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
        ? `Rating completed. Overall: ${res.data.overallScore ?? '—'} (${res.data.adjectival ?? '—'}).`
        : 'Progress saved.',
    });
    setSheet({ ...sheet, phase2Status: res.data.phase2Status });
    void refreshList();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">Phase 2 · QET Rating (per Success Indicator)</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Score each Success Indicator of a frozen IPCR on Quality, Efficiency, and Timeliness (1–5). Save progress
          any time; complete once every indicator is fully scored.
        </p>
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
              targets.map((t) => {
                const chip = statusChip(t.phase2Status);
                const active = sheet?.targetSettingId === t.targetSettingId;
                return (
                  <button
                    key={t.targetSettingId}
                    onClick={() => void openSheet(t)}
                    className={`w-full px-3 py-2.5 text-left transition ${active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-800 truncate">{t.employeeName}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${chip.cls}`}>{chip.text}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">{[t.position, t.period].filter(Boolean).join(' · ')}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{t.ratedCount}/{t.indicatorCount} indicators scored</p>
                  </button>
                );
              })
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
