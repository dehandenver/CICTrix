/**
 * PM Admin → IPCR Rating Scale.
 *
 * Sets what each 1–5 rating means. The wording here is what employees read
 * beside the Quality / Efficiency / Timeliness fields while they complete
 * Phase 2, which is the whole point of specification §G: "employees should not
 * have to guess what a rating means".
 *
 * Built to the shape of OfficeWeightingPanel, like the eligibility points
 * screen, so the admin surfaces stay consistent.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import {
  DEFAULT_RATING_SCALE,
  listRatingScale,
  updateRatingScaleEntry,
  type RatingScaleEntry,
} from '../lib/api/ipcrRatingScale';

/** How long a "Saved" tick stays up before fading, in ms. */
const SAVED_FLASH_MS = 2000;

export const RatingScalePanel = () => {
  const [scale, setScale] = useState<RatingScaleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingRating, setSavingRating] = useState<number | null>(null);
  const [savedRating, setSavedRating] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listRatingScale();
    if (res.ok === false) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setScale(res.data);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (entry: RatingScaleEntry, patch: Partial<RatingScaleEntry>) => {
    const next = { ...entry, ...patch };
    setSavingRating(entry.rating);
    setError(null);
    const res = await updateRatingScaleEntry(next);
    setSavingRating(null);
    if (res.ok === false) {
      setError(res.error);
      return;
    }
    setScale((prev) => prev.map((r) => (r.rating === entry.rating ? res.data : r)));
    setSavedRating(entry.rating);
    window.setTimeout(() => setSavedRating((cur) => (cur === entry.rating ? null : cur)), SAVED_FLASH_MS);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs text-amber-800">
          This wording is what employees rate themselves against. Changing it does not change any rating
          already given — it changes what the numbers are understood to mean from now on.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading rating scale…</p>
      ) : scale.length === 0 ? (
        // Not an empty state to shrug at: the employee portal is falling back to
        // built-in wording right now, and nobody has agreed to it.
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
          <p className="!mb-2 font-semibold text-slate-700">No rating scale configured.</p>
          <p className="!mb-0">
            Employees currently see the built-in wording: {DEFAULT_RATING_SCALE.map((r) => `${r.rating} ${r.label}`).join(' · ')}.
            Run migration 20260930 to seed the scale, then edit it here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-12 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <div className="col-span-1">Rating</div>
            <div className="col-span-3">Label</div>
            <div className="col-span-8">Description shown to the employee</div>
          </div>
          <div className="divide-y divide-slate-100">
            {scale.map((r) => (
              <div key={r.rating} className="grid grid-cols-12 items-start gap-2 px-5 py-3.5">
                <div className="col-span-1 pt-1.5 text-sm font-bold tabular-nums text-slate-900">{r.rating}</div>
                <div className="col-span-3">
                  <input
                    defaultValue={r.label}
                    aria-label={`Label for rating ${r.rating}`}
                    disabled={savingRating === r.rating}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== r.label) void save(r, { label: e.target.value });
                    }}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
                <div className="col-span-8 flex items-start gap-2">
                  <textarea
                    defaultValue={r.description}
                    rows={2}
                    aria-label={`Description for rating ${r.rating}`}
                    disabled={savingRating === r.rating}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== r.description) void save(r, { description: e.target.value });
                    }}
                    className="w-full resize-none rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  />
                  {savingRating === r.rating && <span className="pt-1.5 text-xs text-slate-400">Saving…</span>}
                  {savedRating === r.rating && (
                    <span className="inline-flex items-center gap-1 pt-1.5 text-xs font-semibold text-emerald-600">
                      <Check className="h-3.5 w-3.5" /> Saved
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RatingScalePanel;
