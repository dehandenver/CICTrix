import {
  AlertCircle,
  AlertTriangle,
  Archive as ArchiveIcon,
  Scale,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  Database,
  Download,
  Edit2,
  Eye,
  FileCheck2,
  FileText,
  Globe,
  HelpCircle,
  Info,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  MoreHorizontal,
  Palette,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Upload,
  User,
  UserCircle2,
  Users,
  UsersRound,
  X,
  XCircle
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { AdminHeader } from '../../components/AdminHeader';
import { Sidebar } from '../../components/Sidebar';
import { OfficeDirectorySection } from '../../components/OfficeDirectorySection';
import {
  computeSkillGapByDepartment,
  getEmployeeCompetencies,
} from '../../lib/api/competencies';
import {
  getDocumentRequests,
  groupRequestsByDepartment,
  summarizeRequests,
  updateDocumentRequestStatus,
  type DocumentRequest,
} from '../../lib/api/documentRequests';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { getAllEmployees, type Employee } from '../../lib/api/employees';
import { createDocumentRequest } from '../../lib/employeeDocuments';
import {
  bucketForScore,
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
import { OfficeWeightingPanel } from './pm/OfficeWeightingPanel';
import { PMReportsAnalytics } from './pm/PMReportsAnalytics';

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

export const PMDashboard = ({ isDashboardView = true }: { isDashboardView?: boolean }) => {
  const [stats, setStats] = useState<PerformanceStats>({
    activeCycle: 'None',
    pendingReviews: 0
  });
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  const [showCycleDialog, setShowCycleDialog] = useState(false);
  const [editingCycle, setEditingCycle] = useState<EvaluationCycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<
    'dashboard' | 'office-directory' | 'ipcr-management' | 'competency' | 'promotions' | 'analytics' | 'archive' | 'weighting' | 'settings'
  >('dashboard');

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

  const openRequestModal = (employee?: { id?: string; name: string; role: string; dept: string; initials: string }) => {
    setRequestEmployee(employee || null);
    setRequestDocType('');
    setRequestDescription('');
    setRequestDueDate('');
    setShowRequestModal(true);
  };

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
  const [bulkSelectedDepartment, setBulkSelectedDepartment] = useState<string>('');
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

  const openBulkRequestModal = () => {
    setBulkDocName('');
    setBulkDescription('');
    setBulkDueDate(null);
    setBulkSendTo('all');
    setBulkCalendarMonth(new Date().getMonth());
    setBulkCalendarYear(new Date().getFullYear());
    setBulkSelectedEmployees([]);
    setEmployeeSearchTerm('');
    setShowBulkRequestModal(true);
  };

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
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewRowsPerPage, setReviewRowsPerPage] = useState(20);

  // â”€â”€ Live PM data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Per Phase 2 of the data-migration plan: every dashboard widget reads from
  // these state slots; per-section useEffects below populate them. No mock
  // fallbacks â€” empty arrays render the "No data" empty state in each widget.
  const [evaluations, setEvaluations] = useState<PerformanceEvaluation[]>([]);
  const [evaluationsLoading, setEvaluationsLoading] = useState(false);
  const [statusCounts, setStatusCounts] = useState<Record<EvaluationStatus, number>>({
    'Planning': 0,
    'Self Evaluation': 0,
    'Supervisor Review': 0,
    'Approved': 0,
    'Rejected': 0,
  });
  const [evaluationTotal, setEvaluationTotal] = useState(0);
  const [performanceDistribution, setPerformanceDistribution] = useState<Record<DistributionBucket, number>>({
    'Outstanding': 0,
    'Very Satisfactory': 0,
    'Satisfactory': 0,
    'Unsatisfactory': 0,
    'Poor': 0,
  });
  const [distributionEvaluated, setDistributionEvaluated] = useState(0);
  const [skillGaps, setSkillGaps] = useState<Array<{ dept: string; value: number }>>([]);
  const [retirements, setRetirements] = useState<Array<{ name: string; role: string; date: string; monthsAway: number }>>([]);
  const [documentRequests, setDocumentRequests] = useState<DocumentRequest[]>([]);
  const [documentRequestsLoading, setDocumentRequestsLoading] = useState(false);
  const [reviewingRequest, setReviewingRequest] = useState<DocumentRequest | null>(null);
  const [reviewDecisionPending, setReviewDecisionPending] = useState<'Approved' | 'Rejected' | null>(null);

  // States for Pending IPCR Submissions and Probationary Metrics
  const [probationarySubmissionsCount, setProbationarySubmissionsCount] = useState(0);
  const [regularSubmissionsCount, setRegularSubmissionsCount] = useState(0);
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [probationaryMetrics, setProbationaryMetrics] = useState({
    total: 0,
    due: 0,
    nextDue: '—'
  });
  const [ipcrLoading, setIpcrLoading] = useState(false);
  const [ipcrSubmissionTab, setIpcrSubmissionTab] = useState<'pending' | 'recent'>('pending');

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

  const reviewsData = evaluations.filter(e => e.status === 'Approved');
  const reviewTotalPages = Math.max(1, Math.ceil(reviewsData.length / reviewRowsPerPage));
  const reviewStartIdx = (reviewPage - 1) * reviewRowsPerPage;
  const reviewPageData = reviewsData.slice(reviewStartIdx, reviewStartIdx + reviewRowsPerPage);

  // Action-required queue: pending document requests + evaluations awaiting review.
  const actionRequiredQueue = (() => {
    const items: Array<{ name: string; dept: string; type: string; typeColor: string }> = [];
    for (const e of evaluations) {
      if (e.status === 'Supervisor Review' || e.status === 'Self Evaluation') {
        items.push({
          name: e.employee_name ?? 'Unknown',
          dept: e.department ?? 'Unassigned',
          type: e.status === 'Supervisor Review' ? 'IPCR Validation' : 'Self Evaluation',
          typeColor: 'bg-emerald-100 text-emerald-700',
        });
      }
    }
    for (const d of documentRequests) {
      if (d.status === 'Pending' || d.status === 'Submitted') {
        items.push({
          name: d.employee_name ?? 'Unknown',
          dept: d.department ?? 'Unassigned',
          type: d.document_type,
          typeColor: 'bg-slate-100 text-slate-600',
        });
      }
    }
    return items;
  })();

  // Recent IPCR submissions for the dashboard table (most recent first, top 6).
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
  const [dbEvaluationGroups, setDbEvaluationGroups] = useState<EvaluationGroup[]>([]);

  useEffect(() => {
    fetchCycles();
  }, []);

  useEffect(() => {
    calculateStats();
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
      if (!empResult.success) return;

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

      const subMap = new Map<string, string>();
      for (const s of submissions) {
        subMap.set(`${s.employee_id}::${s.period}::${s.phase}`, s.stage);
      }

      let probTotal = 0;
      let probDue = 0;
      let nextDueDate: Date | null = null;
      const pendingList: any[] = [];

      for (const emp of employees) {
        const hireDateToUse = emp.hire_date || emp.created_at || new Date().toISOString();
        const months = getMonthsOfService(hireDateToUse);
        const isProb = months < 6;
        const { stage, phase, dueDate, periodLabel } = computeStageInfoLocal(hireDateToUse, schedules);

        const actualStage = subMap.get(`${emp.id}::${periodLabel}::${phase}`) || 'Not Started';
        const isPending = actualStage !== 'Forwarded to PM';

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
    } catch (err) {
      console.error('Error calculating IPCR stats:', err);
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

  // Competency / skill-gap data + upcoming retirements (dashboard only).
  useEffect(() => {
    if (activeSection !== 'dashboard') return;
    let cancelled = false;
    (async () => {
      const compResult = await getEmployeeCompetencies();
      if (cancelled) return;
      setSkillGaps(computeSkillGapByDepartment(compResult.data));
    })();
    return () => { cancelled = true; };
  }, [activeSection]);

  // Upcoming retirements: employees turning 65 within the next 12 months.
  useEffect(() => {
    if (activeSection !== 'dashboard') return;
    let cancelled = false;
    (async () => {
      const result = await getAllEmployees({ status: 'Active' });
      if (cancelled) return;
      if (!result.success || !Array.isArray(result.data)) {
        setRetirements([]);
        return;
      }
      const today = new Date();
      const horizon = new Date(today);
      horizon.setMonth(horizon.getMonth() + 12);

      const rows: Array<{ name: string; role: string; date: string; monthsAway: number }> = [];
      for (const emp of result.data as Employee[]) {
        const dob = (emp as any).date_of_birth as string | null | undefined;
        if (!dob) continue;
        const birth = new Date(dob);
        if (Number.isNaN(birth.getTime())) continue;
        const retirementDate = new Date(birth);
        retirementDate.setFullYear(retirementDate.getFullYear() + 65);
        if (retirementDate >= today && retirementDate <= horizon) {
          const monthsAway = Math.max(0, Math.round((retirementDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.4)));
          rows.push({
            name: emp.full_name ?? 'Unnamed',
            role: emp.current_position ?? 'â€”',
            date: retirementDate.toLocaleString('default', { month: 'short', year: 'numeric' }),
            monthsAway,
          });
        }
      }
      rows.sort((a, b) => a.monthsAway - b.monthsAway);
      setRetirements(rows);
    })();
    return () => { cancelled = true; };
  }, [activeSection]);

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

  const calculateStats = () => {
    const activeCycle = cycles.find(c => c.status === 'Active');
    setStats({
      activeCycle: activeCycle?.title || 'None',
      pendingReviews: 12 // Dummy for now
    });
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
      { key: 'ipcr-management', label: 'IPCR Management', subtitle: 'Onboarding & Tracking', icon: ClipboardList },
      { key: 'competency', label: 'Competency Framework', subtitle: 'Position Requirements', icon: BookOpen },
      { key: 'analytics', label: 'Reports & Analytics', subtitle: 'Insights & Exports', icon: TrendingUp },
      { key: 'archive', label: 'Archive', subtitle: 'Historical IPCR records', icon: ArchiveIcon },
      { key: 'weighting', label: 'IPCR Weighting', subtitle: 'Core/Strategic/Support split', icon: Scale },
      { key: 'settings', label: 'Settings', subtitle: '', icon: Settings },
    ] as const;

    return (
      <div className="brand-text min-h-screen bg-slate-100 font-sans text-[#040E6B]">
        <AdminHeader userName="PM Admin" divisionLabel="PM Division" />

        <div className="flex">
          <aside className="w-64 shrink-0 border-r border-slate-200 bg-white min-h-[calc(100vh-70px)] print:hidden">
            <div
              className="border-b border-slate-200 px-6 pb-5 pt-7"
              style={{ background: 'linear-gradient(135deg, #C8D1FF 0%, #FFFFFF 100%)' }}
            >
              <h2 className="mb-1 text-xl font-bold" style={{ color: '#040E6B' }}>PM Admin</h2>
              <span className="block text-xs font-semibold uppercase tracking-wider" style={{ color: '#363EE8' }}>
                Performance Management
              </span>
            </div>

            <nav className="space-y-1.5 px-3 py-4">
              {sideNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.key;
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => setActiveSection(item.key)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition ${isActive ? 'shadow-sm' : 'hover:bg-[#C8D1FF]/50'}`}
                    style={isActive ? { backgroundColor: '#363EE8', color: '#FFFFFF' } : { color: '#040E6B' }}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5" style={{ color: isActive ? '#FFFFFF' : '#363EE8' }} />
                      <div>
                        <p className="text-sm font-semibold leading-tight">{item.label}</p>
                        {item.subtitle ? (
                          <p className="text-xs" style={{ color: isActive ? 'rgba(255,255,255,0.80)' : 'rgba(4,14,107,0.65)' }}>{item.subtitle}</p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="flex-1 p-6">

            {activeSection === 'office-directory' && (
              <OfficeDirectorySection showBulkRequest={false} />
            )}

            {activeSection === 'dashboard' && (
              <>
                {/* â”€â”€ Header Area â”€â”€ */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-blue-600 font-medium">Performance Management <span className="mx-1 text-slate-400">&gt;</span> <span className="text-slate-500">Dashboard</span></p>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                    <Clock className="h-4 w-4" /> How to Navigate
                  </button>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">PM Dashboard</h2>
                <p className="text-sm text-slate-500 mt-0.5">Performance evaluation overview â€” FY 2025</p>

                {errorMessage && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    {errorMessage}
                  </div>
                )}

                {/* â”€â”€ KPI Cards Row â”€â”€ */}
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm relative overflow-hidden">
                    {evaluationsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <p className="text-xs font-medium text-slate-500">Completed Evaluations</p>
                    </div>
                    <p className="text-3xl font-extrabold text-slate-900 leading-none">{statusCounts.Approved}</p>
                    <p className="text-xs text-slate-400 mt-1">FY 2025 total</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm relative overflow-hidden">
                    {evaluationsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <p className="text-xs font-medium text-slate-500">Pending IPCR Reviews</p>
                    </div>
                    <p className="text-3xl font-extrabold text-orange-500 leading-none">{statusCounts['Supervisor Review']}</p>
                    <p className="text-xs text-slate-400 mt-1">Awaiting validation</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm relative overflow-hidden">
                    {ipcrLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <p className="text-xs font-medium text-slate-500">Pending IPCR (Probationary)</p>
                    </div>
                    <p className="text-3xl font-extrabold text-amber-600 leading-none">{probationarySubmissionsCount}</p>
                    <p className="text-xs text-slate-400 mt-1">Hired within 6 months</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm relative overflow-hidden">
                    {ipcrLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-blue-500" />
                      <p className="text-xs font-medium text-slate-500">Pending IPCR (Regular)</p>
                    </div>
                    <p className="text-3xl font-extrabold text-blue-600 leading-none">{regularSubmissionsCount}</p>
                    <p className="text-xs text-slate-400 mt-1">Tenured &gt; 6 months</p>
                  </div>
                </div>

                {/* â”€â”€ Middle Section (60/40) â”€â”€ */}
                <div className="mt-6 grid grid-cols-1 xl:grid-cols-5 gap-6">
                  {/* Left â€“ Action Required Queue (60%) */}
                  <section className="xl:col-span-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <header className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
                        <h3 className="text-sm font-bold text-slate-800">Action Required Queue</h3>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">{actionRequiredQueue.length} pending</span>
                      </div>
                      <button type="button" className="text-xs font-medium text-blue-600 hover:underline">View all</button>
                    </header>
                    {/* Column headers */}
                    <div className="grid grid-cols-12 items-center gap-2 px-5 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-50">
                      <div className="col-span-3">Employee</div>
                      <div className="col-span-3">Department</div>
                      <div className="col-span-3">Request Type</div>
                      <div className="col-span-3 text-right">Action</div>
                    </div>
                    <div className="divide-y divide-slate-100 relative min-h-[60px]">
                      {evaluationsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                      {actionRequiredQueue.length === 0 && !evaluationsLoading ? (
                        <div className="py-8 text-center text-slate-500 text-sm italic">
                          No pending actions
                        </div>
                      ) : (
                        actionRequiredQueue.map((row, idx) => (
                          <div key={`${row.name}-${idx}`} className="grid grid-cols-12 items-center gap-2 px-5 py-3.5 text-sm hover:bg-slate-50/60 transition">
                            <div className="col-span-3 font-semibold text-slate-800">{row.name}</div>
                            <div className="col-span-3 text-slate-500">{row.dept}</div>
                            <div className="col-span-3">
                              <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${row.typeColor}`}>{row.type}</span>
                            </div>
                            <div className="col-span-3 text-right">
                              <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
                                Review <span className="text-slate-400">&gt;</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {/* Right â€“ Performance Distribution Donut (40%) */}
                  <section className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm relative overflow-hidden">
                    {evaluationsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-slate-500" />
                        <h3 className="text-sm font-bold text-slate-800">Performance Distribution</h3>
                      </div>
                      <span className="text-xs text-slate-400">Current</span>
                    </div>
                    {(() => {
                      const total = distributionEvaluated;
                      const circ = 289;
                      const oPct = total > 0 ? (performanceDistribution['Outstanding'] / total) * circ : 0;
                      const vsPct = total > 0 ? (performanceDistribution['Very Satisfactory'] / total) * circ : 0;
                      const sPct = total > 0 ? (performanceDistribution['Satisfactory'] / total) * circ : 0;
                      const uPct = total > 0 ? (performanceDistribution['Unsatisfactory'] / total) * circ : 0;
                      const pPct = total > 0 ? (performanceDistribution['Poor'] / total) * circ : 0;

                      const oOff = 0;
                      const vsOff = oOff - oPct;
                      const sOff = vsOff - vsPct;
                      const uOff = sOff - sPct;
                      const pOff = uOff - uPct;

                      return (
                        <div className="flex flex-col items-center">
                          <svg viewBox="0 0 120 120" className="w-44 h-44">
                            <circle cx="60" cy="60" r="46" fill="none" stroke="#22c55e" strokeWidth="18"
                              strokeDasharray={`${oPct} ${circ}`} strokeDashoffset={oOff}
                              transform="rotate(-90 60 60)" />
                            <circle cx="60" cy="60" r="46" fill="none" stroke="#3b82f6" strokeWidth="18"
                              strokeDasharray={`${vsPct} ${circ}`} strokeDashoffset={vsOff}
                              transform="rotate(-90 60 60)" />
                            <circle cx="60" cy="60" r="46" fill="none" stroke="#eab308" strokeWidth="18"
                              strokeDasharray={`${sPct} ${circ}`} strokeDashoffset={sOff}
                              transform="rotate(-90 60 60)" />
                            <circle cx="60" cy="60" r="46" fill="none" stroke="#f97316" strokeWidth="18"
                              strokeDasharray={`${uPct} ${circ}`} strokeDashoffset={uOff}
                              transform="rotate(-90 60 60)" />
                            <circle cx="60" cy="60" r="46" fill="none" stroke="#ef4444" strokeWidth="18"
                              strokeDasharray={`${pPct} ${circ}`} strokeDashoffset={pOff}
                              transform="rotate(-90 60 60)" />
                            {total === 0 && <circle cx="60" cy="60" r="46" fill="none" stroke="#f1f5f9" strokeWidth="18" />}
                            <text x="60" y="56" textAnchor="middle" fill="#1e293b" fontSize="22" fontWeight="700">{total}</text>
                            <text x="60" y="72" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="500">Evaluated</text>
                          </svg>
                          <div className="mt-4 w-full space-y-1.5">
                            {[
                              { label: 'Outstanding', value: performanceDistribution['Outstanding'], color: '#22c55e' },
                              { label: 'Very Satisfactory', value: performanceDistribution['Very Satisfactory'], color: '#3b82f6' },
                              { label: 'Satisfactory', value: performanceDistribution['Satisfactory'], color: '#eab308' },
                              { label: 'Unsatisfactory', value: performanceDistribution['Unsatisfactory'], color: '#f97316' },
                              { label: 'Poor', value: performanceDistribution['Poor'], color: '#ef4444' },
                            ].map((item) => (
                              <div key={item.label} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                  <span className="text-slate-600">{item.label}</span>
                                </div>
                                <span className="font-semibold text-slate-800">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </section>
                </div>

                {/* â”€â”€ Bottom Section (50/50) â”€â”€ */}
                <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <header className="px-5 py-3.5 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-slate-500" />
                        <h3 className="text-sm font-bold text-slate-800">Competency & Succession Watchlist</h3>
                      </div>
                    </header>
                    <div className="p-5 space-y-6">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Skill Gap Alerts by Department</p>
                        <div className="space-y-3">
                          {skillGaps.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No skill gaps detected</p>
                          ) : (
                            skillGaps.map((d) => (
                              <div key={d.dept} className="flex items-center gap-3 text-xs">
                                <span className="w-20 text-slate-600 shrink-0">{d.dept}</span>
                                <div className="flex-1 h-2.5 rounded-full bg-slate-100">
                                  <div className="h-2.5 rounded-full bg-blue-500" style={{ width: `${d.value}%` }} />
                                </div>
                                <span className="w-8 text-right font-semibold text-slate-700">{d.value}%</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Upcoming Retirements (Next 12 Months)</p>
                        <div className="divide-y divide-slate-100">
                          {retirements.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-2.5">No upcoming retirements</p>
                          ) : (
                            retirements.map((r) => {
                              const dateColor = r.monthsAway <= 6 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700';
                              return (
                                <div key={r.name} className="flex items-center justify-between py-2.5 text-xs">
                                  <div>
                                    <p className="font-semibold text-slate-800">{r.name}</p>
                                    <p className="text-slate-400">{r.role}</p>
                                  </div>
                                  <span className={`rounded-full px-3 py-0.5 text-[11px] font-semibold ${dateColor}`}>{r.date}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

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
                    <div className="overflow-x-auto relative min-h-[60px]">
                      {(evaluationsLoading || ipcrLoading) && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                      
                      {ipcrSubmissionTab === 'pending' ? (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50/80 text-left">
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Employee</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Dept.</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Period</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Stage</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {pendingSubmissions.length === 0 && !ipcrLoading ? (
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
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50/80 text-left">
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Employee</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Dept.</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Period</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Rating</th>
                              <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                              <th className="px-4 py-2.5"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {recentIPCRs.length === 0 && !evaluationsLoading ? (
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
              </>
            )}


            {activeSection === 'ipcr-management' && <PMIPCRManagement />}

            {activeSection === 'competency' && <CompetencyFrameworkPage isDashboardView />}

            {activeSection === 'archive' && <PMArchive />}
            {activeSection === 'weighting' && <OfficeWeightingPanel />}

            {activeSection === 'analytics' && <PMReportsAnalytics />}

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

            {!['dashboard', 'employees', 'evaluation-status', 'performance-reviews', 'goals', 'ipcr', 'ipcr-management', 'competency', 'analytics', 'archive', 'weighting', 'office-directory', 'promotions', 'reports', 'settings', 'registry'].includes(activeSection) && (
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
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
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

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-600">Loading evaluation cycles...</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
              <table className="w-full">
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