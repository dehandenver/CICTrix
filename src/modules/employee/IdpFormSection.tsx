/**
 * Employee Portal — Individual Development Plan.
 *
 * Its own page rather than a card on another tab, because the form is long and
 * only reachable during a window Learning & Development schedules.
 *
 * The form link lives in idp_form_config, not in this file: L&D points a new
 * cycle at a new Google Form from their own screen, and a form link should not
 * need a redeploy. The window is scheduled on that same row, independently of
 * the IPCR phases — see lib/api/idpSchedule.ts for why the two are separate.
 */

import { useEffect, useState } from 'react';
import { CalendarClock, ExternalLink, Lock, Target, TriangleAlert } from 'lucide-react';
import {
  closedReason,
  effectiveIdpState,
  getIdpConfig,
  toEmbeddableFormUrl,
  EMPTY_IDP_CONFIG,
  type IdpFormConfig,
} from '../../lib/api/idpSchedule';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

export const IdpFormSection = () => {
  const [config, setConfig] = useState<IdpFormConfig>(EMPTY_IDP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getIdpConfig();
      if (cancelled) return;
      // `res.ok === false` rather than `!res.ok`: this project compiles with
      // strict off, where truthiness does not narrow a discriminated union but
      // an explicit literal comparison does. Same convention as the rest of the
      // portal's result handling.
      if (res.ok === false) {
        setLoadError(res.error);
        setLoading(false);
        return;
      }
      setConfig(res.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const state = effectiveIdpState(config);
  const embedUrl = toEmbeddableFormUrl(config.formUrl);
  const reason = closedReason(config);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2.5">
        <Target className="h-6 w-6 text-indigo-600" />
        <div>
          <h2 className="text-xl font-bold text-slate-900">Individual Development Plan</h2>
          <p className="text-sm text-slate-500">
            Set your development goals for this cycle with Learning &amp; Development.
          </p>
        </div>
      </div>

      {/* Window summary — shown whether open or closed so the dates are always
          visible, rather than only appearing once the form is unavailable. */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-slate-600">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            {config.mode === 'Auto'
              ? <>Open {fmtDate(config.opensAt)} &ndash; {fmtDate(config.closesAt)}</>
              : <>Schedule set to <strong className="font-semibold">{config.mode}</strong> by L&amp;D</>}
          </span>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              state === 'Open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
            }`}
          >
            {state}
          </span>
        </div>
        {config.instructions && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700">{config.instructions}</p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
          <TriangleAlert className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <p className="text-sm font-semibold text-red-700">Couldn&rsquo;t load the IDP schedule</p>
          <p className="mt-1 text-xs text-red-600">{loadError}</p>
        </div>
      ) : state === 'Closed' ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">The IDP form isn&rsquo;t open right now</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{reason}</p>
        </div>
      ) : !embedUrl ? (
        /* Open, but L&D has not set a usable form link. Saying so beats an empty
           frame the employee would read as the page being broken. */
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center">
          <TriangleAlert className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <p className="text-sm font-semibold text-amber-800">No form has been linked yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-amber-700">
            The IDP window is open, but Learning &amp; Development hasn&rsquo;t attached this
            cycle&rsquo;s form. Please check back shortly.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-xs font-semibold text-slate-500">IDP Form</span>
            {/* Escape hatch: embedded Google Forms can misbehave inside an
                iframe (sign-in prompts, file uploads), so always offer the
                real thing in a new tab. */}
            <a
              href={config.formUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Open in a new tab <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <iframe
            src={embedUrl}
            title="Individual Development Plan form"
            className="h-[70vh] w-full border-0"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
};

export default IdpFormSection;
