import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { Dialog } from '../../../components/Dialog';
import { IPCR_STAGES, type IpcrStage, stagePillStyle } from '../../../lib/api/ipcrStages';
import { type IpcrPhase, sendNotification } from '../../../lib/api/ipcrSubmissions';
import { getAllEmployees, type Employee } from '../../../lib/api/employees';
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

function computeStageInfo(hireDate: string): {
  stage: 'Target Setting' | 'Accomplishment Rating';
  phase: IpcrPhase;
  dueDate: Date;
  periodLabel: string;
} {
  const hired = new Date(hireDate);
  const months = getMonthsOfService(hireDate);

  if (months < 6) {
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

// ── IPCR Form Modal ───────────────────────────────────────────────────────────

const IPCRFormModal = ({
  employee,
  onClose,
  onStageUpdate,
}: {
  employee: EnrichedEmployee;
  onClose: () => void;
  onStageUpdate: (id: string, stage: IpcrStage) => void;
}) => {
  const [newStage, setNewStage] = useState<IpcrStage>(employee.actualStage);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (newStage === employee.actualStage) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    const { setSubmissionStage } = await import('../../../lib/api/ipcrSubmissions');
    const res = await setSubmissionStage({
      employeeId: employee.id,
      employeeName: employee.full_name,
      officeId: employee.department_id ?? null,
      officeName: employee.department ?? null,
      period: employee.periodLabel,
      phase: employee.computedPhase,
      stage: newStage,
      updatedBy: getCurrentAdminEmail(),
    });
    setSaving(false);
    if (!res.ok) {
      setError((res as { ok: false; error: string }).error);
      return;
    }
    onStageUpdate(employee.id, newStage);
    setSaved(true);
    setTimeout(onClose, 700);
  };

  const monthsText =
    employee.monthsOfService < 1
      ? 'Less than 1 month'
      : employee.monthsOfService === 1
        ? '1 month'
        : `${employee.monthsOfService} months`;
  const isProbationary = employee.monthsOfService < 6;

  return (
    <Dialog open title={`IPCR — ${employee.full_name}`} onClose={onClose}>
      <div style={{ width: '580px', maxWidth: '100%' }}>
        {/* Employee Info */}
        <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-200">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Name</p>
              <p className="font-semibold text-slate-800">{employee.full_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Position</p>
              <p className="font-medium text-slate-700">{employee.current_position ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Office / Department</p>
              <p className="font-medium text-slate-700">{employee.department ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Date Hired</p>
              <p className="font-medium text-slate-700">{fmtDate(employee.hire_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Length of Service</p>
              <p className="font-medium text-slate-700">{monthsText}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Employee Type</p>
              <p className="font-medium text-slate-700">{isProbationary ? 'Probationary' : 'Regular'}</p>
            </div>
          </div>
        </div>

        {/* Cycle Timeline */}
        <div className="mb-5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">IPCR Cycle</p>
          <div className="flex items-stretch gap-2">
            <div
              className={`flex-1 rounded-lg p-3 border text-center ${
                employee.computedPhase === 'target'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <p className="text-[10px] text-slate-500 mb-0.5">
                {isProbationary ? 'Month 1–3' : 'First 6 Months'}
              </p>
              <p
                className={`text-xs font-bold ${
                  employee.computedPhase === 'target' ? 'text-[#363EE8]' : 'text-emerald-700'
                }`}
              >
                Target Setting
              </p>
              {employee.computedPhase !== 'target' && (
                <Check size={11} className="mx-auto mt-1 text-emerald-600" />
              )}
            </div>
            <ChevronRight size={14} className="text-slate-300 self-center flex-shrink-0" />
            <div
              className={`flex-1 rounded-lg p-3 border text-center ${
                employee.computedPhase === 'rating'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <p className="text-[10px] text-slate-500 mb-0.5">
                {isProbationary ? 'Month 4–6' : 'Second 6 Months'}
              </p>
              <p
                className={`text-xs font-bold ${
                  employee.computedPhase === 'rating' ? 'text-[#363EE8]' : 'text-slate-400'
                }`}
              >
                Accomplishment Rating
              </p>
            </div>
          </div>
          <div className="mt-2.5 text-xs text-slate-500 flex gap-4">
            <span>
              Period: <strong className="text-slate-700">{employee.periodLabel}</strong>
            </span>
            <span>
              Due: <strong className="text-slate-700">{fmtDate(employee.computedDueDate)}</strong>
            </span>
          </div>
        </div>

        {/* Stage Control */}
        <div className="mb-5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Submission Stage
          </p>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm text-slate-500">Current:</span>
            <span style={stagePillStyle(employee.actualStage)}>{employee.actualStage}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 flex-shrink-0">Update to:</span>
            <select
              value={newStage}
              onChange={(e) => setNewStage(e.target.value as IpcrStage)}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
            >
              {IPCR_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </p>
          )}
        </div>

        {/* Phase content note */}
        <div className="mb-5 border border-dashed border-slate-200 rounded-xl p-4 text-center">
          <ClipboardCheck size={24} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">
            {employee.computedPhase === 'target'
              ? 'Performance targets are entered and submitted by the employee through the Office Account portal.'
              : 'Accomplishments and ratings are submitted by the employee through the Office Account portal.'}
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
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
            disabled={saving || saved}
            className="px-5 py-2 text-sm font-bold bg-[#363EE8] text-white rounded-lg hover:bg-[#2931c5] disabled:opacity-50 flex items-center gap-2"
          >
            {saved ? (
              <>
                <Check size={14} /> Saved!
              </>
            ) : saving ? (
              'Saving…'
            ) : (
              'Save Stage'
            )}
          </button>
        </div>
      </div>
    </Dialog>
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
  const [phase, setPhase] = useState<IpcrPhase>('target');
  const [customMessage, setCustomMessage] = useState('');
  const [notifyOffices, setNotifyOffices] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const offices = useMemo(() => {
    const m = new Map<string, { id: string | null; name: string; count: number }>();
    for (const e of employees) {
      const k = e.department ?? 'Unassigned';
      if (!m.has(k)) m.set(k, { id: e.department_id ?? null, name: k, count: 0 });
      m.get(k)!.count++;
    }
    return Array.from(m.values());
  }, [employees]);

  const handleSave = async () => {
    if (!period.trim()) {
      setError('Evaluation period label is required.');
      return;
    }
    setSaving(true);
    setError('');
    if (notifyOffices) {
      const by = getCurrentAdminEmail();
      for (const o of offices) {
        await sendNotification({
          phase,
          officeId: o.id,
          officeName: o.name,
          period: period.trim(),
          employeeCount: o.count,
          message: customMessage.trim() || null,
          triggeredBy: by,
        });
      }
    }
    setSaving(false);
    onScheduled(period.trim());
    onClose();
  };

  return (
    <Dialog open title="Schedule IPCR Cycle" onClose={onClose}>
      <div style={{ width: '460px', maxWidth: '100%' }}>
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

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Phase</label>
            <div className="flex gap-2">
              {(['target', 'rating'] as IpcrPhase[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPhase(p)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                    phase === p
                      ? 'bg-[#363EE8] text-white border-[#363EE8]'
                      : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p === 'target' ? 'Target Setting' : 'Accomplishment Rating'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Message to Office Accounts (optional)
            </label>
            <textarea
              rows={3}
              placeholder="Instructions or reminders…"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30 resize-none"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyOffices}
              onChange={(e) => setNotifyOffices(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-slate-600">
              Notify {offices.length} office account{offices.length !== 1 ? 's' : ''} (
              {employees.length} {type} employee{employees.length !== 1 ? 's' : ''})
            </span>
          </label>

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
            {saving ? 'Scheduling…' : 'Schedule & Notify'}
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
  onStageUpdate,
}: {
  employees: EnrichedEmployee[];
  loading: boolean;
  onRefresh: () => void;
  onStageUpdate: (id: string, stage: IpcrStage) => void;
}) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EnrichedEmployee | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        !q ||
        e.full_name.toLowerCase().includes(q) ||
        (e.department ?? '').toLowerCase().includes(q) ||
        (e.current_position ?? '').toLowerCase().includes(q),
    );
  }, [employees, search]);

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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Users} label="Probationary Employees" value={employees.length} accent />
        <StatCard icon={Bell} label="Employees Due" value={dueCount} />
        <StatCard
          icon={CalendarDays}
          label="Next Due Date"
          value={nextDue ? fmtDate(nextDue) : '—'}
        />
      </div>

      {currentPeriod && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          Current Evaluation Period: <strong>{currentPeriod}</strong>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by employee, office, or position…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
        />
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
              {search ? 'No results for your search.' : 'No probationary employees found.'}
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
                    'Status',
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
                    onClick={() => setSelected(emp)}
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
                    <td className="px-4 py-3">
                      <span style={statusPillStyle(emp.employeeStatus)}>
                        {emp.employeeStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <IPCRFormModal
          employee={selected}
          onClose={() => setSelected(null)}
          onStageUpdate={(id, stage) => {
            onStageUpdate(id, stage);
            setSelected(null);
          }}
        />
      )}

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
  onStageUpdate,
}: {
  employees: EnrichedEmployee[];
  loading: boolean;
  onRefresh: () => void;
  onStageUpdate: (id: string, stage: IpcrStage) => void;
}) => {
  const [drillOffice, setDrillOffice] = useState<string | null>(null);
  const [selected, setSelected] = useState<EnrichedEmployee | null>(null);
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Users} label="Regular Employees" value={employees.length} accent />
        <StatCard icon={Building2} label="Offices" value={officeGroups.length} />
        <StatCard icon={Bell} label="Pending Submission" value={dueCount} />
      </div>

      {currentPeriod && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          Current Evaluation Period: <strong>{currentPeriod}</strong>
        </div>
      )}

      {nextDue && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
          <Calendar size={12} />
          <span>
            Next Due Date: <strong className="text-slate-700">{fmtDate(nextDue)}</strong>
          </span>
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
                  {['Employee', 'Position', 'Current Stage', 'Due Date', 'Status'].map((h) => (
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
                    onClick={() => setSelected(emp)}
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
                    <td className="px-4 py-3">
                      <span style={statusPillStyle(emp.employeeStatus)}>
                        {emp.employeeStatus}
                      </span>
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

      {selected && (
        <IPCRFormModal
          employee={selected}
          onClose={() => setSelected(null)}
          onStageUpdate={(id, stage) => {
            onStageUpdate(id, stage);
            setSelected(null);
          }}
        />
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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [empResult, subRes] = await Promise.all([
        getAllEmployees({ status: 'Active' }),
        supabase.from('ipcr_submissions').select('id, employee_id, period, phase, stage'),
      ]);

      if (!empResult.success) {
        setLoadError('Failed to load employees.');
        return;
      }

      const submissions: any[] = subRes.error ? [] : (subRes.data ?? []);
      const subMap = new Map<string, { stage: IpcrStage; id: string }>();
      for (const s of submissions) {
        const k = `${s.employee_id}::${s.period}::${s.phase}`;
        subMap.set(k, { stage: s.stage as IpcrStage, id: s.id });
      }

      const enriched: EnrichedEmployee[] = [];
      for (const emp of empResult.data as Employee[]) {
        if (!emp.hire_date) continue;
        const months = getMonthsOfService(emp.hire_date);
        const { stage, phase, dueDate, periodLabel } = computeStageInfo(emp.hire_date);
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

      setAllProbationary(enriched.filter((e) => e.monthsOfService < 6));
      setAllRegular(enriched.filter((e) => e.monthsOfService >= 6));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStageUpdate = useCallback((id: string, stage: IpcrStage) => {
    const update = (list: EnrichedEmployee[]) =>
      list.map((e) =>
        e.id === id
          ? { ...e, actualStage: stage, employeeStatus: deriveStatus(e.computedDueDate, stage) }
          : e,
      );
    setAllProbationary((prev) => update(prev));
    setAllRegular((prev) => update(prev));
  }, []);

  return (
    <div className="space-y-5">
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
          onStageUpdate={handleStageUpdate}
        />
      ) : (
        <RegularPanel
          employees={allRegular}
          loading={loading}
          onRefresh={load}
          onStageUpdate={handleStageUpdate}
        />
      )}
    </div>
  );
};
