import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
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
  Mail,
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
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { LogoutConfirmPopover } from '../../components/LogoutConfirmPopover';
import { Sidebar } from '../../components/Sidebar';
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

import EmployeeDirectory from './EmployeeDirectory';
import { SummaryOfRatings } from './pm/SummaryOfRatings';

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
    'dashboard' | 'employees' | 'evaluation-status' | 'performance-reviews' | 'goals' | 'ipcr' | 'analytics' | 'reports' | 'settings'
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
      alert(`Failed to send request: ${'error' in res ? res.error : 'Unknown error'}`);
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
        .from('employees')
        .select('id, first_name, last_name, position, department, status')
        .eq('status', 'Active')
        .order('last_name', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('Error loading employees for document request modal:', error);
        setActiveEmployees([]);
        return;
      }
      const mapped: EmployeeOption[] = (data ?? []).map((row: any) => {
        const last = (row.last_name ?? '').trim();
        const first = (row.first_name ?? '').trim();
        const name = last && first ? `${last}, ${first}` : last || first || 'Unnamed Employee';
        return {
          id: row.id,
          name,
          position: row.position ?? '—',
          department: row.department ?? '—',
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

  // ── Live PM data ─────────────────────────────────────────────────────────
  // Per Phase 2 of the data-migration plan: every dashboard widget reads from
  // these state slots; per-section useEffects below populate them. No mock
  // fallbacks — empty arrays render the "No data" empty state in each widget.
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
      alert('error' in result ? result.error : 'Unknown error');
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
      position: e.employee_position ?? '—',
      dept: e.department ?? 'Unassigned',
      period: e.period ?? '—',
      rating: e.final_score !== null ? e.final_score.toFixed(2) : '—',
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

  // ── Per-section data fetches ───────────────────────────────────────────────
  // Fetched once on mount because most widgets (Action Queue, Distribution,
  // IPCR Submissions, Reviews, Status Counts) all read from the evaluations
  // slice. activeCycleId scopes to the current cycle when one exists.
  const activeCycleId = cycles.find(c => c.status === 'Active')?.id;

  // Evaluations + derived status counts + distribution.
  useEffect(() => {
    if (activeSection !== 'dashboard' && activeSection !== 'evaluation-status'
        && activeSection !== 'performance-reviews' && activeSection !== 'goals') {
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
    if (activeSection !== 'dashboard' && activeSection !== 'reports') return;
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
            role: emp.current_position ?? '—',
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
      { key: 'employees', label: 'Employees', subtitle: 'Employee Directory', icon: Users },
      { key: 'evaluation-status', label: 'Employee Evaluation Status', subtitle: 'Track progress', icon: ClipboardList },
      { key: 'performance-reviews', label: 'Performance Reviews', subtitle: 'Upcoming reviews', icon: CalendarCheck2 },
      { key: 'goals', label: 'DPCR', subtitle: 'Individual performance', icon: FileCheck2 },
      { key: 'ipcr', label: 'Summary of Ratings', subtitle: 'IPCR ratings per dept', icon: BarChart3 },
      { key: 'reports', label: 'Documents', subtitle: 'Document submissions', icon: FileText },
      { key: 'analytics', label: 'Analytics', subtitle: 'Performance insights', icon: TrendingUp },
      { key: 'settings', label: 'Settings', subtitle: '', icon: Settings },
    ] as const;

    return (
      <div className="min-h-screen bg-slate-100 text-slate-800">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm print:hidden">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-600 text-white grid place-content-center text-lg font-bold">HR</div>
              <div>
                <h1 className="text-lg font-bold leading-none">Government HRIS</h1>
                <p className="text-xs text-slate-500">Human Resource Information System</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <button className="rounded-full p-2 hover:bg-slate-100" type="button"><HelpCircle className="h-5 w-5" /></button>
              <button className="rounded-full p-2 hover:bg-slate-100 relative" type="button">
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-1 inline-block h-2 w-2 rounded-full bg-red-500" />
              </button>
              <div className="h-8 w-px bg-slate-200" />
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-600 text-white grid place-content-center">
                  <UserCircle2 className="h-6 w-6" />
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-slate-800">interviewer</p>
                  <p className="text-xs text-slate-500">PM Division</p>
                </div>
              </div>
              <LogoutConfirmPopover />
            </div>
          </div>
        </header>

        <div className="flex">
          <aside className="w-64 shrink-0 border-r border-slate-200 bg-white px-3 py-4 min-h-[calc(100vh-70px)] print:hidden">
            <nav className="space-y-1.5">
              {sideNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.key;
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => setActiveSection(item.key)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition ${isActive ? 'bg-blue-600 text-white shadow-md' : 'text-black hover:bg-slate-200'
                      }`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`mt-0.5 h-5 w-5 ${isActive ? 'text-white' : 'text-slate-600'}`} />
                      <div>
                        <p className={`text-sm font-semibold leading-tight ${isActive ? 'text-white' : 'text-black'}`}>{item.label}</p>
                        {item.subtitle ? (
                          <p className={`text-xs ${isActive ? 'text-blue-100' : 'text-black'}`}>{item.subtitle}</p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="flex-1 p-6">
            {activeSection === 'dashboard' && (
              <>
                {/* ── Header Area ── */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-blue-600 font-medium">Performance Management <span className="mx-1 text-slate-400">&gt;</span> <span className="text-slate-500">Dashboard</span></p>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                    <Clock className="h-4 w-4" /> How to Navigate
                  </button>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">PM Dashboard</h2>
                <p className="text-sm text-slate-500 mt-0.5">Performance evaluation overview — FY 2025</p>

                {errorMessage && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    {errorMessage}
                  </div>
                )}

                {/* ── KPI Cards Row ── */}
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
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <p className="text-xs font-medium text-slate-500">Urgent Training Approvals</p>
                    </div>
                    <p className="text-3xl font-extrabold text-slate-900 leading-none">7</p>
                    <p className="text-xs text-slate-400 mt-1">Due within 3 days</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-blue-500" />
                      <p className="text-xs font-medium text-slate-500">Expiring Certifications</p>
                    </div>
                    <p className="text-3xl font-extrabold text-slate-900 leading-none">12</p>
                    <p className="text-xs text-slate-400 mt-1">Next 30 days</p>
                  </div>
                </div>

                {/* ── Middle Section (60/40) ── */}
                <div className="mt-6 grid grid-cols-1 xl:grid-cols-5 gap-6">
                  {/* Left – Action Required Queue (60%) */}
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

                  {/* Right – Performance Distribution Donut (40%) */}
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

                {/* ── Bottom Section (50/50) ── */}
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
                    <header className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-slate-500" />
                        <h3 className="text-sm font-bold text-slate-800">IPCR Submissions</h3>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">{recentIPCRs.length} total</span>
                    </header>
                    <div className="overflow-x-auto relative min-h-[60px]">
                      {evaluationsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
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
                                  {row.rating !== '—' ? (
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
                    </div>
                  </section>
                </div>
              </>
            )}

            {activeSection === 'employees' && (
              <div className="relative">
                <EmployeeDirectory />
              </div>
            )}

            {activeSection === 'evaluation-status' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-blue-600 font-medium">Performance Management <span className="mx-1 text-slate-400">&gt;</span> <span className="text-slate-500">Employee Evaluation Status</span></p>
                  <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                    <CalendarDays className="h-4 w-4" /> Jan – Jun 2025 (1st Semester) <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Employee Evaluation Status</h2>
                <p className="text-sm text-slate-500 mt-0.5">Track the complete progress of performance evaluations across your organization</p>

                {/* 5 KPI Cards */}
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 relative">
                  {evaluationsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">Overall Completion</p>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-blue-100"><BarChart3 className="h-5 w-5 text-blue-600" /></span>
                      <div>
                        <p className="text-2xl font-extrabold text-slate-900 leading-none">
                          {evaluationTotal > 0 ? Math.round((statusCounts.Approved / evaluationTotal) * 100) : 0}%
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">of {evaluationTotal} employees</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">Approved</p>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-emerald-100"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></span>
                      <div><p className="text-2xl font-extrabold text-emerald-600 leading-none">{statusCounts.Approved}</p><p className="text-xs text-slate-400 mt-0.5">Fully completed</p></div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">In Progress</p>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-orange-100"><Clock className="h-5 w-5 text-orange-500" /></span>
                      <div><p className="text-2xl font-extrabold text-orange-500 leading-none">{statusCounts['Supervisor Review']}</p><p className="text-xs text-slate-400 mt-0.5">Under supervisor review</p></div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">Planning</p>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-blue-100"><SlidersHorizontal className="h-5 w-5 text-blue-600" /></span>
                      <div><p className="text-2xl font-extrabold text-slate-900 leading-none">{statusCounts.Planning}</p><p className="text-xs text-slate-400 mt-0.5">Self-evaluation stage</p></div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">Rejected</p>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-100"><XCircle className="h-5 w-5 text-red-500" /></span>
                      <div><p className="text-2xl font-extrabold text-red-500 leading-none">{statusCounts.Rejected}</p><p className="text-xs text-slate-400 mt-0.5">Requires resubmission</p></div>
                    </div>
                  </div>
                </div>

                {/* Stacked Bar Chart */}
                <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-bold text-slate-800">Evaluation Completion by Department</h3>
                    <span className="text-xs text-slate-400">Jan – Jun 2025 (1st Semester)</span>
                  </div>
                  <svg viewBox="0 0 500 220" className="w-full" style={{ maxHeight: 260 }}>
                    {/* Y-axis labels & gridlines */}
                    {[0, 2, 4, 6, 8, 10].map((v) => {
                      const y = 180 - (v / 10) * 170;
                      return (
                        <g key={v}>
                          <text x="20" y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{v}</text>
                          <line x1="28" y1={y} x2="490" y2={y} stroke="#e2e8f0" strokeWidth="0.5" />
                        </g>
                      );
                    })}
                    {/* Bars */}
                    {dbEvaluationGroups.map((d, i) => {
                      const x = 55 + i * 92;
                      const bw = 42;
                      const unitH = 17;
                      const baseY = 180;
                      let cy = baseY;
                      const segments = [
                        { val: d.approved, color: '#22c55e' },
                        { val: d.review, color: '#fb923c' },
                        { val: d.self, color: '#22d3ee' },
                        { val: d.planning, color: '#2563eb' },
                        { val: d.rejected || 0, color: '#ef4444' },
                      ];
                      
                      const deptParts = d.dept.split(' ');
                      const dept1 = deptParts[0];
                      const dept2 = deptParts.slice(1).join(' ');

                      return (
                        <g key={d.dept}>
                          {segments.map((seg, si) => {
                            if (seg.val === 0) return null;
                            const h = seg.val * unitH;
                            cy -= h;
                            return <rect key={si} x={x} y={cy} width={bw} height={h} fill={seg.color} rx={si === segments.length - 1 || (segments.slice(si + 1).every(s => s.val === 0)) ? 2 : 0} />;
                          })}
                          <text x={x + bw / 2} y={195} textAnchor="middle" fontSize="10" fill="#64748b">{dept1}</text>
                          {dept2 && <text x={x + bw / 2} y={206} textAnchor="middle" fontSize="10" fill="#64748b">{dept2}</text>}
                        </g>
                      );
                    })}
                  </svg>
                  {/* Legend */}
                  <div className="flex items-center justify-center gap-5 mt-2 text-xs text-slate-600">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" /> Approved</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-400 inline-block" /> Supervisor Review</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-cyan-400 inline-block" /> Self Evaluation</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600 inline-block" /> Planning</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" /> Rejected</span>
                  </div>
                </section>

                {/* Employee Table */}
                <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex items-center gap-4 px-5 py-2.5 border-b border-slate-100">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-1.5 text-sm" placeholder="Search by name or position..." />
                    </div>
                    <select className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600"><option>All Departments</option></select>
                    <select className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600"><option>All Statuses</option></select>
                    <div className="flex-1" />
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-400 cursor-default">Bulk Actions <ChevronDown className="h-3.5 w-3.5" /></button>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-12 items-center px-5 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <div className="col-span-1 flex items-center gap-2"><input type="checkbox" className="rounded border-slate-300 h-4 w-4" /><span className="text-blue-600 normal-case text-xs font-medium">Showing 1–10 of 35 employees</span></div>
                    <div className="col-span-6 pl-10">Employee</div>
                    <div className="col-span-3">Status</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  {/* Department groups — uses live employees from the central
                      employees table when present. */}
                  {dbEvaluationGroups.length > 0 ? dbEvaluationGroups.map((group) => (
                    <div key={group.dept} className="border-b border-slate-100">
                      {/* Group header */}
                      <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50/50 border-b border-slate-100">
                        <input type="checkbox" className="rounded border-slate-300 h-4 w-4" />
                        <span className="font-bold text-sm text-slate-800">{group.dept}</span>
                        <span className="text-xs text-slate-400">{group.count} employees</span>
                        <div className="flex-1 flex items-center gap-3 ml-4">
                          <div className="w-24 h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-amber-400" style={{ width: `${group.pct}%` }} /></div>
                          <span className="text-xs font-semibold text-emerald-600">{group.pct}% Complete</span>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">{group.approved} Approved</span>
                          {group.review > 0 && <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">{group.review} Supervisor Review</span>}
                          {group.self > 0 && <span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-700">{group.self} Self Evaluation</span>}
                          {group.planning > 0 && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">{group.planning} Planning</span>}
                        </div>
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      </div>
                      {/* Employee rows */}
                      {group.employees.map((emp) => {
                        const statusColors: Record<string, string> = { 'Approved': 'bg-emerald-100 text-emerald-700', 'Supervisor Review': 'bg-orange-100 text-orange-700', 'Self Evaluation': 'bg-cyan-100 text-cyan-700', 'Planning': 'bg-blue-100 text-blue-700', 'Rejected': 'bg-red-100 text-red-700' };
                        const dotColors: Record<string, string> = { 'Approved': 'bg-emerald-500', 'Supervisor Review': 'bg-orange-500', 'Self Evaluation': 'bg-cyan-500', 'Planning': 'bg-blue-600', 'Rejected': 'bg-red-500' };
                        const initials = emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                        return (
                          <div key={emp.name} className="grid grid-cols-12 items-start px-5 py-2.5 text-sm hover:bg-slate-50/60 transition border-b border-slate-50 last:border-b-0">
                            <div className="col-span-1 pt-2"><input type="checkbox" className="rounded border-slate-300 h-4 w-4" /></div>
                            <div className="col-span-6 flex items-start gap-3 pl-2">
                              <span className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-[11px] font-bold text-blue-600 shrink-0">
                                {initials}
                              </span>
                              <div className="flex flex-col pt-1.5">
                                <p className="font-semibold text-slate-800 leading-none">{emp.name}</p>
                                <p className="text-[11px] text-slate-500 mt-1">{emp.position}</p>
                              </div>
                            </div>
                            <div className="col-span-3 pt-1.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold ${statusColors[emp.status] || 'bg-slate-100 text-slate-700'}`}><span className={`h-1.5 w-1.5 rounded-full ${dotColors[emp.status] || 'bg-slate-400'}`} />{emp.status}</span></div>
                            <div className="col-span-2 flex items-center justify-end gap-2 pt-1.5">
                              <button type="button" className="p-1 text-slate-400 hover:text-blue-600 transition" title="View"><Eye className="h-4 w-4" /></button>
                              <button type="button" className="p-1 text-slate-400 hover:text-slate-600 transition"><MoreHorizontal className="h-4 w-4" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )) : (
                    <div className="px-5 py-12 text-center text-slate-500">
                      <p>No evaluation records found for this period.</p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-5 py-2.5 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Approved: 18</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-400" /> Supervisor Review: 8</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" /> Self Evaluation: 5</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" /> Planning: 3</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Rejected: 1</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Rows per page:</span>
                      <span className="flex items-center gap-1">{[10, 20, 30].map(n => <button key={n} type="button" className={`h-6 w-7 rounded ${n === 10 ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-100 text-slate-600'} text-xs`}>{n}</button>)}</span>
                      <span>1–10 of 35</span>
                      <span className="flex items-center gap-1">
                        {[1, 2, 3, 4].map(n => <button key={n} type="button" className={`h-6 w-6 rounded ${n === 1 ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-100 text-slate-600'} text-xs`}>{n}</button>)}
                        <button type="button" className="h-6 w-6 rounded bg-slate-100 text-slate-600 text-xs">&gt;</button>
                      </span>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeSection === 'performance-reviews' && (
              <>
                {/* Header */}
                <div className="mb-1">
                  <p className="text-sm text-blue-600 font-medium">Performance Management <span className="mx-1 text-slate-400">&gt;</span> <span className="text-slate-500">Performance Reviews</span></p>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Completed Performance Reviews</h2>
                <p className="text-sm text-slate-500 mt-0.5">Archive of all finalized evaluation records across the organization</p>

                {/* Toolbar */}
                <div className="mt-5 flex items-center gap-4">
                  <div className="relative flex-1 max-w-lg">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm" placeholder="Search employee by name, ID, or department..." />
                  </div>
                  <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"><option>All Departments</option></select>
                  <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm">
                    <Download className="h-4 w-4" /> Export CSV / Excel
                  </button>
                </div>

                {/* Table */}
                <section className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {/* Record count */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                    <span className="text-sm text-slate-700"><span className="font-bold">{reviewsData.length}</span> Records Found</span>
                    <span className="text-xs text-slate-400 italic">Jan 2024 – Feb 2025</span>
                  </div>
                  {/* Column headers */}
                  <div className="grid grid-cols-12 items-center px-5 py-2.5 bg-slate-800 text-[11px] font-semibold text-white uppercase tracking-wider">
                    <div className="col-span-2">Employee ↕</div>
                    <div className="col-span-2">Position</div>
                    <div className="col-span-2">Department ↕</div>
                    <div className="col-span-2">Final Score (out of 5.0) ↕</div>
                    <div className="col-span-2">Review Date ↓</div>
                    <div className="col-span-2">Actions</div>
                  </div>
                  {/* Rows */}
                  <div className="divide-y divide-slate-100 relative min-h-[120px]">
                    {evaluationsLoading && (
                      <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    )}
                    {reviewPageData.length === 0 && !evaluationsLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center text-center">
                        <CalendarCheck2 className="h-12 w-12 text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700">No performance reviews</h3>
                        <p className="text-sm text-slate-500 mt-1">There are currently no approved performance reviews to display.</p>
                      </div>
                    ) : (
                      reviewPageData.map((row) => {
                        const score = row.final_score ?? 0;
                        const rating = bucketForScore(score);
                        const ratingColor = rating === 'Outstanding' ? 'text-emerald-600' : rating === 'Very Satisfactory' ? 'text-blue-600' : 'text-orange-500';
                        return (
                          <div key={row.id} className="grid grid-cols-12 items-center px-5 py-3.5 text-sm hover:bg-slate-50/60 transition">
                            <div className="col-span-2">
                              <p className="font-semibold text-slate-800">{row.employee_name ?? 'Unknown'}</p>
                              <p className="text-xs text-slate-400">ID-{row.employee_id?.substring(0, 8).toUpperCase() ?? 'N/A'}</p>
                            </div>
                            <div className="col-span-2 text-slate-500">{row.employee_position ?? '—'}</div>
                            <div className="col-span-2 text-slate-500">{row.department ?? 'Unassigned'}</div>
                            <div className="col-span-2 flex items-center gap-2">
                              <span className="font-bold text-slate-800">{score.toFixed(2)}</span>
                              <span className={`text-xs font-medium ${ratingColor}`}>{rating}</span>
                            </div>
                            <div className="col-span-2 text-slate-500">{new Date(row.created_at).toLocaleDateString()}</div>
                            <div className="col-span-2 flex items-center gap-3">
                              <button type="button" className="text-xs font-semibold text-blue-600 hover:underline">View Review</button>
                              <span className="text-slate-300">|</span>
                              <button type="button" className="text-xs font-medium text-slate-400 hover:text-slate-600">Download IPCR</button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {/* Footer with functional pagination */}
                  <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-600">
                      Showing {reviewStartIdx + 1} – {Math.min(reviewStartIdx + reviewRowsPerPage, reviewsData.length)} of {reviewsData.length} records
                    </span>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Rows:</span>
                      {[10, 20, 50].map(n => (
                        <button key={n} type="button"
                          onClick={() => { setReviewRowsPerPage(n); setReviewPage(1); }}
                          className={`h-6 w-7 rounded ${n === reviewRowsPerPage ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} text-xs transition`}
                        >{n}</button>
                      ))}
                      <span className="ml-2 flex items-center gap-1">
                        <button type="button" disabled={reviewPage === 1}
                          onClick={() => setReviewPage(p => Math.max(1, p - 1))}
                          className={`px-2 py-1 rounded border border-slate-200 text-xs transition ${reviewPage === 1 ? 'text-slate-300 cursor-default' : 'text-slate-600 hover:bg-slate-100'}`}
                        >&lt; Previous</button>
                        {Array.from({ length: reviewTotalPages }, (_, i) => i + 1).map(n => {
                          if (reviewTotalPages <= 5 || n === 1 || n === reviewTotalPages || Math.abs(n - reviewPage) <= 1) {
                            return (
                              <button key={n} type="button" onClick={() => setReviewPage(n)}
                                className={`h-6 w-6 rounded text-xs transition ${n === reviewPage ? 'bg-blue-600 text-white font-semibold' : 'border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                              >{n}</button>
                            );
                          }
                          if (n === 2 && reviewPage > 3) return <span key={n} className="text-slate-400">…</span>;
                          if (n === reviewTotalPages - 1 && reviewPage < reviewTotalPages - 2) return <span key={n} className="text-slate-400">…</span>;
                          return null;
                        })}
                        <button type="button" disabled={reviewPage === reviewTotalPages}
                          onClick={() => setReviewPage(p => Math.min(reviewTotalPages, p + 1))}
                          className={`px-2 py-1 rounded border border-slate-200 text-xs transition ${reviewPage === reviewTotalPages ? 'text-slate-300 cursor-default' : 'text-slate-600 hover:bg-slate-100'}`}
                        >Next &gt;</button>
                      </span>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeSection === 'goals' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <button type="button" className="p-1 text-slate-400 hover:text-slate-600 transition"><ChevronLeft className="h-5 w-5" /></button>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">DPCR System</h2>
                      <p className="text-sm text-slate-500">Departmental Performance Commitment and Review</p>
                    </div>
                  </div>
                  <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm">
                    <Plus className="h-4 w-4" /> New IPCR
                  </button>
                </div>
                <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-300 rounded-full mb-6" />

                {/* Department IPCR Reports */}
                <h3 className="text-base font-bold text-slate-800 mb-1">Department IPCR Reports</h3>
                <p className="text-sm text-slate-500 mb-4">Click a department card to view its summary and individual employee IPCR forms</p>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                  {dbEvaluationGroups.map((g) => {
                    const deptEvals = evaluations.filter(e => e.department === g.dept && e.status === 'Approved');
                    const hasData = deptEvals.length > 0;
                    const avgScore = hasData ? deptEvals.reduce((sum, e) => sum + (e.final_score ?? 0), 0) / deptEvals.length : 0;
                    const rating = hasData ? bucketForScore(avgScore) : '';

                    return (
                      <div key={g.dept} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition cursor-pointer">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-50"><FileText className="h-5 w-5 text-blue-500" /></span>
                          <div>
                            <p className="font-bold text-sm text-slate-800">{g.dept}</p>
                            <p className="text-xs text-blue-500">{deptEvals.length} evaluated</p>
                          </div>
                        </div>
                        {hasData ? (
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-slate-400">Avg. Score</span>
                              <span className="text-2xl font-extrabold text-blue-600">{avgScore.toFixed(2)}</span>
                            </div>
                            <span className="inline-block rounded-full border border-blue-300 bg-blue-50 px-3 py-0.5 text-xs font-semibold text-blue-700 mb-3">{rating}</span>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400 italic mb-3">No completed IPCRs yet</p>
                        )}
                        <button type="button" className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">
                          <Eye className="h-3.5 w-3.5" /> View Department Report & IPCRs
                        </button>
                      </div>
                    );
                  })}
                  {dbEvaluationGroups.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500">
                      No department reports available.
                    </div>
                  )}
                </div>

                {/* IPCR Submissions */}
                <h3 className="text-base font-bold text-slate-800 mb-1">IPCR Submissions</h3>
                <p className="text-sm text-slate-500 mb-4">All employee IPCR submissions — click "View IPCR" to open the full performance form</p>

                <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100">
                    <div className="relative flex-1 max-w-lg">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm" placeholder="Search employee name, department..." />
                    </div>
                    <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"><option>All Departments</option></select>
                    <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"><option>All Statuses</option></select>
                    <span className="text-xs text-slate-400">6 of 6 records</span>
                  </div>
                  {/* Column headers */}
                  <div className="grid grid-cols-12 items-center px-5 py-2.5 bg-slate-800 text-[11px] font-semibold text-white uppercase tracking-wider">
                    <div className="col-span-2">Department</div>
                    <div className="col-span-2">Employee Name</div>
                    <div className="col-span-2">Date of Submission</div>
                    <div className="col-span-2 text-center">Total Score</div>
                    <div className="col-span-2 text-center">Status</div>
                    <div className="col-span-2 text-right">Action</div>
                  </div>
                  {/* Rows */}
                  <div className="divide-y divide-slate-100 relative min-h-[120px]">
                    {evaluationsLoading && (
                      <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    )}
                    {(() => {
                      const goalEvals = evaluations.filter(e => e.status === 'Self Evaluation' || e.status === 'Supervisor Review' || e.status === 'Approved');
                      if (goalEvals.length === 0 && !evaluationsLoading) {
                        return (
                          <div className="py-12 flex flex-col items-center justify-center text-center">
                            <FileCheck2 className="h-12 w-12 text-slate-300 mb-4" />
                            <h3 className="text-lg font-bold text-slate-700">No IPCR Submissions</h3>
                            <p className="text-sm text-slate-500 mt-1">There are no recent IPCR submissions to display.</p>
                          </div>
                        );
                      }
                      return goalEvals.map((e) => {
                        const hasScore = e.final_score !== null;
                        const score = e.final_score ?? 0;
                        const rating = hasScore ? bucketForScore(score) : '';
                        const initials = (e.employee_name ?? 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                        return (
                          <div key={e.id} className="grid grid-cols-12 items-center px-5 py-4 text-sm hover:bg-slate-50/60 transition">
                            <div className="col-span-2">
                              <span className="inline-block rounded-full border px-3 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-700 border-slate-200">{e.department ?? 'Unassigned'}</span>
                            </div>
                            <div className="col-span-2 flex items-center gap-2.5">
                              <span className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-200 text-xs font-bold text-slate-600">{initials}</span>
                              <div>
                                <p className="font-semibold text-slate-800">{e.employee_name}</p>
                                <p className="text-xs text-slate-400">{e.employee_position}</p>
                              </div>
                            </div>
                            <div className="col-span-2 text-slate-500">{new Date(e.created_at).toLocaleDateString()}</div>
                            <div className="col-span-2 text-center">
                              {hasScore ? (
                                <div>
                                  <p className="text-lg font-extrabold text-blue-600">{score.toFixed(2)}</p>
                                  <p className={`text-[11px] font-medium ${rating === 'Outstanding' ? 'text-emerald-600' : 'text-blue-500'}`}>{rating}</p>
                                </div>
                              ) : <span className="text-slate-400">—</span>}
                            </div>
                            <div className="col-span-2 text-center">
                              {e.status === 'Approved' ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Approved</span>
                              ) : e.status === 'Self Evaluation' || e.status === 'Supervisor Review' ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-[11px] font-semibold text-blue-700"><CheckCircle2 className="h-3 w-3" /> Submitted</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-0.5 text-[11px] font-semibold text-orange-700"><Clock className="h-3 w-3" /> Monitoring Phase</span>
                              )}
                            </div>
                            <div className="col-span-2 text-right">
                              {hasScore ? (
                                <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition">
                                  <Eye className="h-3.5 w-3.5" /> View IPCR
                                </button>
                              ) : <span className="text-xs text-slate-400 italic">Not available</span>}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </section>
              </>
            )}

            {activeSection === 'ipcr' && <SummaryOfRatings />}

            {activeSection === 'analytics' && (
              <>
                <h2 className="text-3xl font-bold text-slate-900">Analytics</h2>
                <p className="mt-1 text-slate-600">Comprehensive performance insights and trends</p>

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Overall Avg Rating</p>
                        <p className="text-3xl font-bold mt-2 text-slate-400">--</p>
                      </div>
                      <div className="h-12 w-12 rounded-lg bg-blue-100 grid place-content-center">
                        <TrendingUp className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Top Performers</p>
                        <p className="text-3xl font-bold mt-2 text-slate-400">--</p>
                      </div>
                      <div className="h-12 w-12 rounded-lg bg-emerald-100 grid place-content-center">
                        <TrendingUp className="h-6 w-6 text-emerald-600" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Departments</p>
                        <p className="text-3xl font-bold mt-2 text-slate-400">--</p>
                      </div>
                      <div className="h-12 w-12 rounded-lg bg-slate-100 grid place-content-center">
                        <FileText className="h-6 w-6 text-slate-600" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Performance by Department</h3>
                      <FileText className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="py-12 text-center text-sm text-slate-500">
                      No department performance data available
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Performance Distribution</h3>
                      <BarChart3 className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="py-12 text-center text-sm text-slate-500">
                      No performance distribution data available
                    </div>
                  </section>
                </div>

                <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold mb-4">Quarterly Performance Trends</h3>
                  <div className="py-12 text-center text-sm text-slate-500">
                    No quarterly trend data available
                  </div>
                </section>

                <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Top Performers</h3>
                    <select className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                      <option>All Departments</option>
                    </select>
                  </div>
                  <div className="py-12 text-center text-sm text-slate-500">
                    No top performer data available
                  </div>
                </section>
              </>
            )}

            {activeSection === 'reports' && (
              <>
                {/* Header Area */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-blue-600 font-medium">Performance Management <span className="mx-1 text-slate-400">/</span> <span className="text-slate-500">Documents</span></p>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Documents</h2>
                    <p className="text-sm text-slate-500 mt-1">Request and track document submissions from employees, organized by department</p>
                  </div>
                  <button type="button" onClick={openBulkRequestModal} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm">
                    <Plus className="h-4 w-4" /> New Request
                  </button>
                </div>

                {/* KPI Cards */}
                {(() => {
                  const reqSummary = summarizeRequests(documentRequests);
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm relative overflow-hidden">
                        {documentRequestsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Total Requests</p>
                        <p className="text-3xl font-bold text-slate-900 leading-none">{reqSummary.total}</p>
                      </div>
                      <div className="rounded-xl border border-orange-300 bg-white p-4 shadow-sm relative overflow-hidden">
                        {documentRequestsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                        <p className="text-[11px] font-semibold text-orange-500 uppercase tracking-wider mb-1.5">Pending</p>
                        <p className="text-3xl font-bold text-orange-500 leading-none">{reqSummary.pending}</p>
                      </div>
                      <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm relative overflow-hidden">
                        {documentRequestsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                        <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider mb-1.5">Overdue</p>
                        <p className="text-3xl font-bold text-red-500 leading-none">{reqSummary.overdue}</p>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm relative overflow-hidden">
                        {documentRequestsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                        <p className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider mb-1.5">Approved</p>
                        <p className="text-3xl font-bold text-emerald-500 leading-none">{reqSummary.approved}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Filters */}
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm flex items-center gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Search employee or document..." />
                  </div>
                  <select className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 outline-none w-48">
                    <option>All Status</option>
                    <option>Pending</option>
                    <option>Submitted</option>
                    <option>Under Review</option>
                    <option>Approved</option>
                    <option>Overdue</option>
                  </select>
                  <select className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 outline-none w-56">
                    <option>All Document Types</option>
                    <option>IPCR</option>
                    <option>Accomplishment Report</option>
                    <option>Service Record</option>
                    <option>Position Description Form</option>
                  </select>
                </div>

                {/* Table Section */}
                {(() => {
                  if (documentRequestsLoading) {
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-8 text-center animate-pulse">
                        <div className="h-4 bg-slate-200 rounded w-1/4 mx-auto mb-4" />
                        <div className="h-10 bg-slate-100 rounded mb-2" />
                        <div className="h-10 bg-slate-100 rounded mb-2" />
                        <div className="h-10 bg-slate-100 rounded" />
                      </div>
                    );
                  }

                  const grouped = groupRequestsByDepartment(documentRequests);
                  const depts = Object.keys(grouped).sort();

                  if (depts.length === 0) {
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-12 text-center flex flex-col items-center">
                        <FileText className="h-12 w-12 text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700">No document requests</h3>
                        <p className="text-sm text-slate-500 mt-1">There are currently no document requests to display.</p>
                      </div>
                    );
                  }

                  return depts.map(dept => {
                    const reqs = grouped[dept];
                    const pendingCount = reqs.filter(r => r.status === 'Pending').length;
                    const submittedCount = reqs.filter(r => r.status === 'Submitted').length;
                    const reviewCount = reqs.filter(r => r.status === 'Under Review').length;
                    const approvedCount = reqs.filter(r => r.status === 'Approved').length;
                    const overdueCount = reqs.filter(r => r.status === 'Overdue').length;

                    return (
                      <div key={dept} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-4">
                        {/* Dark Header */}
                        <div className="bg-[#1e293b] px-5 py-3 flex items-center justify-between text-white">
                          <div className="flex items-center gap-4">
                            <div>
                              <h3 className="text-base font-bold leading-tight">{dept}</h3>
                              <p className="text-xs text-slate-400">{reqs.length} requests</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {pendingCount > 0 && <span className="inline-flex items-center rounded-full bg-orange-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{pendingCount} Pending</span>}
                              {submittedCount > 0 && <span className="inline-flex items-center rounded-full bg-blue-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{submittedCount} Submitted</span>}
                              {reviewCount > 0 && <span className="inline-flex items-center rounded-full bg-[#a855f7] px-2.5 py-0.5 text-[11px] font-bold text-white">{reviewCount} Under Review</span>}
                              {approvedCount > 0 && <span className="inline-flex items-center rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{approvedCount} Approved</span>}
                              {overdueCount > 0 && <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{overdueCount} Overdue</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 cursor-pointer hover:text-slate-300">
                            <ChevronUp className="h-4 w-4" />
                          </div>
                        </div>

                        {/* Table Header */}
                        <div className="grid grid-cols-12 items-center px-5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                          <div className="col-span-1">NO.</div>
                          <div className="col-span-3">EMPLOYEE</div>
                          <div className="col-span-2">DOCUMENT TYPE</div>
                          <div className="col-span-2">DATE REQUESTED</div>
                          <div className="col-span-2">DATE SUBMITTED</div>
                          <div className="col-span-1 text-center">STATUS</div>
                          <div className="col-span-1 text-right">ACTION</div>
                        </div>

                        {/* Rows */}
                        <div className="divide-y divide-slate-100">
                          {reqs.map((row, i) => {
                            const statusConfig: Record<string, { class: string; action: string; actionClass: string; icon: any }> = {
                              'Submitted': { class: 'border-blue-200 bg-blue-50 text-blue-600', action: 'View', actionClass: 'border-purple-200 text-purple-600 hover:bg-purple-50', icon: Eye },
                              'Approved': { class: 'border-emerald-200 bg-emerald-50 text-emerald-600', action: 'Request', actionClass: 'bg-blue-600 text-white hover:bg-blue-700 border-transparent', icon: ClipboardList },
                              'Pending': { class: 'border-orange-200 bg-orange-50 text-orange-600', action: 'Request', actionClass: 'bg-blue-600 text-white hover:bg-blue-700 border-transparent', icon: ClipboardList },
                              'Under Review': { class: 'border-purple-200 bg-purple-50 text-purple-600', action: 'View', actionClass: 'border-purple-200 text-purple-600 hover:bg-purple-50', icon: Eye },
                              'Overdue': { class: 'border-red-200 bg-red-50 text-red-600', action: 'Request', actionClass: 'bg-blue-600 text-white hover:bg-blue-700 border-transparent', icon: ClipboardList },
                            };
                            const config = statusConfig[row.status] || statusConfig['Pending'];
                            const initials = (row.employee_name ?? 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                            const ActionIcon = config.icon;

                            return (
                              <div key={row.id} className="grid grid-cols-12 items-start px-5 py-3 text-sm hover:bg-slate-50/50 transition">
                                <div className="col-span-1 text-slate-500 pt-1.5">{i + 1}</div>
                                <div className="col-span-3 flex items-start gap-3">
                                  <span className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-[11px] font-bold text-blue-600 shrink-0">
                                    {initials}
                                  </span>
                                  <div className="flex flex-col pt-1.5">
                                    <p className="font-semibold text-slate-800 leading-none">{row.employee_name}</p>
                                    <p className="text-[11px] text-slate-400 mt-1">{row.department}</p>
                                  </div>
                                </div>
                                <div className="col-span-2 flex items-center gap-2 text-slate-600 pt-1.5">
                                  <FileText className="h-4 w-4 text-slate-400" />
                                  {row.document_type}
                                </div>
                                <div className="col-span-2 text-slate-600 pt-1.5">{new Date(row.created_at).toLocaleDateString()}</div>
                                <div className="col-span-2 text-slate-600 pt-1.5">{row.date_submitted ? new Date(row.date_submitted).toLocaleDateString() : '—'}</div>
                                <div className="col-span-1 flex justify-center pt-1.5">
                                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${config.class}`}>
                                    {row.status}
                                  </span>
                                </div>
                                <div className="col-span-1 flex justify-end pt-1">
                                  <button
                                    type="button"
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition border ${config.actionClass}`}
                                    onClick={() => {
                                      if (config.action === 'Request') {
                                        openRequestModal({ id: row.employee_id, name: row.employee_name ?? '', role: '', dept: row.department ?? '', initials });
                                      } else if (config.action === 'View') {
                                        setReviewingRequest(row);
                                      }
                                    }}
                                  >
                                    <ActionIcon className="h-3.5 w-3.5" />
                                    {config.action}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </>
            )}

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

            {!['dashboard', 'employees', 'evaluation-status', 'performance-reviews', 'goals', 'ipcr', 'analytics', 'reports', 'settings'].includes(activeSection) && (
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
                        className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm text-left transition ${
                          bulkDocName === type
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
                            className={`py-1.5 rounded-full transition text-sm ${
                              selected
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
                      className={`w-full flex items-center gap-3 rounded-lg border p-3.5 text-left transition ${
                        bulkSendTo === 'all' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
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
                      className={`w-full flex items-center gap-3 rounded-lg border p-3.5 text-left transition ${
                        bulkSendTo === 'department' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
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
                      className={`w-full flex items-center gap-3 rounded-lg border p-3.5 text-left transition ${
                        bulkSendTo === 'selected' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
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
              ? `${reviewingRequest.employee_name ?? 'Employee'} • ${reviewingRequest.department ?? 'Unassigned'} • Status: ${reviewingRequest.status}`
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
                  {reviewDecisionPending === 'Rejected' ? 'Rejecting…' : 'Reject'}
                </button>
                <button
                  type="button"
                  disabled={!!reviewDecisionPending}
                  onClick={() => void handleReviewDecision('Approved')}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {reviewDecisionPending === 'Approved' ? 'Approving…' : 'Approve'}
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
