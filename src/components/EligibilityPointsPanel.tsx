/**
 * Succession → Eligibility Points.
 *
 * Manages the recognized civil service and professional eligibility catalog
 * and shows the fixed V2 scoring tiers (0 / 7.5 / 15 pts out of the 15%
 * Eligibility weight).
 */

import { useCallback, useEffect, useState } from 'react';
import { Award, Check, Info, Plus, Trash2 } from 'lucide-react';
import { failureText } from '../lib/friendlyErrors';
import {
  deleteEligibilityType,
  listEligibilityTypes,
  upsertEligibilityType,
  type EligibilityType,
} from '../lib/api/eligibilityTypes';

/** How long a "Saved" tick stays up before fading, in ms. */
const SAVED_FLASH_MS = 2000;

const V2_ELIGIBILITY_TIERS = [
  {
    label: '0 Recognized Eligibilities',
    points: '0.0 / 15 pts',
    description: 'No recognized, position-relevant, unexpired credentials on file.',
  },
  {
    label: '1 Recognized Eligibility',
    points: '7.5 / 15 pts',
    description: 'One distinct recognized, position-relevant, unexpired credential.',
  },
  {
    label: '2+ Distinct Recognized Eligibilities',
    points: '15.0 / 15 pts',
    description: 'Two or more distinct recognized, position-relevant, unexpired credentials.',
  },
] as const;

export const EligibilityPointsPanel = () => {
  const [types, setTypes] = useState<EligibilityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  // Which add/remove write is in flight; blocks a second click from sending another.
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listEligibilityTypes();
    if (res.ok === false) {
      setError(failureText('load the eligibility types', res.error, { mode: 'load' }));
      setLoading(false);
      return;
    }
    setTypes(res.data);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flashSaved = (id: string) => {
    setSavedId(id);
    window.setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), SAVED_FLASH_MS);
  };

  const saveType = async (t: EligibilityType, patch: Partial<EligibilityType>) => {
    setSavingId(t.id);
    setError(null);
    const res = await upsertEligibilityType({
      id: t.id,
      name: patch.name ?? t.name,
      points: t.points,
      pointsForFullMarks: t.pointsForFullMarks,
      isActive: patch.isActive ?? t.isActive,
      sortOrder: t.sortOrder,
    });
    setSavingId(null);
    if (res.ok === false) {
      setError(failureText('save the eligibility type', res.error));
      return;
    }
    setTypes((prev) => prev.map((x) => (x.id === t.id ? res.data : x)));
    flashSaved(t.id);
  };

  const addType = async () => {
    const name = newName.trim();
    if (!name || busyAction) return;
    setError(null);
    setBusyAction('add');
    const res = await upsertEligibilityType({
      name,
      isActive: true,
      sortOrder: types.length + 1,
    });
    setBusyAction(null);
    if (res.ok === false) {
      setError(failureText('add the eligibility type', res.error));
      return;
    }
    setTypes((prev) => [...prev, res.data]);
    setNewName('');
  };

  const removeType = async (t: EligibilityType) => {
    // Deleting a type does not delete employee eligibility records; those keep
    // their credential text and are treated as unrecognized (0 pts).
    if (busyAction) return;
    setError(null);
    setBusyAction(`remove:${t.id}`);
    const res = await deleteEligibilityType(t.id);
    setBusyAction(null);
    if (res.ok === false) {
      setError(failureText('remove the eligibility type', res.error));
      return;
    }
    setTypes((prev) => prev.filter((x) => x.id !== t.id));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Award className="h-6 w-6 shrink-0 text-blue-600" strokeWidth={1.75} />
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Eligibility Points</h2>
          <p className="text-sm text-slate-500">
            Manage recognized civil service and professional eligibilities and review the V2 scoring tiers
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" strokeWidth={1.75} />
        <p className="text-sm text-slate-700">
          In Reviewed Scoring (V2), eligibility contributes 15% of a candidate&rsquo;s total score using fixed tiers
          based on distinct recognized, position-relevant, unexpired credentials (0 valid = 0 / 15 pts, 1 valid =
          7.5 / 15 pts, 2 or more distinct valid = 15 / 15 pts). Toggling a type inactive or removing it marks that
          credential unrecognized (0 pts) without deleting employee records.
        </p>
      </div>

      <section aria-label="V2 fixed scoring tiers" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {V2_ELIGIBILITY_TIERS.map((tier) => (
          <div key={tier.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{tier.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{tier.points}</p>
            <p className="mt-1 text-xs text-slate-600">{tier.description}</p>
          </div>
        ))}
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading eligibility types…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-slate-900">
                    Eligibility type
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-slate-900">
                    Recognized (Active)
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-slate-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {types.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-semibold ${t.isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                        {t.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={t.isActive}
                          aria-label={`${t.name} is recognized (active)`}
                          disabled={savingId === t.id}
                          onChange={(e) => void saveType(t, { isActive: e.target.checked })}
                          className="h-[18px] w-[18px] cursor-pointer"
                        />
                        {savingId === t.id && <span className="text-xs text-slate-500">Saving…</span>}
                        {savedId === t.id && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <Check className="h-3.5 w-3.5" strokeWidth={1.75} /> Saved
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void removeType(t)}
                        disabled={busyAction !== null}
                        aria-busy={busyAction === `remove:${t.id}` || undefined}
                        aria-label={`Remove ${t.name}`}
                        title="Remove this type. Employee records keep their eligibility; it becomes unrecognized (0 pts)."
                        className="btn btn-secondary btn-sm"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {types.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">
                      No recognized eligibility types configured. Every employee eligibility on record will be marked
                      unrecognized (0 pts) until one is added.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addType(); }}
              placeholder="Add an eligibility type…"
              aria-label="New eligibility type name"
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
            />
            <button
              type="button"
              onClick={() => void addType()}
              disabled={!newName.trim() || busyAction !== null}
              aria-busy={busyAction === 'add' || undefined}
              className="btn btn-primary btn-md"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} /> Add type
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EligibilityPointsPanel;
