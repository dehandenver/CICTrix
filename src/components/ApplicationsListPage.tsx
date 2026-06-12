import { useEffect, useMemo, useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { Sidebar } from './Sidebar';
import { supabase } from '../lib/supabase';
import { isMockModeEnabled } from '../lib/supabase';
import { mockDatabase } from '../lib/mockDatabase';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import { ChevronLeft, ChevronRight, Search, Undo2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Applicant {
  id: string;
  full_name: string;
  email: string;
  item_number: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  application_type?: string | null;
}

const isShortlistedStatus = (status: string) =>
  status.trim().toLowerCase().includes('shortlist');

const ITEMS_PER_PAGE = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
};



// ── Component ─────────────────────────────────────────────────────────────────

export const ApplicationsListPage = () => {
  const navigate = useNavigate();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [officeFilter, setOfficeFilter]     = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [typeFilter, setTypeFilter]         = useState('all');
  const [page, setPage] = useState(1);
  const [selectedShortlistIds, setSelectedShortlistIds] = useState<Set<string>>(new Set());
  const [removingShortlist, setRemovingShortlist] = useState(false);

  // ── Load applicants ────────────────────────────────────────────────────────
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
          item_number:      String(r.item_number ?? r.application_number ?? ''),
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

  // ── Derived ────────────────────────────────────────────────────────────────
  const offices   = useMemo(() => [...new Set(applicants.map(a => a.office).filter(Boolean))].sort(),    [applicants]);
  const positions = useMemo(() => [...new Set(applicants.map(a => a.position).filter(Boolean))].sort(), [applicants]);

  const normalizeType = (t: string | null | undefined) =>
    (t ?? '').toLowerCase().includes('promot') ? 'promotional' : 'original';

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return applicants.filter(a => {
      // Shortlisted rows live in the dedicated section below the main table.
      if (isShortlistedStatus(a.status)) return false;
      if (officeFilter   !== 'all' && a.office   !== officeFilter)   return false;
      if (positionFilter !== 'all' && a.position !== positionFilter) return false;
      if (typeFilter     !== 'all' && normalizeType(a.application_type) !== typeFilter) return false;
      if (term && !a.full_name.toLowerCase().includes(term) &&
          !a.email.toLowerCase().includes(term) &&
          !a.position.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [applicants, search, officeFilter, positionFilter, typeFilter]);

  const shortlisted = useMemo(
    () => applicants.filter(a => isShortlistedStatus(a.status)),
    [applicants],
  );

  // Drop stale ids when the underlying list changes (e.g. after a remove).
  useEffect(() => {
    setSelectedShortlistIds(prev => {
      const valid = new Set(shortlisted.map(a => a.id));
      const next = new Set<string>();
      prev.forEach(id => { if (valid.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [shortlisted]);

  const allShortlistedSelected = shortlisted.length > 0 && selectedShortlistIds.size === shortlisted.length;
  const someShortlistedSelected = selectedShortlistIds.size > 0 && !allShortlistedSelected;

  const toggleShortlistSelection = (id: string) => {
    setSelectedShortlistIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllShortlist = () => {
    setSelectedShortlistIds(prev =>
      prev.size === shortlisted.length ? new Set<string>() : new Set(shortlisted.map(a => a.id))
    );
  };

  const removeSelectedFromShortlist = async () => {
    if (selectedShortlistIds.size === 0 || removingShortlist) return;
    setRemovingShortlist(true);
    const ids = Array.from(selectedShortlistIds);

    // Best-effort: try Supabase, fall back to mock. Either way, update local
    // state so the row immediately falls back into the main list.
    try {
      const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
      const client: any = preferredMode === 'local' ? mockDatabase : supabase;
      await Promise.all(
        ids.map(id =>
          client.from('applicants').update({ status: 'Under Review' }).eq('id', id),
        ),
      );
    } catch (err) {
      console.error('removeSelectedFromShortlist: status revert failed', err);
    }

    setApplicants(prev =>
      prev.map(a => (ids.includes(a.id) ? { ...a, status: 'Under Review' } : a)),
    );
    setSelectedShortlistIds(new Set());
    setRemovingShortlist(false);
    window.dispatchEvent(new Event('cictrix:applicants-updated'));
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
        <div className="admin-layout">
          <Sidebar activeModule="RSP" userRole="rsp" />
          <main className="admin-content bg-slate-50 !p-0">
            <div className="border-b border-slate-200 bg-white px-8 py-6">
              <h1 className="!mb-1 !text-2xl font-bold">Applications</h1>
              <p className="!mb-0 text-base text-slate-500">All applicants submitted across all job positions</p>
            </div>
            <ApplicantsTabBar />
            <div className="flex items-center justify-center p-16 text-slate-500">Loading applicants…</div>
          </main>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
      <div className="admin-layout">
        <Sidebar activeModule="RSP" userRole="rsp" />
        <main className="admin-content bg-slate-50 !p-0">
          <div className="border-b border-slate-200 bg-white px-8 py-6">
            <h1 className="!mb-1 !text-2xl font-bold">Applications</h1>
            <p className="!mb-0 text-base text-slate-500">All applicants submitted across all job positions</p>
          </div>
          <ApplicantsTabBar />

          <div className="p-6">
            {/* Filters */}
            <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Search name, email, position…"
                    value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-[#363EE8] focus:outline-none" />
                </div>
                <select value={officeFilter} onChange={e => { setOfficeFilter(e.target.value); setPage(1); }}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none">
                  <option value="all">All Departments</option>
                  {offices.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <select value={positionFilter} onChange={e => { setPositionFilter(e.target.value); setPage(1); }}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none">
                  <option value="all">All Positions</option>
                  {positions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none">
                  <option value="all">All Types</option>
                  <option value="original">Original</option>
                  <option value="promotional">Promotional</option>
                </select>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                <span>{filtered.length} applicant{filtered.length !== 1 ? 's' : ''} found</span>
                <button type="button" className="text-[#363EE8] hover:underline"
                  onClick={() => { setSearch(''); setOfficeFilter('all'); setPositionFilter('all'); setTypeFilter('all'); setPage(1); }}>
                  Clear filters
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</th>
                    <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                    <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                    <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                    <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(a => (
                    <tr key={a.id} onClick={() => navigate(`/admin/rsp/applicant/${a.id}`, { state: { from: '/admin/rsp/applications' } })} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0">

                      {/* Name — clickable */}
                      <td className="px-5 py-4">
                        <button type="button" className="group text-left"
                          onClick={() => navigate(`/admin/rsp/applicant/${a.id}`, { state: { from: '/admin/rsp/applications' } })}>
                          <p className="font-semibold text-sm text-[#363EE8] group-hover:underline underline-offset-2">{a.full_name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{a.item_number || '—'}</p>
                        </button>
                      </td>

                      {/* Position */}
                      <td className="px-5 py-4 text-sm text-slate-700">{a.position || '—'}</td>

                      {/* Department */}
                      <td className="px-5 py-4 text-sm text-slate-700">{a.office || '—'}</td>

                      {/* Type */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${(a.application_type ?? '').toLowerCase().includes('promot') ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                          {(a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original'}
                        </span>
                      </td>

                      {/* Applied date */}
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(a.created_at)}</td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                        <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                        <p className="font-medium">No applicants found for the selected filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Shortlisted Applicants section */}
            <div className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Shortlisted Applicants</h2>
                  <p className="text-xs text-slate-500">
                    Applicants moved here via the Shortlist action. Select rows and click Remove from Shortlist
                    to return them to the main list.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeSelectedFromShortlist()}
                  disabled={selectedShortlistIds.size === 0 || removingShortlist}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Remove from Shortlist
                  {selectedShortlistIds.size > 0 ? ` (${selectedShortlistIds.size})` : ''}
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full min-w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="w-10 px-5 py-3 text-left">
                        <input
                          type="checkbox"
                          aria-label="Select all shortlisted applicants"
                          checked={allShortlistedSelected}
                          ref={el => { if (el) el.indeterminate = someShortlistedSelected; }}
                          onChange={toggleSelectAllShortlist}
                          disabled={shortlisted.length === 0}
                          className="h-4 w-4 rounded border-slate-300 text-[#363EE8] focus:ring-[#363EE8]"
                        />
                      </th>
                      <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</th>
                      <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                      <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                      <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                      <th className="px-5 py-3 text-left   text-xs font-semibold uppercase tracking-wider text-slate-500">Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortlisted.map(a => (
                      <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0">
                        <td className="px-5 py-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${a.full_name}`}
                            checked={selectedShortlistIds.has(a.id)}
                            onChange={() => toggleShortlistSelection(a.id)}
                            className="h-4 w-4 rounded border-slate-300 text-[#363EE8] focus:ring-[#363EE8]"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <button type="button" className="group text-left"
                            onClick={() => navigate(`/admin/rsp/applicant/${a.id}`, { state: { from: '/admin/rsp/applications' } })}>
                            <p className="font-semibold text-sm text-[#363EE8] group-hover:underline underline-offset-2">{a.full_name}</p>
                            <p className="mt-0.5 text-xs text-slate-400">{a.item_number || '—'}</p>
                          </button>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{a.position || '—'}</td>
                        <td className="px-5 py-4 text-sm text-slate-700">{a.office || '—'}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${(a.application_type ?? '').toLowerCase().includes('promot') ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                            {(a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(a.created_at)}</td>
                      </tr>
                    ))}
                    {shortlisted.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                          <p className="font-medium">No shortlisted applicants yet.</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Click Shortlist on an applicant's profile to move them here.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="mt-3 flex items-center justify-between px-1 text-sm text-slate-600">
              <p>
                {filtered.length === 0 ? 'No results'
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
  );
};
