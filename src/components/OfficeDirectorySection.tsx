import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Search,
  MapPin,
  Briefcase
} from 'lucide-react';
import {
  getOfficeDirectory,
  filterOfficeDirectory,
  type OfficeDirectoryRow
} from '../lib/api/officeDirectory';
import { supabase } from '../lib/supabase';

interface OfficeDirectorySectionProps {
  showBulkRequest?: boolean;
}

const OFFICE_DIRECTORY_PER_PAGE = 6;

export const OfficeDirectorySection: React.FC<OfficeDirectorySectionProps> = ({
  showBulkRequest = false,
}) => {
  const [officeDirectoryRows, setOfficeDirectoryRows] = useState<OfficeDirectoryRow[]>([]);
  const [officeDirectoryLoading, setOfficeDirectoryLoading] = useState(false);
  const [officeDirectoryError, setOfficeDirectoryError] = useState('');
  const [officeDirectorySearch, setOfficeDirectorySearch] = useState('');
  const [officeDirectoryPage, setOfficeDirectoryPage] = useState(0);
  const [selectedOfficeRow, setSelectedOfficeRow] = useState<OfficeDirectoryRow | null>(null);
  const [officeEmployees, setOfficeEmployees] = useState<any[]>([]);
  const [officeEmployeesLoading, setOfficeEmployeesLoading] = useState(false);

  // Load the directory rows on mount
  useEffect(() => {
    let cancelled = false;

    const loadDirectory = () => {
      setOfficeDirectoryLoading(true);
      setOfficeDirectoryError('');
      getOfficeDirectory().then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setOfficeDirectoryRows(result.data);
        } else {
          setOfficeDirectoryError((result as { ok: false; error: string }).error || 'Failed to load offices');
        }
        setOfficeDirectoryLoading(false);
      });
    };

    loadDirectory();

    const reload = () => {
      if (!cancelled) loadDirectory();
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
  }, []);

  const handleOfficeClick = (row: OfficeDirectoryRow) => {
    setSelectedOfficeRow(row);
    setOfficeEmployees([]);
    setOfficeEmployeesLoading(true);
    (supabase as any)
      .from('employees_with_department')
      .select('id, full_name, current_position, department, status, email, mobile_number')
      .eq('department', row.officeName)
      .order('current_position', { ascending: true })
      .order('full_name', { ascending: true })
      .then(({ data }: { data: any[] | null }) => {
        setOfficeEmployees(Array.isArray(data) ? data : []);
        setOfficeEmployeesLoading(false);
      });
  };

  const filteredOfficeDirectoryRows = useMemo(
    () => filterOfficeDirectory(officeDirectoryRows, officeDirectorySearch),
    [officeDirectoryRows, officeDirectorySearch]
  );

  const officeDirectoryPageCount = Math.max(1, Math.ceil(filteredOfficeDirectoryRows.length / OFFICE_DIRECTORY_PER_PAGE));
  const safeOfficeDirectoryPage = Math.min(officeDirectoryPage, officeDirectoryPageCount - 1);
  const paginatedOfficeDirectoryRows = useMemo(
    () =>
      filteredOfficeDirectoryRows.slice(
        safeOfficeDirectoryPage * OFFICE_DIRECTORY_PER_PAGE,
        (safeOfficeDirectoryPage + 1) * OFFICE_DIRECTORY_PER_PAGE
      ),
    [filteredOfficeDirectoryRows, safeOfficeDirectoryPage]
  );

  useEffect(() => {
    if (officeDirectoryPage > officeDirectoryPageCount - 1) {
      setOfficeDirectoryPage(Math.max(0, officeDirectoryPageCount - 1));
    }
  }, [officeDirectoryPage, officeDirectoryPageCount]);

  const clearOfficeDirectoryFilters = () => {
    setOfficeDirectorySearch('');
    setOfficeDirectoryPage(0);
  };

  return (
    <div className="space-y-4">
      {selectedOfficeRow ? (
        /* Office employee list for selected office */
        <>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-sm">
              <button
                type="button"
                onClick={() => setSelectedOfficeRow(null)}
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
              >
                <ChevronLeft size={13} /> Office Directory
              </button>
              <ChevronRight size={13} className="text-slate-400" />
              <span className="font-medium text-slate-700">{selectedOfficeRow.officeName}</span>
            </div>
            <h2 className="!mb-0.5 text-xl font-bold text-slate-900">{selectedOfficeRow.officeName}</h2>
            <p className="!mb-0 text-sm text-slate-500">{officeEmployees.length} employee{officeEmployees.length === 1 ? '' : 's'}</p>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Employee</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {officeEmployeesLoading ? (
                  <tr>
                    <td colSpan={2} className="px-5 py-8 text-center text-sm text-slate-400">Loading employees...</td>
                  </tr>
                ) : officeEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-5 py-8 text-center text-sm text-slate-400">No employees found for this office.</td>
                  </tr>
                ) : (
                  officeEmployees.map((employee: any) => (
                    <tr key={employee.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="!mb-0 font-semibold" style={{ color: '#040E6B' }}>{employee.full_name}</p>
                        <p className="!mb-0 mt-0.5 text-xs text-slate-400">{employee.email || '--'}</p>
                      </td>
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
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Office Directory</h2>
              <p className="text-sm text-slate-500 mt-0.5">Click an office row to view all assigned employees and their accounts</p>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="relative">
              <Search size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={officeDirectorySearch}
                onChange={(e) => {
                  setOfficeDirectorySearch(e.target.value);
                  setOfficeDirectoryPage(0);
                }}
                placeholder="Search by office or department head..."
                className="h-12 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-base"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-base text-slate-600">
              <p className="!mb-0">Showing {filteredOfficeDirectoryRows.length} office{filteredOfficeDirectoryRows.length === 1 ? '' : 's'}</p>
              <button type="button" className="text-sm font-medium text-blue-700" onClick={clearOfficeDirectoryFilters}>
                Clear Filters
              </button>
            </div>
          </section>

          {officeDirectoryError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{officeDirectoryError}</div>
          )}

          <div className="flex items-center justify-center text-lg font-semibold text-slate-700">
            {filteredOfficeDirectoryRows.length === 0
              ? 'Office 0 to 0 of 0'
              : `Office ${safeOfficeDirectoryPage * OFFICE_DIRECTORY_PER_PAGE + 1} to ${Math.min((safeOfficeDirectoryPage + 1) * OFFICE_DIRECTORY_PER_PAGE, filteredOfficeDirectoryRows.length)} of ${filteredOfficeDirectoryRows.length}`}
          </div>

          <section>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Office / Department</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department Head</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Employees</th>
                  </tr>
                </thead>
                <tbody>
                  {officeDirectoryLoading ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-12 text-center text-slate-500">Loading offices...</td>
                    </tr>
                  ) : (
                    <>
                      {paginatedOfficeDirectoryRows.map((row) => (
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
                      {filteredOfficeDirectoryRows.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-5 py-12 text-center text-slate-500">
                            <Briefcase className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                            <p className="font-medium">{officeDirectoryRows.length === 0 ? 'No offices found.' : 'No offices match your search.'}</p>
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <p className="!mb-0">
              Showing {filteredOfficeDirectoryRows.length === 0 ? 0 : safeOfficeDirectoryPage * OFFICE_DIRECTORY_PER_PAGE + 1}-{Math.min((safeOfficeDirectoryPage + 1) * OFFICE_DIRECTORY_PER_PAGE, filteredOfficeDirectoryRows.length)} of {filteredOfficeDirectoryRows.length} offices
            </p>
            <div className="flex items-center gap-2">
              <button
                className="rounded border border-slate-300 p-1 disabled:opacity-40"
                onClick={() => setOfficeDirectoryPage((current) => Math.max(0, current - 1))}
                disabled={safeOfficeDirectoryPage === 0 || filteredOfficeDirectoryRows.length === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-semibold text-slate-800">Page {safeOfficeDirectoryPage + 1} / {officeDirectoryPageCount}</span>
              <button
                className="rounded border border-slate-300 p-1 disabled:opacity-40"
                onClick={() => setOfficeDirectoryPage((current) => Math.min(officeDirectoryPageCount - 1, current + 1))}
                disabled={safeOfficeDirectoryPage >= officeDirectoryPageCount - 1 || filteredOfficeDirectoryRows.length === 0}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
};
