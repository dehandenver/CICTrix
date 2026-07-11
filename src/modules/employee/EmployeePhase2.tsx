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
import React, { useEffect, useMemo, useState } from 'react';
import { Lock, CheckCircle, Loader2, Info } from 'lucide-react';
import {
  loadEmployeeRatingSheet,
  saveEmployeeRatings,
  type EmployeeRatingSheet,
  type Phase2Status,
} from '../../lib/api/ipcrRatings';
import { markEmployeeNotificationsRead } from '../../lib/api/employeeNotifications';

// Do NOT paraphrase — exact copy required by spec.
const LOCKED_NOTICE =
  'Notice: Your targets have been finalized and locked for this rating period. The Accomplishments & Self-Ratings module will be available after 4-5 months. We will notify you when the semester ends and the self-rating period opens.';

const FUNCTION_GROUPS = [
  { key: 'core', label: 'Core Functions' },
  { key: 'strategic', label: 'Strategic Functions' },
  { key: 'support', label: 'Support Functions' },
] as const;

const LIKERT = [1, 2, 3, 4, 5];

type Entry = { accomplishment: string; quality: number | null; efficiency: number | null; timeliness: number | null };

const avgOf = (nums: Array<number | null>): number | null => {
  const f = nums.filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
  return f.length ? Number((f.reduce((a, b) => a + b, 0) / f.length).toFixed(2)) : null;
};

export const EmployeePhase2: React.FC<{ employeeId: string | null }> = ({ employeeId }) => {
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<EmployeeRatingSheet | null>(null);
  const [status, setStatus] = useState<Phase2Status>('locked');
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!employeeId) { setLoading(false); return; }
      setLoading(true);
      const res = await loadEmployeeRatingSheet(employeeId);
      if (cancelled) return;
      setLoading(false);
      if (res.ok === false) { setNotice({ tone: 'err', text: res.error }); return; }
      const s = res.data;
      setSheet(s);
      if (s) {
        setStatus(s.phase2Status);
        const init: Record<string, Entry> = {};
        for (const m of s.mfos) for (const si of m.indicators)
          init[si.successIndicatorId] = { accomplishment: si.accomplishment, quality: si.quality, efficiency: si.efficiency, timeliness: si.timeliness };
        setEntries(init);
      }
      // Opening Phase 2 clears the "self-rating opened" notification badge.
      void markEmployeeNotificationsRead(employeeId);
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  const allIds = useMemo(
    () => (sheet ? sheet.mfos.flatMap((m) => m.indicators.map((si) => si.successIndicatorId)) : []),
    [sheet],
  );
  const editable = status === 'open' || status === 'in_progress';
  const readOnly = status === 'completed';

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
      return e && e.quality != null && e.efficiency != null && e.timeliness != null;
    });

  const setField = (id: string, field: keyof Entry, value: string | number | null) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const persist = async (submit: boolean) => {
    if (!sheet) return;
    setSaving(true);
    setNotice(null);
    const res = await saveEmployeeRatings({
      targetSettingId: sheet.targetSettingId,
      employeeId: employeeId!,
      entries: allIds.map((id) => ({
        successIndicatorId: id,
        accomplishment: entries[id]?.accomplishment ?? '',
        quality: entries[id]?.quality ?? null,
        efficiency: entries[id]?.efficiency ?? null,
        timeliness: entries[id]?.timeliness ?? null,
      })),
      submit,
    });
    setSaving(false);
    if (res.ok === false) { setNotice({ tone: 'err', text: res.error }); return; }
    setStatus(res.data.phase2Status);
    setNotice({
      tone: 'ok',
      text: submit ? `Submitted. Overall rating: ${res.data.overallScore ?? '—'} (${res.data.adjectival ?? '—'}).` : 'Draft saved.',
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (!sheet) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500 shadow-sm" style={{ borderColor: '#C8D1FF' }}>
        You don’t have an approved (frozen) Phase 1 record yet, so the self-rating module isn’t available.
      </div>
    );
  }

  // ── LOCKED: only the notice, no form fields at all ─────────────────────────
  if (status === 'locked' || status === 'not_started') {
    const expected = sheet.phase2OpenTargetDate
      ? new Date(sheet.phase2OpenTargetDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : null;
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold leading-relaxed text-amber-900">{LOCKED_NOTICE}</p>
            {expected && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Expected to open around {expected}.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── OPEN / IN_PROGRESS / COMPLETED: the per-indicator table ────────────────
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            {readOnly && <Lock className="h-4 w-4 text-slate-400" />}
            Accomplishments &amp; Self-Ratings
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {readOnly
              ? 'Your self-ratings have been submitted and are locked.'
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

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#C8D1FF' }}>
        <table className="w-full min-w-[820px] border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] font-bold text-slate-600">
              <th className="w-2/5 border-b px-3 py-2" style={{ borderColor: '#C8D1FF' }}>Success Indicator (frozen)</th>
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
                        const e = entries[si.successIndicatorId] ?? { accomplishment: '', quality: null, efficiency: null, timeliness: null };
                        const a = avgOf([e.quality, e.efficiency, e.timeliness]);
                        return (
                          <tr key={si.successIndicatorId} className="align-top">
                            <td className="border-b px-3 py-2" style={{ borderColor: '#EEF0FD' }}>
                              <div className="rounded-md bg-slate-100 px-2 py-1.5 text-[11px] text-slate-500 shadow-inner">{si.description}</div>
                            </td>
                            <td className="border-b px-3 py-2" style={{ borderColor: '#EEF0FD' }}>
                              <textarea
                                value={e.accomplishment}
                                onChange={(ev) => setField(si.successIndicatorId, 'accomplishment', ev.target.value)}
                                disabled={!editable}
                                placeholder="Detail your achievement matching this target..."
                                rows={2}
                                style={{ borderColor: '#C8D1FF' }}
                                className="w-full rounded-lg border px-2 py-1.5 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#363EE8] disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-default"
                              />
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

      {readOnly ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <CheckCircle className="h-4 w-4" /> Submitted — overall rating {overall != null ? overall.toFixed(2) : '—'}.
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-[10px] text-slate-400"><Info className="h-3 w-3" /> Q = Quality · E = Efficiency · T = Timeliness · A = Average</p>
          <div className="flex gap-2">
            <button onClick={() => void persist(false)} disabled={saving} className="rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 text-xs font-semibold transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button onClick={() => void persist(true)} disabled={saving || !isComplete} title={isComplete ? '' : 'Rate every indicator on Q, E and T first.'} className="inline-flex items-center gap-1 rounded-lg bg-[#363EE8] hover:bg-[#2e35d4] text-white px-4 py-2 text-xs font-semibold shadow transition disabled:bg-slate-400 disabled:cursor-not-allowed">
              <CheckCircle className="h-3.5 w-3.5" /> Submit Self-Ratings
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
