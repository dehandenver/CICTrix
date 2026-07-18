import { ArrowLeft, ArrowUpDown, Building2, ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { EmptyState } from '../../components/EmptyState';
import { getIPCRRecordsFromGapView } from '../../lib/api/competencyGapAnalysis';
import { REPORT_PERIOD, getAdjectival, groupByDept, type IPCRRatingRecord } from './pm/SummaryOfRatings';
import { CompetencyGapPanel } from './pm/CompetencyGapPanel';

// Employees rated below "Satisfactory" (< 3.00 on the IPCR scale) are flagged as
// needing improvement — the same absolute threshold the department landing counts.
const NEEDS_IMPROVEMENT_THRESHOLD = 3;

const fmtDate = (d: Date) =>
  d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const LndSummaryOfRatings = () => {
  const [records, setRecords] = useState<IPCRRatingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [deptSortAsc, setDeptSortAsc] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // null → department landing view; a department name → drilled-in employee view
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const latestLoadId = useRef(0);

  const fetchRecords = useCallback(async (isSilent = false) => {
    const loadId = ++latestLoadId.current;
    if (!isSilent) setLoading(true);
    try {
      const data = await getIPCRRecordsFromGapView(REPORT_PERIOD);
      if (loadId !== latestLoadId.current) return;
      setRecords(data);
      setLastSynced(new Date());
    } catch (err) {
      console.error('Error loading IPCR records:', err);
    } finally {
      if (loadId === latestLoadId.current && !isSilent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  useRealtimeRefresh({
    channel: 'lnd-summary-of-ratings',
    tables: ['success_indicator_ratings', 'ipcr_competency_matches'],
    onChange: useCallback(() => {
      void fetchRecords(true);
    }, [fetchRecords]),
  });

  // Department landing rows — grouped, with avg rating and low-performer counts.
  const deptRows = useMemo(() => {
    const groups = groupByDept(records);
    const rows = Array.from(groups.entries()).map(([department, g]) => {
      const lowCount = g.distribution.Unsatisfactory + g.distribution.Poor;
      return {
        department,
        count: g.records.length,
        avg: g._count > 0 ? g.avg : null,
        lowCount,
        nonSubmission: g.distribution['Non-Submission'],
      };
    });
    return rows.sort((a, b) => {
      const aAvg = a.avg ?? -1;
      const bAvg = b.avg ?? -1;
      return deptSortAsc ? aAvg - bAvg : bAvg - aAvg;
    });
  }, [records, deptSortAsc]);

  // Employees within the drilled-in department, searched + sorted by rating.
  const filteredSorted = useMemo(() => {
    if (!activeDept) return [];
    const term = searchTerm.toLowerCase();
    return records
      .filter(r => r.department === activeDept)
      .filter(r => !term || r.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const aScore = a.numericalRating ?? -1;
        const bScore = b.numericalRating ?? -1;
        return sortAsc ? aScore - bScore : bScore - aScore;
      });
  }, [records, searchTerm, activeDept, sortAsc]);

  const enterDept = (dept: string) => {
    setActiveDept(dept);
    setSearchTerm('');
  };

  const backToDepartments = () => {
    setActiveDept(null);
    setSearchTerm('');
  };

  return (
    <div className="space-y-5 p-8">
      {/* Header */}
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&D</span>{' '}
          <span className="mx-1 text-gray-400">/</span>{' '}
          {activeDept === null ? (
            <span>Summary of Ratings</span>
          ) : (
            <>
              <button
                type="button"
                onClick={backToDepartments}
                className="text-blue-600 hover:underline"
              >
                Summary of Ratings
              </button>
              <span className="mx-1 text-gray-400">/</span> {activeDept}
            </>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            {activeDept !== null && (
              <button
                type="button"
                onClick={backToDepartments}
                className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-blue-600 transition"
              >
                <ArrowLeft className="h-4 w-4" /> All departments
              </button>
            )}
            <h1 className="text-3xl font-bold text-gray-900">
              {activeDept === null ? 'Summary of Ratings' : activeDept}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {activeDept === null
                ? 'IPCR performance ratings by department — read-only identification surface'
                : `Employee ratings · sorted lowest-first · ${REPORT_PERIOD}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastSynced && (
              <span className="text-xs text-gray-400">
                Last synced {fmtDate(lastSynced)}
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchRecords()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {activeDept === null ? (
      /* ── Department landing table ─────────────────────────────── */
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <span className="text-sm text-gray-500">Loading…</span>
          </div>
        )}

        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {deptRows.length} department{deptRows.length !== 1 ? 's' : ''} · {records.length} employees
          </span>
          <button
            type="button"
            onClick={() => setDeptSortAsc(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {deptSortAsc ? 'Lowest avg first' : 'Highest avg first'}
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 items-center border-b border-gray-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <div className="col-span-5">Department</div>
          <div className="col-span-2 text-center">Employees</div>
          <div className="col-span-2 text-center">Avg Rating</div>
          <div className="col-span-2 text-center">Needs Attention</div>
          <div className="col-span-1" />
        </div>

        {deptRows.length === 0 && !loading ? (
          <div className="py-12">
            <EmptyState
              title="No departments found"
              description="No IPCR records are available to summarize yet."
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {deptRows.map(d => {
              const adj = getAdjectival(d.avg);
              return (
                <button
                  key={d.department}
                  type="button"
                  onClick={() => enterDept(d.department)}
                  className="grid w-full grid-cols-12 items-center px-5 py-4 text-left transition hover:bg-blue-50/40"
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{d.department}</span>
                  </div>
                  <div className="col-span-2 text-center text-sm text-gray-600">{d.count}</div>
                  <div className="col-span-2 flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-gray-900">
                      {d.avg !== null ? d.avg.toFixed(2) : '—'}
                    </span>
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}
                    >
                      {adj.label}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    {d.lowCount > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        {d.lowCount} low
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                    {d.nonSubmission > 0 && (
                      <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {d.nonSubmission} no sub
                      </span>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      ) : (
      <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search employees in this department…"
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <span className="ml-auto text-xs text-gray-400">
          {filteredSorted.length} employee{filteredSorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <span className="text-sm text-gray-500">Loading…</span>
          </div>
        )}

        {/* Sort toggle */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {filteredSorted.length} employee{filteredSorted.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => setSortAsc(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortAsc ? 'Lowest to highest' : 'Highest to lowest'}
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 items-center border-b border-gray-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <div className="col-span-4">Employee</div>
          <div className="col-span-3">Position</div>
          <div className="col-span-2 text-center">Rating</div>
          <div className="col-span-3">Period</div>
        </div>

        {/* Rows */}
        {filteredSorted.length === 0 && !loading ? (
          <div className="py-12">
            <EmptyState
              title="No employees found"
              description="No IPCR records match the current search."
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredSorted.map(row => {
              const isLow =
                row.numericalRating !== null &&
                row.numericalRating < NEEDS_IMPROVEMENT_THRESHOLD;
              const adj = getAdjectival(row.numericalRating);
              const hasGaps = (row.competencies ?? []).some(c => c.isGap);
              const open = !!expandedRows[row.id];
              return (
                <div key={row.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedRows(p => ({ ...p, [row.id]: !p[row.id] }))}
                    className={[
                      'grid w-full grid-cols-12 items-center border-l-4 px-5 py-3.5 text-left transition hover:bg-gray-50/50',
                      isLow ? 'border-l-amber-400' : 'border-l-transparent',
                    ].join(' ')}
                  >
                    <div className="col-span-4">
                      <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{row.department}</p>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {isLow && <span className="inline-block text-[10px] font-semibold text-amber-600">Low performer</span>}
                        {hasGaps && (
                          <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                            Training recommended
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="col-span-3 text-xs text-gray-500 leading-snug pr-2">
                      {row.position}
                    </div>
                    <div className="col-span-2 flex flex-col items-center gap-1">
                      <span className="text-sm font-bold text-gray-900">
                        {row.numericalRating !== null ? row.numericalRating.toFixed(2) : '—'}
                      </span>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}>
                        {adj.label}
                      </span>
                    </div>
                    <div className="col-span-3 flex items-center justify-between text-xs text-gray-500">
                      <span>{row.period}</span>
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-gray-100 bg-gray-50/60 p-4">
                      <CompetencyGapPanel record={row} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
};
