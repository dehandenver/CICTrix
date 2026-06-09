// Simplified Rater Management widget shown on the Qualified Applicants page.
// Lists raters with only two visible columns — name and status — plus a single
// action button that toggles between "Grant Access" (inactive → active) and
// "Revoke Access" (active → inactive).

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
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
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Rater Management</h3>
          <p className="text-xs text-slate-500">
            Grant or revoke interviewer access. Only active raters appear in the assignment dropdown above.
          </p>
        </div>
      </div>

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
