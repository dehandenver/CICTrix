import { useBackClosesView } from '../../../hooks/useHistoryBack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ListChecks,
  Lock,
  Unlock,
  RefreshCw,
  Scale,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { BackButton } from '../../../components/BackButton';
import { Dialog } from '../../../components/Dialog';
import { ConfirmModal, Modal } from '../../../components/modal';
import { useAsyncAction, useFeedback } from '../../../components/action-feedback';
import { useDepartmentNames } from '../../../hooks/useDepartmentOptions';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh';
import { type IpcrStage, stagePillStyle } from '../../../lib/api/ipcrStages';
import { type IpcrPhase } from '../../../lib/api/ipcrSubmissions';
import { getAllEmployees, type Employee } from '../../../lib/api/employees';
import { getEmployeeIPCR, type IPCRRowDraft, bucketForScore } from '../../../lib/api/performanceEvaluations';
import { computeOverallScore } from '../../../lib/api/ipcrWorkspace';
import { resolveOfficeWeights } from '../../../lib/api/officeWeighting';
import { loadEmployeeIpcrForReview } from '../../../lib/api/ipcrApproval';
import { OfficeWeightingPanel } from './OfficeWeightingPanel';
import { RatingScalePanel } from '../../../components/RatingScalePanel';
import { getCurrentAdminEmail } from '../moduleUi';
import { supabase as supabaseClient } from '../../../lib/supabase';
import { getSystemPhaseStates, openPhase, closePhase, type PhaseChangeResult } from '../../../lib/api/ipcrPhaseControl';
import { getActiveCyclePeriod } from '../../../lib/api/compliance';
import type { EffectiveState } from '../../../lib/api/phaseSchedules';
import { SkeletonList, useDelayedLoading, useTableLoading } from '../../../components/table-loading';

