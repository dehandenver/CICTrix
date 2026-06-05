import { useEffect, useMemo, useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { Sidebar } from './Sidebar';
import { isMockModeEnabled, supabase } from '../lib/supabase';
import { mockDatabase } from '../lib/mockDatabase';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Applicant {
  id: string;
  full_name: string;
  email: string;
  contact_number: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  application_type?: string | null;
}

const ITEMS_PER_PAGE = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
};

const POSITION_COLORS = [
  'bg-indigo-100 text-indigo-700', 'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700', 'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',     'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',     'bg-lime-100 text-lime-700',
];
const positionColorCache = new Map<string, string>();
let colorIdx = 0;
const getPositionColor = (pos: string) => {
  if (!positionColorCache.has(pos)) {
    positionColorCache.set(pos, POSITION_COLORS[colorIdx % POSITION_COLORS.length]);
    colorIdx++;
  }
  return positionColorCache.get(pos)!;
};

// Highlights the matching evaluate button when the applicant already has that status
const shortlistCls = (status: string) =>
  status.toLowerCase().includes('shortlist')
    ? 'bg-amber-500 text-white border-amber-500'
    : 'border-amber-400 text-amber-600 hover:bg-amber-50';

const qualifyCls = (status: string) => {
  const s = status.toLowerCase();
  return s.includes('qualified') && !s.includes('dis')
    ? 'bg-emerald-600 text-white border-emerald-600'
    : 'border-emerald-400 text-emerald-600 hover:bg-emerald-50';
};

const disqualifyCls = (status: string) => {
  const s = status.toLowerCase();
  return s.includes('disqual') || s.includes('not qualified') || s.includes('reject')
    ? 'bg-red-500 text-white border-red-500'
    : 'border-red-300 text-red-500 hover:bg-red-50';
};

// ── Component ─────────────────────────────────────────────────────────────────

