/**
 * L&D → IDP Form.
 *
 * Controls the one thing L&D decides about the Individual Development Plan:
 * when employees can fill it in. The questionnaire itself is built into the
 * employee portal (lib/idpQuestionnaire.ts) and is not editable here — it is
 * the printed CSC-style form, and its wording changes in a release, not from a
 * settings screen.
 *
 * The window is stored on idp_form_config, independently of the IPCR phase
 * scheduler: that belongs to Performance Management on a different cycle, and
 * an IPCR phase change has no business moving the IDP window.
 */

import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Save, Target, TriangleAlert, Users } from 'lucide-react';
import {
  EMPTY_IDP_CONFIG,
  effectiveIdpState,
  getIdpConfig,
  saveIdpConfig,
  type IdpFormConfig,
  type IdpMode,
} from '../../lib/api/idpSchedule';
import { cycleYearFor, listSubmissions, type IdpSubmission } from '../../lib/api/idpSubmissions';

const MODES: { id: IdpMode; label: string; hint: string }[] = [
  { id: 'Auto', label: 'Auto', hint: 'Open only between the dates below' },
  { id: 'Open', label: 'Open', hint: 'Always reachable, ignoring the dates' },
  { id: 'Closed', label: 'Closed', hint: 'Employees see it as closed' },
];

const labelCls = 'block text-xs font-bold text-[#040E6B] mb-1';
const inputCls =
  'w-full rounded-lg border border-[#C8D1FF] px-3 py-2 text-sm text-[#040E6B] outline-none focus:border-[#363EE8]';

export const LndIdpFormSettings = () => {
  const cycleYear = cycleYearFor();
  const [config, setConfig] = useState<IdpFormConfig>(EMPTY_IDP_CONFIG);
  const [submissions, setSubmissions] = useState<IdpSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [cfg, subs] = await Promise.all([getIdpConfig(), listSubmissions(cycleYear)]);
      if (cfg.ok === false) setError(cfg.error);
      else setConfig(cfg.data);
      if (subs.ok === true) setSubmissions(subs.data);
      setLoading(false);
    })();
  }, [cycleYear]);

  const set = <K extends keyof IdpFormConfig>(key: K, value: IdpFormConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(null);
  };

  const state = effectiveIdpState(config);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(null);
    const res = await saveIdpConfig(config, 'L&D Admin');
    setSaving(false);
    if (res.ok === false) {
      setError(res.error);
      return;
    }
    setConfig(res.data);
    setSaved('Saved. The employee portal picks this up immediately.');
  };

  if (loading) return <div className="p-8 text-sm text-slate-400">Loading…</div>;

  // Offices represented so far, most submissions first — enough to see uptake
  // without standing in for the full per-office report, which is still blocked
  // on how the form's options map onto its six categories.
  const byOffice = submissions.reduce<Record<string, number>>((acc, s) => {
    const key = s.office || 'Unspecified';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const officeRows = Object.entries(byOffice).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-5 flex items-center gap-2.5">
        <Target className="h-6 w-6 text-indigo-600" />
        <div>
          <h2 className="text-xl font-bold text-slate-900">IDP Form</h2>
          <p className="text-sm text-slate-500">
            Set when employees can fill in their {cycleYear} Individual Development Plan.
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {saved}
        </p>
      )}

      <div className="mb-5 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className={labelCls}>Instructions shown above the form</label>
          <textarea
            className={`${inputCls} min-h-[72px] resize-y`}
            value={config.instructions}
            onChange={(e) => set('instructions', e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Availability</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => set('mode', m.id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  config.mode === m.id ? 'border-[#363EE8] bg-[#363EE8]/5' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="block text-sm font-bold text-[#040E6B]">{m.label}</span>
                <span className="block text-[0.7rem] leading-tight text-slate-500">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {config.mode === 'Auto' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Opens on</label>
              <input
                type="date"
                className={inputCls}
                value={config.opensAt ?? ''}
                onChange={(e) => set('opensAt', e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelCls}>Closes on</label>
              <input
                type="date"
                className={inputCls}
                value={config.closesAt ?? ''}
                onChange={(e) => set('closesAt', e.target.value || null)}
              />
            </div>
            {(!config.opensAt || !config.closesAt) && (
              <p className="sm:col-span-2 inline-flex items-start gap-1.5 text-xs font-semibold text-amber-700">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Auto needs both dates. Until both are set the form stays closed, so a half-set
                window can&rsquo;t leave it collecting indefinitely.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <span className="inline-flex items-center gap-2 text-sm text-slate-600">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            Employees see it as
            <strong
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                state === 'Open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {state}
            </strong>
            right now
          </span>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#363EE8] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Uptake so far ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-400" />
          <h3 className="text-base font-bold text-slate-900">{cycleYear} submissions</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            {submissions.length}
          </span>
        </div>
        {officeRows.length === 0 ? (
          <p className="text-sm text-slate-400">No submissions yet for this cycle.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="pb-2">Office</th>
                <th className="pb-2 text-right">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {officeRows.map(([office, count]) => (
                <tr key={office} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-slate-700">{office}</td>
                  <td className="py-2 text-right font-semibold text-slate-900">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          The full per-office breakdown of development needs isn&rsquo;t built yet — the form&rsquo;s
          checkbox options don&rsquo;t line up with the six categories in the annual report, so the
          mapping needs confirming first.
        </p>
      </div>
    </div>
  );
};

export default LndIdpFormSettings;
