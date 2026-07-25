/**
 * L&D Archive — two-level drill-down.
 *
 *   Level 1: an office directory (one row per office) with record roll-ups.
 *   Level 2: the selected office's employees as training cards (unchanged design).
 *
 * Read-only view of `employee_training` (see lib/api/lndArchive). Attendance /
 * completion that were never captured render as documented conventions, not
 * invented data. Supports deep-linking straight to an employee (from Succession
 * Planning) via the initialOffice / focusEmployeeId props.
 */

import { Archive, ArrowLeft, Building2, CalendarClock, ChevronRight, ExternalLink, FileText, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import {
  listArchiveOfficeDirectory,
  listTrainingArchive,
  type ArchiveEmployee,
  type ArchiveOffice,
} from '../../lib/api/lndArchive';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

type SortKey = 'office' | 'employeesWithRecords' | 'recordCount' | 'latestDate';

export const LndArchive = ({
  initialOffice = null,
  focusEmployeeId = null,
}: {
  initialOffice?: string | null;
  focusEmployeeId?: string | null;
}) => {
  const [offices, setOffices] = useState<ArchiveOffice[]>([]);
  const [loadingOffices, setLoadingOffices] = useState(true);
  const [selectedOffice, setSelectedOffice] = useState<string | null>(initialOffice);
  const [employees, setEmployees] = useState<ArchiveEmployee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const [officeSearch, setOfficeSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'office', dir: 'asc' });
  const [empSearch, setEmpSearch] = useState('');
  const focusRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await listArchiveOfficeDirectory();
      if (!cancelled) {
        setOffices(data);
        setLoadingOffices(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load an office's employees whenever one is selected (incl. via deep-link).
  useEffect(() => {
    if (!selectedOffice) return;
    let cancelled = false;
    setLoadingEmployees(true);
    setEmpSearch('');
    (async () => {
      const data = await listTrainingArchive(selectedOffice);
      if (!cancelled) {
        setEmployees(data);
        setLoadingEmployees(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedOffice]);

  // Scroll a deep-linked employee into view once their office's cards render.
  useEffect(() => {
    if (focusEmployeeId && !loadingEmployees && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusEmployeeId, loadingEmployees, employees]);

  const grand = useMemo(() => ({
    offices: offices.length,
    employees: offices.reduce((s, o) => s + o.employeesWithRecords, 0),
    records: offices.reduce((s, o) => s + o.recordCount, 0),
  }), [offices]);

  const visibleOffices = useMemo(() => {
    const q = officeSearch.trim().toLowerCase();
    const filtered = q ? offices.filter((o) => o.office.toLowerCase().includes(q)) : offices;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === 'office') return a.office.localeCompare(b.office) * dir;
      if (sort.key === 'latestDate') return ((a.latestDate ?? '').localeCompare(b.latestDate ?? '')) * dir;
      return ((a[sort.key] as number) - (b[sort.key] as number)) * dir;
    });
  }, [offices, officeSearch, sort]);

  const visibleEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) ||
        (e.position ?? '').toLowerCase().includes(q) ||
        e.trainings.some((t) => t.title.toLowerCase().includes(q)),
    );
  }, [employees, empSearch]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'office' ? 'asc' : 'desc' }));

  const SortHead = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <th className={`px-4 py-2.5 ${className ?? ''}`}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-gray-700">
        {label}
        {sort.key === k && <span className="text-[9px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );

  return (
    <div className="space-y-6 p-8">
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Archive
          {selectedOffice && (
            <>
              <span className="mx-1 text-gray-400">/</span>
              <span className="text-gray-700">{selectedOffice}</span>
            </>
          )}
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-gray-900">
          <Archive className="h-7 w-7 text-blue-600" />
          L&D Archive
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Historical training records. Browse by office, then drill into an office to see each
          employee's training history. Read-only — sourced from completed training records.
        </p>
      </section>

      {/* Grand totals (always the org-wide total) */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 font-semibold text-gray-700">
          <Building2 className="h-3.5 w-3.5" /> {grand.offices} office{grand.offices === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 font-semibold text-gray-700">
          <FileText className="h-3.5 w-3.5" /> {grand.employees} employee{grand.employees === 1 ? '' : 's'} with records
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 font-semibold text-gray-700">
          {grand.records} training record{grand.records === 1 ? '' : 's'}
        </span>
      </div>

      {!selectedOffice ? (
        /* ── Level 1: office directory ─────────────────────────────────────── */
        <>
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={officeSearch}
              onChange={(e) => setOfficeSearch(e.target.value)}
              placeholder="Search offices…"
              className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {loadingOffices ? (
            <div className="rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-500">Loading offices…</div>
          ) : visibleOffices.length === 0 ? (
            <EmptyState icon={Archive} title="No offices" description="No offices match your search." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <SortHead label="Office" k="office" />
                    <SortHead label="Employees w/ Records" k="employeesWithRecords" className="text-center" />
                    <SortHead label="Training Records" k="recordCount" className="text-center" />
                    <SortHead label="Latest Training" k="latestDate" />
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleOffices.map((o) => (
                    <tr
                      key={o.office}
                      onClick={() => setSelectedOffice(o.office)}
                      className="cursor-pointer hover:bg-blue-50/40"
                    >
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
                          <Building2 className="h-4 w-4 text-gray-400" /> {o.office}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-gray-700">{o.employeesWithRecords}</td>
                      <td className="px-4 py-3.5 text-center">
                        {o.recordCount > 0 ? (
                          <span className="font-semibold text-gray-900">{o.recordCount}</span>
                        ) : (
                          <span className="text-gray-400">0 records</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">{fmtDate(o.latestDate)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
                          View Employees <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        /* ── Level 2: employees within the selected office ─────────────────── */
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedOffice(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Offices
            </button>
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="Search employees or training titles…"
                className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {loadingEmployees ? (
            <div className="rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-500">Loading employees…</div>
          ) : visibleEmployees.length === 0 ? (
            <EmptyState
              icon={Archive}
              title="No training records"
              description={empSearch ? 'No employees or trainings match your search.' : `${selectedOffice} has no training records on file yet.`}
            />
          ) : (
            <div className="space-y-5">
              {visibleEmployees.map((emp) => (
                <section
                  key={emp.employeeId}
                  ref={focusEmployeeId === emp.employeeId ? focusRef : undefined}
                  className={`overflow-hidden rounded-2xl border bg-white ${focusEmployeeId === emp.employeeId ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/60 px-5 py-4">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-gray-900">{emp.name}</h2>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {emp.position ?? '—'}
                        {emp.department ? ` · ${emp.department}` : ''}
                        {emp.employeeNumber ? ` · ${emp.employeeNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        <CalendarClock className="h-3.5 w-3.5" /> Hired {fmtDate(emp.dateHired)}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate('/admin/rsp/succession')}
                        title="View this office's succession pipeline"
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600"
                      >
                        <ExternalLink className="h-3 w-3" /> Succession Planning
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <th className="px-4 py-2.5">Training Title</th>
                          <th className="px-4 py-2.5">Category</th>
                          <th className="px-4 py-2.5">Provider</th>
                          <th className="px-4 py-2.5">Date Conducted</th>
                          <th className="px-4 py-2.5 text-center">Hours</th>
                          <th className="px-4 py-2.5">Attendance</th>
                          <th className="px-4 py-2.5">Completion</th>
                          <th className="px-4 py-2.5">Certificate No.</th>
                          <th className="px-4 py-2.5">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {emp.trainings.map((t) => (
                          <tr key={t.id} className="hover:bg-gray-50/60">
                            <td className="px-4 py-3 font-medium text-gray-900">{t.title}</td>
                            <td className="px-4 py-3 text-gray-600">{t.category ?? '—'}</td>
                            <td className="px-4 py-3 text-gray-600">{t.provider ?? '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{t.dateConducted}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{t.hours ?? '—'}</td>
                            <td className="px-4 py-3 text-gray-600">{t.attendanceStatus}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                {t.completionStatus}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{t.certificateNumber ?? '—'}</td>
                            <td className="px-4 py-3 text-gray-400">{t.remarks || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
