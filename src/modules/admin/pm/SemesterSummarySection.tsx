/**
 * "Semester Summary of Ratings" — the second, period-scoped section that appears
 * beneath the existing Complete Summary of Ratings (Requirement 2), plus the PM
 * semester-transition control that gates L&D (Requirement 3).
 *
 * Its own heading/section (NOT a subtab). Renders only once Phase 2 is open and
 * at least one finalized IPCR exists for the new (collecting) semester; it then
 * self-backfills every already-completed new-semester IPCR. The transition card
 * shows completion across all offices and lets a PM confirm the cutover once 100%
 * is reached, at which point L&D switches to the new semester.
 */

import { ArrowLeft, ArrowUpDown, Building2, ChevronDown, ChevronRight, GraduationCap, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh';
import { EmptyState } from '../../../components/EmptyState';
import { getAdjectival, groupByDept, type IPCRRatingRecord } from './SummaryOfRatings';
import { CompetencyGapPanel } from './CompetencyGapPanel';
import {
  getSemesterSectionState,
  getSemesterRatingRecords,
  type SemesterSectionState,
} from '../../../lib/api/semesterSummaryOfRatings';
import {
  computeNewSemesterCompletion,
  confirmSemesterTransition,
  type CompletionSnapshot,
} from '../../../lib/api/semesterTransition';

export const SemesterSummarySection = () => {
  const [section, setSection] = useState<SemesterSectionState | null>(null);
  const [records, setRecords] = useState<IPCRRatingRecord[]>([]);
  const [completion, setCompletion] = useState<CompletionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [deptSortAsc, setDeptSortAsc] = useState(false);
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const latestLoadId = useRef(0);

  const load = useCallback(async (isSilent = false) => {
    const loadId = ++latestLoadId.current;
    if (!isSilent) setLoading(true);
    try {
      const state = await getSemesterSectionState();
      if (loadId !== latestLoadId.current) return;
      setSection(state);
      if (state.visible && state.newCycleId != null) {
        const [recs, snap] = await Promise.all([
          getSemesterRatingRecords(state.newCycleId),
          computeNewSemesterCompletion(),
        ]);
        if (loadId !== latestLoadId.current) return;
        setRecords(recs);
        setCompletion(snap);
      } else {
        setRecords([]);
        setCompletion(null);
      }
    } catch (err) {
      console.error('Error loading Semester Summary of Ratings:', err);
    } finally {
      if (loadId === latestLoadId.current && !isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh({
    channel: 'pm-semester-summary-of-ratings',
    tables: ['target_settings', 'employee_competencies', 'semester_transition_state'],
    onChange: useCallback(() => {
      void load(true);
    }, [load]),
  });

  const onConfirmTransition = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await confirmSemesterTransition('PM Admin');
      if (!res.ok) {
        setConfirmError(res.error ?? 'Could not confirm the transition.');
        return;
      }
      await load(); // section retires (new → current); L&D now reads the new semester
    } finally {
      setConfirming(false);
    }
  };

  // Office landing rows — same shape as the existing Summary of Ratings section:
  // Department, Employees, Avg Rating, Needs Attention. "Needs Attention" counts
  // employees with at least one competency gap this semester.
  const deptRows = useMemo(() => {
    const groups = groupByDept(records);
    const rows = Array.from(groups.entries()).map(([department, g]) => ({
      department,
      count: g.records.length,
      avg: g._count > 0 ? g.avg : null,
      needsAttention: g.records.filter((r) => (r.competencies ?? []).some((c) => c.isGap)).length,
      awaiting: g.records.filter((r) => r.numericalRating === null).length,
    }));
    return rows.sort((a, b) => {
      const aAvg = a.avg ?? -1;
      const bAvg = b.avg ?? -1;
      return deptSortAsc ? aAvg - bAvg : bAvg - aAvg;
    });
  }, [records, deptSortAsc]);

  // Employees within the drilled-in office, searched + sorted by rating.
  const filteredSorted = useMemo(() => {
    if (!activeDept) return [];
    const term = searchTerm.trim().toLowerCase();
    return records
      .filter((r) => r.department === activeDept)
      .filter((r) => !term || r.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const av = a.numericalRating ?? -1;
        const bv = b.numericalRating ?? -1;
        return sortAsc ? av - bv : bv - av;
      });
  }, [records, activeDept, searchTerm, sortAsc]);

  // Nothing to show until Phase 2 is open AND a finalized new-semester IPCR exists.
  if (loading && !section) return null;
  if (!section?.visible) return null;

  const enterDept = (dept: string) => {
    setActiveDept(dept);
    setSearchTerm('');
  };
  const backToDepartments = () => {
    setActiveDept(null);
    setSearchTerm('');
  };

  const pct = completion?.pct ?? 0;
  const is100 = completion?.is100 ?? false;

  return (
    <section className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/30 p-6">
      {/* Own heading — distinct section, not a subtab */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-600">
            <GraduationCap className="h-3.5 w-3.5" /> New semester
          </p>
          <h2 className="mt-0.5 text-2xl font-bold text-gray-900">
            Semester Summary of Ratings{section.newCyclePeriod ? ` — ${section.newCyclePeriod}` : ''}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Required vs. possessed per competency for the semester currently being collected.
            Populates as offices submit finalized IPCRs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Transition gate card (Requirement 3) */}
      <div className="rounded-xl border border-indigo-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              L&amp;D data transition
            </p>
            <p className="mt-0.5 text-sm text-gray-700">
              L&amp;D keeps reading the previous semester until this one is 100% complete
              across all offices and a PM confirms.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">
              {completion ? `${completion.completed}/${completion.expected}` : '—'}
            </p>
            <p className="text-[11px] uppercase tracking-wider text-gray-400">employees complete</p>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all ${is100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className={`text-sm font-semibold ${is100 ? 'text-emerald-600' : 'text-indigo-600'}`}>
            {pct}% complete{is100 ? ' · ready to transition' : ''}
          </span>
          <button
            type="button"
            onClick={() => void onConfirmTransition()}
            disabled={!is100 || confirming}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {confirming ? 'Confirming…' : `Confirm transition${section.newCyclePeriod ? ` to ${section.newCyclePeriod}` : ''}`}
          </button>
        </div>
        {confirmError && <p className="mt-2 text-sm text-rose-600">{confirmError}</p>}
      </div>

      {/* Ratings for the new semester — organized by office, mirroring the
          existing Summary of Ratings section (Requirement 5). */}
      {activeDept === null ? (
        /* ── Office landing table ─────────────────────────────────── */
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {deptRows.length} office{deptRows.length !== 1 ? 's' : ''} · {records.length} employee{records.length !== 1 ? 's' : ''} rated
              {section.newCyclePeriod ? ` · ${section.newCyclePeriod}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setDeptSortAsc((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {deptSortAsc ? 'Lowest avg first' : 'Highest avg first'}
            </button>
          </div>

          <div className="grid grid-cols-12 items-center border-b border-gray-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <div className="col-span-5">Department</div>
            <div className="col-span-2 text-center">Employees</div>
            <div className="col-span-2 text-center">Avg Rating</div>
            <div className="col-span-2 text-center">Needs Attention</div>
            <div className="col-span-1" />
          </div>

          {deptRows.length === 0 ? (
            <div className="py-12">
              <EmptyState
                title="No new-semester ratings yet"
                description="Competency ratings will appear here as offices finalize IPCRs for this semester."
              />
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {deptRows.map((d) => {
                const adj = getAdjectival(d.avg);
                return (
                  <button
                    key={d.department}
                    type="button"
                    onClick={() => enterDept(d.department)}
                    className="grid w-full grid-cols-12 items-center px-5 py-4 text-left transition hover:bg-indigo-50/40"
                  >
                    <div className="col-span-5 flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{d.department}</span>
                    </div>
                    <div className="col-span-2 text-center text-sm text-gray-600">{d.count}</div>
                    <div className="col-span-2 flex flex-col items-center gap-1">
                      <span className="text-sm font-bold text-gray-900">{d.avg !== null ? d.avg.toFixed(2) : '—'}</span>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}>
                        {adj.label}
                      </span>
                    </div>
                    <div className="col-span-2 text-center">
                      {d.needsAttention > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600">
                          {d.needsAttention} with gaps
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                      {d.awaiting > 0 && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          {d.awaiting} awaiting
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
        /* ── Drilled-in office: employee ratings ──────────────────── */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={backToDepartments}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-indigo-600 transition"
            >
              <ArrowLeft className="h-4 w-4" /> All offices
            </button>
            <span className="text-sm font-semibold text-gray-700">
              {activeDept}
              {section.newCyclePeriod ? <span className="ml-2 font-normal text-gray-400">· {section.newCyclePeriod}</span> : null}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search employees in this office…"
                className="w-full rounded-lg border border-gray-200 py-1.5 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setSortAsc((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortAsc ? 'Lowest first' : 'Highest first'}
            </button>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="grid grid-cols-12 items-center border-b border-gray-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              <div className="col-span-4">Employee</div>
              <div className="col-span-4">Position</div>
              <div className="col-span-2 text-center">Rating</div>
              <div className="col-span-2 text-center">Gaps</div>
            </div>

            {filteredSorted.length === 0 ? (
              <div className="py-12">
                <EmptyState title="No employees found" description="No ratings match the current search." />
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredSorted.map((row) => {
                  const adj = getAdjectival(row.numericalRating);
                  const gapCount = (row.competencies ?? []).filter((c) => c.isGap).length;
                  const open = !!expandedRows[row.id];
                  return (
                    <div key={row.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedRows((p) => ({ ...p, [row.id]: !p[row.id] }))}
                        className="grid w-full grid-cols-12 items-center px-5 py-3.5 text-left transition hover:bg-gray-50/50"
                      >
                        <div className="col-span-4">
                          <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                          <p className="mt-0.5 text-xs text-gray-400">{row.department}</p>
                        </div>
                        <div className="col-span-4 pr-2 text-xs leading-snug text-gray-500">{row.position}</div>
                        <div className="col-span-2 flex flex-col items-center gap-1">
                          {row.numericalRating !== null ? (
                            <>
                              <span className="text-sm font-bold text-gray-900">{row.numericalRating.toFixed(2)}</span>
                              <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}>
                                {adj.label}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-sm font-bold text-gray-300">—</span>
                              <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                                Awaiting assessment
                              </span>
                            </>
                          )}
                        </div>
                        <div className="col-span-2 flex items-center justify-center gap-2">
                          {gapCount > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600">
                              {gapCount} gap{gapCount === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
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
        </div>
      )}
    </section>
  );
};

export default SemesterSummarySection;
