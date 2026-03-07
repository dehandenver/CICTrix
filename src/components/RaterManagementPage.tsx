import {
    CalendarClock,
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
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
    } else {
      setEditingAssignmentId(null);
      setForm(defaultAssignmentForm());
    }
    setShowAssignModal(true);
  };

  const saveAssignment = () => {
    if (!form.employeeName || !form.employeePosition || !form.department || !form.period || !form.immediateSupervisor || !form.departmentHead || !form.effectiveDate) {
      setToast('Please complete required assignment fields.');
      return;
    }

    const payload: RaterAssignment = {
      id: editingAssignmentId ?? crypto.randomUUID(),
      employeeId: editingAssignmentId ?? `EMP-PENDING-${Math.floor(Math.random() * 9999)}`,
      employeeName: form.employeeName,
      employeePosition: form.employeePosition,
      department: form.department,
      evaluationPeriod: form.period,
      raters: {
        immediateSupervisor: {
          id: crypto.randomUUID(),
          name: form.immediateSupervisor,
          position: 'Immediate Supervisor',
        },
        departmentHead: {
          id: crypto.randomUUID(),
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
      effectiveDate: new Date(form.effectiveDate).toISOString(),
      expirationDate: form.expirationDate ? new Date(form.expirationDate).toISOString() : undefined,
      status: form.immediateSupervisor && form.departmentHead ? 'Assigned' : 'Pending',
      createdBy: 'HR Admin',
      createdDate: new Date().toISOString(),
    };

    const nextRows = editingAssignmentId
      ? assignments.map((row) => (row.id === editingAssignmentId ? payload : row))
      : [payload, ...assignments];

    persistAssignments(nextRows);
    setShowAssignModal(false);
    setToast(editingAssignmentId ? 'Assignment updated.' : 'Rater assigned successfully.');
  };

  const removeAssignment = (assignmentId: string) => {
    persistAssignments(assignments.filter((row) => row.id !== assignmentId));
    setToast('Assignment removed.');
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
          <div className="mx-auto mt-10 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{editingAssignmentId ? 'Edit Rater Assignment' : 'Assign Rater'}</h2>
                <p className="text-sm text-slate-500">Define rater hierarchy and evaluation period.</p>
              </div>
              <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setShowAssignModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Employee Name" value={form.employeeName} onChange={(event) => setForm({ ...form, employeeName: event.target.value })} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Employee Position" value={form.employeePosition} onChange={(event) => setForm({ ...form, employeePosition: event.target.value })} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />

              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })}>
                <option value="">Select Evaluation Period</option>
                {periods.map((period) => <option key={period.id} value={period.name}>{period.name}</option>)}
              </select>

              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Immediate Supervisor (Level 1)" value={form.immediateSupervisor} onChange={(event) => setForm({ ...form, immediateSupervisor: event.target.value })} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Department Head (Level 2)" value={form.departmentHead} onChange={(event) => setForm({ ...form, departmentHead: event.target.value })} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Additional Rater (optional)" value={form.additionalRater} onChange={(event) => setForm({ ...form, additionalRater: event.target.value })} />

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                PMD Head (Final Reviewer): Liza Manalo
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} />
                <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={form.expirationDate} onChange={(event) => setForm({ ...form, expirationDate: event.target.value })} />
              </div>

              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked readOnly /> Notify employee (ratee)</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked readOnly /> Notify assigned raters</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked readOnly /> Send email reminder</label>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white" onClick={saveAssignment}>Save Assignment</button>
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
