import {
  Archive as ArchiveIcon,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Database,
  Edit2,
  Eye,
  FileText,
  Globe,
  Info,
  LayoutDashboard,
  Mail,
  Palette,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  Trash2,
  Upload,
  User,
  UserCircle2,
  Users,
  UsersRound,
  X} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { useSectionParam } from '../../hooks/useSectionParam';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { AdminHeader } from '../../components/AdminHeader';
import { RailNav } from '../../components/RailNav';
import { Sidebar } from '../../components/Sidebar';
import { OfficeDirectorySection } from '../../components/OfficeDirectorySection';
import {
  getDocumentRequests,
  updateDocumentRequestStatus,
  type DocumentRequest,
} from '../../lib/api/documentRequests';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { getAllEmployees, type Employee } from '../../lib/api/employees';
import { createDocumentRequest } from '../../lib/employeeDocuments';
import {
  getEvaluationStatusCounts,
  getEvaluationsWithEmployee,
  getPerformanceDistribution,
  type DistributionBucket,
  type EvaluationStatus,
  type PerformanceEvaluation,
} from '../../lib/api/performanceEvaluations';
import { supabase } from '../../lib/supabase';
import '../../styles/admin.css';

type EmployeeOption = { id: string; name: string; position: string; department: string };

import { PMIPCRManagement } from './pm/PMIPCRManagement';
import { CompetencyFrameworkPage } from './CompetencyFrameworkPageView';
import { PMArchive } from './pm/PMArchive';
import { SummaryOfRatings } from './pm/SummaryOfRatings';
import { SkeletonList, TableRefreshBar, TableSkeletonRows, tableBodyClass, useTableLoading } from '../../components/table-loading';
import { PmDashboardOverview, type IpcrStatus } from './PmDashboardOverview';
import { toCalendarPeriod } from '../../lib/ipcrPeriods';
import '../../styles/dashboard-scale.css';

type EvaluationEmployeeRow = { name: string; position: string; status: string };
type EvaluationGroup = {
  dept: string;
  count: number;
  pct: number;
  approved: number;
  review: number;
  self: number;
  planning: number;
  rejected: number;
  employees: EvaluationEmployeeRow[];
};

// Action Required Queue (docs/plans/2026-10-16-action-queue-dropdown.md)
const QUEUE_PREVIEW_ROWS = 5;
const QUEUE_WARNING_DAYS = 3;
const QUEUE_OVERDUE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ActionQueueItem = {
  key: string;
  name: string | null;
  dept: string | null;
  type: string;
  daysWaiting: number;
  overdue: boolean;
};

const queueAgeChip = (item: ActionQueueItem) => {
  const label = item.daysWaiting === 0
    ? 'Today'
    : `Waiting ${item.daysWaiting} day${item.daysWaiting === 1 ? '' : 's'}`;
  if (item.overdue) return { label, className: 'bg-[var(--error-100)] text-[var(--error-700)]' };
  if (item.daysWaiting >= QUEUE_WARNING_DAYS) return { label, className: 'bg-[var(--warning-100)] text-[var(--warning-700)]' };
  return { label, className: 'bg-[var(--neutral-100)] text-[var(--neutral-800)]' };
};


interface EvaluationCycle {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  status: 'Active' | 'Completed' | 'Planned';
  created_at: string;
}

interface PerformanceStats {
  activeCycle: string;
  pendingReviews: number;
}

const FALLBACK_CYCLES: EvaluationCycle[] = [];

const PM_SECTIONS = [
  'dashboard', 'office-directory', 'summary-of-ratings', 'ipcr-management', 'competency',
  'promotions', 'analytics', 'archive', 'weighting', 'settings',
] as const;

/**
 * `viewOnly` is the super admin looking at this division, not operating it.
 * Distinct from isDashboardView, which is true for the PM admin's own route.
 */