const supabase = supabaseClient as any;

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: string | Date | null | undefined): string => {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

function getMonthsOfService(hireDate: string): number {
  const hired = new Date(hireDate);
  const now = new Date();
  return Math.max(
    0,
    (now.getFullYear() - hired.getFullYear()) * 12 + (now.getMonth() - hired.getMonth()),
  );
}

function computeStageInfo(
  hireDate: string,
  schedules: any[] = []
): {
  stage: 'Target Setting' | 'Accomplishment Rating';
  phase: IpcrPhase;
  dueDate: Date;
  periodLabel: string;
} {
  const hired = new Date(hireDate);
  const months = getMonthsOfService(hireDate);

  if (months < 6) {
    // 1. Check if there is a PM-configured probationary cycle for the employee's hire month
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const hireMonthName = monthNames[hired.getMonth()];
    
    // Find the latest configured cycle for this hired month
    const sched = schedules.find((s) => s.hired_month === hireMonthName);
    
    if (sched) {
      const now = new Date();
      const targetEnd = new Date(sched.target_end);
      const accomplishmentEnd = new Date(sched.accomplishment_end);
      
      if (now <= targetEnd) {
        return {
          stage: 'Target Setting',
          phase: 'target',
          dueDate: targetEnd,
          periodLabel: sched.period_label,
        };
      } else {
        return {
          stage: 'Accomplishment Rating',
          phase: 'rating',
          dueDate: accomplishmentEnd,
          periodLabel: sched.period_label,
        };
      }
    }

    // Probationary: 3-month cycles
    if (months < 3) {
      const due = new Date(hired);
      due.setMonth(due.getMonth() + 3);
      return {
        stage: 'Target Setting',
        phase: 'target',
        dueDate: due,
        periodLabel: 'Probationary — 1st 3 Months',
      };
    }
    const due = new Date(hired);
    due.setMonth(due.getMonth() + 6);
    return {
      stage: 'Accomplishment Rating',
      phase: 'rating',
      dueDate: due,
      periodLabel: 'Probationary — 2nd 3 Months',
    };
  }

  // Regular: 6-month cycles starting from the 6-month mark
  const regularStart = new Date(hired);
  regularStart.setMonth(regularStart.getMonth() + 6);
  const now = new Date();
  const msSinceRegular = Math.max(
    0,
    (now.getFullYear() - regularStart.getFullYear()) * 12 +
      (now.getMonth() - regularStart.getMonth()),
  );
  const completedCycles = Math.floor(msSinceRegular / 12);
  const posInCycle = msSinceRegular % 12;
  const cycleStart = new Date(regularStart);
  cycleStart.setMonth(cycleStart.getMonth() + completedCycles * 12);
  const yr = cycleStart.getFullYear();
  const halfLabel = cycleStart.getMonth() < 6 ? '1st Half' : '2nd Half';

  if (posInCycle < 6) {
    const due = new Date(cycleStart);
    due.setMonth(due.getMonth() + 6);
    return {
      stage: 'Target Setting',
      phase: 'target',
      dueDate: due,
      periodLabel: `${halfLabel} ${yr}`,
    };
  }
  const due = new Date(cycleStart);
  due.setMonth(due.getMonth() + 12);
  return {
    stage: 'Accomplishment Rating',
    phase: 'rating',
    dueDate: due,
    periodLabel: `${halfLabel} ${yr}`,
  };
}

/**
 * Start of the employee's CURRENT overarching cycle — the floor used to match a
 * submission to this employee without picking up a stale one from a prior cycle.
 * Mirrors the regular-cycle math in computeStageInfo. Probationary employees use
 * their hire date (the whole probation is the current window).
 */
function currentCycleStart(hireDate: string): Date {
  const hired = new Date(hireDate);
  if (getMonthsOfService(hireDate) < 6) return hired;
  const regularStart = new Date(hired);
  regularStart.setMonth(regularStart.getMonth() + 6);
  const now = new Date();
  const msSinceRegular = Math.max(
    0,
    (now.getFullYear() - regularStart.getFullYear()) * 12 + (now.getMonth() - regularStart.getMonth()),
  );
  const completedCycles = Math.floor(msSinceRegular / 12);
  const cycleStart = new Date(regularStart);
  cycleStart.setMonth(cycleStart.getMonth() + completedCycles * 12);
  return cycleStart;
}

function deriveStatus(
  dueDate: Date,
  actualStage: IpcrStage,
): 'Completed' | 'In Progress' | 'Not Started' | 'Overdue' {
  if (actualStage === 'Forwarded to PM' || actualStage === 'Verified') return 'Completed';
  if (actualStage !== 'Not Started') return 'In Progress';
  return new Date() > dueDate ? 'Overdue' : 'Not Started';
}


// ── Types ────────────────────────────────────────────────────────────────────

interface EnrichedEmployee extends Employee {
  monthsOfService: number;
  computedStage: 'Target Setting' | 'Accomplishment Rating';
  computedDueDate: Date;
  computedPhase: IpcrPhase;
  periodLabel: string;
  actualStage: IpcrStage;
  submissionId: string | null;
  employeeStatus: 'Completed' | 'In Progress' | 'Not Started' | 'Overdue';
}

interface OfficeGroup {
  officeId: string | null;
  officeName: string;
  employees: EnrichedEmployee[];
  pending: number;
  completed: number;
}

// ── Stat Card ────────────────────────────────────────────────────────────────


// ── IPCR Detail Page ─────────────────────────────────────────────────────────

const IPCRDetailPage = ({
  employee,
}: {
  employee: EnrichedEmployee;
  onStageUpdate: (id: string, stage: IpcrStage) => void;
}) => {


  const [ipcrRows, setIpcrRows] = useState<IPCRRowDraft[]>([]);
  const [ipcrLoading, setIpcrLoading] = useState(true);
  const showIpcrLoader = useDelayedLoading(ipcrLoading);
  const [ipcrError, setIpcrError] = useState('');
  const [relationalStatus, setRelationalStatus] = useState<string | null>(null);
  const [relationalPhase2Status, setRelationalPhase2Status] = useState<string | null>(null);
  const [legacyEvaluationStatus, setLegacyEvaluationStatus] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  // The office's Core/Strategic/Support split, so the overall shown here matches
  // the weighted score rollUpToWorkspace stores — not an unweighted mean.
  const [officeWeights, setOfficeWeights] = useState<
    { core: number; strategic: number; support: number } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const name = String(employee.department ?? '').trim();
      if (!name) {
        setOfficeWeights(null);
        return;
      }
      const { data: dep } = await (supabaseClient as any)
        .from('departments')
        .select('id')
        .eq('name', name)
        .maybeSingle();
      const weights = dep?.id ? await resolveOfficeWeights(String(dep.id)) : null;
      if (!cancelled) {
        setOfficeWeights(weights ? { core: weights.core, strategic: weights.strategic, support: weights.support } : null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employee.department]);

  const reload = useCallback(async () => {
    setIpcrLoading(true);
    setIpcrError('');
    try {
      const res = await loadEmployeeIpcrForReview(employee.id, null);
      if (res.ok && res.data.relational) {
        setIpcrRows(res.data.rows);
        setRelationalStatus(res.data.status ?? null);
        setRelationalPhase2Status(res.data.phase2Status ?? null);
        setLegacyEvaluationStatus(null);
      } else {
        const legacyRes = await getEmployeeIPCR(
          employee.employee_id || '',
          employee.periodLabel,
          employee.id,
          null
        );
        if (legacyRes.success && legacyRes.data) {
          setIpcrRows(legacyRes.data.rows || []);
          setLegacyEvaluationStatus(legacyRes.data.evaluation?.status ?? null);
        } else {
          setIpcrError(legacyRes.error || 'Failed to load IPCR rows.');
          setLegacyEvaluationStatus(null);
        }
        setRelationalStatus(null);
        setRelationalPhase2Status(null);
      }
    } catch (err) {
      setIpcrError('Error fetching IPCR details.');
    } finally {
      setIpcrLoading(false);
    }
  }, [employee.id, employee.employee_id, employee.periodLabel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useRealtimeRefresh({
    channel: `pm-ipcr-detail-${employee.id}`,
    tables: ['target_settings', 'mfos', 'success_indicators', 'success_indicator_ratings'],
    onChange: reload,
    enabled: true,
  });




  const monthsText =
    employee.monthsOfService < 1
      ? 'Less than 1 month'
      : employee.monthsOfService === 1
        ? '1 month'
        : `${employee.monthsOfService} months`;
  const isProbationary = employee.monthsOfService < 6;

  const LEGACY_WITHOUT_EVALUATION_IS_VISIBLE = true;

  // computedPhase comes from the calendar alone (months of service vs the
  // probationary schedule), so an employee still inside their target-setting
  // window reads as 'target' even after they have submitted accomplishments and
  // had them approved. That hid the entire Phase 2 section here — PM saw only
  // the Phase 1 MFOs for a fully rated IPCR. Trust the record's actual Phase 2
  // state when it has one, and fall back to the schedule when it doesn't.
  const phase2Started = ['open', 'in_progress', 'completed'].includes(
    String(relationalPhase2Status ?? '').toLowerCase(),
  );
  const showPhase2 = employee.computedPhase === 'rating' || phase2Started;

  const splitTarget = (targetText: string) => {
    const delimiter = ' — ';
    const index = targetText.indexOf(delimiter);
    if (index !== -1) {
      return {
        mfoTitle: targetText.substring(0, index),
        siDescription: targetText.substring(index + delimiter.length),
      };
    }
    return {
      mfoTitle: 'Untitled MFO',
      siDescription: targetText,
    };
  };

  const groupedRows = useMemo(() => {
    const groups: Record<string, { functionType: string; indicators: any[] }> = {};
    for (const row of ipcrRows) {
      const { mfoTitle, siDescription } = splitTarget(row.target_text || '');
      if (!groups[mfoTitle]) {
        groups[mfoTitle] = {
          functionType: row.function_type,
          indicators: [],
        };
      }
      groups[mfoTitle].indicators.push({
        ...row,
        siDescription,
      });
    }
    return groups;
  }, [ipcrRows]);

  const computedScores = useMemo(() => {
    const acc: Record<string, { q: number[]; e: number[]; t: number[] }> = {
      core: { q: [], e: [], t: [] },
      strategic: { q: [], e: [], t: [] },
      support: { q: [], e: [], t: [] },
    };

    for (const row of ipcrRows) {
      const fn = (row.function_type || '').toLowerCase();
      if (!acc[fn]) {
        acc[fn] = { q: [], e: [], t: [] };
      }
      if (row.q_rating != null) acc[fn].q.push(row.q_rating);
      if (row.e_rating != null) acc[fn].e.push(row.e_rating);
      if (row.t_rating != null) acc[fn].t.push(row.t_rating);
    }

    const mean = (xs: number[]): number | null =>
      xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)) : null;

    const catAvg = (fn: string) => {
      const q = mean(acc[fn].q);
      const e = mean(acc[fn].e);
      const t = mean(acc[fn].t);
      const filled = [q, e, t].filter((r): r is number => r !== null && !Number.isNaN(r));
      if (filled.length === 0) return null;
      return Number((filled.reduce((a, b) => a + b, 0) / filled.length).toFixed(2));
    };

    const coreAvg = catAvg('core');
    const strategicAvg = catAvg('strategic');
    const supportAvg = catAvg('support');

    // Apply the office's Core/Strategic/Support split so this matches the
    // finalized score rollUpToWorkspace stores. computeOverallScore falls back
    // to an unweighted mean when no weights are configured, so this is never
    // worse than before.
    const overallScore = computeOverallScore([
      { average: coreAvg, weight: officeWeights?.core ?? null },
      { average: strategicAvg, weight: officeWeights?.strategic ?? null },
      { average: supportAvg, weight: officeWeights?.support ?? null },
    ]);

    return {
      coreAvg,
      strategicAvg,
      supportAvg,
      overallScore,
    };
  }, [ipcrRows, officeWeights]);

  const isApproved =
    relationalStatus === 'approved' ||
    legacyEvaluationStatus === 'Approved' ||
    (LEGACY_WITHOUT_EVALUATION_IS_VISIBLE &&
      relationalStatus === null &&
      legacyEvaluationStatus === null &&
      ipcrRows.length > 0);

  return (
    <div className="space-y-6">
      {showInfoModal && (
        <Dialog open onClose={() => setShowInfoModal(false)} title="Employee Information">
          <div className="space-y-4 text-sm w-80 max-w-full">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Name</p>
              <p className="font-semibold text-slate-800">{employee.full_name}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Position</p>
              <p className="font-medium text-slate-700">{employee.current_position ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Office / Department</p>
              <p className="font-medium text-slate-700">{employee.department ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Date Hired</p>
              <p className="font-medium text-slate-700">{fmtDate(employee.hire_date)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Length of Service</p>
              <p className="font-medium text-slate-700">{monthsText}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Employee Type</p>
              <p className="font-medium text-slate-700">{isProbationary ? 'Probationary' : 'Regular'}</p>
            </div>
            <div className="flex justify-end pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2 text-xs font-bold bg-[#363EE8] hover:bg-[#2931c5] text-white rounded-lg shadow-sm transition"
              >
                Close
              </button>
            </div>
          </div>
        </Dialog>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">IPCR — {employee.full_name}</h2>
            {isApproved && relationalStatus && (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                Phase 1: {relationalStatus.replace(/_/g, ' ')}
              </span>
            )}
            {isApproved && relationalPhase2Status && (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                Phase 2: {relationalPhase2Status.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">Review targets and accomplishments.</p>
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="mt-3 px-3 py-1.5 bg-[#363EE8] hover:bg-[#2931c5] text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
          >
            View Employee Information
          </button>
        </div>

        {!ipcrLoading && isApproved && (
          <div className="flex items-center gap-4 bg-slate-50/50 p-3 rounded-xl border border-slate-100 flex-shrink-0">
            {/* Visual Timeline Blocks */}
            <div className="flex items-stretch gap-1.5 w-60">
              <div
                className={`flex-1 rounded-lg p-2 border text-center ${
                  !showPhase2
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-emerald-50 border-emerald-100'
                }`}
              >
                <p className="text-[8px] text-slate-500 mb-0.5">
                  {isProbationary ? 'Month 1–3' : 'First 6 Mos'}
                </p>
                <p
                  className={`text-[10px] font-bold ${
                    !showPhase2 ? 'text-[#363EE8]' : 'text-emerald-700'
                  }`}
                >
                  Target Setting
                </p>
                {showPhase2 && (
                  <Check size={8} className="mx-auto mt-0.5 text-emerald-600" />
                )}
              </div>
              <ChevronRight size={10} className="text-slate-300 self-center flex-shrink-0" />
              <div
                className={`flex-1 rounded-lg p-2 border text-center ${
                  showPhase2
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <p className="text-[8px] text-slate-500 mb-0.5">
                  {isProbationary ? 'Month 4–6' : 'Second 6 Mos'}
                </p>
                <p
                  className={`text-[10px] font-bold ${
                    showPhase2 ? 'text-[#363EE8]' : 'text-slate-400'
                  }`}
                >
                  Accomplishment
                </p>
              </div>
            </div>

            {/* Metadata Text */}
            <div className="text-[11px] text-slate-500 space-y-1 border-l border-slate-200 pl-4">
              <div>
                Period: <strong className="text-slate-700">{employee.periodLabel}</strong>
              </div>
              <div>
                Due: <strong className="text-slate-700">{fmtDate(employee.computedDueDate)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-full space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
            <h3 className="text-sm font-bold text-slate-800">
              Employee IPCR Sheet
            </h3>
            {showPhase2 && computedScores.overallScore !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Overall Rating:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {computedScores.overallScore.toFixed(2)} — {bucketForScore(computedScores.overallScore)}
                </span>
              </div>
            )}
          </div>

          {ipcrLoading || showIpcrLoader ? (
            <SkeletonList show={showIpcrLoader} label="Loading IPCR details…" />
          ) : ipcrError ? (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center text-sm text-red-700">
              {ipcrError}
            </div>
          ) : !isApproved && (relationalStatus !== null || legacyEvaluationStatus !== null) ? (
            <div className="p-8 text-center text-sm text-amber-800 flex flex-col items-center gap-2">
              <ClipboardCheck size={28} className="text-amber-500 mb-1" />
              <span className="font-semibold text-base">IPCR Sheet Pending Approval</span>
              <span className="text-xs text-slate-500">This employee's IPCR has not yet been approved by their department head.</span>
            </div>
          ) : ipcrRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-amber-800 flex flex-col items-center gap-2">
              <ClipboardCheck size={28} className="text-amber-500 mb-1" />
              <span className="font-semibold">No IPCR records found</span>
              <span className="text-xs text-slate-500">The employee has not encoded targets for the rating period {employee.periodLabel}.</span>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedRows).map(([mfoTitle, group]) => (
                <div key={mfoTitle} className="bg-slate-50/40 rounded-xl border border-slate-200 p-4 space-y-4">
                  {/* MFO Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-indigo-600 tracking-wide uppercase bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                        M.F.O. / P.A.P.
                      </span>
                      <h4 className="text-xs font-bold text-slate-800">
                        {mfoTitle}
                      </h4>
                    </div>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                      group.functionType === 'CORE' 
                        ? 'bg-indigo-100/50 text-indigo-800 border border-indigo-200/40' 
                        : 'bg-slate-200/60 text-slate-700'
                    }`}>
                      {group.functionType}
                    </span>
                  </div>

                  {/* Visual Divider Separator */}
                  <div className="border-t border-slate-200 my-2"></div>

                  {/* Success Indicators List */}
                  <div className="space-y-4">
                    {group.indicators.map((si, siIdx) => {
                      const selfAvg = [si.q_rating, si.e_rating, si.t_rating].filter((v) => v !== null).length
                        ? Number(([si.q_rating, si.e_rating, si.t_rating].filter((v) => v !== null).reduce((a, b) => a + b, 0) / [si.q_rating, si.e_rating, si.t_rating].filter((v) => v !== null).length).toFixed(2))
                        : null;

                      return (
                        <div key={si.id || siIdx} className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-sm">
                          {/* Success Indicator Target */}
                          <div>
                            <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wider mb-1">
                              Success Indicator (Phase 1 Target)
                            </span>
                            <p className="text-slate-800 font-semibold text-xs leading-relaxed">
                              {si.siDescription || 'No indicator target description encoded.'}
                            </p>
                          </div>

                          {showPhase2 && (
                            <>
                              {/* Accomplishment Achievement */}
                              <div>
                                <span className="text-[9px] font-extrabold uppercase text-[#363EE8] block tracking-wider mb-1">
                                  Employee Achievement (Phase 2 Accomplishment)
                                </span>
                                <p className="text-slate-700 italic text-xs bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                                  {si.accomplishment_text || 'No accomplishments encoded.'}
                                </p>
                              </div>

                              {/* Ratings Footer */}
                              <div className="pt-3 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100">
                                {/* Left Side: Self-Rating */}
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-slate-400">Self-Rating:</span>
                                  <div className="flex gap-1.5">
                                    <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">
                                      Q: <strong className="text-slate-800">{si.q_rating ?? '—'}</strong>
                                    </span>
                                    <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">
                                      E: <strong className="text-slate-800">{si.e_rating ?? '—'}</strong>
                                    </span>
                                    <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">
                                      T: <strong className="text-slate-800">{si.t_rating ?? '—'}</strong>
                                    </span>
                                    <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded font-bold">
                                      A: {selfAvg !== null ? selfAvg.toFixed(2) : '—'}
                                    </span>
                                  </div>
                                </div>

                                {/* Right Side: Final Rating */}
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-bold text-indigo-600">Final Rating:</span>
                                  <div className="flex gap-2 items-center">
                                    <div className="flex gap-1.5">
                                      <label className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-slate-500">Q</span>
                                        <div className="flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 bg-white shadow-sm h-6">
                                          <span>{si.q_rating ?? '—'}</span>
                                          <ChevronDown size={10} className="text-slate-400" />
                                        </div>
                                      </label>
                                      <label className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-slate-500">E</span>
                                        <div className="flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 bg-white shadow-sm h-6">
                                          <span>{si.e_rating ?? '—'}</span>
                                          <ChevronDown size={10} className="text-slate-400" />
                                        </div>
                                      </label>
                                      <label className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-slate-500">T</span>
                                        <div className="flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 bg-white shadow-sm h-6">
                                          <span>{si.t_rating ?? '—'}</span>
                                          <ChevronDown size={10} className="text-slate-400" />
                                        </div>
                                      </label>
                                    </div>
                                    <span className="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                      Final A: {si.ave_rating ? si.ave_rating.toFixed(2) : '—'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}

                          {/* Remarks */}
                          {si.remarks && (
                            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 italic">
                              Remarks: {si.remarks}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Schedule Cycle Modal ──────────────────────────────────────────────────────

const ScheduleCycleModal = ({
  type,
  onClose,
  onScheduled,
}: {
  type: 'probationary' | 'regular';
  employees: EnrichedEmployee[];
  onClose: () => void;
  onScheduled: (period: string) => void;
}) => {
  const [period, setPeriod] = useState('');
  const [targetStart, setTargetStart] = useState('');
  const [targetEnd, setTargetEnd] = useState('');
  const [accomplishmentStart, setAccomplishmentStart] = useState('');
  const [accomplishmentEnd, setAccomplishmentEnd] = useState('');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const [newlyHiredMonth, setNewlyHiredMonth] = useState(monthNames[new Date().getMonth()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!period.trim()) {
      setError('Evaluation period label is required.');
      return;
    }
    if (!targetStart || !targetEnd || !accomplishmentStart || !accomplishmentEnd) {
      setError('All target setting and accomplishment setting dates are required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (type === 'probationary') {
        // 1. Insert schedule configuration
        const { error: dbErr } = await supabase
          .from('probationary_ipcr_schedules')
          .insert([
            {
              period_label: period.trim(),
              hired_month: newlyHiredMonth,
              target_start: targetStart,
              target_end: targetEnd,
              accomplishment_start: accomplishmentStart,
              accomplishment_end: accomplishmentEnd,
            }
          ]);

        if (dbErr) throw dbErr;

        // 2. Fetch newly hired from newly_hired table
        const { data: newlyHired, error: nhErr } = await supabase
          .from('newly_hired')
          .select('*');

        if (nhErr) throw nhErr;

        // Filter by the selected month name
        const matchingHires = (newlyHired ?? []).filter((nh: any) => {
          if (!nh.date_hired) return false;
          const hiredDate = new Date(nh.date_hired);
          return monthNames[hiredDate.getMonth()] === newlyHiredMonth;
        });

        const empIds = matchingHires.map((nh: any) => nh.employee_id).filter(Boolean);

        // Fetch active employees with department details matching the hired month as fallback
        const { data: activeEmployees } = await supabase
          .from('employees_with_department')
          .select('id, full_name, department_id, department, hire_date');

        const fallbackEmpIds = (activeEmployees ?? [])
          .filter((e: any) => {
            if (!e.hire_date) return false;
            return monthNames[new Date(e.hire_date).getMonth()] === newlyHiredMonth;
          })
          .map((e: any) => e.id);

        const allEmpIds = Array.from(new Set([...empIds, ...fallbackEmpIds]));
        const targetEmployees = (activeEmployees ?? []).filter((e: any) => allEmpIds.includes(e.id));

        // 3. Request targets by creating target setting stage IPCR submissions
        for (const emp of targetEmployees) {
          const { error: subErr } = await supabase
            .from('ipcr_submissions')
            .upsert([
              {
                employee_id: emp.id,
                employee_name: emp.full_name,
                office_id: emp.department_id || null,
                office_name: emp.department || null,
                period: period.trim(),
                phase: 'target',
                stage: 'Not Started',
                updated_by: getCurrentAdminEmail(),
              }
            ], { onConflict: 'employee_id,period,phase' });

          if (subErr) {
            console.error('Failed to create target request for employee', emp.full_name, subErr);
          }
        }
      } else {
        // Regular cycle updates phase schedules using resolving logic
        const { data: currentSchedules } = await supabase
          .from('phase_schedules')
          .select('*')
          .eq('scope', 'system');

        // Target Setting
        const tsRow = currentSchedules?.find((s: any) => s.phase === 'target_setting');
        if (tsRow) {
          await supabase.from('phase_schedules').update({
            start_date: targetStart,
            deadline_date: targetEnd,
            updated_by: getCurrentAdminEmail(),
          }).eq('id', tsRow.id);
        } else {
          await supabase.from('phase_schedules').insert({
            scope: 'system',
            phase: 'target_setting',
            start_date: targetStart,
            deadline_date: targetEnd,
            updated_by: getCurrentAdminEmail(),
          });
        }

        // Accomplishment Rating
        const ratingRow = currentSchedules?.find((s: any) => s.phase === 'rating');
        if (ratingRow) {
          await supabase.from('phase_schedules').update({
            start_date: accomplishmentStart,
            deadline_date: accomplishmentEnd,
            updated_by: getCurrentAdminEmail(),
          }).eq('id', ratingRow.id);
        } else {
          await supabase.from('phase_schedules').insert({
            scope: 'system',
            phase: 'rating',
            start_date: accomplishmentStart,
            deadline_date: accomplishmentEnd,
            updated_by: getCurrentAdminEmail(),
          });
        }
      }

      setSaving(false);
      onScheduled(period.trim());
      onClose();
    } catch (err: any) {
      setSaving(false);
      setError(err.message || 'An error occurred while saving the cycle.');
    }
  };

  return (
    <Dialog open title="Schedule IPCR Cycle" onClose={onClose}>
      <div style={{ width: '500px', maxWidth: '100%' }}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Evaluation Period Label *
            </label>
            <input
              type="text"
              placeholder={
                type === 'probationary'
                  ? 'e.g. Probationary Cycle 1 — Jan 2025'
                  : 'e.g. 1st Half 2025, Q3 FY2025'
              }
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Target Setting Start Date *
              </label>
              <input
                type="date"
                value={targetStart}
                onChange={(e) => setTargetStart(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Target Setting End Date *
              </label>
              <input
                type="date"
                value={targetEnd}
                onChange={(e) => setTargetEnd(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Accomplishment Start Date *
              </label>
              <input
                type="date"
                value={accomplishmentStart}
                onChange={(e) => setAccomplishmentStart(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Accomplishment End Date *
              </label>
              <input
                type="date"
                value={accomplishmentEnd}
                onChange={(e) => setAccomplishmentEnd(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
              />
            </div>
          </div>

          {type === 'probationary' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Newly Hired Employees for the month of: *
              </label>
              <select
                value={newlyHiredMonth}
                onChange={(e) => setNewlyHiredMonth(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
              >
                {monthNames.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 font-medium hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-bold bg-[#363EE8] text-white rounded-lg hover:bg-[#2931c5] disabled:opacity-50 flex items-center gap-2"
          >
            <Send size={13} />
            {saving ? 'Scheduling…' : 'Schedule Cycle'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ── Probationary Panel ────────────────────────────────────────────────────────

/** Two-way Open | Closed switch for a phase window. The active segment shows
 *  the current state; clicking the other one asks for confirmation upstream.
 *
 *  Both active states carry a status colour (§10: green open, red closed). The
 *  closed segment used to be plain white, which read the same as the inactive
 *  segment beside it, so the switch gave no colour cue at all when a phase was
 *  shut — the state that actually blocks employees from working. */
const PhaseWindowSwitch = ({
  isOpen,
  onOpen,
  onClose,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) => {
  const base = 'px-3 py-1 text-[11px] font-bold rounded-md transition-all';
  const idle = 'text-slate-500 hover:text-slate-800 active:scale-95';
  return (
    <div role="group" className="inline-flex p-0.5 bg-slate-100 border border-slate-200/70 rounded-lg">
      <button
        type="button"
        aria-pressed={isOpen}
        disabled={isOpen}
        onClick={onOpen}
        className={`${base} ${isOpen ? 'bg-emerald-600 text-white shadow-xs cursor-default' : idle}`}
      >
        Open
      </button>
      <button
        type="button"
        aria-pressed={!isOpen}
        disabled={!isOpen}
        onClick={onClose}
        className={`${base} ${!isOpen ? 'bg-[#E05252] text-white shadow-xs cursor-default' : idle}`}
      >
        Closed
      </button>
    </div>
  );
};

interface PhaseConfirmTarget {
  phase: 'phase1' | 'phase2';
  action: 'open' | 'close';
}

/** Unified confirmation modal for opening and closing Phase 1 / Phase 2 windows.
 *  Uses Dialog without a title prop so Dialog does not inject a duplicate header close button. */
const PhaseConfirmModal = ({
  open,
  phase,
  action,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  phase: 'phase1' | 'phase2';
  action: 'open' | 'close';
  onClose: () => void;
  onConfirmed: () => Promise<void>;
}) => {
  const feedback = useFeedback();
  const change = useAsyncAction<PhaseChangeResult>();
  const isOpenAction = action === 'open';
  const isPhase1 = phase === 'phase1';
  const phaseName = isPhase1 ? 'Phase 1' : 'Phase 2';

  const title = isOpenAction
    ? isPhase1 ? 'Open Phase 1?' : 'Open Phase 2?'
    : isPhase1 ? 'Close Phase 1?' : 'Close Phase 2?';

  const description = isOpenAction
    ? isPhase1
      ? 'This opens Target Setting system-wide and allows all regular and probationary employees to prepare and submit their IPCR targets.'
      : 'This opens Accomplishment Rating system-wide and allows all regular and probationary employees to submit their self-ratings.'
    : isPhase1
      ? 'This closes Target Setting system-wide and locks the submission window for all regular and probationary employees.'
      : 'This closes Accomplishment Rating system-wide and locks the submission window for all regular and probationary employees.';

  const handleConfirm = async () => {
    const changed = isOpenAction ? 'opened' : 'closed';
    await change.run({
      action: `${isOpenAction ? 'open' : 'close'} ${phaseName}`,
      failureChannel: 'toast',
      run: () => {
        const email = getCurrentAdminEmail();
        return isOpenAction
          ? openPhase({ phase, openedBy: email })
          : closePhase({ phase, closedBy: email });
      },
      onSuccess: (res) => {
        const warning = res.ok ? res.warning : undefined;
        if (warning) feedback.warning(`${phaseName} ${changed}, with a warning`, warning);
        else feedback.success(`${phaseName} ${changed}`);
      },
    });
    // The phase state is reloaded whatever the outcome, as before.
    onClose();
    await onConfirmed();
  };

  return (
    <ConfirmModal
      open={open}
      title={title}
      icon={isOpenAction ? <Unlock size={20} /> : <Lock size={20} />}
      message={description}
      confirmLabel={isOpenAction ? 'Confirm open' : 'Confirm close'}
      tone={isOpenAction ? 'primary' : 'destructive'}
      loading={change.pending}
      onConfirm={() => void handleConfirm()}
      onCancel={onClose}
    />
  );
};

const ProbationaryPanel = ({
  employees,
  loading,
  onRefresh,
  onSelectEmployee,
}: {
  employees: EnrichedEmployee[];
  loading: boolean;
  onRefresh: () => void;
  onSelectEmployee: (emp: EnrichedEmployee) => void;
}) => {
  const employeesLoad = useTableLoading(loading, employees.length > 0);
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  // The evaluation period this screen is acting on. It used to be set only by
  // the Schedule dialog, so the panel read "No active period" on every load
  // even when a cycle existed — and kept reading it while phase notifications
  // went out stamped with the period the API resolved anyway.
  const [currentPeriod, setCurrentPeriod] = useState('');
  const [periodScheduled, setPeriodScheduled] = useState(true);

  const [systemStates, setSystemStates] = useState<{ target_setting: EffectiveState; rating: EffectiveState }>({
    target_setting: 'Closed',
    rating: 'Closed',
  });
  const [confirmModal, setConfirmModal] = useState<PhaseConfirmTarget | null>(null);

  const loadSystemStates = useCallback(async () => {
    try {
      const [states, cycle] = await Promise.all([getSystemPhaseStates(), getActiveCyclePeriod()]);
      setSystemStates(states);
      setCurrentPeriod(cycle.period);
      setPeriodScheduled(cycle.isScheduled);
    } catch (err) {
      console.warn('Failed to load system phase states:', err);
    }
  }, []);

  useEffect(() => {
    void loadSystemStates();
  }, [loadSystemStates]);

  const handleRefresh = async () => {
    onRefresh();
    await loadSystemStates();
  };

  // Offices come from the canonical departments table, same as every other
  // screen. Any office actually present on these employees is unioned in so a
  // record whose office predates the table can still be filtered to.
  const departmentNames = useDepartmentNames();
  const officeOptions = useMemo(() => {
    const present = employees.map((e) => String(e.department ?? '').trim()).filter(Boolean);
    return Array.from(new Set([...departmentNames, ...present])).sort((a, b) => a.localeCompare(b));
  }, [departmentNames, employees]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const office = officeFilter.trim().toLowerCase();
    return employees.filter((e) => {
      const matchesSearch =
        !q ||
        e.full_name.toLowerCase().includes(q) ||
        (e.department ?? '').toLowerCase().includes(q) ||
        (e.current_position ?? '').toLowerCase().includes(q);
      const matchesOffice = !office || String(e.department ?? '').trim().toLowerCase() === office;
      return matchesSearch && matchesOffice;
    });
  }, [employees, search, officeFilter]);



  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          Employees with less than 6 months of service — 3-month IPCR cycle (Target Setting →
          Accomplishment Rating).
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh"
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShowSchedule(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-[#363EE8] text-white rounded-lg hover:bg-[#2931c5]"
          >
            <Calendar size={13} />
            Schedule IPCR Cycle
          </button>
        </div>
      </div>

      {/* Main White Container Card with Evaluation Period & Compact Vertically Stacked Phase Rows */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between bg-white rounded-xl border border-slate-200/90 py-2.5 px-4 shadow-xs gap-3">
        {/* Left: Evaluation Period Information */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 shadow-2xs">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Evaluation Period</p>
            <p className="text-xs font-bold text-slate-900 mt-0.5">{currentPeriod || 'No active period'}</p>
            {currentPeriod && !periodScheduled && (
              <p className="text-[9px] font-semibold text-amber-600 mt-0.5">
                Not scheduled — phases will use this period
              </p>
            )}
          </div>
        </div>

        {/* Right: Sleek Vertically Stacked Phase Rows */}
        <div className="flex flex-col gap-1.5 w-full lg:w-auto min-w-[320px]">
          {/* Phase 1 Row */}
          <div className="flex items-center justify-between gap-3 bg-slate-50/60 border border-slate-200/70 rounded-lg px-3 py-1 shadow-2xs">
            <span className="text-xs font-bold text-slate-900">Phase 1 (Target)</span>
            <PhaseWindowSwitch
              isOpen={systemStates.target_setting === 'Open'}
              onOpen={() => setConfirmModal({ phase: 'phase1', action: 'open' })}
              onClose={() => setConfirmModal({ phase: 'phase1', action: 'close' })}
            />
          </div>

          {/* Phase 2 Row */}
          <div className="flex items-center justify-between gap-3 bg-slate-50/60 border border-slate-200/70 rounded-lg px-3 py-1 shadow-2xs">
            <span className="text-xs font-bold text-slate-900">Phase 2 (Rating)</span>
            <PhaseWindowSwitch
              isOpen={systemStates.rating === 'Open'}
              onOpen={() => setConfirmModal({ phase: 'phase2', action: 'open' })}
              onClose={() => setConfirmModal({ phase: 'phase2', action: 'close' })}
            />
          </div>
        </div>
      </div>

      {/* Search + office filter */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by employee, office, or position…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
          />
        </div>
        <div className="relative sm:w-64">
          <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            aria-label="Filter by office"
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            className="w-full appearance-none pl-8 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
          >
            <option value="">All Offices</option>
            {officeOptions.map((office) => (
              <option key={office} value={office}>
                {office}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        {(search || officeFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setOfficeFilter('');
            }}
            className="px-3 py-2 text-sm font-medium text-[#363EE8] hover:underline whitespace-nowrap"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {employeesLoad.initialLoading ? (
          <SkeletonList show={employeesLoad.showSkeleton} label="Loading probationary employees…" />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <Users size={28} className="mb-2 text-slate-300" />
            <p className="text-sm">
              {officeFilter && !search
                ? `No probationary employees in ${officeFilter}.`
                : search || officeFilter
                  ? 'No results for your filters.'
                  : 'No probationary employees found.'}
            </p>
          </div>
        ) : (
          <div className="abyan-table-wrap">
            <table className="abyan-table w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[
                    'Employee',
                    'Office',
                    'Position',
                    'Date Hired',
                    'Current Stage',
                    'Deadline',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              {/* divide-slate-100 was too faint to tell one employee's row from
                  the next, and two employees can share a name (see the two
                  "Magiting Jimenez Cayabo" rows), so the separation has to
                  carry real weight. */}
              <tbody className="divide-y divide-slate-200">
                {filtered.map((emp) => (
                  <tr
                    key={emp.id}
                    onClick={() => onSelectEmployee(emp)}
                    className="cursor-pointer transition odd:bg-white even:bg-slate-50/70 hover:bg-blue-50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{emp.full_name}</div>
                      <div className="text-xs text-slate-500">{emp.employee_id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{emp.department ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{emp.current_position ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {fmtDate(emp.hire_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span style={stagePillStyle(emp.actualStage)}>{emp.actualStage}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {fmtDate(emp.computedDueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showSchedule && (
        <ScheduleCycleModal
          type="probationary"
          employees={employees}
          onClose={() => setShowSchedule(false)}
          onScheduled={(p) => {
            setCurrentPeriod(p);
            // A cycle now exists, so the label is no longer the fallback.
            setPeriodScheduled(true);
          }}
        />
      )}

      {confirmModal && (
        <PhaseConfirmModal
          open={Boolean(confirmModal)}
          phase={confirmModal.phase}
          action={confirmModal.action}
          onClose={() => setConfirmModal(null)}
          onConfirmed={loadSystemStates}
        />
      )}
    </div>
  );
};

// ── Regular Panel ─────────────────────────────────────────────────────────────

const RegularPanel = ({
  employees,
  loading,
  onRefresh,
  onSelectEmployee,
  drillOffice,
  setDrillOffice,
}: {
  employees: EnrichedEmployee[];
  loading: boolean;
  onRefresh: () => void;
  onSelectEmployee: (emp: EnrichedEmployee) => void;
  // Owned by the parent so the drilled office survives opening an employee,
  // and browser Back from the employee returns to that office.
  drillOffice: string | null;
  setDrillOffice: (office: string | null) => void;
}) => {
  const employeesLoad = useTableLoading(loading, employees.length > 0);
  const [showSchedule, setShowSchedule] = useState(false);
  // The evaluation period this screen is acting on. It used to be set only by
  // the Schedule dialog, so the panel read "No active period" on every load
  // even when a cycle existed — and kept reading it while phase notifications
  // went out stamped with the period the API resolved anyway.
  const [currentPeriod, setCurrentPeriod] = useState('');
  const [periodScheduled, setPeriodScheduled] = useState(true);

  const [systemStates, setSystemStates] = useState<{ target_setting: EffectiveState; rating: EffectiveState }>({
    target_setting: 'Closed',
    rating: 'Closed',
  });
  const [confirmModal, setConfirmModal] = useState<PhaseConfirmTarget | null>(null);

  const loadSystemStates = useCallback(async () => {
    try {
      const [states, cycle] = await Promise.all([getSystemPhaseStates(), getActiveCyclePeriod()]);
      setSystemStates(states);
      setCurrentPeriod(cycle.period);
      setPeriodScheduled(cycle.isScheduled);
    } catch (err) {
      console.warn('Failed to load system phase states:', err);
    }
  }, []);

  useEffect(() => {
    void loadSystemStates();
  }, [loadSystemStates]);

  const handleRefresh = async () => {
    onRefresh();
    await loadSystemStates();
  };

  const officeGroups: OfficeGroup[] = useMemo(() => {
    const m = new Map<string, OfficeGroup>();
    for (const e of employees) {
      const k = e.department ?? 'Unassigned';
      if (!m.has(k)) {
        m.set(k, {
          officeId: e.department_id ?? null,
          officeName: k,
          employees: [],
          pending: 0,
          completed: 0,
        });
      }
      const g = m.get(k)!;
      g.employees.push(e);
      if (e.employeeStatus === 'Completed') g.completed++;
      else g.pending++;
    }
    return Array.from(m.values()).sort((a, b) => a.officeName.localeCompare(b.officeName));
  }, [employees]);

  const activeDrill = drillOffice
    ? officeGroups.find((g) => g.officeName === drillOffice) ?? null
    : null;



  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          Employees with 6+ months of service — 6-month IPCR cycle, organized by office.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh"
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShowSchedule(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-[#363EE8] text-white rounded-lg hover:bg-[#2931c5]"
          >
            <Calendar size={13} />
            Schedule IPCR Cycle
          </button>
        </div>
      </div>

      {/* Main White Container Card with Evaluation Period & Compact Vertically Stacked Phase Rows */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between bg-white rounded-xl border border-slate-200/90 py-2.5 px-4 shadow-xs gap-3">
        {/* Left: Evaluation Period Information */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 shadow-2xs">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Evaluation Period</p>
            <p className="text-xs font-bold text-slate-900 mt-0.5">{currentPeriod || 'No active period'}</p>
            {currentPeriod && !periodScheduled && (
              <p className="text-[9px] font-semibold text-amber-600 mt-0.5">
                Not scheduled — phases will use this period
              </p>
            )}
          </div>
        </div>

        {/* Right: Sleek Vertically Stacked Phase Rows */}
        <div className="flex flex-col gap-1.5 w-full lg:w-auto min-w-[320px]">
          {/* Phase 1 Row */}
          <div className="flex items-center justify-between gap-3 bg-slate-50/60 border border-slate-200/70 rounded-lg px-3 py-1 shadow-2xs">
            <span className="text-xs font-bold text-slate-900">Phase 1 (Target)</span>
            <PhaseWindowSwitch
              isOpen={systemStates.target_setting === 'Open'}
              onOpen={() => setConfirmModal({ phase: 'phase1', action: 'open' })}
              onClose={() => setConfirmModal({ phase: 'phase1', action: 'close' })}
            />
          </div>

          {/* Phase 2 Row */}
          <div className="flex items-center justify-between gap-3 bg-slate-50/60 border border-slate-200/70 rounded-lg px-3 py-1 shadow-2xs">
            <span className="text-xs font-bold text-slate-900">Phase 2 (Rating)</span>
            <PhaseWindowSwitch
              isOpen={systemStates.rating === 'Open'}
              onOpen={() => setConfirmModal({ phase: 'phase2', action: 'open' })}
              onClose={() => setConfirmModal({ phase: 'phase2', action: 'close' })}
            />
          </div>
        </div>
      </div>

      {employeesLoad.initialLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm" aria-busy="true">
          <SkeletonList show={employeesLoad.showSkeleton} label="Loading offices…" />
        </div>
      ) : activeDrill ? (
        /* ── Employee drill-down ── */
        <>
        <BackButton onBack={() => setDrillOffice(null)} />
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <Building2 size={14} className="text-[#363EE8]" />
            <span className="text-sm font-bold text-slate-800">{activeDrill.officeName}</span>
            <span className="text-xs text-slate-400">
              ({activeDrill.employees.length} employee
              {activeDrill.employees.length !== 1 ? 's' : ''})
            </span>
          </div>
          <div className="abyan-table-wrap">
            <table className="abyan-table w-full">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-200">
                  {['Employee', 'Position', 'Current Stage', 'Deadline'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeDrill.employees.map((emp) => (
                  <tr
                    key={emp.id}
                    onClick={() => onSelectEmployee(emp)}
                    className="hover:bg-blue-50/30 cursor-pointer transition"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{emp.full_name}</div>
                      <div className="text-xs text-slate-400">{emp.employee_id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{emp.current_position ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span style={stagePillStyle(emp.actualStage)}>{emp.actualStage}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {fmtDate(emp.computedDueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      ) : officeGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-slate-400 bg-white rounded-xl border border-slate-200">
          <Building2 size={28} className="mb-2 text-slate-300" />
          <p className="text-sm">No regular employees found.</p>
        </div>
      ) : (
        /* ── Office list ── */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="abyan-table-wrap">
            <table className="abyan-table w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Office', 'Employees', 'Pending', 'Completed', ''].map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {officeGroups.map((grp) => (
                  <tr
                    key={grp.officeName}
                    onClick={() => setDrillOffice(grp.officeName)}
                    className="hover:bg-blue-50/30 cursor-pointer transition"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="font-semibold text-slate-800">{grp.officeName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {grp.employees.length}
                    </td>
                    <td className="px-4 py-3">
                      {grp.pending > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-semibold text-xs">
                          <Bell size={11} /> {grp.pending}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {grp.completed > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs">
                          <Check size={11} /> {grp.completed}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight size={14} className="text-slate-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showSchedule && (
        <ScheduleCycleModal
          type="regular"
          employees={employees}
          onClose={() => setShowSchedule(false)}
          onScheduled={(p) => {
            setCurrentPeriod(p);
            // A cycle now exists, so the label is no longer the fallback.
            setPeriodScheduled(true);
          }}
        />
      )}

      {confirmModal && (
        <PhaseConfirmModal
          open={Boolean(confirmModal)}
          phase={confirmModal.phase}
          action={confirmModal.action}
          onClose={() => setConfirmModal(null)}
          onConfirmed={loadSystemStates}
        />
      )}
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

const SUBTABS = [
  { key: 'probationary', label: 'Probationary Employees (< 6 Months)' },
  { key: 'regular', label: 'Regular Employees (6 Months & Above)' },
] as const;

type SubtabKey = (typeof SUBTABS)[number]['key'];

export const PMIPCRManagement = () => {
  const [active, setActive] = useState<SubtabKey>('probationary');
  const [allProbationary, setAllProbationary] = useState<EnrichedEmployee[]>([]);
  const [allRegular, setAllRegular] = useState<EnrichedEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EnrichedEmployee | null>(null);
  useBackClosesView(selectedEmployee !== null, () => setSelectedEmployee(null), 'pm-ipcr-employee');
  const [drillOffice, setDrillOffice] = useState<string | null>(null);
  useBackClosesView(active === 'regular' && drillOffice !== null, () => setDrillOffice(null), 'pm-ipcr-office');
  // IPCR Weighting used to be its own sidebar page; it now opens from here as a
  // popup so the per-office Core/Strategic/Support split lives beside the IPCR
  // records it governs.
  const [showWeighting, setShowWeighting] = useState(false);
  // Same treatment for the rating scale (spec §G): it governs the ratings on
  // these records, so it opens beside them rather than from Settings.
  const [showRatingScale, setShowRatingScale] = useState(false);

  const latestLoadId = useRef<number>(0);

  const load = useCallback(async (isBackground = false) => {
    const loadId = ++latestLoadId.current;
    if (!isBackground) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const [empResult, subRes, schedRes] = await Promise.all([
        getAllEmployees({ status: 'Active' }),
        supabase.from('ipcr_submissions').select('id, employee_id, period, phase, stage, updated_at'),
        supabase.from('probationary_ipcr_schedules').select('*'),
      ]);

      if (loadId !== latestLoadId.current) return;

      if (!empResult.success) {
        if (!isBackground) {
          setLoadError('Failed to load employees.');
        } else {
          console.warn('[PMIPCRManagement] Silent background reload failed:', empResult.error);
        }
        return;
      }

      const submissions: any[] = subRes.error ? [] : (subRes.data ?? []);
      const schedules: any[] = schedRes.error ? [] : (schedRes.data ?? []);
      // Exact key: employee::period::phase. But `period` is written in several
      // vocabularies across the codebase (cycle title vs semester vs
      // probationary label), while this screen derives its own label from the
      // hire date — so the exact key often misses even when a submission exists,
      // leaving a submitted employee showing "Not Started". The fallback map,
      // keyed by employee::phase and holding the most recently updated
      // submission, recovers that match. It's only consulted when the exact key
      // misses, and only accepted when the submission is newer than the current
      // cycle start, so it can't surface a prior cycle's stage.
      const subMap = new Map<string, { stage: IpcrStage; id: string }>();
      const subByEmpPhase = new Map<string, { stage: IpcrStage; id: string; updatedAt: number }>();
      for (const s of submissions) {
        const k = `${s.employee_id}::${s.period}::${s.phase}`;
        subMap.set(k, { stage: s.stage as IpcrStage, id: s.id });

        const fk = `${s.employee_id}::${s.phase}`;
        const updatedAt = new Date(s.updated_at ?? 0).getTime();
        const prev = subByEmpPhase.get(fk);
        if (!prev || updatedAt >= prev.updatedAt) {
          subByEmpPhase.set(fk, { stage: s.stage as IpcrStage, id: s.id, updatedAt });
        }
      }

      const enriched: EnrichedEmployee[] = [];
      for (const emp of empResult.data as Employee[]) {
        const hireDateToUse = emp.hire_date || emp.created_at || new Date().toISOString();
        const months = getMonthsOfService(hireDateToUse);
        const { stage, phase, dueDate, periodLabel } = computeStageInfo(hireDateToUse, schedules);
        const k = `${emp.id}::${periodLabel}::${phase}`;
        let sub: { stage: IpcrStage; id: string } | undefined = subMap.get(k);
        if (!sub) {
          const fallback = subByEmpPhase.get(`${emp.id}::${phase}`);
          // Only within the current cycle — never resurrect a prior cycle's stage.
          if (fallback && fallback.updatedAt >= currentCycleStart(hireDateToUse).getTime()) {
            sub = { stage: fallback.stage, id: fallback.id };
          }
        }
        const actualStage: IpcrStage = sub?.stage ?? 'Not Started';
        enriched.push({
          ...emp,
          monthsOfService: months,
          computedStage: stage,
          computedDueDate: dueDate,
          computedPhase: phase,
          periodLabel,
          actualStage,
          submissionId: sub?.id ?? null,
          employeeStatus: deriveStatus(dueDate, actualStage),
        });
      }

      const probationaryList = enriched.filter((e) => e.monthsOfService < 6);
      const regularList = enriched.filter((e) => e.monthsOfService >= 6);

      setAllProbationary(probationaryList);
      setAllRegular(regularList);

      // Keep open detail page synchronized
      setSelectedEmployee((prev) => {
        if (!prev) return null;
        const updated = enriched.find((e) => e.id === prev.id);
        return updated || prev;
      });

    } catch (err) {
      if (loadId !== latestLoadId.current) return;
      if (!isBackground) {
        setLoadError(err instanceof Error ? err.message : String(err));
      } else {
        console.error('[PMIPCRManagement] Silent background reload exception:', err);
      }
    } finally {
      if (loadId === latestLoadId.current && !isBackground) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh({
    channel: 'pm-ipcr-management-realtime',
    tables: ['employees', 'ipcr_submissions', 'probationary_ipcr_schedules'],
    onChange: useCallback(() => void load(true), [load]),
  });

  const handleStageUpdate = useCallback((id: string, stage: IpcrStage) => {
    const update = (list: EnrichedEmployee[]) =>
      list.map((e) =>
        e.id === id
          ? { ...e, actualStage: stage, employeeStatus: deriveStatus(e.computedDueDate, stage) }
          : e,
      );
    setAllProbationary((prev) => update(prev));
    setAllRegular((prev) => update(prev));
    setSelectedEmployee((prev) => prev && prev.id === id ? { ...prev, actualStage: stage } : prev);
  }, []);

  if (selectedEmployee) {
    return (
      <div className="space-y-4">
        <BackButton onBack={() => setSelectedEmployee(null)} />
        <IPCRDetailPage
          employee={selectedEmployee}
          onStageUpdate={handleStageUpdate}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-[#363EE8]" />
            IPCR Management
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Module 2 — employees auto-classified by length of service: 3-month cycle (probationary)
            and 6-month cycle (regular).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowWeighting(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          title="Set each office's Core / Strategic / Support split"
        >
          <Scale size={15} className="text-blue-600" />
          IPCR Weighting
        </button>
        <button
          type="button"
          onClick={() => setShowRatingScale(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          title="Set what each 1–5 rating means for employees"
        >
          <ListChecks size={15} className="text-blue-600" />
          Rating Scale
        </button>
      </div>

      {/* Subtabs */}
      <div className="flex flex-wrap gap-2 bg-white rounded-xl border border-slate-200 p-2 shadow-sm">
        {SUBTABS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActive(s.key)}
            className={`px-4 py-2 text-xs font-bold rounded-md transition ${
              active === s.key
                ? 'bg-[#363EE8] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={14} /> {loadError}
        </div>
      )}

      {active === 'probationary' ? (
        <ProbationaryPanel
          employees={allProbationary}
          loading={loading}
          onRefresh={load}
          onSelectEmployee={setSelectedEmployee}
        />
      ) : (
        <RegularPanel
          employees={allRegular}
          loading={loading}
          onRefresh={load}
          onSelectEmployee={setSelectedEmployee}
          drillOffice={drillOffice}
          setDrillOffice={setDrillOffice}
        />
      )}

      {/* IPCR Weighting popup: xl, since the per-office table needs the width. */}
      <Modal
        open={showWeighting}
        onClose={() => setShowWeighting(false)}
        size="xl"
        icon={<Scale size={20} />}
        title="IPCR Weighting"
        subtitle="How Core, Strategic and Support ratings combine into an overall score, per office"
      >
        <OfficeWeightingPanel />
      </Modal>

      <Modal
        open={showRatingScale}
        onClose={() => setShowRatingScale(false)}
        size="xl"
        icon={<ListChecks size={20} />}
        title="IPCR Rating Scale"
        subtitle="What each rating means. Employees see this while rating their accomplishments in Phase 2."
      >
        <RatingScalePanel />
      </Modal>
    </div>
  );
};
