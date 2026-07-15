import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  Plus,
  Edit2,
  Trash2,
  Download,
  ListChecks,
  FileText
} from 'lucide-react';
import { Dialog } from '../../../components/Dialog';
import {
  getPositions,
  createPosition,
  updatePosition,
  deletePosition,
  getPositionCompetencies,
  addPositionCompetency,
  updatePositionCompetencyLevel,
  removePositionCompetency,
  getCompetencyLibrary,
  createCompetency,
  updateCompetency,
  deleteCompetency,
  getEmployeeAssessments,
  saveEmployeeAssessment,
  getAssessmentPeriods,
  type Position,
  type Competency,
  type PositionCompetency,
  type EmployeeAssessmentRow,
  type OverallStatus,
} from '../../../lib/api/pmCompetencyFramework';

const ADMIN_SESSION_KEY = 'cictrix_admin_session';

const getCurrentAdminEmail = (): string => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return 'PM Admin';
    const parsed = JSON.parse(raw) as { email?: string };
    return parsed?.email || 'PM Admin';
  } catch {
    return 'PM Admin';
  }
};

// --- COMPONENTS ---
export const PMCompetencyFramework = () => {
  const [activeTab, setActiveTab] = useState<'gap-report' | 'management'>('gap-report');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-[#363EE8]" />
            Competency Framework
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Define requirements, track employee assessments, and analyze competency gaps.
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('gap-report')}
          className={`px-4 py-2 font-semibold text-sm border-b-2 transition ${
            activeTab === 'gap-report' ? 'border-[#363EE8] text-[#363EE8]' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Competency Gap Report
        </button>
        <button
          onClick={() => setActiveTab('management')}
          className={`px-4 py-2 font-semibold text-sm border-b-2 transition ${
            activeTab === 'management' ? 'border-[#363EE8] text-[#363EE8]' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Competency Management
        </button>
      </div>

      {activeTab === 'gap-report' && <GapReportTab />}
      {activeTab === 'management' && <ManagementTab />}
    </div>
  );
};

const GapReportTab = () => {
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [cycleId, setCycleId] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<OverallStatus | ''>('');
  const [viewEmployee, setViewEmployee] = useState<EmployeeAssessmentRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EmployeeAssessmentRow[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [periods, setPeriods] = useState<{ id: number; title: string }[]>([]);

  const loadRows = async () => {
    setLoading(true);
    const result = await getEmployeeAssessments({
      department: department || undefined,
      position: position || undefined,
      employeeSearch: employeeSearch || undefined,
      cycleId: cycleId || undefined,
      status: statusFilter || undefined,
    });
    setRows(result.data);
    setLoading(false);
  };

  useEffect(() => {
    void getPositions().then((r) => setPositions(r.data));
    void getAssessmentPeriods().then((r) => setPeriods(r.data));
  }, []);

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, position, employeeSearch, cycleId, statusFilter]);

  const departments = useMemo(() => Array.from(new Set(positions.map((p) => p.department))).sort(), [positions]);
  const positionNames = useMemo(
    () => Array.from(new Set(positions.filter((p) => !department || p.department === department).map((p) => p.name))).sort(),
    [positions, department],
  );

  const stats = useMemo(() => ({
    total: rows.length,
    assessed: rows.filter((r) => r.overallStatus !== 'Not Yet Assessed').length,
    gaps: rows.filter((r) => r.overallStatus === 'Below Requirement').length,
    met: rows.filter((r) => r.overallStatus === 'Meets Requirement').length,
    pending: rows.filter((r) => r.overallStatus === 'Not Yet Assessed').length,
  }), [rows]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
          <Users className="h-6 w-6 text-[#363EE8] mb-2" />
          <span className="text-2xl font-bold text-slate-800">{stats.total}</span>
          <span className="text-xs font-semibold text-slate-500">Total Employees</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-500 mb-2" />
          <span className="text-2xl font-bold text-slate-800">{stats.assessed}</span>
          <span className="text-xs font-semibold text-slate-500">Employees Assessed</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm flex flex-col items-center justify-center text-center bg-red-50">
          <AlertTriangle className="h-6 w-6 text-red-500 mb-2" />
          <span className="text-2xl font-bold text-red-700">{stats.gaps}</span>
          <span className="text-xs font-semibold text-red-600">With Competency Gaps</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex flex-col items-center justify-center text-center bg-emerald-50">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 mb-2" />
          <span className="text-2xl font-bold text-emerald-700">{stats.met}</span>
          <span className="text-xs font-semibold text-emerald-600">Meeting Requirements</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col items-center justify-center text-center bg-amber-50">
          <Clock className="h-6 w-6 text-amber-500 mb-2" />
          <span className="text-2xl font-bold text-amber-700">{stats.pending}</span>
          <span className="text-xs font-semibold text-amber-600">Pending Assessment</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
          <select value={department} onChange={e => { setDepartment(e.target.value); setPosition(''); }} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#363EE8]">
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Position</label>
          <select value={position} onChange={e => setPosition(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#363EE8]">
            <option value="">All Positions</option>
            {positionNames.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Employee</label>
          <input
            value={employeeSearch}
            onChange={e => setEmployeeSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Assessment Period</label>
          <select value={cycleId} onChange={e => setCycleId(e.target.value ? Number(e.target.value) : '')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#363EE8]">
            <option value="">All Periods</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as OverallStatus | '')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#363EE8]">
            <option value="">All Statuses</option>
            <option value="Meets Requirement">Meets Requirement</option>
            <option value="Below Requirement">Below Requirement</option>
            <option value="Not Yet Assessed">Not Yet Assessed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <th className="px-6 py-3 font-semibold">Employee</th>
              <th className="px-6 py-3 font-semibold">Department</th>
              <th className="px-6 py-3 font-semibold">Position</th>
              <th className="px-6 py-3 font-semibold">Overall Status</th>
              <th className="px-6 py-3 font-semibold text-center">Missing Competencies</th>
              <th className="px-6 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No employees match the current filters.</td></tr>
            )}
            {!loading && rows.map(emp => (
              <tr key={emp.employeeId} className="hover:bg-slate-50">
                <td className="px-6 py-4 font-medium text-slate-800">{emp.name}</td>
                <td className="px-6 py-4 text-slate-600">{emp.department ?? '—'}</td>
                <td className="px-6 py-4 text-slate-600">{emp.position ?? '—'}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    emp.overallStatus === 'Meets Requirement' ? 'bg-emerald-100 text-emerald-800'
                      : emp.overallStatus === 'Below Requirement' ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {emp.overallStatus}
                  </span>
                </td>
                <td className="px-6 py-4 text-center font-medium text-slate-700">{emp.missingCount}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => setViewEmployee(emp)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#363EE8] hover:text-[#2e35d4] transition">
                    <Eye className="h-4 w-4" /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewEmployee && (
        <EmployeeCompetencyModal
          employee={viewEmployee}
          onClose={() => setViewEmployee(null)}
          onReassessed={() => { setViewEmployee(null); void loadRows(); }}
        />
      )}
    </div>
  );
};

const EmployeeCompetencyModal = ({
  employee,
  onClose,
  onReassessed,
}: {
  employee: EmployeeAssessmentRow;
  onClose: () => void;
  onReassessed: () => void;
}) => {
  const [reassessing, setReassessing] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const startReassess = () => {
    const initial: Record<string, number> = {};
    for (const c of employee.competencies) initial[c.competency_id] = c.current ?? 1;
    setRatings(initial);
    setReassessing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = employee.competencies.map((c) => ({
      competencyId: c.competency_id,
      requiredLevel: c.required,
      proficiencyLevel: ratings[c.competency_id] ?? 1,
    }));
    await saveEmployeeAssessment(employee.employeeId, payload, getCurrentAdminEmail());
    setSaving(false);
    onReassessed();
  };

  return (
    <Dialog open onClose={onClose} title="Employee Competency Details">
      <div className="space-y-6">
        {/* Employee Info */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Employee ID</span>
            <span className="font-semibold text-slate-800">{employee.employeeNumber ?? '—'}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Name</span>
            <span className="font-semibold text-slate-800">{employee.name}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Department</span>
            <span className="text-slate-700">{employee.department ?? '—'}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Position</span>
            <span className="text-slate-700">{employee.position ?? '—'}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date Assessed</span>
            <span className="text-slate-700">{employee.dateAssessed ? new Date(employee.dateAssessed).toLocaleDateString() : 'Not yet assessed'}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Assessor</span>
            <span className="text-slate-700">{employee.assessor ?? '—'}</span>
          </div>
        </div>

        {/* Competency Comparison Table */}
        <div>
          <h4 className="font-semibold text-slate-800 mb-3">Competency Comparison</h4>
          {employee.competencies.length === 0 ? (
            <p className="text-sm text-slate-400">This employee's position has no required competencies configured yet.</p>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="px-4 py-2 font-semibold">Competency</th>
                    <th className="px-4 py-2 font-semibold text-center">Required Level</th>
                    <th className="px-4 py-2 font-semibold text-center">{reassessing ? 'New Rating' : 'Employee Level'}</th>
                    {!reassessing && <th className="px-4 py-2 font-semibold text-center">Status</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employee.competencies.map((c) => (
                    <tr key={c.competency_id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                      <td className="px-4 py-3 text-center">{c.required}</td>
                      {reassessing ? (
                        <td className="px-4 py-3 text-center">
                          <select
                            value={ratings[c.competency_id] ?? 1}
                            onChange={(e) => setRatings((prev) => ({ ...prev, [c.competency_id]: Number(e.target.value) }))}
                            className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
                          >
                            {[1, 2, 3, 4, 5].map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                          </select>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-center font-semibold">{c.current ?? '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                              c.status === 'Met' ? 'bg-emerald-100 text-emerald-800' : c.status === 'Gap' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {c.status === 'Not Assessed' ? 'Not Assessed' : c.status}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-between gap-3 pt-4 border-t border-slate-200">
          <div className="flex gap-2">
            <button className="flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition" onClick={() => window.print()}>
              <Download className="h-4 w-4" /> Print Report
            </button>
            <button className="flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition" onClick={() => window.print()}>
              <FileText className="h-4 w-4" /> Export PDF
            </button>
          </div>
          <div className="flex gap-2">
            {reassessing ? (
              <>
                <button onClick={() => setReassessing(false)} disabled={saving} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || employee.competencies.length === 0} className="bg-[#363EE8] hover:bg-[#2e35d4] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Assessment'}
                </button>
              </>
            ) : (
              <>
                <button onClick={startReassess} disabled={employee.competencies.length === 0} className="flex items-center gap-2 bg-[#363EE8] hover:bg-[#2e35d4] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition disabled:opacity-50">
                  Reassess Employee
                </button>
                <button onClick={onClose} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};

const ManagementTab = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManageComp, setShowManageComp] = useState<Position | null>(null);
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [editPosition, setEditPosition] = useState<Position | null>(null);
  const [showAddCompetency, setShowAddCompetency] = useState(false);
  const [editCompetency, setEditCompetency] = useState<Competency | null>(null);

  const reload = async () => {
    setLoading(true);
    const [posResult, compResult] = await Promise.all([getPositions(), getCompetencyLibrary()]);
    setPositions(posResult.data);
    setCompetencies(compResult.data);
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []);

  const handleDeletePosition = async (id: string) => {
    if (!window.confirm('Delete this position? Its competency requirements will also be removed.')) return;
    await deletePosition(id);
    await reload();
  };

  const handleDeleteCompetency = async (id: string) => {
    if (!window.confirm('Delete this competency from the library?')) return;
    await deleteCompetency(id);
    await reload();
  };

  return (
    <div className="space-y-8">
      {/* SECTION A: Position List */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">Section A – Position List</h3>
          <button onClick={() => setShowAddPosition(true)} className="flex items-center gap-1.5 bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-sm font-semibold shadow transition">
            <Plus className="h-4 w-4" /> Add Position
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <th className="px-6 py-3 font-semibold">Position</th>
                <th className="px-6 py-3 font-semibold text-center">Required Competencies</th>
                <th className="px-6 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">Loading…</td></tr>
              )}
              {!loading && positions.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">No positions defined yet.</td></tr>
              )}
              {!loading && (() => {
                // Group positions by department, then list positions under each.
                const byDept = new Map<string, typeof positions>();
                for (const p of positions) {
                  const d = p.department || 'Unassigned';
                  if (!byDept.has(d)) byDept.set(d, []);
                  byDept.get(d)!.push(p);
                }
                return Array.from(byDept.entries())
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([dept, list]) => (
                    <React.Fragment key={dept}>
                      <tr className="bg-slate-50/70 border-t border-slate-200">
                        <td colSpan={3} className="px-6 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          {dept}
                          <span className="text-slate-400 font-medium normal-case"> · {list.length} position{list.length !== 1 ? 's' : ''}</span>
                        </td>
                      </tr>
                      {list.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 pl-10 font-medium text-slate-800">{p.name}</td>
                          <td className="px-6 py-4 text-center text-slate-700">{p.reqCount}</td>
                          <td className="px-6 py-4 text-right flex justify-end gap-3">
                            <button onClick={() => setShowManageComp(p)} className="text-[#363EE8] hover:text-[#2e35d4] font-semibold transition">
                              Manage
                            </button>
                            <button onClick={() => setEditPosition(p)} className="text-slate-400 hover:text-slate-600 transition"><Edit2 className="h-4 w-4" /></button>
                            <button onClick={() => void handleDeletePosition(p.id)} className="text-red-400 hover:text-red-600 transition"><Trash2 className="h-4 w-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ));
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION B: Competency Library */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">Section B – Competency Library</h3>
          <button onClick={() => setShowAddCompetency(true)} className="flex items-center gap-1.5 bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-sm font-semibold shadow transition">
            <Plus className="h-4 w-4" /> Add Competency
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <th className="px-6 py-3 font-semibold">Competency</th>
                <th className="px-6 py-3 font-semibold">Description</th>
                <th className="px-6 py-3 font-semibold">Category</th>
                <th className="px-6 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && competencies.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">No competencies in the library yet.</td></tr>
              )}
              {competencies.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-800">{c.name}</td>
                  <td className="px-6 py-4 text-slate-600">{c.description ?? '—'}</td>
                  <td className="px-6 py-4 text-slate-600">
                    <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs font-semibold">
                      {c.category ?? 'Uncategorized'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-3">
                    <button onClick={() => setEditCompetency(c)} className="text-slate-400 hover:text-slate-600 transition"><Edit2 className="h-4 w-4" /></button>
                    <button onClick={() => void handleDeleteCompetency(c.id)} className="text-red-400 hover:text-red-600 transition"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showManageComp && (
        <ManageCompetenciesModal position={showManageComp} competencyLibrary={competencies} onClose={() => setShowManageComp(null)} onChanged={reload} />
      )}
      {(showAddPosition || editPosition) && (
        <PositionFormDialog position={editPosition} onClose={() => { setShowAddPosition(false); setEditPosition(null); }} onSaved={reload} />
      )}
      {(showAddCompetency || editCompetency) && (
        <CompetencyFormDialog competency={editCompetency} onClose={() => { setShowAddCompetency(false); setEditCompetency(null); }} onSaved={reload} />
      )}
    </div>
  );
};

const PositionFormDialog = ({ position, onClose, onSaved }: { position: Position | null; onClose: () => void; onSaved: () => void }) => {
  const [name, setName] = useState(position?.name ?? '');
  const [department, setDepartment] = useState(position?.department ?? '');
  const [description, setDescription] = useState(position?.description ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !department.trim()) return;
    setSaving(true);
    if (position) {
      await updatePosition(position.id, { name: name.trim(), department: department.trim(), description: description.trim() || null });
    } else {
      await createPosition({ name: name.trim(), department: department.trim(), description: description.trim() || null });
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title={position ? 'Edit Position' : 'Add Position'}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Position Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
          <input value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
          <textarea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !department.trim()} className="bg-[#363EE8] hover:bg-[#2e35d4] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

const CompetencyFormDialog = ({ competency, onClose, onSaved }: { competency: Competency | null; onClose: () => void; onSaved: () => void }) => {
  const [name, setName] = useState(competency?.name ?? '');
  const [category, setCategory] = useState(competency?.category ?? '');
  const [description, setDescription] = useState(competency?.description ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    if (competency) {
      await updateCompetency(competency.id, { name: name.trim(), category: category.trim() || null, description: description.trim() || null });
    } else {
      await createCompetency({ name: name.trim(), category: category.trim() || null, description: description.trim() || null });
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title={competency ? 'Edit Competency' : 'Add Competency'}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Competency Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
          <input value={category ?? ''} onChange={(e) => setCategory(e.target.value)} placeholder="Technical, Core, Managerial…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
          <textarea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim()} className="bg-[#363EE8] hover:bg-[#2e35d4] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

const ManageCompetenciesModal = ({
  position,
  competencyLibrary,
  onClose,
  onChanged,
}: {
  position: Position;
  competencyLibrary: Competency[];
  onClose: () => void;
  onChanged: () => void;
}) => {
  const [required, setRequired] = useState<PositionCompetency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLevel, setEditLevel] = useState(1);

  const reload = async () => {
    setLoading(true);
    const result = await getPositionCompetencies(position.id);
    setRequired(result.data);
    setLoading(false);
  };

  useEffect(() => { void reload(); }, [position.id]);

  const handleRemove = async (id: string) => {
    await removePositionCompetency(id);
    await reload();
  };

  const handleSaveLevel = async (id: string) => {
    await updatePositionCompetencyLevel(id, editLevel);
    setEditingId(null);
    await reload();
  };

  const handleClose = () => { onChanged(); onClose(); };

  return (
    <Dialog open onClose={handleClose} title={`Manage Competencies: ${position.name}`}>
      <div className="space-y-6">
        <div>
          <h4 className="font-semibold text-slate-800 mb-3">Required Competencies</h4>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <th className="px-4 py-2 font-semibold">Competency</th>
                    <th className="px-4 py-2 font-semibold text-center">Required Level</th>
                    <th className="px-4 py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {required.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">No required competencies yet.</td></tr>
                  )}
                  {required.map((rc) => (
                    <tr key={rc.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{rc.competency_name}</td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {editingId === rc.id ? (
                          <select value={editLevel} onChange={(e) => setEditLevel(Number(e.target.value))} className="border border-slate-200 rounded-lg px-2 py-1 text-sm">
                            {[1, 2, 3, 4, 5].map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                          </select>
                        ) : rc.required_level}
                      </td>
                      <td className="px-4 py-3 text-right flex justify-end gap-2 text-[#363EE8]">
                        {editingId === rc.id ? (
                          <button onClick={() => void handleSaveLevel(rc.id)} className="hover:underline text-xs font-semibold">Save</button>
                        ) : (
                          <button onClick={() => { setEditingId(rc.id); setEditLevel(rc.required_level); }} className="hover:underline text-xs font-semibold">Edit</button>
                        )}
                        <button onClick={() => void handleRemove(rc.id)} className="hover:underline text-xs font-semibold text-red-600">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-3 pt-4 border-t border-slate-200">
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus className="h-4 w-4" /> Add Competency
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
              Cancel
            </button>
            <button onClick={handleClose} className="bg-[#363EE8] hover:bg-[#2e35d4] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition">
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {showAdd && (
        <AddPositionCompetencyDialog
          positionId={position.id}
          competencyLibrary={competencyLibrary.filter((c) => !required.some((r) => r.competency_id === c.id))}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); void reload(); }}
        />
      )}
    </Dialog>
  );
};

const AddPositionCompetencyDialog = ({
  positionId,
  competencyLibrary,
  onClose,
  onAdded,
}: {
  positionId: string;
  competencyLibrary: Competency[];
  onClose: () => void;
  onAdded: () => void;
}) => {
  const [competencyId, setCompetencyId] = useState(competencyLibrary[0]?.id ?? '');
  const [level, setLevel] = useState(3);
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!competencyId) return;
    setSaving(true);
    await addPositionCompetency(positionId, competencyId, level);
    setSaving(false);
    onAdded();
  };

  return (
    <Dialog open onClose={onClose} title="Add Competency">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Competency</label>
          <select value={competencyId} onChange={(e) => setCompetencyId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {competencyLibrary.length === 0 && <option value="">No competencies available</option>}
            {competencyLibrary.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Required Proficiency Level (1–5)</label>
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {[1, 2, 3, 4, 5].map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50">Cancel</button>
          <button onClick={handleAdd} disabled={saving || !competencyId} className="bg-[#363EE8] hover:bg-[#2e35d4] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition disabled:opacity-50">
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
