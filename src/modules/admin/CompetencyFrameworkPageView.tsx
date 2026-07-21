import { useEffect, useMemo, useState } from 'react';
import { Eye, ListChecks, Search, Loader2, AlertCircle, Check } from 'lucide-react';
import { AdminHeader } from '../../components/AdminHeader';
import { Dialog } from '../../components/Dialog';
import { Sidebar } from '../../components/Sidebar';
import { useDepartmentNames } from '../../hooks/useDepartmentOptions';
import {
  assessEmployeeCompetencies,
  getEmployeeCompetencyDetails,
  getGapAnalysisReport,
} from '../../lib/api/competencyFramework';
import { generateRecommendations } from '../../lib/api/trainingRecommendations';
import { PMCompetencyFramework } from './pm/PMCompetencyFramework';
import { readAdminSession } from '../../lib/adminSession';

type TabKey = 'report' | 'management';
type CompetencyStatus = 'Meets Requirement' | 'Below Requirement' | 'Not Yet Assessed';
type CompetencyGapStatus = 'Met' | 'Gap';

type EmployeeAssessment = {
  id: string;
  employeeNumber: string;
  employeeName: string;
  department: string;
  position: string;
  status: CompetencyStatus;
  missingCompetencies: number;
  assessedAt: string;
  assessor: string;
  competencies: {
    name: string;
    requiredLevel: number;
    employeeLevel: number;
    status: CompetencyGapStatus;
  }[];
};

const tabs: { key: TabKey; label: string }[] = [
  { key: 'report', label: 'Competency Gap Report' },
  { key: 'management', label: 'Competency Management' },
];

const statusOptions = ['All', 'Meets Requirement', 'Below Requirement', 'Not Yet Assessed'] as const;

