/**
 * PM Admin → IPCR office weighting.
 *
 * Sets which Core / Strategic / Support split each office's ratings are computed
 * with. Changing a split re-weights every rating in that office, so this writes
 * through the backend (which holds the service key and checks the caller's role)
 * rather than straight to Supabase — a direct write is rejected by Postgres.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Check, Scale } from 'lucide-react';
import {
  describeSplit,
  listWeightingConfigs,
  listWeightingOptions,
  setWeightingConfig,
  type WeightingConfig,
  type WeightingOption,
} from '../../../lib/api/officeWeighting';

export const OfficeWeightingPanel = () => {
  const [options, setOptions] = useState<WeightingOption[]>([]);
  const [configs, setConfigs] = useState<WeightingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [opt, cfg] = await Promise.all([listWeightingOptions(), listWeightingConfigs()]);
    if (!opt.ok || !cfg.ok) {
      setError(opt.error || cfg.error || 'Failed to load weighting configuration.');
      setLoading(false);
      return;
    }
    setOptions(opt.data ?? []);
    setConfigs(cfg.data ?? []);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const optionByCode = useMemo(
    () => new Map((options ?? []).map((o) => [o.code, o])),
    [options]
  );

  const handleChange = async (officeId: string, code: 'A' | 'B' | 'C') => {
    setSavingId(officeId);
    setError(null);
    const res = await setWeightingConfig(officeId, code);
    setSavingId(null);
    if (!res.ok) {
      setError(res.error ?? 'Failed to update weighting.');
      return;
    }
    setConfigs((prev) => prev.map((c) => (c.department_id === officeId ? { ...c, ...res.data } : c)));
    setSavedId(officeId);
    window.setTimeout(() => setSavedId((id) => (id === officeId ? null : id)), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <Scale className="h-6 w-6 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold text-slate-900">IPCR Weighting</h2>
          <p className="text-sm text-slate-500">
            How Core, Strategic and Support ratings combine into an overall score, per office
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs text-amber-800">
          Changing an office's split re-weights every rating in that office. Previous configurations are
          kept, so a cycle that was already rated keeps the weights it was rated under.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading weighting configuration…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-12 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <div className="col-span-4">Office</div>
            <div className="col-span-4">Current split</div>
            <div className="col-span-4">Weighting option</div>
          </div>
          <div className="divide-y divide-slate-100">
            {configs.map((c) => (
              <div key={c.department_id} className="grid grid-cols-12 items-center px-5 py-3.5">
                <div className="col-span-4 flex min-w-0 items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate text-sm font-semibold text-slate-900">
                    {c.department_name ?? '—'}
                  </span>
                </div>
                <div className="col-span-4">
                  <span className={`text-sm ${c.code ? 'text-slate-600' : 'text-slate-400 italic'}`}>
                    {describeSplit(c)}
                  </span>
                  {c.code && <span className="ml-2 text-xs font-bold text-slate-400">Option {c.code}</span>}
                </div>
                <div className="col-span-4 flex items-center gap-2">
                  <select
                    value={c.code ?? ''}
                    disabled={savingId === c.department_id}
                    onChange={(e) => void handleChange(c.department_id, e.target.value as 'A' | 'B' | 'C')}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="" disabled>Select…</option>
                    {(options ?? []).map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.code} — {describeSplit(optionByCode.get(o.code) ?? o)}
                      </option>
                    ))}
                  </select>
                  {savingId === c.department_id && <span className="text-xs text-slate-400">Saving…</span>}
                  {savedId === c.department_id && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
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

export default OfficeWeightingPanel;
