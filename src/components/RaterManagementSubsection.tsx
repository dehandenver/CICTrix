// Simplified Rater Management widget shown on the Qualified Applicants page.
// Lists raters with only two visible columns — name and status — plus a single
// action button that toggles between "Grant Access" (inactive → active) and
// "Revoke Access" (active → inactive).

import { useCallback, useEffect, useState } from 'react';
import { Plus, ShieldCheck, ShieldOff, UserPlus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RaterRow {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
}

interface RaterManagementSubsectionProps {
  onAccessChange?: () => void;
}

export const RaterManagementSubsection = ({ onAccessChange }: RaterManagementSubsectionProps) => {
  const [raters, setRaters] = useState<RaterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('raters')
        .select('id, name, email, is_active')
        .order('name', { ascending: true });
      if (error) {
        console.warn('[RaterManagementSubsection] load failed', error);
        setRaters([]);
      } else {
        setRaters(
          (Array.isArray(data) ? data : []).map((r: any) => ({
            id: String(r.id ?? ''),
            name: String(r.name ?? 'Unknown'),
            email: String(r.email ?? ''),
            is_active: Boolean(r.is_active),
          })),
        );
      }
    } catch (err) {
      console.warn('[RaterManagementSubsection] load threw', err);
      setRaters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetAddForm = () => {
    setNewName('');
    setNewEmail('');
    setAddError('');
  };

  const addRater = async () => {
    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmedName) {
      setAddError('Name is required.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setAddError('A valid email is required.');
      return;
    }
    if (raters.some((r) => r.email.toLowerCase() === trimmedEmail)) {
      setAddError('A rater with this email already exists.');
      return;
    }

    setAddError('');
    setAdding(true);
    try {
      const { data, error } = await (supabase as any)
        .from('raters')
        .insert({
          name: trimmedName,
          email: trimmedEmail,
          is_active: true,
        })
        .select('id, name, email, is_active')
        .single();
      if (error) {
        console.error('[RaterManagementSubsection] add failed', error);
        setAddError(error.message ?? 'Could not add the rater.');
      } else if (data) {
        setRaters((prev) => [
          ...prev,
          {
            id: String(data.id ?? ''),
            name: String(data.name ?? trimmedName),
            email: String(data.email ?? trimmedEmail),
            is_active: Boolean(data.is_active),
          },
        ].sort((a, b) => a.name.localeCompare(b.name)));
        // Refresh the assigned-interviewer dropdown on the parent page so a
        // freshly added (active) rater appears immediately.
        window.dispatchEvent(new CustomEvent('cictrix:raters-updated'));
        onAccessChange?.();
        resetAddForm();
        setShowAddForm(false);
      }
    } catch (err) {
      console.error('[RaterManagementSubsection] add threw', err);
      setAddError('Could not add the rater.');
    } finally {
      setAdding(false);
    }
  };

  const toggleAccess = async (rater: RaterRow) => {
    if (pendingId) return;
    setPendingId(rater.id);
    const nextActive = !rater.is_active;

    // Optimistic update so the button label flips immediately.
    setRaters((prev) =>
      prev.map((r) => (r.id === rater.id ? { ...r, is_active: nextActive } : r)),
    );

    try {
      const { error } = await (supabase as any)
        .from('raters')
        .update({ is_active: nextActive })
        .eq('id', rater.id);
      if (error) {
        console.error('[RaterManagementSubsection] toggle failed', error);
        // Revert on failure.
        setRaters((prev) =>
          prev.map((r) => (r.id === rater.id ? { ...r, is_active: !nextActive } : r)),
        );
      } else {
        onAccessChange?.();
      }
    } catch (err) {
      console.error('[RaterManagementSubsection] toggle threw', err);
      setRaters((prev) =>
        prev.map((r) => (r.id === rater.id ? { ...r, is_active: !nextActive } : r)),
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Rater Management</h3>
          <p className="text-xs text-slate-500">
            Add interviewers, then grant or revoke their access. Only active raters appear in the assignment dropdown.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showAddForm) {
              setShowAddForm(false);
              resetAddForm();
            } else {
              setShowAddForm(true);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          {showAddForm ? (
            <>
              <X className="h-3.5 w-3.5" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> Add Rater
            </>
          )}
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-blue-700" />
            <p className="text-sm font-semibold text-slate-900">Add a new rater</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Full Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Melchor U. Tan"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Email
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="e.g. interviewer@cictrix.gov.ph"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {addError && (
            <p className="mt-2 text-xs font-medium text-rose-600">{addError}</p>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowAddForm(false); resetAddForm(); }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void addRater()}
              disabled={adding}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {adding ? 'Adding…' : 'Add Rater'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Rater Name</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-sm text-slate-400">
                  Loading raters…
                </td>
              </tr>
            ) : raters.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-sm text-slate-400">
                  No raters yet.
                </td>
              </tr>
            ) : (
              raters.map((r) => {
                const isPending = pendingId === r.id;
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{r.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          r.is_active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void toggleAccess(r)}
                        disabled={isPending}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          r.is_active
                            ? 'bg-rose-600 text-white hover:bg-rose-700'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {r.is_active ? (
                          <>
                            <ShieldOff className="h-3.5 w-3.5" /> {isPending ? 'Revoking…' : 'Revoke Access'}
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5" /> {isPending ? 'Granting…' : 'Grant Access'}
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
