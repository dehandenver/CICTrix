import { useEffect, useMemo, useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { Sidebar } from './Sidebar';
import { hireApplicant } from '../lib/api/employeesApi';
import {
  ensureRecruitmentSeedData,
  getApplicants,
  saveApplicants,
} from '../lib/recruitmentData';
import { isMockModeEnabled } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { UserCheck, Users } from 'lucide-react';

interface HiringRow {
  id: string;
  fullName: string;
  email: string;
  position: string;
  department: string;
  score: number;
  status: string;
}

const QUALIFY_STATUSES = ['qualified', 'recommended for hiring', 'accepted'];

const isForHiring = (status: string) => {
  const s = status.toLowerCase().trim();
  return QUALIFY_STATUSES.some(q => s.includes(q));
};

export const ForHiringPage = () => {
  const [rows, setRows] = useState<HiringRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmTarget, setConfirmTarget] = useState<HiringRow[] | null>(null);
  const [hiring, setHiring] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        ensureRecruitmentSeedData();
        const local = getApplicants().filter(a => isForHiring(a.status));

        // Also check Supabase for any qualified applicants not in local store
        const supabaseRows: HiringRow[] = [];
        if (!isMockModeEnabled) {
          try {
            const { data } = await (supabase as any)
              .from('applicants')
              .select('id,first_name,last_name,middle_name,email,position,office,status,qualification_score')
              .order('office', { ascending: true });

            const localIds = new Set(local.map(a => a.id));
            (data ?? []).forEach((r: any) => {
              if (!localIds.has(String(r.id)) && isForHiring(String(r.status ?? ''))) {
                supabaseRows.push({
                  id: String(r.id),
                  fullName: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' '),
                  email: r.email ?? '',
                  position: r.position ?? '—',
                  department: r.office ?? '—',
                  score: Number(r.qualification_score ?? 0),
                  status: r.status ?? '',
                });
              }
            });
          } catch {
            // Supabase unavailable — local only
          }
        }

        const localMapped: HiringRow[] = local.map(a => ({
          id: a.id,
          fullName: `${a.personalInfo.firstName} ${a.personalInfo.lastName}`.trim(),
          email: a.personalInfo.email ?? '',
          position: (a as any).position ?? '—',
          department: (a as any).department ?? (a as any).office ?? '—',
          score: Number(a.qualificationScore ?? 0),
          status: a.status,
        }));

        const all = [...localMapped, ...supabaseRows];
        // Sort by department then position
        all.sort((a, b) =>
          a.department.localeCompare(b.department) || a.position.localeCompare(b.position)
        );
        setRows(all);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const groupedByDept = useMemo(() => {
    const map = new Map<string, HiringRow[]>();
    rows.forEach(r => {
      const dept = r.department || '—';
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(r);
    });
    return map;
  }, [rows]);

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.id)));
    }
  };

  const handleCreateClick = () => {
    const targets = rows.filter(r => selected.has(r.id));
    if (targets.length === 0) return;
    setConfirmTarget(targets);
  };

  const handleConfirmHire = async () => {
    if (!confirmTarget) return;
    setHiring(true);
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const row of confirmTarget) {
      try {
        await hireApplicant(row.id);
        succeeded.push(row.id);
        // Update local recruitment store status
        const applicants = getApplicants();
        const updated = applicants.map(a =>
          a.id === row.id ? { ...a, status: 'Hired' as any } : a
        );
        saveApplicants(updated);
      } catch {
        failed.push(row.fullName);
      }
    }

    setHiring(false);
    setConfirmTarget(null);
    setSelected(new Set());

    // Remove hired rows from display
    setRows(prev => prev.filter(r => !succeeded.includes(r.id)));

    if (failed.length > 0) {
      showToast(`Failed to hire: ${failed.join(', ')}`, 'error');
    } else {
      showToast(`${succeeded.length} employee record${succeeded.length > 1 ? 's' : ''} created successfully.`, 'success');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
        <div className="admin-layout">
          <Sidebar activeModule="RSP" userRole="rsp" />
          <main className="admin-content bg-slate-50 !p-0">
            <ApplicantsTabBar />
            <div className="flex items-center justify-center p-16 text-slate-500">Loading…</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
      <div className="admin-layout">
        <Sidebar activeModule="RSP" userRole="rsp" />
        <main className="admin-content bg-slate-50 !p-0">
          <ApplicantsTabBar />

          <div className="p-6">
            {/* Toast */}
            {toast && (
              <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {toast.message}
              </div>
            )}

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">For Hiring</h1>
                <p className="text-sm text-slate-500">
                  Applicants who have completed all recruitment stages and obtained the required scores are listed below.
                </p>
              </div>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={handleCreateClick}
                className="inline-flex items-center gap-2 rounded-xl bg-[#363EE8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <UserCheck className="h-4 w-4" />
                Create Employee Record{selected.size > 1 ? `s (${selected.size})` : ''}
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-slate-400">
                <Users className="mb-3 h-10 w-10" />
                <p className="font-medium">No applicants ready for hiring yet.</p>
                <p className="mt-1 text-sm">Qualified applicants will appear here once all stages are completed.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full min-w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.size === rows.length && rows.length > 0}
                          onChange={toggleAll}
                          className="h-4 w-4 accent-[#363EE8]"
                          title="Select all"
                        />
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Score</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(groupedByDept.entries()).map(([dept, deptRows]) => (
                      <>
                        {/* Department group header */}
                        <tr key={`dept-${dept}`} className="bg-[#363EE8]/5 border-b border-slate-200">
                          <td colSpan={6} className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-[#363EE8]">
                            {dept}
                          </td>
                        </tr>
                        {deptRows.map(row => (
                          <tr
                            key={row.id}
                            className={`border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50 ${selected.has(row.id) ? 'bg-blue-50/60' : ''}`}
                          >
                            <td className="px-4 py-4 text-center">
                              <input
                                type="checkbox"
                                checked={selected.has(row.id)}
                                onChange={() => toggleRow(row.id)}
                                className="h-4 w-4 accent-[#363EE8]"
                              />
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold text-slate-900">{row.fullName}</p>
                              <p className="text-xs text-slate-400">{row.email}</p>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-700">{row.position}</td>
                            <td className="px-5 py-4">
                              <span className="inline-flex rounded-full bg-[#363EE8]/10 px-2.5 py-0.5 text-xs font-semibold text-[#363EE8]">
                                {row.department}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                              {row.score > 0 ? `${row.score.toFixed(1)}%` : '—'}
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Confirmation Dialog */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#363EE8]/10">
              <UserCheck className="h-6 w-6 text-[#363EE8]" />
            </div>
            <h2 className="mb-2 text-lg font-bold text-slate-900">Confirm Employee Record Creation</h2>

            {confirmTarget.length === 1 ? (
              <p className="text-sm text-slate-600">
                Are you sure you want to hire{' '}
                <strong>{confirmTarget[0].fullName}</strong> for the position of{' '}
                <strong>{confirmTarget[0].position}</strong> under the{' '}
                <strong>{confirmTarget[0].department}</strong> department? This action will create an employee record and generate a system account.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  Are you sure you want to create employee records for the following{' '}
                  <strong>{confirmTarget.length} applicants</strong>? This action will create employee records and generate system accounts.
                </p>
                <ul className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {confirmTarget.map(r => (
                    <li key={r.id} className="px-3 py-2">
                      <p className="text-sm font-semibold text-slate-800">{r.fullName}</p>
                      <p className="text-xs text-slate-500">{r.position} — {r.department}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={hiring}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmHire}
                disabled={hiring}
                className="rounded-xl bg-[#363EE8] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {hiring ? 'Creating…' : 'Yes, Create Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
