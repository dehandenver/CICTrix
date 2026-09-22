/**
 * L&D → IDP Form.
 *
 * Where Learning & Development points the employee portal at this cycle's
 * Individual Development Plan form and decides when employees can reach it.
 *
 * The form link is configuration, not code: each cycle tends to get a new
 * Google Form, and needing an engineer to swap a URL would make the schedule
 * useless. The window is stored on the same row and is independent of the IPCR
 * phase scheduler — see lib/api/idpSchedule.ts.
 */

import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, ExternalLink, Save, Target, TriangleAlert } from 'lucide-react';
import {
  EMPTY_IDP_CONFIG,
  effectiveIdpState,
  getIdpConfig,
  saveIdpConfig,
  toEmbeddableFormUrl,
  type IdpFormConfig,
  type IdpMode,
} from '../../lib/api/idpSchedule';

const MODES: { id: IdpMode; label: string; hint: string }[] = [
  { id: 'Auto', label: 'Auto', hint: 'Open only between the dates below' },
  { id: 'Open', label: 'Open', hint: 'Always reachable, ignoring the dates' },
  { id: 'Closed', label: 'Closed', hint: 'Hidden from employees' },
];

const labelCls = 'block text-xs font-bold text-[#040E6B] mb-1';
const inputCls =
  'w-full rounded-lg border border-[#C8D1FF] px-3 py-2 text-sm text-[#040E6B] outline-none focus:border-[#363EE8]';

export const LndIdpFormSettings = () => {
  const [config, setConfig] = useState<IdpFormConfig>(EMPTY_IDP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await getIdpConfig();
      if (res.ok === false) setError(res.error);
      else setConfig(res.data);
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof IdpFormConfig>(key: K, value: IdpFormConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(null);
  };

  const embedUrl = toEmbeddableFormUrl(config.formUrl);
  const formLinkInvalid = config.formUrl.trim().length > 0 && !embedUrl;
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

  if (loading) {
    return <div className="p-8 text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-5 flex items-center gap-2.5">
        <Target className="h-6 w-6 text-indigo-600" />
        <div>
          <h2 className="text-xl font-bold text-slate-900">IDP Form</h2>
          <p className="text-sm text-slate-500">
            Link this cycle&rsquo;s Individual Development Plan form and set when employees can fill it in.
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

      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className={labelCls}>Google Form link (shown to employees)</label>
          <input
            type="url"
            className={inputCls}
            placeholder="https://docs.google.com/forms/d/e/.../viewform"
            value={config.formUrl}
            onChange={(e) => set('formUrl', e.target.value)}
          />
          {formLinkInvalid ? (
            <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs font-semibold text-amber-700">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {/* A Drive folder link is the usual mistake here: it looks right,
                  and it embeds as a blank frame rather than failing loudly. */}
              That doesn&rsquo;t look like a Google Form. Use the form&rsquo;s own link — a
              docs.google.com/forms/… or forms.gle/… URL. A Drive folder link will render blank.
            </p>
          ) : embedUrl ? (
            <p className="mt-1.5 text-xs text-slate-500">
              Employees will see this embedded in their portal.{' '}
              <a
                href={config.formUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-indigo-600"
              >
                Preview <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          ) : null}
        </div>

        <div>
          <label className={labelCls}>Responses spreadsheet (for L&amp;D only)</label>
          <input
            type="url"
            className={inputCls}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={config.responsesUrl}
            onChange={(e) => set('responsesUrl', e.target.value)}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Never shown to employees. Kept here so the form and its responses stay together.
          </p>
        </div>

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
                  config.mode === m.id
                    ? 'border-[#363EE8] bg-[#363EE8]/5'
                    : 'border-slate-200 hover:border-slate-300'
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
                window can&rsquo;t leave it open indefinitely.
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
    </div>
  );
};

export default LndIdpFormSettings;
