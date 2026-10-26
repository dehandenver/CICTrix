import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorBanner } from './ErrorBanner';
import { Pagination } from './Pagination';
import { useBackClosesView } from '../hooks/useHistoryBack';
import {
  MapPin,
  Briefcase,
  Search,
  X
} from 'lucide-react';
import {
  queryOfficeDirectory,
  type OfficeDirectoryPage,
  type OfficeDirectoryRow
} from '../lib/api/officeDirectory';
import { DEFAULT_PAGE_SIZE, parsePageParam, parsePageSizeParam } from '../lib/pagination';
import { TableRefreshBar, TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';
import { supabase } from '../lib/supabase';

interface OfficeDirectorySectionProps {
  showBulkRequest?: boolean;
}

/** URL query keys, so refresh and Back keep the page, size and search. */
const PARAM = { page: 'odPage', size: 'odSize', search: 'odQ' } as const;
/** Wait for a pause in typing before searching. */
const SEARCH_DEBOUNCE_MS = 250;

export const OfficeDirectorySection: React.FC<OfficeDirectorySectionProps> = () => {
  const [params, setParams] = useSearchParams();
  const page = parsePageParam(params.get(PARAM.page));
  const pageSize = parsePageSizeParam(params.get(PARAM.size));
  const search = params.get(PARAM.search) ?? '';
  const [searchInput, setSearchInput] = useState(search);

  const [directoryPage, setDirectoryPage] = useState<OfficeDirectoryPage | null>(null);
  // Starts true: the directory loads on mount, so the first paint is the skeleton, not "No offices found."
  const [officeDirectoryLoading, setOfficeDirectoryLoading] = useState(true);
  const [officeDirectoryError, setOfficeDirectoryError] = useState('');
  const [selectedOfficeRow, setSelectedOfficeRow] = useState<OfficeDirectoryRow | null>(null);
  const [officeEmployees, setOfficeEmployees] = useState<any[]>([]);
  const [officeEmployeesLoading, setOfficeEmployeesLoading] = useState(false);
  const pageRows = directoryPage?.rows ?? [];
  const directoryLoad = useTableLoading(officeDirectoryLoading, pageRows.length > 0);
  const employeesLoad = useTableLoading(officeEmployeesLoading, officeEmployees.length > 0);
  useBackClosesView(selectedOfficeRow !== null, () => setSelectedOfficeRow(null), 'office-directory');

  /** Writes our keys into the URL (null or a default removes one), keeping others such as ?module=. */
  const updateParams = useCallback((patch: Partial<Record<keyof typeof PARAM, string | null>>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      (Object.keys(patch) as (keyof typeof PARAM)[]).forEach((key) => {
        const value = patch[key];
        if (value == null || value === '') next.delete(PARAM[key]);
        else next.set(PARAM[key], value);
      });
      return next;
    }, { replace: true });
  }, [setParams]);

  const setPage = (next: number) => updateParams({ page: next > 1 ? String(next) : null });
  // A new page size or search starts again at page 1.
  const setPageSize = (next: number) => updateParams({ size: next === DEFAULT_PAGE_SIZE ? null : String(next), page: null });

  // Back/forward can change the URL under us; keep the box in step.
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(() => updateParams({ search: searchInput.trim() ? searchInput : null, page: null }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  // Only the newest request may land, so a slow earlier page can't overwrite a later one.
  const requestId = useRef(0);

  // Declared outside the effect so the error banner's Retry can re-run it.
  const loadDirectory = useCallback(() => {
    const id = ++requestId.current;
    setOfficeDirectoryLoading(true);
    setOfficeDirectoryError('');
    return queryOfficeDirectory({ page, pageSize, search }).then((result) => {
      if (id !== requestId.current) return;
      if (result.ok && result.data) {
        setDirectoryPage(result.data);
      } else {
        setOfficeDirectoryError(result.error || 'Failed to load offices');
      }
      setOfficeDirectoryLoading(false);
    });
  }, [page, pageSize, search]);

  // A page past the end (stale link, or the list shrank) is clamped by the
  // service; put the page actually shown back into the URL.
  useEffect(() => {
    if (directoryPage && directoryPage.page !== page) setPage(directoryPage.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPage]);

  // Load the directory rows on mount
  useEffect(() => {
    let cancelled = false;

    void loadDirectory();

    const reload = () => {
      if (!cancelled) void loadDirectory();
    };

    window.addEventListener('cictrix:applicants-updated', reload);
    window.addEventListener('cictrix:newly-hired-updated', reload);
    window.addEventListener('cictrix:employee-accounts-updated', reload);
    window.addEventListener('cictrix:job-postings-updated', reload);
    window.addEventListener('EMPLOYEE_DOCUMENTS_UPDATED', reload);

    return () => {
      cancelled = true;
      window.removeEventListener('cictrix:applicants-updated', reload);
      window.removeEventListener('cictrix:newly-hired-updated', reload);
      window.removeEventListener('cictrix:employee-accounts-updated', reload);
      window.removeEventListener('cictrix:job-postings-updated', reload);
      window.removeEventListener('EMPLOYEE_DOCUMENTS_UPDATED', reload);
    };
  }, [loadDirectory]);

  const handleOfficeClick = (row: OfficeDirectoryRow) => {
    setSelectedOfficeRow(row);
    setOfficeEmployees([]);
    setOfficeEmployeesLoading(true);

    // Mirrors the headcount rules in getOfficeDirectory (officeDirectory.ts):
    // same normalization, same status filter, same email dedup — so the list
    // length always equals the count shown on the directory table.
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

    Promise.all([
      // All employees (unfiltered): office membership is decided client-side
      // with the same normalized department/current_department key the
      // headcount uses, and the full set doubles as the email dedup index.
      (supabase as any)
        .from('employees_with_department')
        .select('id, first_name, middle_name, last_name, current_position, department, current_department, status, email, mobile_number'),
      (supabase as any)
        .from('applicants')
        .select('id, first_name, middle_name, last_name, email, contact_number, position, office, status')
        .eq('status', 'Hired'),
    ]).then(([empRes, appRes]: [{ data: any[] | null }, { data: any[] | null }]) => {
      const allEmployees = Array.isArray(empRes?.data) ? empRes.data : [];
      const hiredApplicants = Array.isArray(appRes?.data) ? appRes.data : [];
      const officeKey = norm(row.officeName);

      const employeeEmails = new Set<string>();
      for (const emp of allEmployees) {
        const email = norm(emp?.email);
        if (email) employeeEmails.add(email);
      }

      // Active employees only, matching the headcount rule in officeDirectory.ts
      // (hired applicants are no longer folded into the office roster).
      void hiredApplicants;
      void employeeEmails;
      const officeEmps = allEmployees.filter(
        (emp) =>
          (norm(emp?.department) || norm(emp?.current_department)) === officeKey &&
          norm(emp?.status) === 'active'
      );

      const compareText = (a: string, b: string) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' });

      const byPositionThenName = (a: any, b: any) => {
        const posA = String(a?.current_position ?? '').trim();
        const posB = String(b?.current_position ?? '').trim();
        if (posA !== posB) {
          if (!posA) return 1;
          if (!posB) return -1;
          const cmp = compareText(posA, posB);
          if (cmp !== 0) return cmp;
        }
        const lastCmp = compareText(String(a?.last_name ?? ''), String(b?.last_name ?? ''));
        if (lastCmp !== 0) return lastCmp;
        return compareText(String(a?.first_name ?? ''), String(b?.first_name ?? ''));
      };

      setOfficeEmployees([...officeEmps].sort(byPositionThenName));
      setOfficeEmployeesLoading(false);
    });
  };

  // Active offices matching the search, across all pages (the service filters active-only).
  const total = directoryPage?.total ?? 0;
  const clearSearch = () => {
    setSearchInput('');
    updateParams({ search: null, page: null });
  };

  return (
    <div className="space-y-4">
      {selectedOfficeRow ? (
        /* Office employee list for selected office */
        <>
          <div>
            <h2 className="!mb-0.5 text-xl font-bold text-slate-900">{selectedOfficeRow.officeName}</h2>
            <p className="!mb-0 text-sm text-slate-500">{officeEmployees.length} employee{officeEmployees.length === 1 ? '' : 's'}</p>
          </div>

          <section className="abyan-table-wrap">
            <table className="abyan-table w-full">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">First Name</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Middle Name</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Last Name</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-slate-100 ${tableBodyClass(false)}`}>
                {employeesLoad.initialLoading ? (
                  <TableSkeletonRows show={employeesLoad.showSkeleton} columns={4} label="Loading employees…" />
                ) : officeEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-400">No employees found for this office.</td>
                  </tr>
                ) : (
                  officeEmployees.map((employee: any) => (
                    <tr key={employee.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="!mb-0 font-semibold" style={{ color: '#040E6B' }}>{employee.first_name || '--'}</p>
                        <p className="!mb-0 mt-0.5 text-xs text-slate-400">{employee.email || '--'}</p>
                      </td>
                      <td className="px-5 py-3.5 font-semibold" style={{ color: '#040E6B' }}>{employee.middle_name || '--'}</td>
                      <td className="px-5 py-3.5 font-semibold" style={{ color: '#040E6B' }}>{employee.last_name || '--'}</td>
                      <td className="px-5 py-3.5 text-slate-600">{employee.current_position || '--'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        /* Office Directory table */
        <div className="abyan-tokens space-y-4">
          {/* Title left, toolbar right; stacks on mobile (§9.4). */}
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Office Directory</h2>
              <p className="text-sm text-slate-500 mt-0.5">Click an office row to view all assigned employees and their accounts</p>
            </div>
            <div className="relative w-full sm:w-[280px]">
              <Search size={18} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--neutral-400)' }} />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search office or head"
                aria-label="Search offices"
                className="w-full rounded-lg border bg-white pl-10 pr-3 text-sm outline-none transition focus:border-[1.5px] focus:border-[var(--color-primary)] focus:shadow-[var(--ring-input)] hover:border-[var(--color-primary-200)]"
                style={{ height: 'var(--control-h-compact)', borderColor: 'var(--neutral-200)', color: 'var(--neutral-800)' }}
              />
            </div>
          </div>

          <ErrorBanner error={officeDirectoryError} context="server" onRetry={loadDirectory} />

          <section>
            {/* The shared table wrap scrolls sideways on small screens (§8.3). */}
            <div className="abyan-table-wrap" aria-busy={officeDirectoryLoading}>
              <table className="abyan-table w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Office / Department</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department Head</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Employees</th>
                  </tr>
                  <TableRefreshBar active={directoryLoad.refreshing} colSpan={3} />
                </thead>
                <tbody className={tableBodyClass(directoryLoad.refreshing)}>
                  {directoryLoad.initialLoading ? (
                    <TableSkeletonRows show={directoryLoad.showSkeleton} columns={['text', 'text', 'text']} label="Loading offices…" />
                  ) : (
                    <>
                      {pageRows.map((row) => (
                        <tr
                          key={row.officeId}
                          className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0 cursor-pointer"
                          onClick={() => handleOfficeClick(row)}
                        >
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-sm text-slate-900"><MapPin size={13} className="text-slate-400" /> {row.officeName}</span>
                            {row.code && <p className="!mb-0 mt-0.5 pl-[19px] text-xs text-slate-400">{row.code}</p>}
                          </td>
                          <td className="px-5 py-4 text-sm">
                            {row.deptHead ? (
                              <div>
                                <p className="!mb-0 font-medium text-slate-700">{row.deptHead.name}</p>
                                <p className="!mb-0 text-xs text-slate-400">{row.deptHead.contact}</p>
                              </div>
                            ) : (
                              <span className="text-amber-600 text-xs font-semibold">Unassigned</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="font-bold text-slate-900 text-sm">{row.employeeCount}</span>
                          </td>
                        </tr>
                      ))}
                      {total === 0 && !officeDirectoryError && (
                        <tr>
                          <td colSpan={3} className="px-5 py-12 text-center text-slate-500">
                            {search ? (
                              <div className="abyan-ds">
                                <Search className="mx-auto mb-2 h-8 w-8" strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--neutral-400)' }} />
                                <p className="!mb-1 font-medium" style={{ color: 'var(--color-primary-900)' }}>No offices match “{search}”</p>
                                <p className="!mb-3 text-sm" style={{ color: 'var(--neutral-600)' }}>Try another office name or department head.</p>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={clearSearch}>
                                  <X size={14} aria-hidden="true" /> Clear search
                                </button>
                              </div>
                            ) : (
                              <>
                                <Briefcase className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                                <p className="font-medium">No offices found.</p>
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <Pagination
            total={total}
            page={directoryPage?.page ?? page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel={total === 1 ? 'office' : 'offices'}
            label="Office directory pages"
          />
        </div>
      )}
    </div>
  );
};