export const CompetencyFrameworkPage = ({ isDashboardView = false }: { isDashboardView?: boolean }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('report');
  
  // Real Database States
  const [employees, setEmployees] = useState<EmployeeAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Details Modal States
  const [detailScores, setDetailScores] = useState<any[]>([]);
  const [detailSummary, setDetailSummary] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [recSuccess, setRecSuccess] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState('');

  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeAssessment | null>(null);
  const [filters, setFilters] = useState({
    department: 'All',
    position: 'All',
    employee: '',
    assessmentPeriod: 'All Periods',
    status: 'All',
  });

  // Dynamic Options
  const departmentNames = useDepartmentNames();
  const departmentOptions = useMemo(() => ['All', ...departmentNames], [departmentNames]);
  
  const positionOptions = useMemo(() => {
    const list = Array.from(new Set(employees.map((e) => e.position))).filter(Boolean);
    return ['All', ...list];
  }, [employees]);

  const assessmentPeriods = useMemo(() => {
    const list = Array.from(new Set(employees.map((e) => e.assessedAt))).filter(Boolean).map(date => {
      return date.substring(0, 7); // YYYY-MM
    });
    const uniquePeriods = Array.from(new Set(list));
    return ['All Periods', ...uniquePeriods];
  }, [employees]);

  const loadReport = async () => {
    setLoading(true);
    setError('');
    const res = await getGapAnalysisReport();
    if (res.ok && res.data) {
      setEmployees(res.data as EmployeeAssessment[]);
    } else {
      setError(res.error || 'Failed to load gap analysis report.');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'report') {
      void loadReport();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedEmployee) {
      setLoadingDetails(true);
      setErrorDetails('');
      setRecSuccess(null);
      getEmployeeCompetencyDetails(selectedEmployee.id)
        .then((res) => {
          if (res.ok) {
            setDetailScores(res.scores || []);
            setDetailSummary(res.summary);
          } else {
            setErrorDetails(res.error || 'Failed to load details.');
          }
        })
        .catch((err) => setErrorDetails(err instanceof Error ? err.message : (err as any)?.message ?? String(err)))
        .finally(() => setLoadingDetails(false));
    } else {
      setDetailScores([]);
      setDetailSummary(null);
    }
  }, [selectedEmployee]);

  const handleRunAssessment = async () => {
    if (!selectedEmployee) return;
    setAssessing(true);
    setErrorDetails('');
    setRecSuccess(null);
    const res = await assessEmployeeCompetencies(selectedEmployee.id);
    setAssessing(false);
    if (res.ok) {
      const det = await getEmployeeCompetencyDetails(selectedEmployee.id, res.data?.cycle_id);
      if (det.ok) {
        setDetailScores(det.scores || []);
        setDetailSummary(det.summary);
      }
      void loadReport();
    } else {
      setErrorDetails(res.error || 'AI Assessment failed.');
    }
  };

  const handleGenerateRecommendations = async () => {
    if (!selectedEmployee) return;
    const gaps = detailScores
      .filter((s) => s.status === 'Gap')
      .map((s) => ({ competency: s.name, gap: Math.max(s.requiredLevel - s.proficiencyLevel, 0) }));
    
    if (gaps.length === 0) {
      setRecSuccess('No competency gaps found to recommend training for.');
      return;
    }
    
    setRecommending(true);
    setRecSuccess(null);
    setErrorDetails('');
    const res = await generateRecommendations(selectedEmployee.id, gaps);
    setRecommending(false);
    if (res.ok) {
      setRecSuccess(`Successfully generated recommendations for ${res.upserted} scheduled course(s).`);
    } else {
      setErrorDetails(res.error || 'Failed to generate training recommendations.');
    }
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesDepartment = filters.department === 'All' || employee.department === filters.department;
      const matchesPosition = filters.position === 'All' || employee.position === filters.position;
      const matchesEmployee = !filters.employee || employee.employeeName.toLowerCase().includes(filters.employee.toLowerCase());
      const matchesStatus = filters.status === 'All' || employee.status === filters.status;
      return matchesDepartment && matchesPosition && matchesEmployee && matchesStatus;
    });
  }, [employees, filters]);

  const summaryCards = useMemo(() => {
    const totalEmployees = filteredEmployees.length;
    const employeesAssessed = filteredEmployees.filter((employee) => employee.status !== 'Not Yet Assessed').length;
    const employeesWithGaps = filteredEmployees.filter((employee) => employee.status === 'Below Requirement').length;
    const employeesMeetingRequirements = filteredEmployees.filter((employee) => employee.status === 'Meets Requirement').length;
    const pendingAssessment = filteredEmployees.filter((employee) => employee.status === 'Not Yet Assessed').length;

    return [
      { label: 'Total Employees', value: totalEmployees, tone: 'bg-blue-50 text-blue-700' },
      { label: 'Employees Assessed', value: employeesAssessed, tone: 'bg-emerald-50 text-emerald-700' },
      { label: 'Employees with Competency Gaps', value: employeesWithGaps, tone: 'bg-amber-50 text-amber-700' },
      { label: 'Employees Meeting Required Competencies', value: employeesMeetingRequirements, tone: 'bg-violet-50 text-violet-700' },
      { label: 'Employees Pending Assessment', value: pendingAssessment, tone: 'bg-slate-100 text-slate-700' },
    ];
  }, [filteredEmployees]);

  const session = readAdminSession();
  const isSuper = session?.role === 'super-admin';
  const userName = isSuper ? 'Super Admin' : 'PM Admin';
  const divisionLabel = isSuper ? 'System Administrator' : 'Performance Management';
  const sidebarRole = isSuper ? 'super-admin' : 'pm';
  const sidebarModule = isSuper ? 'Super' : 'PM';

  const content = (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-blue-700">
              <ListChecks size={22} />
              <span className="text-sm font-semibold uppercase tracking-[0.2em]">{isSuper ? 'Super Admin Module' : 'PM Module'}</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">Competency Framework</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Monitor employee competency gaps, manage position requirements, and maintain the shared competency library for HR administrators.
            </p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <p className="font-semibold">Workflow</p>
            <p>Assess employees → compare against position requirements → identify gaps → plan development.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'report' ? (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-5">
              <label className="text-sm text-slate-600">
                <span className="mb-2 block font-semibold">Department</span>
                <select value={filters.department} onChange={(event) => setFilters((prev) => ({ ...prev, department: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                <span className="mb-2 block font-semibold">Position</span>
                <select value={filters.position} onChange={(event) => setFilters((prev) => ({ ...prev, position: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  {positionOptions.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                <span className="mb-2 block font-semibold">Employee</span>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={filters.employee} onChange={(event) => setFilters((prev) => ({ ...prev, employee: event.target.value }))} placeholder="Search employee" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
              </label>
              <label className="text-sm text-slate-600">
                <span className="mb-2 block font-semibold">Assessment Period</span>
                <select value={filters.assessmentPeriod} onChange={(event) => setFilters((prev) => ({ ...prev, assessmentPeriod: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  {assessmentPeriods.map((period) => (
                    <option key={period} value={period}>
                      {period}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                <span className="mb-2 block font-semibold">Competency Status</span>
                <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((card) => (
              <div key={card.label} className={`rounded-2xl border border-slate-200 p-4 shadow-sm ${card.tone}`}>
                <p className="text-sm font-medium">{card.label}</p>
                <p className="mt-2 text-3xl font-semibold">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Competency Report</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">Department</th>
                    <th className="px-5 py-3">Position</th>
                    <th className="px-5 py-3">Overall Status</th>
                    <th className="px-5 py-3">Missing Competencies</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-500 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                          Loading report data...
                        </span>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-red-500 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <AlertCircle className="h-5 w-5" />
                          {error}
                        </span>
                      </td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-400 font-medium">
                        No employees found matching the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-semibold text-slate-900">{employee.employeeName}</td>
                        <td className="px-5 py-4 text-slate-600">{employee.department}</td>
                        <td className="px-5 py-4 text-slate-600">{employee.position}</td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${employee.status === 'Meets Requirement' ? 'bg-emerald-100 text-emerald-700' : employee.status === 'Below Requirement' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                            {employee.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-700">{employee.missingCompetencies}</td>
                        <td className="px-5 py-4">
                          <button type="button" onClick={() => setSelectedEmployee(employee)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
                            <Eye size={15} />
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <PMCompetencyFramework />
        </div>
      )}

      {selectedEmployee && (
        <Dialog open onClose={() => setSelectedEmployee(null)} title={`Competency Details · ${selectedEmployee.employeeName}`}>
          <div className="space-y-5">
            {errorDetails && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{errorDetails}</span>
              </div>
            )}
            
            {recSuccess && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                <Check className="h-4 w-4 flex-shrink-0" />
                <span>{recSuccess}</span>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Employee Information</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><span className="font-semibold text-slate-900">Employee ID:</span> {selectedEmployee.employeeNumber || '—'}</p>
                  <p><span className="font-semibold text-slate-900">Name:</span> {selectedEmployee.employeeName}</p>
                  <p><span className="font-semibold text-slate-900">Department:</span> {selectedEmployee.department}</p>
                  <p><span className="font-semibold text-slate-900">Position:</span> {selectedEmployee.position}</p>
                  <p><span className="font-semibold text-slate-900">Date Assessed:</span> {selectedEmployee.assessedAt || 'Pending'}</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assessment Summary</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><span className="font-semibold text-slate-900">Overall Status:</span> {selectedEmployee.status}</p>
                  <p><span className="font-semibold text-slate-900">Missing Competencies:</span> {selectedEmployee.missingCompetencies}</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={assessing || loadingDetails}
                      onClick={handleRunAssessment}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {assessing ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Assessing…
                        </>
                      ) : (
                        'Run Assessment'
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={recommending || loadingDetails || detailScores.length === 0 || !detailScores.some(s => s.status === 'Gap')}
                      onClick={handleGenerateRecommendations}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {recommending ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Recommending…
                        </>
                      ) : (
                        'Generate Recommendations'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {loadingDetails ? (
              <div className="flex items-center justify-center py-10 text-sm text-slate-500 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span>Loading competency details...</span>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Competency</th>
                        <th className="px-4 py-3">Required Level</th>
                        <th className="px-4 py-3">Employee Level</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {detailScores.map((competency) => (
                        <tr key={competency.name} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">{competency.name}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {competency.requiredLevel > 0 ? `Level ${competency.requiredLevel}` : 'No requirement configured'}
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">
                            {competency.proficiencyLevel > 0 ? `Level ${competency.proficiencyLevel}` : 'Not yet demonstrated'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              competency.status === 'Met'
                                ? 'bg-emerald-100 text-emerald-700'
                                : competency.status === 'Gap'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}>
                              {competency.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {detailScores.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                            No competency records found. Click "Run Assessment" to evaluate.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {detailSummary && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Demonstrated Strengths</p>
                      <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{detailSummary.strengths}</p>
                    </div>
                    
                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Areas for Improvement</p>
                      <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{detailSummary.improvements}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recommended Learning Interventions</p>
                      <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{detailSummary.recommendations}</p>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setSelectedEmployee(null)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Close</button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );

  if (isDashboardView) {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName={userName} divisionLabel={divisionLabel} />
      <div className="admin-layout">
        <Sidebar activeModule={sidebarModule} userRole={sidebarRole} />
        <main className="admin-content">
          {content}
        </main>
      </div>
    </div>
  );
};
