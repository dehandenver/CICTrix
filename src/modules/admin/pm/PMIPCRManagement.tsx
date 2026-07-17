import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { Dialog } from '../../../components/Dialog';
import { useDepartmentNames } from '../../../hooks/useDepartmentOptions';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh';
import { IPCR_STAGES, type IpcrStage, stagePillStyle } from '../../../lib/api/ipcrStages';
import { type IpcrPhase, sendNotification } from '../../../lib/api/ipcrSubmissions';
import { getAllEmployees, type Employee } from '../../../lib/api/employees';
import { upsertSchedule } from '../../../lib/api/phaseSchedules';
import { getEmployeeIPCR, type IPCRRowDraft } from '../../../lib/api/performanceEvaluations';
import { getCurrentAdminEmail } from '../moduleUi';
import { supabase as supabaseClient } from '../../../lib/supabase';

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

function deriveStatus(
  dueDate: Date,
  actualStage: IpcrStage,
): 'Completed' | 'In Progress' | 'Not Started' | 'Overdue' {
  if (actualStage === 'Forwarded to PM' || actualStage === 'Verified') return 'Completed';
  if (actualStage !== 'Not Started') return 'In Progress';
  return new Date() > dueDate ? 'Overdue' : 'Not Started';
}

const statusPillStyle = (
  s: 'Completed' | 'In Progress' | 'Not Started' | 'Overdue',
): React.CSSProperties => {
  const map = {
    Completed: { bg: 'rgba(16,185,129,0.12)', fg: '#047857' },
    'In Progress': { bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8' },
    'Not Started': { bg: 'rgba(107,114,128,0.1)', fg: '#4b5563' },
    Overdue: { bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' },
  };
  const { bg, fg } = map[s];
  return {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    background: bg,
    color: fg,
    whiteSpace: 'nowrap',
  };
};

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

const StatCard = ({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent?: boolean;
}) => (
  <div
    className={`rounded-xl border p-4 flex items-start gap-3 ${
      accent ? 'border-[#363EE8]/20 bg-[#363EE8]/5' : 'border-slate-200 bg-white'
    }`}
  >
    <div className={`p-2 rounded-lg ${accent ? 'bg-[#363EE8]/10' : 'bg-slate-50'}`}>
      <Icon size={16} className={accent ? 'text-[#363EE8]' : 'text-slate-500'} />
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  </div>
);

// ── IPCR Detail Page ─────────────────────────────────────────────────────────

const IPCRDetailPage = ({
  employee,
  onClose,
  onStageUpdate,
}: {
  employee: EnrichedEmployee;
  onClose: () => void;
  onStageUpdate: (id: string, stage: IpcrStage) => void;
}) => {


  const [ipcrRows, setIpcrRows] = useState<IPCRRowDraft[]>([]);
  const [ipcrLoading, setIpcrLoading] = useState(true);
  const [ipcrError, setIpcrError] = useState('');



  useEffect(() => {
    let active = true;
    (async () => {
      setIpcrLoading(true);
      setIpcrError('');
      try {
        const res = await getEmployeeIPCR(
          employee.employee_id || '',
          employee.periodLabel,
          employee.id,
          null
        );
        if (!active) return;
        if (res.success && res.data) {
          setIpcrRows(res.data.rows || []);
        } else {
          setIpcrError(res.error || 'Failed to load IPCR rows.');
        }
      } catch (err) {
        if (!active) return;
        setIpcrError('Error fetching IPCR details.');
      } finally {
        if (active) setIpcrLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [employee.id, employee.employee_id, employee.periodLabel]);



  const monthsText =
    employee.monthsOfService < 1
      ? 'Less than 1 month'
      : employee.monthsOfService === 1
        ? '1 month'
        : `${employee.monthsOfService} months`;
  const isProbationary = employee.monthsOfService < 6;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-1.5 text-sm font-semibold text-[#363EE8] hover:underline"
      >
        <ChevronLeft size={16} /> Back to IPCR Management
      </button>

      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">IPCR — {employee.full_name}</h2>
          <p className="text-xs text-slate-500 mt-1">Review targets and accomplishments.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 align-start items-start">
        {/* Left Column: Info & Control */}
        <div className="space-y-5 lg:col-span-1">
          {/* Employee Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4">Employee Information</h3>
            <div className="space-y-3 text-sm">
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
            </div>
          </div>

          {/* Cycle Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4">IPCR Cycle</h3>
            <div className="flex items-stretch gap-1.5 mb-4">
              <div
                className={`flex-1 rounded-lg p-3 border text-center ${
                  employee.computedPhase === 'target'
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-emerald-50 border-emerald-100'
                }`}
              >
                <p className="text-[9px] text-slate-500 mb-0.5">
                  {isProbationary ? 'Month 1–3' : 'First 6 Mos'}
                </p>
                <p
                  className={`text-[11px] font-bold ${
                    employee.computedPhase === 'target' ? 'text-[#363EE8]' : 'text-emerald-700'
                  }`}
                >
                  Target Setting
                </p>
                {employee.computedPhase !== 'target' && (
                  <Check size={10} className="mx-auto mt-1 text-emerald-600" />
                )}
              </div>
              <ChevronRight size={12} className="text-slate-300 self-center flex-shrink-0" />
              <div
                className={`flex-1 rounded-lg p-3 border text-center ${
                  employee.computedPhase === 'rating'
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <p className="text-[9px] text-slate-500 mb-0.5">
                  {isProbationary ? 'Month 4–6' : 'Second 6 Mos'}
                </p>
                <p
                  className={`text-[11px] font-bold ${
                    employee.computedPhase === 'rating' ? 'text-[#363EE8]' : 'text-slate-400'
                  }`}
                >
                  Accomplishment
                </p>
              </div>
            </div>
            <div className="text-xs text-slate-500 space-y-1">
              <div>
                Period: <strong className="text-slate-700">{employee.periodLabel}</strong>
              </div>
              <div>
                Due: <strong className="text-slate-700">{fmtDate(employee.computedDueDate)}</strong>
              </div>
            </div>
          </div>


        </div>

        {/* Right Column: IPCR Sheet Details */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4">
              Employee IPCR Sheet
            </h3>

            {ipcrLoading ? (
              <div className="p-12 text-center text-sm text-slate-400">
                Loading IPCR details…
              </div>
            ) : ipcrError ? (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center text-sm text-red-700">
                {ipcrError}
              </div>
            ) : ipcrRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-amber-800 flex flex-col items-center gap-2">
                <ClipboardCheck size={28} className="text-amber-500 mb-1" />
                <span className="font-semibold">No IPCR records found</span>
                <span className="text-xs text-slate-500">The employee has not encoded targets for the rating period {employee.periodLabel}.</span>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="px-3 py-3 w-16">Type</th>
                      <th className="px-3 py-3">M.F.O. / Target Description</th>
                      {employee.computedPhase === 'rating' && (
                        <>
                          <th className="px-3 py-3">Accomplishment</th>
                          <th className="px-3 py-3 w-28">Ratings (Q/E/T/Ave)</th>
                        </>
                      )}
                      <th className="px-3 py-3 w-28">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {ipcrRows.map((row, idx) => {
                      const isCore = row.function_type === 'CORE';
                      return (
                        <tr key={row.id || idx} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-3 py-3.5 align-top">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isCore ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {row.function_type}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 align-top whitespace-pre-wrap leading-relaxed text-slate-800">
                            {row.target_text || '—'}
                          </td>
                          {employee.computedPhase === 'rating' && (
                            <>
                              <td className="px-3 py-3.5 align-top whitespace-pre-wrap leading-relaxed text-slate-800">
                                {row.accomplishment_text || '—'}
                              </td>
                              <td className="px-3 py-3.5 align-top">
                                {row.ave_rating ? (
                                  <div className="space-y-0.5">
                                    <div className="font-bold text-slate-800 text-sm">
                                      {row.ave_rating.toFixed(2)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      Q:{row.q_rating ?? '—'} E:{row.e_rating ?? '—'} T:{row.t_rating ?? '—'}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic">Not rated</span>
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-3.5 align-top whitespace-pre-wrap text-slate-500 italic">
                            {row.remarks || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Schedule Cycle Modal ──────────────────────────────────────────────────────

const ScheduleCycleModal = ({
  type,
  employees,
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
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('');

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

  const dueCount = useMemo(
    () =>
      employees.filter(
        (e) => e.employeeStatus === 'Overdue' || e.employeeStatus === 'Not Started',
      ).length,
    [employees],
  );

  const nextDue = useMemo(() => {
    const dates = employees
      .map((e) => e.computedDueDate)
      .filter(Boolean)
      .sort((a, b) => a!.getTime() - b!.getTime());
    return dates[0] ?? null;
  }, [employees]);

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
            onClick={onRefresh}
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
      {currentPeriod && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700 mb-4">
          Current Evaluation Period: <strong>{currentPeriod}</strong>
        </div>
      )}

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
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
            Loading…
          </div>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[
                    'Employee',
                    'Office',
                    'Position',
                    'Date Hired',
                    'Current Stage',
                    'Due Date',
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
              <tbody className="divide-y divide-slate-100">
                {filtered.map((emp) => (
                  <tr
                    key={emp.id}
                    onClick={() => onSelectEmployee(emp)}
                    className="hover:bg-blue-50/30 cursor-pointer transition"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{emp.full_name}</div>
                      <div className="text-xs text-slate-400">{emp.employee_id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{emp.department ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{emp.current_position ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {fmtDate(emp.hire_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span style={stagePillStyle(emp.actualStage)}>{emp.computedStage}</span>
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
          onScheduled={(p) => setCurrentPeriod(p)}
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
}: {
  employees: EnrichedEmployee[];
  loading: boolean;
  onRefresh: () => void;
  onSelectEmployee: (emp: EnrichedEmployee) => void;
}) => {
  const [drillOffice, setDrillOffice] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('');

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

  const dueCount = useMemo(
    () => employees.filter((e) => e.employeeStatus !== 'Completed').length,
    [employees],
  );

  const nextDue = useMemo(() => {
    const dates = employees
      .map((e) => e.computedDueDate)
      .sort((a, b) => a.getTime() - b.getTime());
    return dates[0] ?? null;
  }, [employees]);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          Employees with 6+ months of service — 6-month IPCR cycle, organized by office.
        </p>
        <div className="flex items-center gap-2">
          {activeDrill && (
            <button
              type="button"
              onClick={() => setDrillOffice(null)}
              className="flex items-center gap-1.5 text-sm text-[#363EE8] font-medium hover:underline"
            >
              <ChevronLeft size={14} /> All Offices
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
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

      {currentPeriod && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700 mb-4">
          Current Evaluation Period: <strong>{currentPeriod}</strong>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
          Loading…
        </div>
      ) : activeDrill ? (
        /* ── Employee drill-down ── */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <Building2 size={14} className="text-[#363EE8]" />
            <span className="text-sm font-bold text-slate-800">{activeDrill.officeName}</span>
            <span className="text-xs text-slate-400">
              ({activeDrill.employees.length} employee
              {activeDrill.employees.length !== 1 ? 's' : ''})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-200">
                  {['Employee', 'Position', 'Current Stage', 'Due Date'].map((h) => (
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
                      <span style={stagePillStyle(emp.actualStage)}>{emp.computedStage}</span>
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
      ) : officeGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-slate-400 bg-white rounded-xl border border-slate-200">
          <Building2 size={28} className="mb-2 text-slate-300" />
          <p className="text-sm">No regular employees found.</p>
        </div>
      ) : (
        /* ── Office list ── */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
          onScheduled={(p) => setCurrentPeriod(p)}
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
        supabase.from('ipcr_submissions').select('id, employee_id, period, phase, stage'),
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
      const subMap = new Map<string, { stage: IpcrStage; id: string }>();
      for (const s of submissions) {
        const k = `${s.employee_id}::${s.period}::${s.phase}`;
        subMap.set(k, { stage: s.stage as IpcrStage, id: s.id });
      }

      const enriched: EnrichedEmployee[] = [];
      for (const emp of empResult.data as Employee[]) {
        if (!emp.hire_date) continue;
        const months = getMonthsOfService(emp.hire_date);
        const { stage, phase, dueDate, periodLabel } = computeStageInfo(emp.hire_date, schedules);
        const k = `${emp.id}::${periodLabel}::${phase}`;
        const sub = subMap.get(k);
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
      <IPCRDetailPage
        employee={selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        onStageUpdate={handleStageUpdate}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-[#363EE8]" />
          IPCR Management
        </h2>
        <p className="text-sm text-slate-550 mt-0.5">
          Module 2 — employees auto-classified by length of service: 3-month cycle (probationary)
          and 6-month cycle (regular).
        </p>
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
        />
      )}
    </div>
  );
};