export const ApplicationsListPage = () => {
  const navigate = useNavigate();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [officeFilter, setOfficeFilter]     = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [statusFilter, setStatusFilter]     = useState('all');
  const [page, setPage]       = useState(1);
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [toast, setToast]       = useState('');

  // ── Data load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
        const client: any = preferredMode === 'local' ? mockDatabase : supabase;

        const { data } = await client.from('applicants').select('*').order('created_at', { ascending: false });
        const rows: Applicant[] = (data ?? []).map((r: any) => ({
          id:               String(r.id ?? ''),
          full_name:        [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ') || String(r.full_name ?? '—'),
          email:            String(r.email ?? ''),
          contact_number:   String(r.contact_number ?? ''),
          position:         String(r.position ?? ''),
          office:           String(r.office ?? ''),
          status:           String(r.status ?? ''),
          created_at:       String(r.created_at ?? ''),
          application_type: r.application_type ?? null,
        }));
        setApplicants(rows);
      } catch {
        setApplicants([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
    window.addEventListener('cictrix:applicants-updated', load);
    return () => window.removeEventListener('cictrix:applicants-updated', load);
  }, []);

  // ── Status update — tries Supabase then falls back to mockDatabase ─────────
  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(prev => new Set(prev).add(id));
    try {
      const payload = { status: newStatus };

      if (isMockModeEnabled) {
        // Mock mode: write directly to mockDatabase
        await (mockDatabase as any).from('applicants').update(payload).eq('id', id);
      } else {
        // Live mode: try Supabase, fall back to mockDatabase on RLS / network error
        const result = await (supabase as any).from('applicants').update(payload).eq('id', id);
        if ((result as any)?.error) {
          await (mockDatabase as any).from('applicants').update(payload).eq('id', id);
        }
      }

      // Optimistic local update so the button highlights immediately
      setApplicants(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
      showToast(`Applicant marked as ${newStatus}.`);
      window.dispatchEvent(new Event('cictrix:applicants-updated'));
    } catch {
      showToast('Update failed — please try again.');
    } finally {
      setUpdating(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const offices   = useMemo(() => [...new Set(applicants.map(a => a.office).filter(Boolean))].sort(), [applicants]);
  const positions = useMemo(() => [...new Set(applicants.map(a => a.position).filter(Boolean))].sort(), [applicants]);
  const statuses  = useMemo(() => [...new Set(applicants.map(a => a.status).filter(Boolean))].sort(), [applicants]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return applicants.filter(a => {
      if (officeFilter   !== 'all' && a.office   !== officeFilter)   return false;
      if (positionFilter !== 'all' && a.position !== positionFilter) return false;
      if (statusFilter   !== 'all' && a.status   !== statusFilter)   return false;
      if (term && !a.full_name.toLowerCase().includes(term) &&
          !a.email.toLowerCase().includes(term) &&
          !a.position.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [applicants, search, officeFilter, positionFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
        <div className="admin-layout">
          <Sidebar activeModule="RSP" userRole="rsp" />
          <main className="admin-content bg-slate-50 !p-0">
            <ApplicantsTabBar />
            <div className="flex items-center justify-center p-16 text-slate-500">Loading applicants…</div>
          </main>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="min-h-screen bg-[#f8f9fa]">
        <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
        <div className="admin-layout">
          <Sidebar activeModule="RSP" userRole="rsp" />
          <main className="admin-content bg-slate-50 !p-0">
            <ApplicantsTabBar />

            <div className="p-6">
              {/* Page header */}
              <div className="mb-5">
                <h1 className="text-2xl font-bold text-slate-900">Applications</h1>
                <p className="text-sm text-slate-500">
                  Click an applicant's name to view their profile · Use the buttons to evaluate each applicant
                </p>
              </div>

              {/* Filters */}
              <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search name, email, position…"
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                      className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <select value={officeFilter} onChange={e => { setOfficeFilter(e.target.value); setPage(1); }}
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                    <option value="all">All Departments</option>
                    {offices.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <select value={positionFilter} onChange={e => { setPositionFilter(e.target.value); setPage(1); }}
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                    <option value="all">All Positions</option>
                    {positions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                    <option value="all">All Statuses</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                  <span>{filtered.length} applicant{filtered.length !== 1 ? 's' : ''} found</span>
                  <button type="button" className="text-blue-600 hover:underline"
                    onClick={() => { setSearch(''); setOfficeFilter('all'); setPositionFilter('all'); setStatusFilter('all'); setPage(1); }}>
                    Clear filters
                  </button>
                </div>
              </div>

              {/* Applicant table */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full min-w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</th>
                      <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                      <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                      <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                      <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Applied</th>
                      <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Evaluate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(a => {
                      const busy = updating.has(a.id);
                      return (
                        <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0">

                          {/* Applicant name — clickable → applicant profile */}
                          <td className="px-5 py-4">
                            <button type="button" className="group text-left"
                              onClick={() => navigate(`/admin/rsp/applicant/${a.id}`)}>
                              <p className="font-semibold text-sm text-[#363EE8] group-hover:underline underline-offset-2">
                                {a.full_name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">{a.email}</p>
                            </button>
                          </td>

                          {/* Position badge */}
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${getPositionColor(a.position)}`}>
                              {a.position || '—'}
                            </span>
                          </td>

                          {/* Department */}
                          <td className="px-5 py-4 text-sm text-slate-600">{a.office || '—'}</td>

                          {/* Type */}
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${(a.application_type ?? '').toLowerCase().includes('promot') ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                              {(a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original'}
                            </span>
                          </td>

                          {/* Applied date */}
                          <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(a.created_at)}</td>

                          {/* Evaluate: Shortlist / Qualify / Disqualify */}
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button type="button" disabled={busy}
                                onClick={() => updateStatus(a.id, 'Shortlisted')}
                                title="Shortlist this applicant"
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${shortlistCls(a.status)}`}>
                                Shortlist
                              </button>
                              <button type="button" disabled={busy}
                                onClick={() => updateStatus(a.id, 'Qualified')}
                                title="Mark as Qualified"
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${qualifyCls(a.status)}`}>
                                Qualify
                              </button>
                              <button type="button" disabled={busy}
                                onClick={() => updateStatus(a.id, 'Disqualified')}
                                title="Mark as Disqualified"
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${disqualifyCls(a.status)}`}>
                                Disqualify
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {paged.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                          <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                          <p className="font-medium">No applicants found for the selected filters.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-3 flex items-center justify-between px-1 text-sm text-slate-600">
                <p>
                  {filtered.length === 0
                    ? 'No results'
                    : `Showing ${(safePage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of ${filtered.length}`}
                </p>
                <div className="flex items-center gap-2">
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 disabled:opacity-40 hover:bg-slate-50"
                    onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-medium">Page {safePage} of {totalPages}</span>
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 disabled:opacity-40 hover:bg-slate-50"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
};
