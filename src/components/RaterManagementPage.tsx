import {
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ClipboardCheck,
    FileSpreadsheet,
    MoreVertical,
    Search,
    Send,
    UserPlus,
    Users,
    X,
    XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { mockDatabase } from '../lib/mockDatabase';
import {
    downloadTextFile,
    ensureRecruitmentSeedData,
    formatPHDate,
    getEvaluationPeriods,
    getRaterAssignments,
    saveEvaluationPeriods,
    saveRaterAssignments,
    toCsv,
} from '../lib/recruitmentData';
import { isMockModeEnabled, supabase } from '../lib/supabase';
import { EvaluationPeriod, RaterAssignment } from '../types/recruitment.types';
import { RaterManagementNavigationGuide } from './RaterManagementNavigationGuide';
import { Sidebar } from './Sidebar';

const STATUS_COLORS: Record<RaterAssignment['status'], string> = {
  Assigned: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Unassigned: 'bg-rose-100 text-rose-700',
};

interface AssignmentForm {
  employeeName: string;
  employeePosition: string;
  department: string;
  period: string;
  immediateSupervisor: string;
  departmentHead: string;
  additionalRater: string;
  effectiveDate: string;
  expirationDate: string;
}

interface RaterOption {
  id: string;
  name: string;
  email: string;
  department?: string;
  is_active: boolean;
}

const normalizeValue = (value: unknown) => String(value ?? '').trim().toLowerCase();

const defaultAssignmentForm = (): AssignmentForm => ({
  employeeName: '',
  employeePosition: '',
  department: '',
  period: '',
  immediateSupervisor: '',
  departmentHead: '',
  additionalRater: '',
  effectiveDate: '',
  expirationDate: '',
});

const getAccessClient = () => {
  // Access control must use the real rater DB when Supabase is configured.
  return isMockModeEnabled ? (mockDatabase as any) : supabase;
};
const RATER_ACCESS_STATE_KEY = 'cictrix_rater_access_state_map';

const saveRaterAccessState = (email: string, isActive: boolean) => {
  try {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const raw = localStorage.getItem(RATER_ACCESS_STATE_KEY);
    const current = raw ? JSON.parse(raw) : {};
    const next = current && typeof current === 'object' ? { ...current } : {};
    next[normalizedEmail] = isActive;
    localStorage.setItem(RATER_ACCESS_STATE_KEY, JSON.stringify(next));
  } catch {
  }
};

const runRaterEmailUpdate = async (
  client: any,
  updates: Record<string, unknown>,
  email: string,
  anchorId?: string
) => {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await client.from('raters').select('id,email');
  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const matchedIds = rows
    .filter((row: any) => String(row?.email ?? '').trim().toLowerCase() === normalizedEmail)
    .map((row: any) => String(row?.id ?? '').trim())
    .filter(Boolean);

  const normalizedAnchorId = String(anchorId ?? '').trim();
  if (normalizedAnchorId && !matchedIds.includes(normalizedAnchorId)) {
    matchedIds.push(normalizedAnchorId);
  }

  if (matchedIds.length === 0) {
    throw new Error('No matching rater account found for update.');
  }

  const updateResults = await Promise.all(
    matchedIds.map((id) => client.from('raters').update(updates).eq('id', id))
  );

  const allFailed = updateResults.every((result: any) => Boolean(result?.error));
  if (allFailed) {
    throw new Error('Failed to persist rater access update.');
  }
};

const verifyRaterAccessState = async (client: any, email: string, expectedIsActive: boolean) => {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await client.from('raters').select('id,email,is_active');
  if (error) {
    throw error;
  }

  const rows = (Array.isArray(data) ? data : []).filter(
    (row: any) => String(row?.email ?? '').trim().toLowerCase() === normalizedEmail
  );

  if (rows.length === 0) {
    throw new Error('No matching rater account found after update.');
  }

  const mismatch = rows.some((row: any) => Boolean(row?.is_active) !== expectedIsActive);
  if (mismatch) {
    throw new Error('Rater access update did not persist for all matching rows.');
  }
};

export const RaterManagementPage = () => {
  const [assignments, setAssignments] = useState<RaterAssignment[]>([]);
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [ratingLevelFilter, setRatingLevelFilter] = useState('all');
  const [assignmentStatus, setAssignmentStatus] = useState<'all' | RaterAssignment['status']>('all');
  const [periodFilter, setPeriodFilter] = useState('Current');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [collapsedDepartments, setCollapsedDepartments] = useState<Record<string, boolean>>({});
  const [showGuide, setShowGuide] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [form, setForm] = useState<AssignmentForm>(defaultAssignmentForm());
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'Assignments' | 'Rating History'>('Assignments');
  const [historyEmployeeFilter, setHistoryEmployeeFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [availableRaters, setAvailableRaters] = useState<RaterOption[]>([]);
  const [assignedPositions, setAssignedPositions] = useState<string[]>([]);

  const fetchAvailableRaters = async () => {
    try {
      const client = getAccessClient();
      const response = await client
        .from('raters')
        .select('id,name,email,department,is_active')
        .order('name');

      const rows = (((response as any)?.data ?? []) as RaterOption[])
        .filter((row) => row?.name && row?.email);

      setAvailableRaters(rows);
    } catch {
      setToast('Unable to load raters from database.');
    }
  };

  useEffect(() => {
    ensureRecruitmentSeedData();
    const initialAssignments = getRaterAssignments();
    const initialPeriods = getEvaluationPeriods();
    setAssignments(initialAssignments);
    setPeriods(initialPeriods);

    const initialCollapsed: Record<string, boolean> = {};
    Array.from(new Set(initialAssignments.map((item) => item.department))).forEach((dept) => {
      initialCollapsed[dept] = false;
    });
    setCollapsedDepartments(initialCollapsed);

    void fetchAvailableRaters();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const departments = useMemo(() => Array.from(new Set(assignments.map((item) => item.department))), [assignments]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((row) => {
      const matchesSearch =
        !search ||
        `${row.employeeName} ${row.employeePosition} ${row.raters.immediateSupervisor.name} ${row.raters.departmentHead.name}`
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchesDepartment = departmentFilter === 'all' || row.department === departmentFilter;
      const matchesStatus = assignmentStatus === 'all' || row.status === assignmentStatus;
      const matchesPeriod =
        periodFilter === 'All'
          ? true
          : periodFilter === 'Current'
            ? row.evaluationPeriod.includes('2026')
            : periodFilter === 'Previous'
              ? row.evaluationPeriod.includes('2025')
              : row.evaluationPeriod === periodFilter;
      const matchesLevel =
        ratingLevelFilter === 'all' ||
        (ratingLevelFilter === 'Immediate Supervisor' && Boolean(row.raters.immediateSupervisor.name)) ||
        (ratingLevelFilter === 'Department Head' && Boolean(row.raters.departmentHead.name)) ||
        (ratingLevelFilter === 'Division Chief' && row.raters.immediateSupervisor.position.toLowerCase().includes('division')) ||
        (ratingLevelFilter === 'PMD Head (final reviewer)' && Boolean(row.raters.pmdHead.name));
      return matchesSearch && matchesDepartment && matchesStatus && matchesPeriod && matchesLevel;
    });
  }, [assignments, search, departmentFilter, assignmentStatus, periodFilter, ratingLevelFilter]);

  const groupedAssignments = useMemo(() => {
    const groupMap = new Map<string, RaterAssignment[]>();
    filteredAssignments.forEach((row) => {
      if (!groupMap.has(row.department)) groupMap.set(row.department, []);
      const departmentRows = groupMap.get(row.department);
      if (departmentRows) departmentRows.push(row);
    });
    return Array.from(groupMap.entries());
  }, [filteredAssignments]);

  const stats = useMemo(() => {
    const totalEmployees = assignments.length;
    return {
      totalEmployees,
      assigned: assignments.filter((item) => item.status === 'Assigned').length,
      pending: assignments.filter((item) => item.status === 'Pending' || item.status === 'Unassigned').length,
      multipleRaters: assignments.filter((item) => Boolean(item.raters.additionalRater)).length,
    };
  }, [assignments]);

  const allSelected = filteredAssignments.length > 0 && selectedIds.length === filteredAssignments.length;

  const persistAssignments = (nextRows: RaterAssignment[]) => {
    setAssignments(nextRows);
    saveRaterAssignments(nextRows);
  };

  const openAssignModal = (assignment?: RaterAssignment) => {
    void fetchAvailableRaters();
    if (assignment) {
      setEditingAssignmentId(assignment.id);
      setForm({
        employeeName: assignment.employeeName,
        employeePosition: assignment.employeePosition,
        department: assignment.department,
        period: assignment.evaluationPeriod,
        immediateSupervisor: assignment.raters.immediateSupervisor.name,
        departmentHead: assignment.raters.departmentHead.name,
        additionalRater: assignment.raters.additionalRater?.name ?? '',
        effectiveDate: assignment.effectiveDate.slice(0, 10),
        expirationDate: assignment.expirationDate?.slice(0, 10) ?? '',
      });
      setAssignedPositions(
        assignment.employeePosition
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      );
    } else {
      setEditingAssignmentId(null);
      setForm(defaultAssignmentForm());
      setAssignedPositions([]);
    }
    setShowAssignModal(true);
  };

  const handleRaterSelection = (raterName: string) => {
    const selected = availableRaters.find((entry) => entry.name === raterName);
    setForm((current) => ({
      ...current,
      employeeName: raterName,
      department: selected?.department ?? current.department,
      immediateSupervisor: raterName,
      departmentHead: raterName,
      additionalRater: '',
    }));
  };

  const toggleAssignedPosition = (position: string) => {
    setAssignedPositions((current) =>
      current.includes(position)
        ? current.filter((item) => item !== position)
        : [...current, position]
    );
  };

  const saveAssignment = () => {
    if (!form.employeeName || assignedPositions.length === 0) {
      setToast('Please complete required assignment fields.');
      return;
    }

    const selectedRater = availableRaters.find((entry) => entry.name === form.employeeName);
    const effectiveDateIso = form.effectiveDate
      ? new Date(form.effectiveDate).toISOString()
      : new Date().toISOString();
    const resolvedPeriod = form.period || activePeriod?.name || 'Current Period';

    const payload: RaterAssignment = {
      id: editingAssignmentId ?? crypto.randomUUID(),
      employeeId: editingAssignmentId ?? `EMP-PENDING-${Math.floor(Math.random() * 9999)}`,
      employeeName: form.employeeName,
      employeePosition: assignedPositions.join(', '),
      department: form.department || selectedRater?.department || 'Unassigned',
      evaluationPeriod: resolvedPeriod,
      raters: {
        immediateSupervisor: {
          id: selectedRater?.id ?? crypto.randomUUID(),
          name: form.immediateSupervisor,
          position: 'Immediate Supervisor',
        },
        departmentHead: {
          id: selectedRater?.id ?? crypto.randomUUID(),
          name: form.departmentHead,
          position: 'Department Head',
        },
        additionalRater: form.additionalRater
          ? {
              id: crypto.randomUUID(),
              name: form.additionalRater,
              position: 'Additional Rater',
            }
          : undefined,
        pmdHead: {
          id: 'pmd-001',
          name: 'Liza Manalo',
          position: 'PMD Head',
        },
      },
      effectiveDate: effectiveDateIso,
      expirationDate: form.expirationDate ? new Date(form.expirationDate).toISOString() : undefined,
      status: 'Assigned',
      createdBy: 'HR Admin',
      createdDate: new Date().toISOString(),
    };

    const nextRows = editingAssignmentId
      ? assignments.map((row) => (row.id === editingAssignmentId ? payload : row))
      : [payload, ...assignments];

    persistAssignments(nextRows);
    setShowAssignModal(false);
    setAssignedPositions([]);
    setToast(editingAssignmentId ? 'Assignment updated.' : 'Rater assigned successfully.');
  };

  const removeAssignment = (assignmentId: string) => {
    persistAssignments(assignments.filter((row) => row.id !== assignmentId));
    setToast('Assignment removed.');
  };

  const findRaterByName = (name: string) => {
    const normalized = normalizeValue(name);
    return availableRaters.find((rater) => normalizeValue(rater.name) === normalized);
  };

  const findRaterById = (id: string) => {
    const normalizedId = String(id ?? '').trim();
    if (!normalizedId) return undefined;
    return availableRaters.find((rater) => String(rater.id ?? '').trim() === normalizedId);
  };

  const resolveRaterAccount = (raterId: string | undefined, raterName: string) => {
    const byId = raterId ? findRaterById(raterId) : undefined;
    if (byId) return byId;
    return findRaterByName(raterName);
  };

  const toggleRaterAccess = async (raterId: string | undefined, raterName: string) => {
    const client = getAccessClient();
    let existing = resolveRaterAccount(raterId, raterName);

    // Pull latest raters from DB before failing a toggle, so newly-created accounts work immediately.
    if (!existing) {
      try {
        const latestResponse = await client
          .from('raters')
          .select('id,name,email,department,is_active')
          .order('name');
        const latestRows = (((latestResponse as any)?.data ?? []) as RaterOption[]).filter(
          (row) => row?.name && row?.email
        );
        if (latestRows.length > 0) {
          setAvailableRaters(latestRows);
          const normalizedTargetId = String(raterId ?? '').trim();
          const normalizedTargetName = normalizeValue(raterName);
          existing =
            latestRows.find((row) => String(row.id ?? '').trim() === normalizedTargetId) ||
            latestRows.find((row) => normalizeValue(row.name) === normalizedTargetName);
        }
      } catch {
        // Keep existing local state and show actionable toast below if still unresolved.
      }
    }

    if (!existing) {
      setToast('No matching rater account in database. Use Assign Rater and select a rater account first.');
      return;
    }

    const nextIsActive = !existing.is_active;
    const normalizedEmail = existing.email.trim().toLowerCase();
    setAvailableRaters((current) =>
      current.map((rater) =>
        rater.email.trim().toLowerCase() === normalizedEmail ? { ...rater, is_active: nextIsActive } : rater
      )
    );

    try {
      await runRaterEmailUpdate(client, { is_active: nextIsActive }, normalizedEmail, String(existing.id));
      await verifyRaterAccessState(client, normalizedEmail, nextIsActive);
      saveRaterAccessState(normalizedEmail, nextIsActive);
      await fetchAvailableRaters();
      setToast(nextIsActive ? 'Interviewer access granted.' : 'Interviewer access revoked.');
    } catch {
      setAvailableRaters((current) =>
        current.map((rater) =>
          rater.email.trim().toLowerCase() === normalizedEmail ? { ...rater, is_active: existing.is_active } : rater
        )
      );
      setToast('Failed to update interviewer access.');
    }
  };

  const toggleCollapse = (department: string) => {
    setCollapsedDepartments((current) => ({ ...current, [department]: !current[department] }));
  };

  const sendNotification = (ids: string[]) => {
    if (!ids.length) {
      setToast('Select at least one row for notification.');
      return;
    }
    setToast(`Notification sent to ${ids.length} assignment(s).`);
  };

  const exportAssignments = () => {
    const rowsForExport = selectedIds.length
      ? filteredAssignments.filter((item) => selectedIds.includes(item.id))
      : filteredAssignments;

    const csv = toCsv(
      ['Employee', 'Position', 'Department', 'Immediate Supervisor', 'Department Head', 'Additional Rater', 'Status', 'Period'],
      rowsForExport.map((row) => [
        row.employeeName,
        row.employeePosition,
        row.department,
        row.raters.immediateSupervisor.name,
        row.raters.departmentHead.name,
        row.raters.additionalRater?.name ?? '-',
        row.status,
        row.evaluationPeriod,
      ])
    );
    downloadTextFile('rater-assignments.csv', csv, 'text/csv;charset=utf-8');
    setToast('Assignments exported (CSV).');
  };

  const savePeriods = (nextPeriods: EvaluationPeriod[]) => {
    setPeriods(nextPeriods);
    saveEvaluationPeriods(nextPeriods);
  };

  const activePeriod = periods.find((period) => period.status === 'Active');

  const historyRows = useMemo(() => {
    return assignments
      .filter((row) => historyEmployeeFilter === 'all' || row.employeeId === historyEmployeeFilter)
      .map((row) => [
        row.evaluationPeriod,
        row.employeeName,
        `${row.raters.immediateSupervisor.name} (Supervisor)`,
        row.status === 'Assigned' ? '4.52 - Very Satisfactory' : '--',
        row.status === 'Assigned' ? formatPHDate(row.createdDate) : '--',
        row.status === 'Assigned' ? 'Submitted' : 'Pending',
      ]);
  }, [assignments, historyEmployeeFilter]);

  const assignableJobPositions = useMemo(() => {
    const fromAssignments = assignments
      .flatMap((item) => item.employeePosition.split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);

    const defaults = [
      'IT Officer II',
      'HR Assistant',
      'Admin Aide II',
      'Admin Aide III',
      'Clerk I',
      'Clerk II',
      'Engineer II',
      'HR Officer',
      'Administrative Officer',
      'IT Programmer',
      'Accountant II',
      'Legal Officer I',
    ];

    return Array.from(new Set([...fromAssignments, ...defaults]));
  }, [assignments]);

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Rater Management</h1>
            <p className="text-slate-600">Configure rater assignments and evaluation hierarchies</p>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setShowPeriodModal(true)}>
              <CalendarClock className="mr-1 inline h-4 w-4" /> Evaluation Period Settings
            </button>
            <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setShowGuide(true)}>
              How to Navigate
            </button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => openAssignModal()}>
              <UserPlus className="mr-1 inline h-4 w-4" /> Assign Rater
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[{ label: 'Total Employees', value: stats.totalEmployees }, { label: 'Assigned Raters', value: stats.assigned }, { label: 'Pending', value: stats.pending }, { label: 'Multiple Raters', value: stats.multipleRaters }].map((card) => (
            <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
            </article>
          ))}
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap gap-2">
            {(['Assignments', 'Rating History'] as const).map((tab) => (
              <button key={tab} className={`rounded-full px-3 py-1 text-sm ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Assignments' ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                  <option value="all">All Departments</option>
                  {departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                </select>
                <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={ratingLevelFilter} onChange={(event) => setRatingLevelFilter(event.target.value)}>
                  <option value="all">All Rating Levels</option>
                  <option value="Immediate Supervisor">Immediate Supervisor</option>
                  <option value="Department Head">Department Head</option>
                  <option value="Division Chief">Division Chief</option>
                  <option value="PMD Head (final reviewer)">PMD Head (final reviewer)</option>
                </select>
                <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={assignmentStatus} onChange={(event) => setAssignmentStatus(event.target.value as 'all' | RaterAssignment['status'])}>
                  <option value="all">All Status</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Pending">Pending Assignment</option>
                  <option value="Unassigned">Unassigned</option>
                </select>
                <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
                  <option>Current</option>
                  <option>Previous</option>
                  <option>All</option>
                  {periods.map((period) => <option key={period.id}>{period.name}</option>)}
                </select>
                <div className="relative xl:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" placeholder="Search employee, position, or rater" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" onClick={() => openAssignModal()}>Assign Rater</button>
                <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" onClick={() => sendNotification(selectedIds.length ? selectedIds : filteredAssignments.map((item) => item.id))}>
                  <Send className="mr-1 inline h-4 w-4" />Send Notification
                </button>
                <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" onClick={exportAssignments}>
                  <FileSpreadsheet className="mr-1 inline h-4 w-4" />Export Assignments
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={(event) => setSelectedIds(event.target.checked ? filteredAssignments.map((row) => row.id) : [])}
                          />
                        </th>
                        <th className="px-3 py-3">Employee</th>
                        <th className="px-3 py-3">Position</th>
                        <th className="px-3 py-3">Immediate Supervisor</th>
                        <th className="px-3 py-3">Department Head</th>
                        <th className="px-3 py-3">Additional Rater</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedAssignments.map(([department, departmentRows]) => (
                        <>
                          <tr key={`${department}-header`} className="border-t border-slate-200 bg-slate-50">
                            <td className="px-3 py-2">
                              <button className="rounded border border-slate-300 p-1" onClick={() => toggleCollapse(department)}>
                                {collapsedDepartments[department] ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-900" colSpan={7}>
                              {department} • {departmentRows.length} employees • {departmentRows.filter((row) => row.status === 'Assigned').length} assigned, {departmentRows.filter((row) => row.status !== 'Assigned').length} pending
                            </td>
                          </tr>

                          {!collapsedDepartments[department] &&
                            departmentRows.map((row) => (
                              <tr key={row.id} className="border-t border-slate-100 bg-white">
                                <td className="px-3 py-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.includes(row.id)}
                                    onChange={() =>
                                      setSelectedIds((current) =>
                                        current.includes(row.id)
                                          ? current.filter((entry) => entry !== row.id)
                                          : [...current, row.id]
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-3 font-medium text-slate-900">{row.employeeName}</td>
                                <td className="px-3 py-3 text-slate-600">{row.employeePosition}</td>
                                <td className="px-3 py-3 text-slate-600">{row.raters.immediateSupervisor.name}</td>
                                <td className="px-3 py-3 text-slate-600">{row.raters.departmentHead.name}</td>
                                <td className="px-3 py-3 text-slate-600">{row.raters.additionalRater?.name ?? '+'}</td>
                                <td className="px-3 py-3">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[row.status]}`}>{row.status}</span>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const linkedRater = resolveRaterAccount(
                                        row.raters.immediateSupervisor.id,
                                        row.raters.immediateSupervisor.name
                                      );
                                      const isActive = Boolean(linkedRater?.is_active);
                                      return (
                                        <button
                                          type="button"
                                          className={`inline-flex items-center rounded-lg border px-2 py-1 text-xs font-semibold transition ${isActive ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                          onClick={() =>
                                            toggleRaterAccess(
                                              row.raters.immediateSupervisor.id,
                                              row.raters.immediateSupervisor.name
                                            )
                                          }
                                          title={linkedRater ? '' : 'No linked rater account found. Click to see how to fix.'}
                                        >
                                          {isActive ? <XCircle className="mr-1 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                                          {isActive ? 'Revoke Access' : 'Grant Access'}
                                        </button>
                                      );
                                    })()}

                                  <div className="relative">
                                    <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}>
                                      <MoreVertical className="h-4 w-4" />
                                    </button>
                                    {openMenuId === row.id && (
                                      <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                                        <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { openAssignModal(row); setOpenMenuId(null); }}>Edit Rater Assignment</button>
                                        <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { setActiveTab('Rating History'); setHistoryEmployeeFilter(row.employeeId); setOpenMenuId(null); }}>View Rating History</button>
                                        <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { sendNotification([row.id]); setOpenMenuId(null); }}>Send Notification</button>
                                        <button className="block w-full rounded px-2 py-1 text-left text-rose-700 hover:bg-rose-50" onClick={() => { removeAssignment(row.id); setOpenMenuId(null); }}>Remove Assignment</button>
                                      </div>
                                    )}
                                  </div>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={historyEmployeeFilter} onChange={(event) => setHistoryEmployeeFilter(event.target.value)}>
                  <option value="all">All Employees</option>
                  {assignments.map((item) => (
                    <option key={item.employeeId} value={item.employeeId}>{item.employeeName}</option>
                  ))}
                </select>
                <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" onClick={() => setHistoryEmployeeFilter('all')}>Reset</button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Evaluation Period</th>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Rater Name & Level</th>
                      <th className="px-3 py-2">Rating Given</th>
                      <th className="px-3 py-2">Date Submitted</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr key={`${row[0]}-${row[1]}-${row[2]}`} className="border-t border-slate-100">
                        {row.map((cell) => (
                          <td key={`${cell}`} className="px-3 py-2 text-slate-700">{cell}</td>
                        ))}
                        <td className="px-3 py-2">
                          <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium">View IPCR</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      <RaterManagementNavigationGuide open={showGuide} onClose={() => setShowGuide(false)} />

      {showAssignModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/70 p-4" onClick={() => setShowAssignModal(false)}>
          <div className="mx-auto mt-6 flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between bg-blue-700 px-6 py-4 text-white">
              <div>
                <h2 className="text-3xl font-bold">Assign Rater Access</h2>
                <p className="text-base text-blue-100">Grant access to interviewer portal</p>
              </div>
              <button className="rounded-md p-1 text-white/90 hover:bg-white/10" onClick={() => setShowAssignModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">Select Rater <span className="text-red-500">*</span></label>
                <select
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
                  value={form.employeeName}
                  onChange={(event) => handleRaterSelection(event.target.value)}
                >
                  <option value="">Choose a rater...</option>
                  {availableRaters.map((rater) => (
                    <option key={rater.id} value={rater.name}>{rater.name}</option>
                  ))}
                </select>
              </section>

              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">Designation / Role</label>
                <input className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-lg" value={form.department} readOnly />
                <p className="mt-2 text-sm text-slate-500">Auto-filled based on selected rater</p>
              </section>

              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">Access Level <span className="text-red-500">*</span></label>
                <select className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-lg" value="Interviewer" disabled>
                  <option value="Interviewer">Interviewer</option>
                </select>
              </section>

              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">Assign Job Positions <span className="text-red-500">*</span></label>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-300 p-4">
                  <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
                    {assignableJobPositions.map((position) => {
                      const checked = assignedPositions.includes(position);
                      return (
                        <label key={position} className="flex items-center gap-3 text-xl text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAssignedPosition(position)}
                            className="h-5 w-5 rounded"
                          />
                          <span>{position}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-500">Selected: {assignedPositions.length} position{assignedPositions.length === 1 ? '' : 's'}</p>
              </section>

              {availableRaters.length === 0 && (
                <p className="text-xs text-amber-700">No active raters found in database. Add raters first, then reopen this form.</p>
              )}

              <section>
                <h3 className="mb-3 text-3xl font-bold text-slate-800">Access Duration (Optional)</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-600">Start Date</label>
                    <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg" type="date" value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-600">End Date</label>
                    <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg" type="date" value={form.expirationDate} onChange={(event) => setForm({ ...form, expirationDate: event.target.value })} />
                  </div>
                </div>
              </section>

              <select className="hidden" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })}>
                <option value="">Select Evaluation Period</option>
                {periods.map((period) => <option key={period.id} value={period.name}>{period.name}</option>)}
              </select>

              <div className="hidden">
                <input value={form.immediateSupervisor} onChange={(event) => setForm({ ...form, immediateSupervisor: event.target.value })} />
                <input value={form.departmentHead} onChange={(event) => setForm({ ...form, departmentHead: event.target.value })} />
                <input value={form.additionalRater} onChange={(event) => setForm({ ...form, additionalRater: event.target.value })} />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-lg" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-lg font-semibold text-white" onClick={saveAssignment}>Save & Generate Access</button>
            </div>
          </div>
        </div>
      )}

      {showPeriodModal && (
        <div className="fixed inset-0 z-[121] bg-slate-900/70 p-4" onClick={() => setShowPeriodModal(false)}>
          <div className="mx-auto mt-10 w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Evaluation Period Settings</h2>
                <p className="text-sm text-slate-500">Define evaluation cycles, deadlines, and rating periods.</p>
              </div>
              <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setShowPeriodModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">Current Period Configuration</h3>
              {activePeriod ? (
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  <p>Name: {activePeriod.name}</p>
                  <p>Type: {activePeriod.type}</p>
                  <p>Range: {formatPHDate(activePeriod.startDate)} - {formatPHDate(activePeriod.endDate)}</p>
                  <p>Submission Deadline: {formatPHDate(activePeriod.submissionDeadline)}</p>
                  <p>Status: {activePeriod.status}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No active period configured.</p>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Period Name</th>
                    <th className="px-3 py-2">Date Range</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => (
                    <tr key={period.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{period.name}</td>
                      <td className="px-3 py-2 text-slate-700">{formatPHDate(period.startDate)} - {formatPHDate(period.endDate)}</td>
                      <td className="px-3 py-2 text-slate-700">{period.status}</td>
                      <td className="px-3 py-2">
                        <button className="mr-2 rounded-lg border border-slate-300 px-2 py-1 text-xs" onClick={() => setToast(`Viewing ${period.name}`)}>View</button>
                        <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs" onClick={() => {
                          const next: EvaluationPeriod[] = periods.map((item) => ({
                            ...item,
                            status: item.id === period.id
                              ? 'Active'
                              : item.status === 'Active'
                                ? 'Completed'
                                : item.status,
                          }));
                          savePeriods(next);
                          setToast(`${period.name} set as active period.`);
                        }}>Set Active</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-between gap-2">
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => {
                const nowYear = new Date().getFullYear() + 1;
                const nextPeriod: EvaluationPeriod = {
                  id: crypto.randomUUID(),
                  name: `${nowYear} Annual IPCR`,
                  type: 'Annual',
                  startDate: `${nowYear}-01-01T00:00:00+08:00`,
                  endDate: `${nowYear}-12-31T23:59:00+08:00`,
                  submissionDeadline: `${nowYear}-12-15T23:59:00+08:00`,
                  status: 'Upcoming',
                };
                savePeriods([...periods, nextPeriod]);
                setToast('New period created.');
              }}>
                <ClipboardCheck className="mr-1 inline h-4 w-4" />Create New Period
              </button>
              <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white" onClick={() => setShowPeriodModal(false)}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}

      <div className="fixed bottom-6 left-6 flex gap-2">
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" onClick={() => sendNotification(selectedIds.length ? selectedIds : filteredAssignments.map((item) => item.id))}>
          <Send className="mr-1 inline h-4 w-4" />Notify Raters
        </button>
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" onClick={exportAssignments}>
          <FileSpreadsheet className="mr-1 inline h-4 w-4" />Export
        </button>
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" onClick={() => setToast('IPCR viewer opens from PM module routing.') }>
          <Users className="mr-1 inline h-4 w-4" />Open IPCR
        </button>
      </div>
    </div>
  );
};