export const PMDashboard = ({
  isDashboardView = true,
  viewOnly = false,
}: { isDashboardView?: boolean; viewOnly?: boolean }) => {
  const [, setStats] = useState<PerformanceStats>({
    activeCycle: 'None',
    pendingReviews: 0
  });
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  const [showCycleDialog, setShowCycleDialog] = useState(false);
  const [editingCycle, setEditingCycle] = useState<EvaluationCycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Kept in ?module= so a refresh returns to the section. Locked to the
  // dashboard when a super admin is viewing: they have no PM navigation to
  // leave it with, and on /admin ?module= names the division.
  const [activeSection, setActiveSection] = useSectionParam(PM_SECTIONS, 'dashboard', !viewOnly);

  const [newCycle, setNewCycle] = useState<{
    title: string;
    start_date: string;
    end_date: string;
    status: 'Active' | 'Completed' | 'Planned';
  }>({
    title: '',
    start_date: '',
    end_date: '',
    status: 'Planned'
  });

  // Request Document modal state (individual employee requests)
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestEmployee, setRequestEmployee] = useState<{ id?: string; name: string; role: string; dept: string; initials: string } | null>(null);
  const [requestDocType, setRequestDocType] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [requestDueDate, setRequestDueDate] = useState('');

  const documentTypes = [
    'NBI Clearance',
    'Medical Certificate',
    'SALN',
    'Certificate of Training',
    'Performance Evaluation Form',
    'Updated Resume/CV',
  ];


  const closeRequestModal = () => {
    setShowRequestModal(false);
    setRequestEmployee(null);
    setRequestDocType('');
    setRequestDescription('');
    setRequestDueDate('');
  };

  const handleSendRequest = async () => {
    if (!requestDocType || !requestDueDate) {
      alert('Please select a document type and due date.');
      return;
    }
    if (!requestEmployee?.id) {
      alert('Cannot send request: Employee ID is missing.');
      return;
    }
    const res = await createDocumentRequest({
      employeeId: requestEmployee.id,
      documentName: requestDocType,
      description: requestDescription || `Please submit your ${requestDocType}`,
      dueDate: requestDueDate,
      requestedBy: 'PM Admin',
      source: 'PM'
    });
    if (!res.success) {
      alert(`Failed to send request: ${(res as any).error}`);
      return;
    }
    window.dispatchEvent(new CustomEvent('EMPLOYEE_DOCUMENTS_UPDATED'));
    alert(`Request sent for "${requestDocType}" due ${requestDueDate}${requestEmployee.name ? ` to ${requestEmployee.name}` : ''}.`);
    closeRequestModal();
  };

  // Bulk Document Request modal state
  const [showBulkRequestModal, setShowBulkRequestModal] = useState(false);
  const [bulkDocName, setBulkDocName] = useState('');
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkDueDate, setBulkDueDate] = useState<Date | null>(null);
  const [bulkCalendarMonth, setBulkCalendarMonth] = useState(new Date().getMonth());
  const [bulkCalendarYear, setBulkCalendarYear] = useState(new Date().getFullYear());
  const [bulkSendTo, setBulkSendTo] = useState<'all' | 'department' | 'selected'>('all');
  const [activeEmployees, setActiveEmployees] = useState<EmployeeOption[]>([]);
  const [bulkSelectedDepartment] = useState<string>('');
  const [bulkSelectedEmployees, setBulkSelectedEmployees] = useState<string[]>([]);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('employees_with_department')
        .select('id, full_name, current_position, department, status')
        .eq('status', 'Active')
        .order('full_name', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('Error loading employees for document request modal:', error);
        setActiveEmployees([]);
        return;
      }
      const mapped: EmployeeOption[] = (data ?? []).map((row: any) => {
        const name = (row.full_name ?? '').trim() || 'Unnamed Employee';
        return {
          id: row.id,
          name,
          position: row.current_position ?? 'â€”',
          department: row.department ?? 'â€”',
        };
      });
      setActiveEmployees(mapped);
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredBulkEmployees = useMemo(() => {
    const term = employeeSearchTerm.trim().toLowerCase();
    if (!term) return activeEmployees;
    return activeEmployees.filter((emp) =>
      emp.name.toLowerCase().includes(term) ||
      emp.position.toLowerCase().includes(term) ||
      emp.department.toLowerCase().includes(term)
    );
  }, [activeEmployees, employeeSearchTerm]);

  const toggleBulkEmployee = (id: string) => {
    setBulkSelectedEmployees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const totalEmployees = activeEmployees.length;


  const closeBulkRequestModal = () => {
    setShowBulkRequestModal(false);
    setBulkSelectedEmployees([]);
    setEmployeeSearchTerm('');
  };

  const handleBulkSendRequest = async () => {
    if (!bulkDocName || !bulkDescription || !bulkDueDate) {
      alert('Please fill in all required fields.');
      return;
    }

    let targetEmployees: string[] = [];
    if (bulkSendTo === 'all') {
      targetEmployees = activeEmployees.map((e) => e.id);
    } else if (bulkSendTo === 'department') {
      if (!bulkSelectedDepartment) {
        alert('Please select a department.');
        return;
      }
      targetEmployees = activeEmployees.filter((e) => e.department === bulkSelectedDepartment).map((e) => e.id);
    } else if (bulkSendTo === 'selected') {
      targetEmployees = bulkSelectedEmployees;
      if (targetEmployees.length === 0) {
        alert('Please select at least one employee.');
        return;
      }
    }

    if (targetEmployees.length === 0) {
      alert('No employees match the selected criteria.');
      return;
    }

    const dueDateStr = bulkDueDate.toISOString().split('T')[0];

    const results = await Promise.all(
      targetEmployees.map((id) =>
        createDocumentRequest({
          employeeId: id,
          documentName: bulkDocName,
          description: bulkDescription,
          dueDate: dueDateStr,
          requestedBy: 'PM Admin',
          source: 'PM'
        })
      )
    );

    const errors = results.filter((r) => !r.success);
    if (errors.length > 0) {
      console.error(errors);
      alert(`Failed to send ${errors.length} requests. Check console for details.`);
    }

    window.dispatchEvent(new CustomEvent('EMPLOYEE_DOCUMENTS_UPDATED'));
    alert(`Bulk request for "${bulkDocName}" sent to ${targetEmployees.length - errors.length} employees, due ${bulkDueDate.toLocaleDateString()}.`);
    closeBulkRequestModal();
  };

  const getCalendarDays = (month: number, year: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  };

  const handleCalendarPrev = () => {
    if (bulkCalendarMonth === 0) {
      setBulkCalendarMonth(11);
      setBulkCalendarYear(bulkCalendarYear - 1);
    } else {
      setBulkCalendarMonth(bulkCalendarMonth - 1);
    }
  };

  const handleCalendarNext = () => {
    if (bulkCalendarMonth === 11) {
      setBulkCalendarMonth(0);
      setBulkCalendarYear(bulkCalendarYear + 1);
    } else {
      setBulkCalendarMonth(bulkCalendarMonth + 1);
    }
  };

  const calendarMonthName = new Date(bulkCalendarYear, bulkCalendarMonth).toLocaleString('default', { month: 'long' });

  const isDatePast = (day: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const check = new Date(bulkCalendarYear, bulkCalendarMonth, day);
    return check < today;
  };

  // Pagination state for Performance Reviews table

  // â”€â”€ Live PM data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Per Phase 2 of the data-migration plan: every dashboard widget reads from
  // these state slots; per-section useEffects below populate them. No mock
  // fallbacks â€” empty arrays render the "No data" empty state in each widget.
  const [evaluations, setEvaluations] = useState<PerformanceEvaluation[]>([]);
  // Start true: the dashboard section fetches on mount, so the first paint is the skeleton, not an empty table.
  const [evaluationsLoading, setEvaluationsLoading] = useState(true);
  const [, setStatusCounts] = useState<Record<EvaluationStatus, number>>({
    'Planning': 0,
    'Self Evaluation': 0,
    'Supervisor Review': 0,
    'Approved': 0,
    'Rejected': 0,
  });
  const [, setEvaluationTotal] = useState(0);
  const [, setPerformanceDistribution] = useState<Record<DistributionBucket, number>>({
    'Outstanding': 0,
    'Very Satisfactory': 0,
    'Satisfactory': 0,
    'Unsatisfactory': 0,
    'Poor': 0,
  });
  const [, setDistributionEvaluated] = useState(0);
  const [documentRequests, setDocumentRequests] = useState<DocumentRequest[]>([]);
  const [, setDocumentRequestsLoading] = useState(false);
  const [reviewingRequest, setReviewingRequest] = useState<DocumentRequest | null>(null);
  const [reviewDecisionPending, setReviewDecisionPending] = useState<'Approved' | 'Rejected' | null>(null);

  // States for Pending IPCR Submissions and Probationary Metrics
  const [, setProbationarySubmissionsCount] = useState(0);
  const [, setRegularSubmissionsCount] = useState(0);
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  // Every Active employee's current IPCR status, for the overview's submission card. null = failed to load.
  const [ipcrStatuses, setIpcrStatuses] = useState<IpcrStatus[] | null>([]);
  const [, setProbationaryMetrics] = useState({
    total: 0,
    due: 0,
    nextDue: '—'
  });
  const [ipcrLoading, setIpcrLoading] = useState(true);
  const [ipcrSubmissionTab, setIpcrSubmissionTab] = useState<'pending' | 'recent'>('pending');
  const [actionQueueOpen, setActionQueueOpen] = useState(false);
  const [actionQueueShowAll, setActionQueueShowAll] = useState(false);

  const refreshDocumentRequests = async () => {
    const result = await getDocumentRequests({ source: 'PM' });
    if (result.success) setDocumentRequests(result.data);
  };

  const handleReviewDecision = async (status: 'Approved' | 'Rejected') => {
    if (!reviewingRequest) return;
    setReviewDecisionPending(status);
    const result = await updateDocumentRequestStatus(reviewingRequest.id, status);
    setReviewDecisionPending(null);
    if (!result.success) {
      alert((result as any).error);
      return;
    }
    setReviewingRequest(null);
    await refreshDocumentRequests();
  };


  // Action-required queue: pending document requests + evaluations awaiting review.
  // Oldest first, so the longest-waiting items lead the collapsed preview.
  const actionRequiredQueue = (() => {
    const now = Date.now();
    const daysSince = (iso: string) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / MS_PER_DAY));
    const items: ActionQueueItem[] = [];
    for (const e of evaluations) {
      if (e.status === 'Supervisor Review' || e.status === 'Self Evaluation') {
        const daysWaiting = daysSince(e.submitted_at ?? e.created_at);
        items.push({
          key: `eval-${e.id}`,
          name: e.employee_name ?? null,
          dept: e.department ?? null,
          type: e.status === 'Supervisor Review' ? 'IPCR Validation' : 'Self Evaluation',
          daysWaiting,
          overdue: daysWaiting >= QUEUE_OVERDUE_DAYS,
        });
      }
    }
    for (const d of documentRequests) {
      if (d.status === 'Pending' || d.status === 'Submitted') {
        const daysWaiting = daysSince(d.uploaded_at);
        const pastDue = d.due_date !== null && new Date(d.due_date).getTime() < now;
        items.push({
          key: `doc-${d.id}`,
          name: d.employee_name ?? null,
          dept: d.department ?? null,
          type: d.document_type,
          daysWaiting,
          overdue: pastDue || daysWaiting >= QUEUE_OVERDUE_DAYS,
        });
      }
    }
    return items.sort((a, b) => b.daysWaiting - a.daysWaiting);
  })();
  const actionQueueOverdue = actionRequiredQueue.filter(item => item.overdue).length;
  const actionQueueRows = actionQueueShowAll ? actionRequiredQueue : actionRequiredQueue.slice(0, QUEUE_PREVIEW_ROWS);

  // Recent IPCR submissions for the dashboard table (most recent first, top 6).
  const pendingLoad = useTableLoading(ipcrLoading, pendingSubmissions.length > 0);
  const recentLoad = useTableLoading(evaluationsLoading, evaluations.length > 0);
  const cyclesLoad = useTableLoading(loading, cycles.length > 0);

  const recentIPCRs = evaluations
    .filter(e => e.final_score !== null || e.status === 'Approved' || e.status === 'Supervisor Review')
    .slice(0, 6)
    .map(e => ({
      name: e.employee_name ?? 'Unknown',
      position: e.employee_position ?? 'â€”',
      dept: e.department ?? 'Unassigned',
      period: e.period ?? 'â€”',
      rating: e.final_score !== null ? e.final_score.toFixed(2) : 'â€”',
      status: e.status === 'Approved'
        ? 'Approved'
        : e.status === 'Supervisor Review'
          ? 'Under Review'
          : 'Submitted',
      statusColor: e.status === 'Approved'
        ? 'bg-emerald-100 text-emerald-700'
        : e.status === 'Supervisor Review'
          ? 'bg-orange-100 text-orange-700'
          : 'bg-blue-100 text-blue-700',
    }));

  // Department-grouped employees from the central employees table.
  const [, setDbEvaluationGroups] = useState<EvaluationGroup[]>([]);

  useEffect(() => {
    fetchCycles();
  }, []);

  useEffect(() => {
    const activeCycle = cycles.find(c => c.status === 'Active');
    setStats({
      activeCycle: activeCycle?.title || 'None',
      pendingReviews: 12 // Dummy for now
    });
  }, [cycles]);

  // Group active employees by department + merge live evaluation status per row.
  // Replaces the prior "default everyone to Planning" behavior.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [empResult, evalResult] = await Promise.all([
        getAllEmployees({ status: 'Active' }),
        getEvaluationsWithEmployee(),
      ]);
      if (cancelled) return;
      if (!empResult.success || !Array.isArray(empResult.data) || empResult.data.length === 0) {
        setDbEvaluationGroups([]);
        return;
      }

      const statusByEmployee = new Map<string, EvaluationStatus>();
      for (const ev of evalResult.data) {
        if (ev.employee_id) statusByEmployee.set(ev.employee_id, ev.status);
      }

      const groupsByDept = new Map<string, EvaluationEmployeeRow[]>();
      for (const emp of empResult.data as Employee[]) {
        const dept = emp.department ?? emp.current_department ?? 'Unassigned Department';
        const liveStatus = statusByEmployee.get(emp.id) ?? 'Planning';
        const row: EvaluationEmployeeRow = {
          name: emp.full_name ?? 'Unnamed',
          position: emp.current_position ?? 'Unassigned Position',
          status: liveStatus,
        };
        const existing = groupsByDept.get(dept);
        if (existing) existing.push(row);
        else groupsByDept.set(dept, [row]);
      }

      const groups: EvaluationGroup[] = Array.from(groupsByDept.entries())
        .map(([dept, employees]) => {
          const approved = employees.filter(e => e.status === 'Approved').length;
          const review = employees.filter(e => e.status === 'Supervisor Review').length;
          const self = employees.filter(e => e.status === 'Self Evaluation').length;
          const planning = employees.filter(e => e.status === 'Planning').length;
          const rejected = employees.filter(e => e.status === 'Rejected').length;
          const count = employees.length;
          return {
            dept,
            count,
            pct: count === 0 ? 0 : Math.round((approved / count) * 100),
            approved,
            review,
            self,
            planning,
            rejected,
            employees,
          };
        })
        .sort((a, b) => a.dept.localeCompare(b.dept));

      setDbEvaluationGroups(groups);
    })();
    return () => {
      cancelled = true;
    };
  }, [evaluations]);

  // â”€â”€ Per-section data fetches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Fetched once on mount because most widgets (Action Queue, Distribution,
  // IPCR Submissions, Reviews, Status Counts) all read from the evaluations
  // slice. activeCycleId scopes to the current cycle when one exists.
  const activeCycleId = cycles.find(c => c.status === 'Active')?.id;

  // Evaluations + derived status counts + distribution.
  useEffect(() => {
    if (activeSection !== 'dashboard') {
      return;
    }
    let cancelled = false;
    (async () => {
      setEvaluationsLoading(true);
      const [evalResult, countsResult, distResult] = await Promise.all([
        getEvaluationsWithEmployee(activeCycleId !== undefined ? { cycleId: activeCycleId } : undefined),
        getEvaluationStatusCounts(activeCycleId),
        getPerformanceDistribution(activeCycleId),
      ]);
      if (cancelled) return;
      setEvaluations(evalResult.data);
      setStatusCounts(countsResult.counts);
      setEvaluationTotal(countsResult.total);
      setPerformanceDistribution(distResult.distribution);
      setDistributionEvaluated(distResult.evaluated);
      setEvaluationsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeSection, activeCycleId]);

  // Document requests (Action Queue on dashboard + Documents/Reports section).
  useEffect(() => {
    if (activeSection !== 'dashboard') return;
    let cancelled = false;
    (async () => {
      setDocumentRequestsLoading(true);
      const result = await getDocumentRequests({ source: 'PM' });
      if (cancelled) return;
      setDocumentRequests(result.data);
      setDocumentRequestsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeSection]);

  const latestIpcrLoadId = useRef(0);

  const loadIpcrStats = useCallback(async (isSilent = false) => {
    const loadId = ++latestIpcrLoadId.current;
    if (!isSilent) {
      setIpcrLoading(true);
    }
    try {
      const [empResult, subRes, schedRes] = await Promise.all([
        getAllEmployees({ status: 'Active' }),
        (supabase as any).from('ipcr_submissions').select('*'),
        (supabase as any).from('probationary_ipcr_schedules').select('*'),
      ]);

      if (loadId !== latestIpcrLoadId.current) return;
      if (!empResult.success) {
        setIpcrStatuses(null);
        return;
      }

      const employees: Employee[] = empResult.data || [];
      const submissions = subRes.error ? [] : (subRes.data ?? []);
      const schedules = schedRes.error ? [] : (schedRes.data ?? []);

      const getMonthsOfService = (hireDate: string) => {
        const hired = new Date(hireDate);
        const now = new Date();
        return Math.max(
          0,
          (now.getFullYear() - hired.getFullYear()) * 12 + (now.getMonth() - hired.getMonth()),
        );
      };

      const computeStageInfoLocal = (hireDate: string, schedules: any[]) => {
        const hired = new Date(hireDate);
        const months = getMonthsOfService(hireDate);

        if (months < 6) {
          const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
          ];
          const hireMonthName = monthNames[hired.getMonth()];
          const sched = schedules.find((s) => s.hired_month === hireMonthName);
          
          if (sched) {
            const now = new Date();
            const targetEnd = new Date(sched.target_end);
            const accomplishmentEnd = new Date(sched.accomplishment_end);
            if (now <= targetEnd) {
              return { stage: 'Target Setting', phase: 'target', dueDate: targetEnd, periodLabel: sched.period_label };
            } else {
              return { stage: 'Accomplishment Rating', phase: 'rating', dueDate: accomplishmentEnd, periodLabel: sched.period_label };
            }
          }
          if (months < 3) {
            const due = new Date(hired);
            due.setMonth(due.getMonth() + 3);
            return { stage: 'Target Setting', phase: 'target', dueDate: due, periodLabel: 'Probationary — 1st 3 Months' };
          }
          const due = new Date(hired);
          due.setMonth(due.getMonth() + 6);
          return { stage: 'Accomplishment Rating', phase: 'rating', dueDate: due, periodLabel: 'Probationary — 2nd 3 Months' };
        }

        const regularStart = new Date(hired);
        regularStart.setMonth(regularStart.getMonth() + 6);
        const now = new Date();
        const msSinceRegular = Math.max(
          0,
          (now.getFullYear() - regularStart.getFullYear()) * 12 + (now.getMonth() - regularStart.getMonth()),
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
          return { stage: 'Target Setting', phase: 'target', dueDate: due, periodLabel: `${halfLabel} ${yr}` };
        }
        const due = new Date(cycleStart);
        due.setMonth(due.getMonth() + 12);
        return { stage: 'Accomplishment Rating', phase: 'rating', dueDate: due, periodLabel: `${halfLabel} ${yr}` };
      };

      const currentCycleStart = (hireDate: string): Date => {
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
      };

      const subMap = new Map<string, string>();
      const subByEmpPhase = new Map<string, { stage: string; updatedAt: number }>();
      for (const s of submissions) {
        subMap.set(`${s.employee_id}::${s.period}::${s.phase}`, s.stage);

        const fk = `${s.employee_id}::${s.phase}`;
        const updatedAt = new Date(s.updated_at ?? 0).getTime();
        const prev = subByEmpPhase.get(fk);
        if (!prev || updatedAt >= prev.updatedAt) {
          subByEmpPhase.set(fk, { stage: s.stage, updatedAt });
        }
      }

      let probTotal = 0;
      let probDue = 0;
      let nextDueDate: Date | null = null;
      const pendingList: any[] = [];
      const statuses: IpcrStatus[] = [];

      for (const emp of employees) {
        const hireDateToUse = emp.hire_date || emp.created_at || new Date().toISOString();
        const months = getMonthsOfService(hireDateToUse);
        const isProb = months < 6;
        const { phase, dueDate, periodLabel } = computeStageInfoLocal(hireDateToUse, schedules);

        const calPeriod = toCalendarPeriod(periodLabel);
        let actualStage = subMap.get(`${emp.id}::${periodLabel}::${phase}`);
        if (!actualStage && calPeriod) {
          actualStage = subMap.get(`${emp.id}::${calPeriod}::${phase}`);
        }
        if (!actualStage) {
          const fallback = subByEmpPhase.get(`${emp.id}::${phase}`);
          if (fallback && fallback.updatedAt >= currentCycleStart(hireDateToUse).getTime()) {
            actualStage = fallback.stage;
          }
        }
        actualStage = actualStage || 'Not Started';
        const isPending = actualStage !== 'Forwarded to PM';
        statuses.push({ dept: emp.department ?? '', dueDate, forwarded: !isPending });

        if (isProb) {
          probTotal++;
          if (isPending) {
            probDue++;
            if (!nextDueDate || dueDate < nextDueDate) {
              nextDueDate = dueDate;
            }
          }
        }

        if (isPending) {
          pendingList.push({
            name: emp.full_name,
            position: emp.current_position || '—',
            dept: emp.department || 'Unassigned',
            type: isProb ? 'Probationary' : 'Regular',
            period: periodLabel,
            stage: actualStage,
            dueDate: dueDate,
          });
        }
      }

      setProbationaryMetrics({
        total: probTotal,
        due: probDue,
        nextDue: nextDueDate ? nextDueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
      });

      const probPending = pendingList.filter(p => p.type === 'Probationary').length;
      const regPending = pendingList.filter(p => p.type === 'Regular').length;
      setProbationarySubmissionsCount(probPending);
      setRegularSubmissionsCount(regPending);

      pendingList.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      setPendingSubmissions(pendingList);
      setIpcrStatuses(statuses);
    } catch (err) {
      console.error('Error calculating IPCR stats:', err);
      if (loadId === latestIpcrLoadId.current) setIpcrStatuses(null);
    } finally {
      if (loadId === latestIpcrLoadId.current) {
        setIpcrLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (activeSection !== 'dashboard') return;
    void loadIpcrStats();
  }, [activeSection, loadIpcrStats]);

  useRealtimeRefresh({
    channel: 'pm-dashboard-ipcr',
    tables: ['ipcr_submissions', 'probationary_ipcr_schedules', 'employees'],
    onChange: useCallback(() => {
      void loadIpcrStats(true);
    }, [loadIpcrStats]),
    enabled: activeSection === 'dashboard',
  });


  const fetchCycles = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from('performance_cycles')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;
      const safeCycles = (Array.isArray(data) ? data : []).map((item: any, index: number) => ({
        id: Number(item?.id ?? index + 1),
        title: String(item?.title ?? `Cycle ${index + 1}`),
        start_date: String(item?.start_date ?? ''),
        end_date: String(item?.end_date ?? ''),
        status: (item?.status === 'Active' || item?.status === 'Completed' ? item.status : 'Planned') as 'Active' | 'Completed' | 'Planned',
        created_at: String(item?.created_at ?? new Date().toISOString()),
      }));
      setCycles(safeCycles);
    } catch (error) {
      console.error('Error fetching evaluation cycles:', error);
      setCycles(FALLBACK_CYCLES);
      setErrorMessage('Using local sample evaluation data (live source unavailable).');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCycle = async () => {
    if (!newCycle.title || !newCycle.start_date || !newCycle.end_date) {
      alert('Please fill in all fields');
      return;
    }

    try {
      if (editingCycle) {
        const { error } = await (supabase as any)
          .from('performance_cycles')
          .update(newCycle)
          .eq('id', editingCycle.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('performance_cycles')
          .insert([newCycle]);
        if (error) throw error;
      }

      await fetchCycles();
      setShowCycleDialog(false);
      setEditingCycle(null);
      setNewCycle({ title: '', start_date: '', end_date: '', status: 'Planned' });
    } catch (error) {
      console.error('Error saving evaluation cycle:', error);
      alert('Failed to save evaluation cycle');
    }
  };

  const handleDeleteCycle = async (id: number) => {
    if (!confirm('Are you sure you want to delete this evaluation cycle?')) return;

    try {
      const { error } = await supabase
        .from('performance_cycles')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchCycles();
    } catch (error) {
      console.error('Error deleting evaluation cycle:', error);
      alert('Failed to delete evaluation cycle');
    }
  };

  const handleEditCycle = (cycle: EvaluationCycle) => {
    setEditingCycle(cycle);
    setNewCycle({
      title: cycle.title,
      start_date: cycle.start_date,
      end_date: cycle.end_date,
      status: cycle.status as 'Active' | 'Completed' | 'Planned'
    });
    setShowCycleDialog(true);
  };


  if (isDashboardView) {
    const sideNavItems = [
      { key: 'dashboard', label: 'Dashboard', subtitle: '', icon: LayoutDashboard },
      { key: 'office-directory', label: 'Office Directory', subtitle: 'Offices, heads & employees', icon: Building2 },
      { key: 'summary-of-ratings', label: 'Summary of Ratings', subtitle: 'IPCR performance data', icon: BarChart3 },
      { key: 'ipcr-management', label: 'IPCR Management', subtitle: 'Onboarding & Tracking', icon: ClipboardList },
      { key: 'competency', label: 'Competency Framework', subtitle: 'Position Requirements', icon: BookOpen },
      { key: 'archive', label: 'Archive', subtitle: 'Historical IPCR records', icon: ArchiveIcon },
      { key: 'settings', label: 'Settings', subtitle: '', icon: Settings },
    ] as const;

    return (
      <div className="brand-text min-h-screen bg-slate-100 font-sans text-[#040E6B]">
        <AdminHeader userName="PM Admin" divisionLabel="PM Division" />

        <div className="flex">
          {/* Side navigation rail (DESIGN_IDENTITY.md §9.12), same as the RSP
              portal — unless a super admin is viewing, in which case they keep
              their own sidebar rather than being handed PM's navigation. */}
          {viewOnly ? (
            <Sidebar activeModule="PM" userRole="super-admin" />
          ) : (
            <RailNav
              items={sideNavItems.map((item) => ({
                path: `pm:${item.key}`,
                label: item.label,
                icon: item.icon,
                isActive: activeSection === item.key,
                bottom: item.key === 'settings',
                onSelect: () => setActiveSection(item.key),
                title: item.subtitle || item.label,
              }))}
            />
          )}

          {/* The dashboard draws its own full-width gradient header strip. */}
          <main className={`min-w-0 flex-1 ${activeSection === 'dashboard' ? 'p-0' : 'p-4 sm:p-6'}`}>

            {activeSection === 'office-directory' && (
              <OfficeDirectorySection showBulkRequest={false} />
            )}

            {activeSection === 'dashboard' && (
              <div className="dash-lg">
                <PmDashboardOverview
                  statuses={ipcrStatuses}
                  statusesLoading={ipcrLoading}
                  onOpenSummary={() => setActiveSection('summary-of-ratings')}
                />

                <div className="px-4 pb-6 sm:px-6">
                {errorMessage && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    {errorMessage}
                  </div>
                )}
                  {/* Left â€“ Action Required Queue (60%) */}
                  {/* Collapsed by default so it doesn't push the dashboard down (docs/mockups/2026-10-16-action-queue-dropdown.html). */}
                  <section className="abyan-ds rounded-xl border border-[var(--neutral-200)] bg-[var(--bg-surface)] overflow-hidden">
                    <h3>
                      <button
                        type="button"
                        aria-expanded={actionQueueOpen}
                        aria-controls="pm-action-queue-list"
                        onClick={() => setActionQueueOpen(open => !open)}
                        className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left hover:bg-[var(--bg-page)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)] transition-colors"
                      >
                        <span className="text-title-s text-[var(--color-primary-900)]">Action required</span>
                        {actionRequiredQueue.length > 0 ? (
                          <span className="text-body-s rounded-full bg-[var(--warning-100)] px-2.5 py-0.5 text-[var(--warning-700)]">{actionRequiredQueue.length} pending</span>
                        ) : (
                          <span className="text-body-s rounded-full bg-[var(--neutral-100)] px-2.5 py-0.5 text-[var(--neutral-800)]">None pending</span>
                        )}
                        {actionQueueOverdue > 0 && (
                          <span className="text-body-s rounded-full bg-[var(--error-100)] px-2.5 py-0.5 text-[var(--error-700)]">{actionQueueOverdue} overdue</span>
                        )}
                        <span className="text-caption ml-auto inline-flex items-center gap-1 text-[var(--neutral-600)]">
                          {actionQueueOpen ? 'Hide' : 'Show'}
                          {actionQueueOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                        </span>
                      </button>
                    </h3>
                    {actionQueueOpen && (
                      <div id="pm-action-queue-list" className="relative min-h-[60px] border-t border-[var(--neutral-200)]">
                        {evaluationsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                        {actionRequiredQueue.length === 0 && !evaluationsLoading ? (
                          <p className="text-body-m py-8 text-center text-[var(--neutral-600)]">No pending actions</p>
                        ) : (
                          <ul className="divide-y divide-[var(--neutral-200)]">
                            {actionQueueRows.map(row => {
                              const age = queueAgeChip(row);
                              return (
                                <li key={row.key} className="flex items-center gap-3 px-5 py-3">
                                  <div className="min-w-0 flex-1">
                                    {row.name ? (
                                      <p className="text-body-m truncate font-semibold text-[var(--color-primary-900)]" title={row.name}>{row.name}</p>
                                    ) : (
                                      <p className="text-body-m font-semibold italic text-[var(--neutral-600)]">Employee not linked</p>
                                    )}
                                    <p className="text-body-s truncate text-[var(--neutral-600)]" title={`${row.dept ?? 'No department'} · ${row.type}`}>
                                      {row.dept ?? 'No department'} · {row.type}
                                    </p>
                                  </div>
                                  <span className={`text-body-s shrink-0 rounded-full px-2.5 py-0.5 ${age.className}`}>{age.label}</span>
                                  <button type="button" className="btn btn-sm btn-secondary shrink-0">Review</button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {actionRequiredQueue.length > QUEUE_PREVIEW_ROWS && (
                          <div className="border-t border-[var(--neutral-200)] px-5 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => setActionQueueShowAll(all => !all)}
                              className="text-body-m font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-700)] hover:underline"
                            >
                              {actionQueueShowAll ? 'Show fewer' : `View all ${actionRequiredQueue.length} →`}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>


                {/* IPCR Submissions, full width: the Competency & Succession
                    Watchlist that shared this row was removed
                    (docs/plans/2026-10-26-pm-dashboard-cleanup.md). */}
                <div className="mt-6">
                  <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-slate-500" />
                          <h3 className="text-sm font-bold text-slate-800">IPCR Submissions</h3>
                        </div>
                        <div className="flex bg-slate-100 rounded-lg p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setIpcrSubmissionTab('pending')}
                            className={`px-2.5 py-1 rounded-md transition ${
                              ipcrSubmissionTab === 'pending'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Pending ({pendingSubmissions.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setIpcrSubmissionTab('recent')}
                            className={`px-2.5 py-1 rounded-md transition ${
                              ipcrSubmissionTab === 'recent'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Recent ({recentIPCRs.length})
                          </button>
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        ipcrSubmissionTab === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {ipcrSubmissionTab === 'pending' ? 'Action Required' : 'Completed'}
                      </span>
                    </header>
                    <div className="abyan-table-wrap relative min-h-[60px]">
                      
                      {ipcrSubmissionTab === 'pending' ? (
                        <table className="abyan-table w-full">
                          <thead>
                            <tr className="bg-slate-50/80 text-left">
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Employee</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Dept.</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Period</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Stage</th>
                            </tr>
                            <TableRefreshBar active={pendingLoad.refreshing} colSpan={5} />
                          </thead>
                          <tbody className={`divide-y divide-slate-100 ${tableBodyClass(pendingLoad.refreshing)}`}>
                            {pendingLoad.initialLoading ? (
                              <TableSkeletonRows show={pendingLoad.showSkeleton} columns={['text', 'text', 'text', 'text', 'badge']} label="Loading pending submissions…" />
                            ) : pendingSubmissions.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-8 text-center text-slate-500 italic">No pending submissions</td>
                              </tr>
                            ) : (
                              pendingSubmissions.map((row, idx) => {
                                const stageColors: Record<string, string> = {
                                  'Not Started': 'bg-slate-100 text-slate-600',
                                  'In Draft': 'bg-amber-100 text-amber-800',
                                  'Submitted to Office': 'bg-blue-100 text-blue-800',
                                  'Returned for Revision': 'bg-rose-100 text-rose-800',
                                  'Verified': 'bg-indigo-100 text-indigo-800',
                                  'Forwarded to PM': 'bg-emerald-100 text-emerald-800'
                                };
                                const typeColors: Record<string, string> = {
                                  'Probationary': 'bg-purple-100 text-purple-800',
                                  'Regular': 'bg-sky-100 text-sky-800'
                                };
                                return (
                                  <tr key={`${row.name}-${idx}`} className="hover:bg-slate-50/60 transition">
                                    <td className="px-4 py-3">
                                      <p className="font-semibold text-slate-800">{row.name}</p>
                                      <p className="text-slate-400">{row.position}</p>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">{row.dept}</td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${typeColors[row.type] || 'bg-slate-100 text-slate-850'}`}>
                                        {row.type}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">{row.period}</td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${stageColors[row.stage] || 'bg-slate-100 text-slate-850'}`}>
                                        {row.stage}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      ) : (
                        <table className="abyan-table w-full">
                          <thead>
                            <tr className="bg-slate-50/80 text-left">
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Employee</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Dept.</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Period</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Rating</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                              <th className="px-4 py-2.5"></th>
                            </tr>
                            <TableRefreshBar active={recentLoad.refreshing} colSpan={6} />
                          </thead>
                          <tbody className={`divide-y divide-slate-100 ${tableBodyClass(recentLoad.refreshing)}`}>
                            {recentLoad.initialLoading ? (
                              <TableSkeletonRows show={recentLoad.showSkeleton} columns={['text', 'text', 'text', 'text', 'badge', 'button']} label="Loading submissions…" />
                            ) : recentIPCRs.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-slate-500 italic">No submissions yet</td>
                              </tr>
                            ) : (
                              recentIPCRs.map((row, idx) => (
                                <tr key={`${row.name}-${idx}`} className="hover:bg-slate-50/60 transition">
                                  <td className="px-4 py-3">
                                    <p className="font-semibold text-slate-800">{row.name}</p>
                                    <p className="text-slate-400">{row.position}</p>
                                  </td>
                                  <td className="px-4 py-3 text-slate-500">{row.dept}</td>
                                  <td className="px-4 py-3 text-slate-500">{row.period}</td>
                                  <td className="px-4 py-3">
                                    {row.rating !== '—' && row.rating !== 'â€”' ? (
                                      <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">{row.rating}</span>
                                    ) : <span className="text-slate-400">—</span>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${row.statusColor}`}>
                                      {row.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button type="button" className="rounded-md p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition" title="View">
                                      <Eye className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </section>
                </div>
                </div>
              </div>
            )}


            {activeSection === 'ipcr-management' && <PMIPCRManagement />}

            {activeSection === 'summary-of-ratings' && <SummaryOfRatings />}

            {activeSection === 'competency' && <CompetencyFrameworkPage isDashboardView />}

            {activeSection === 'archive' && <PMArchive />}

            {activeSection === 'settings' && (
              <>
                <h2 className="text-3xl font-bold text-slate-900">Settings</h2>
                <p className="mt-1 text-slate-600">Configure your system preferences and account settings</p>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-4 gap-6">
                  <aside className="xl:col-span-1 space-y-2">
                    {[
                      { id: 'profile', label: 'Profile Settings', icon: User },
                      { id: 'notifications', label: 'Notifications', icon: Bell },
                      { id: 'security', label: 'Security', icon: Shield },
                      { id: 'system', label: 'System Settings', icon: Database },
                      { id: 'email', label: 'Email Configuration', icon: Mail },
                      { id: 'appearance', label: 'Appearance', icon: Palette },
                      { id: 'localization', label: 'Localization', icon: Globe },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const isActive = tab.id === 'profile';
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition ${isActive ? 'bg-blue-50 text-blue-600 font-medium' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                        >
                          <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
                          <span className="text-sm">{tab.label}</span>
                        </button>
                      );
                    })}
                  </aside>

                  <div className="xl:col-span-3">
                    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-2xl font-bold text-slate-900">Profile Settings</h3>
                      <p className="mt-1 text-sm text-slate-600">Personal information is view-only in this screen.</p>

                      <div className="mt-6 flex items-center gap-4">
                        <div className="h-24 w-24 rounded-full bg-blue-100 grid place-content-center">
                          <UserCircle2 className="h-12 w-12 text-blue-600" />
                        </div>
                        <div>
                          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
                            Change Photo
                          </button>
                          <p className="mt-1 text-xs text-slate-500">JPG, PNG or GIF. Max size 2MB</p>
                        </div>
                      </div>

                      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">First Name</label>
                          <input type="text" className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm" placeholder="Enter first name" readOnly />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Last Name</label>
                          <input type="text" className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm" placeholder="Enter last name" readOnly />
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                        <input type="email" className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm" placeholder="Enter email address" readOnly />
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                        <input type="text" className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm bg-slate-50" value="PM" disabled />
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Department</label>
                        <select className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm" disabled>
                          <option>Select department</option>
                          <option>Human Resource Management Office</option>
                          <option>Finance Department</option>
                          <option>IT Department</option>
                        </select>
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Bio</label>
                        <textarea className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm" rows={4} placeholder="Tell us about yourself..." readOnly></textarea>
                      </div>

                      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Personal information updates must be handled outside this screen.
                      </div>
                    </section>
                  </div>
                </div>
              </>
            )}

            {!['dashboard', 'employees', 'evaluation-status', 'performance-reviews', 'goals', 'ipcr', 'ipcr-management', 'summary-of-ratings', 'competency', 'analytics', 'archive', 'weighting', 'office-directory', 'promotions', 'reports', 'settings', 'registry'].includes(activeSection) && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900 capitalize">{activeSection.replace('-', ' ')}</h2>
                <p className="mt-2 text-slate-600">Section scaffold is ready. Share the next screenshots and I'll match this page exactly.</p>
              </div>
            )}
          </main>
        </div>

        {/* Request Document Modal */}
        {showRequestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeRequestModal}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Request Document</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Send a document request to this employee</p>
                </div>
                <button type="button" onClick={closeRequestModal} className="text-slate-400 hover:text-slate-600 transition">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Employee Info */}
              {requestEmployee && (
                <div className="mx-6 mt-4 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <span className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-900 text-sm font-bold text-white shrink-0">
                    {requestEmployee.initials}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{requestEmployee.name}</p>
                    <p className="text-xs text-slate-500">{requestEmployee.role} &middot; {requestEmployee.dept}</p>
                  </div>
                </div>
              )}

              {/* Form */}
              <div className="px-6 pt-5 pb-6 space-y-5">
                {/* Document Type */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Document Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={requestDocType}
                    onChange={(e) => setRequestDocType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none appearance-none bg-white"
                  >
                    <option value="">Select document type...</option>
                    {documentTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Description <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    value={requestDescription}
                    onChange={(e) => setRequestDescription(e.target.value)}
                    placeholder="e.g. Please upload your signed Q3 Performance Review."
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Due Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={requestDueDate}
                    onChange={(e) => setRequestDueDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 pb-6">
                <button
                  type="button"
                  onClick={closeRequestModal}
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendRequest}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm"
                >
                  <Send className="h-4 w-4" />
                  Send Request
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Document Request Modal */}
        {showBulkRequestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeBulkRequestModal}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-2 sticky top-0 bg-white rounded-t-2xl z-10">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Bulk Document Request</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Request documents from multiple employees at once</p>
                </div>
                <button type="button" onClick={closeBulkRequestModal} className="text-slate-400 hover:text-slate-600 transition">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-6 pt-5 pb-6 space-y-6">
                {/* Quick Templates */}
                <div>
                  <p className="text-sm font-semibold text-slate-800 mb-2">
                    Quick Templates <span className="text-slate-400 font-normal">(Optional)</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {documentTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setBulkDocName(type)}
                        className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm text-left transition ${bulkDocName === type
                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                      >
                        <FileText className={`h-4 w-4 shrink-0 ${bulkDocName === type ? 'text-blue-500' : 'text-blue-400'}`} />
                        <span className="leading-snug">{type === 'SALN' ? 'SALN (Statement of Assets, Liabilities and Net Worth)' : type}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Document Name */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Document Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={bulkDocName}
                    onChange={(e) => setBulkDocName(e.target.value)}
                    placeholder="e.g., NBI Clearance, Medical Certificate, etc."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Description / Requirements */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Description / Requirements <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={bulkDescription}
                    onChange={(e) => setBulkDescription(e.target.value)}
                    placeholder="Provide details about what the document should include, validity requirements, etc."
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>

                {/* Due Date with inline calendar */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Due Date <span className="text-red-500">*</span>
                  </label>
                  <div className="rounded-lg border border-slate-300 p-3">
                    {/* Calendar Navigation */}
                    <div className="flex items-center justify-between mb-3">
                      <button type="button" onClick={handleCalendarPrev} className="text-slate-400 hover:text-slate-600 transition p-1">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-sm font-semibold text-slate-800">{calendarMonthName} {bulkCalendarYear}</span>
                      <button type="button" onClick={handleCalendarNext} className="text-slate-400 hover:text-slate-600 transition p-1">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Day headers */}
                    <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400 mb-1">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                        <span key={d} className="py-1">{d}</span>
                      ))}
                    </div>
                    {/* Day cells */}
                    <div className="grid grid-cols-7 text-center text-sm">
                      {getCalendarDays(bulkCalendarMonth, bulkCalendarYear).map((day, idx) => {
                        if (day === null) return <span key={idx} />;
                        const past = isDatePast(day);
                        const selected = bulkDueDate && bulkDueDate.getDate() === day && bulkDueDate.getMonth() === bulkCalendarMonth && bulkDueDate.getFullYear() === bulkCalendarYear;
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={past}
                            onClick={() => setBulkDueDate(new Date(bulkCalendarYear, bulkCalendarMonth, day))}
                            className={`py-1.5 rounded-full transition text-sm ${selected
                                ? 'bg-blue-600 text-white font-semibold'
                                : past
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : 'text-slate-700 hover:bg-blue-50'
                              }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Upload Template File */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Upload Template File <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <label className="flex items-center gap-2.5 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-500 cursor-pointer hover:border-slate-400 transition">
                    <Upload className="h-4 w-4 text-slate-400" />
                    <span>Choose File</span>
                    <span className="text-slate-400">No file chosen</span>
                    <input type="file" className="hidden" />
                  </label>
                </div>

                {/* Send Request To */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">
                    Send Request To <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    {/* All Employees */}
                    <button
                      type="button"
                      onClick={() => setBulkSendTo('all')}
                      className={`w-full flex items-center gap-3 rounded-lg border p-3.5 text-left transition ${bulkSendTo === 'all' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                    >
                      <span className={`flex items-center justify-center h-10 w-10 rounded-full shrink-0 ${bulkSendTo === 'all' ? 'bg-blue-600' : 'bg-slate-100'}`}>
                        <Users className={`h-5 w-5 ${bulkSendTo === 'all' ? 'text-white' : 'text-slate-500'}`} />
                      </span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${bulkSendTo === 'all' ? 'text-blue-800' : 'text-slate-800'}`}>All Employees</p>
                        <p className={`text-xs ${bulkSendTo === 'all' ? 'text-blue-600' : 'text-slate-400'}`}>{totalEmployees} employees will receive this request</p>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${bulkSendTo === 'all' ? 'border-blue-600' : 'border-slate-300'}`}>
                        {bulkSendTo === 'all' && <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
                      </div>
                    </button>

                    {/* By Department */}
                    <button
                      type="button"
                      onClick={() => setBulkSendTo('department')}
                      className={`w-full flex items-center gap-3 rounded-lg border p-3.5 text-left transition ${bulkSendTo === 'department' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                    >
                      <span className={`flex items-center justify-center h-10 w-10 rounded-full shrink-0 ${bulkSendTo === 'department' ? 'bg-blue-600' : 'bg-slate-100'}`}>
                        <Building2 className={`h-5 w-5 ${bulkSendTo === 'department' ? 'text-white' : 'text-slate-500'}`} />
                      </span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${bulkSendTo === 'department' ? 'text-blue-800' : 'text-slate-800'}`}>By Department</p>
                        <p className={`text-xs ${bulkSendTo === 'department' ? 'text-blue-600' : 'text-slate-400'}`}>Select a specific department</p>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${bulkSendTo === 'department' ? 'border-blue-600' : 'border-slate-300'}`}>
                        {bulkSendTo === 'department' && <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
                      </div>
                    </button>
                    {bulkSendTo === 'department' && (
                      <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                        <select className="w-full rounded-lg border border-blue-500 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 shadow-sm">
                          <option value="">Select department...</option>
                          <option value="IT Department">IT Department</option>
                          <option value="Finance Department">Finance Department</option>
                          <option value="HR Department">HR Department</option>
                          <option value="Administration">Administration</option>
                          <option value="Operations">Operations</option>
                        </select>
                      </div>
                    )}

                    {/* Selected Employees */}
                    <button
                      type="button"
                      onClick={() => setBulkSendTo('selected')}
                      className={`w-full flex items-center gap-3 rounded-lg border p-3.5 text-left transition ${bulkSendTo === 'selected' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                    >
                      <span className={`flex items-center justify-center h-10 w-10 rounded-full shrink-0 ${bulkSendTo === 'selected' ? 'bg-blue-600' : 'bg-slate-100'}`}>
                        <UsersRound className={`h-5 w-5 ${bulkSendTo === 'selected' ? 'text-white' : 'text-slate-500'}`} />
                      </span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${bulkSendTo === 'selected' ? 'text-blue-800' : 'text-slate-800'}`}>Selected Employees</p>
                        <p className={`text-xs ${bulkSendTo === 'selected' ? 'text-blue-600' : 'text-slate-400'}`}>Choose specific employees from the list</p>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${bulkSendTo === 'selected' ? 'border-blue-600' : 'border-slate-300'}`}>
                        {bulkSendTo === 'selected' && <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
                      </div>
                    </button>
                    {bulkSendTo === 'selected' && (
                      <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="rounded-lg border border-blue-500 bg-white overflow-hidden shadow-sm">
                          <div className="flex items-center px-3 py-2.5 border-b border-slate-200">
                            <Search className="h-4 w-4 text-slate-400 mr-2" />
                            <input
                              type="text"
                              value={employeeSearchTerm}
                              onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                              placeholder="Search by name, position, or department..."
                              className="w-full text-sm text-slate-700 outline-none bg-transparent placeholder-slate-400"
                            />
                          </div>
                          {filteredBulkEmployees.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/30">
                              <Search className="h-8 w-8 text-slate-300 mb-2 opacity-50" />
                              <p className="text-sm font-medium text-slate-600">No employees match "{employeeSearchTerm}"</p>
                              <p className="text-xs text-slate-400 mt-1">Try a different name, position, or department</p>
                            </div>
                          ) : (
                            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                              {filteredBulkEmployees.map((emp) => {
                                const checked = bulkSelectedEmployees.includes(emp.id);
                                return (
                                  <li key={emp.id}>
                                    <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleBulkEmployee(emp.id)}
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-800 truncate">{emp.name}</p>
                                        <p className="text-xs text-slate-500 truncate">{emp.position} &middot; {emp.department}</p>
                                      </div>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {bulkSelectedEmployees.length > 0 && (
                            <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 text-xs text-blue-700 font-medium">
                              {bulkSelectedEmployees.length} selected
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">Summary:</span> This document request will be sent to <span className="font-bold text-slate-900">{totalEmployees}</span> employees. All employees will be notified.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 pb-6">
                <button
                  type="button"
                  onClick={closeBulkRequestModal}
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkSendRequest}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm"
                >
                  <FileText className="h-4 w-4" />
                  {bulkSendTo === 'all' && `Send to All Employees (${totalEmployees})`}
                  {bulkSendTo === 'department' && 'Send to Department'}
                  {bulkSendTo === 'selected' && 'Send to Selected Employees'}
                </button>
              </div>
            </div>
          </div>
        )}

        <DocumentPreviewModal
          open={!!reviewingRequest}
          fileUrl={reviewingRequest?.file_url ?? ''}
          fileName={reviewingRequest?.file_name ?? reviewingRequest?.document_name ?? 'Document'}
          fileType={reviewingRequest?.file_type ?? undefined}
          title={reviewingRequest?.document_name ?? 'Review Document'}
          subtitle={
            reviewingRequest
              ? `${reviewingRequest.employee_name ?? 'Employee'} â€¢ ${reviewingRequest.department ?? 'Unassigned'} â€¢ Status: ${reviewingRequest.status}`
              : undefined
          }
          onClose={() => { if (!reviewDecisionPending) setReviewingRequest(null); }}
          actions={
            reviewingRequest?.status === 'Submitted' ? (
              <>
                <button
                  type="button"
                  disabled={!!reviewDecisionPending}
                  onClick={() => void handleReviewDecision('Rejected')}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  {reviewDecisionPending === 'Rejected' ? 'Rejectingâ€¦' : 'Reject'}
                </button>
                <button
                  type="button"
                  disabled={!!reviewDecisionPending}
                  onClick={() => void handleReviewDecision('Approved')}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {reviewDecisionPending === 'Approved' ? 'Approvingâ€¦' : 'Approve'}
                </button>
              </>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Performance Management System</h1>
            <Button onClick={() => {
              setEditingCycle(null);
              setNewCycle({ title: '', start_date: '', end_date: '', status: 'Planned' });
              setShowCycleDialog(true);
            }} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Evaluation Cycle
            </Button>
          </div>

          {errorMessage && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {errorMessage}
            </div>
          )}

          {cyclesLoad.initialLoading ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md" aria-busy="true">
              <SkeletonList show={cyclesLoad.showSkeleton} rows={4} label="Loading evaluation cycles…" />
            </div>
          ) : (
            <div className="abyan-table-wrap">
              <table className="abyan-table w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Cycle Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Start Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">End Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Action</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900">Options</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                        No evaluation cycles created yet.
                      </td>
                    </tr>
                  ) : (
                    cycles.map((cycle) => (
                      <tr key={cycle.id} className="border-b border-slate-200 hover:bg-slate-50 transition">
                        <td className="px-6 py-4 text-sm text-slate-900 font-medium">{cycle.title}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{new Date(cycle.start_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{new Date(cycle.end_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cycle.status === 'Active' ? 'bg-blue-100 text-blue-800' :
                            cycle.status === 'Completed' ? 'bg-green-100 text-green-800' :
                              'bg-slate-100 text-slate-800'
                            }`}>
                            {cycle.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <button className="text-blue-900 hover:text-blue-700 transition flex items-center gap-1 font-medium">
                            <Eye className="w-4 h-4" />
                            View Status
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => handleEditCycle(cycle)}
                            className="text-blue-900 hover:text-blue-700 transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCycle(cycle.id)}
                            className="text-red-600 hover:text-red-800 transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create/Edit Evaluation Cycle Dialog */}
      <Dialog
        open={showCycleDialog}
        onClose={() => {
          setShowCycleDialog(false);
          setEditingCycle(null);
          setNewCycle({ title: '', start_date: '', end_date: '', status: 'Planned' });
        }}
        title={editingCycle ? 'Edit Evaluation Cycle' : 'Create New Evaluation Cycle'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cycle Name *</label>
            <Input
              type="text"
              placeholder="e.g., Annual Review 2026"
              value={newCycle.title}
              onChange={(e) => setNewCycle({ ...newCycle, title: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
            <Input
              type="date"
              value={newCycle.start_date}
              onChange={(e) => setNewCycle({ ...newCycle, start_date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End Date *</label>
            <Input
              type="date"
              value={newCycle.end_date}
              onChange={(e) => setNewCycle({ ...newCycle, end_date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={newCycle.status}
              onChange={(e) => setNewCycle({ ...newCycle, status: e.target.value as 'Active' | 'Completed' | 'Planned' })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/30 focus:border-blue-900"
            >
              <option value="Planned">Planned</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleAddCycle}
              className="flex-1 bg-blue-900 text-white"
            >
              {editingCycle ? 'Update Cycle' : 'Create Cycle'}
            </Button>
            <Button
              onClick={() => {
                setShowCycleDialog(false);
                setEditingCycle(null);
                setNewCycle({ title: '', start_date: '', end_date: '', status: 'Planned' });
              }}
              className="flex-1 bg-slate-300 text-slate-900"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};