/**
 * PM Admin → Archive.
 *
 * Browse any employee's closed, rated IPCR semesters. Read-only: once a semester
 * is rated it's a historical record, and it's the baseline the summary of
 * ratings and competency gap analysis assess against.
 */

import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, Building2, Search } from 'lucide-react';
import { EmptyState } from '../../../components/EmptyState';
import {
  getEmployeeArchive,
  listArchiveEmployees,
  type ArchiveEmployee,
  type ArchiveSemester,
} from '../../../lib/api/ipcrArchive';
import { getAdjectival } from './SummaryOfRatings';
import { IpcrArchiveSemester } from './IpcrArchiveSemester';

export const PMArchive = () => {
  const [employees, setEmployees] = useState<ArchiveEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<ArchiveEmployee | null>(null);
  const [semesters, setSemesters] = useState<ArchiveSemester[]>([]);
  const [semLoading, setSemLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listArchiveEmployees();
      if (cancelled) return;
      setEmployees(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const openEmployee = async (emp: ArchiveEmployee) => {
    setSelected(emp);
    setSemesters([]);
    setSemLoading(true);
    const rows = await getEmployeeArchive(emp.employeeNum);
    setSemesters(rows);
    setSemLoading(false);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(term) ||
        (e.department ?? '').toLowerCase().includes(term) ||
        (e.position ?? '').toLowerCase().includes(term) ||
        e.employeeNum.toLowerCase().includes(term)
    );
  }, [employees, search]);

  // ── Drill-in: one employee's archived semesters ─────────────────────────
  if (selected) {
    const adj = getAdjectival(selected.overall);
    return (
      <div className="space-y-5">
        <div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" /> All employees
          </button>
          <h2 className="text-2xl font-bold text-slate-900">{selected.name}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {selected.employeeNum}
            {selected.position ? ` · ${selected.position}` : ''}
            {selected.department ? ` · ${selected.department}` : ''}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-slate-500">Career average</span>
            <span className="text-sm font-bold text-slate-900">{selected.overall != null ? selected.overall.toFixed(2) : '—'}</span>
            <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}>{adj.label}</span>
          </div>
        </div>

        {semLoading ? (
          <p className="text-sm text-slate-400">Loading archived semesters…</p>
        ) : semesters.length === 0 ? (
          <EmptyState title="No archived semesters" description="This employee has no closed, rated IPCR records yet." />
        ) : (
          <div className="space-y-3">
            {semesters.map((s, i) => (
              <IpcrArchiveSemester key={s.period} semester={s} defaultOpen={i === 0} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Employee list ───────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <Archive className="h-6 w-6 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Archive</h2>
          <p className="text-sm text-slate-500">Closed, rated IPCR records by employee — the baseline for ratings and competency gap analysis</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by employee, number, position or office…"
          className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading archive…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={employees.length === 0 ? 'No archived IPCR records' : 'No employees match your search'}
          description={employees.length === 0 ? 'Once semesters are closed and rated they appear here as historical records.' : 'Try a different name, number, position or office.'}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-12 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <div className="col-span-4">Employee</div>
            <div className="col-span-3">Office</div>
            <div className="col-span-2 text-center">Semesters</div>
            <div className="col-span-3 text-center">Career average</div>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.map((e) => {
              const adj = getAdjectival(e.overall);
              return (
                <button
                  key={e.employeeNum}
                  type="button"
                  onClick={() => void openEmployee(e)}
                  className="grid w-full grid-cols-12 items-center px-5 py-3.5 text-left transition hover:bg-blue-50/40"
                >
                  <div className="col-span-4 min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{e.name}</p>
                    <p className="truncate text-xs text-slate-400">{e.employeeNum}{e.position ? ` · ${e.position}` : ''}</p>
                  </div>
                  <div className="col-span-3 flex min-w-0 items-center gap-1.5 text-sm text-slate-600">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{e.department ?? '—'}</span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="text-sm font-semibold text-slate-800">{e.semesterCount}</span>
                    {e.latestPeriod && <p className="text-[11px] text-slate-400">latest {e.latestPeriod}</p>}
                  </div>
                  <div className="col-span-3 flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-slate-900">{e.overall != null ? e.overall.toFixed(2) : '—'}</span>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}>{adj.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PMArchive;
