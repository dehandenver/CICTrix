import {
    CheckCircle2,
    Download,
    FileSpreadsheet,
    Mail,
    MoreVertical,
    Search,
    UserPlus,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    downloadTextFile,
    ensureRecruitmentSeedData,
    formatPHDate,
    formatPHDateTime,
    generateEmployeeId,
    getEmployeeRecords,
    getNewlyHired,
    saveEmployeeRecords,
    saveNewlyHired,
    toCsv,
} from '../lib/recruitmentData';
import { NewlyHired, NewlyHiredStatus } from '../types/recruitment.types';
import { RecruitmentNavigationGuide } from './RecruitmentNavigationGuide';
import { Sidebar } from './Sidebar';

const STATUS_OPTIONS: NewlyHiredStatus[] = [
  'Pending Onboarding',
  'In Onboarding',
  'Onboarding Complete',
  'Deployed',
];

const STATUS_COLORS: Record<NewlyHiredStatus, string> = {
  'Pending Onboarding': 'bg-slate-100 text-slate-700',
  'In Onboarding': 'bg-blue-100 text-blue-700',
  'Onboarding Complete': 'bg-green-100 text-green-700',
  Deployed: 'bg-violet-100 text-violet-700',
};

export const NewlyHiredPage = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<NewlyHired[]>([]);
  const [statusTab, setStatusTab] = useState<'All' | NewlyHiredStatus>('All');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeRow, setActiveRow] = useState<NewlyHired | null>(null);
  const [activeTab, setActiveTab] = useState<'Personal' | 'Checklist' | 'Documents' | 'Timeline'>('Personal');
  const [showGuide, setShowGuide] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [deployForm, setDeployForm] = useState({
    deploymentDate: '',
    department: '',
    supervisor: '',
    employeeId: '',
  });

  useEffect(() => {
    ensureRecruitmentSeedData();
    setRows(getNewlyHired());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const departments = useMemo(() => Array.from(new Set(rows.map((row) => row.department))), [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesStatus = statusTab === 'All' || row.status === statusTab;
        const matchesDepartment = departmentFilter === 'all' || row.department === departmentFilter;
        const fullName = `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`.toLowerCase();
        const matchesSearch =
          !search ||
          `${fullName} ${row.employeeId ?? ''} ${row.position}`.toLowerCase().includes(search.toLowerCase());
        return matchesStatus && matchesDepartment && matchesSearch;
      }),
    [rows, statusTab, departmentFilter, search]
  );

  const counts = useMemo(() => {
    const inMonth = rows.filter((row) => {
      const date = new Date(row.dateHired);
      return date.getMonth() === 2 && date.getFullYear() === 2026;
    }).length;

    return {
      thisMonth: inMonth,
      pending: rows.filter((row) => row.status === 'Pending Onboarding').length,
      inOnboarding: rows.filter((row) => row.status === 'In Onboarding').length,
      readyDeploy: rows.filter((row) => row.status === 'Onboarding Complete').length,
    };
  }, [rows]);

  const updateRows = (nextRows: NewlyHired[]) => {
    setRows(nextRows);
    saveNewlyHired(nextRows);
  };

  const toggleChecklistItem = (rowId: string, itemIndex: number, completedBy = 'HR Coordinator') => {
    const now = new Date().toISOString();
    const nextRows = rows.map((row) => {
      if (row.id !== rowId) return row;
      const nextChecklist = row.onboardingChecklist.map((item, index) =>
        index !== itemIndex
          ? item
          : {
              ...item,
              completed: !item.completed,
              completedDate: !item.completed ? now : undefined,
              completedBy: !item.completed ? completedBy : undefined,
            }
      );
      const completedCount = nextChecklist.filter((entry) => entry.completed).length;
      const progress = Math.round((completedCount / nextChecklist.length) * 100);
      const status: NewlyHiredStatus =
        progress >= 100 ? 'Onboarding Complete' : progress > 0 ? 'In Onboarding' : 'Pending Onboarding';
      return {
        ...row,
        onboardingChecklist: nextChecklist,
        onboardingProgress: progress,
        status,
        timeline: [...row.timeline, { event: 'Onboarding checklist updated', date: now, actor: completedBy }],
      };
    });
    updateRows(nextRows);
  };

  const openDeploy = (row: NewlyHired) => {
    setActiveRow(row);
    setDeployForm({
      deploymentDate: row.expectedStartDate.slice(0, 10),
      department: row.department,
      supervisor: row.supervisor ?? '',
      employeeId: row.employeeId ?? generateEmployeeId(getEmployeeRecords().length + 100),
    });
    setShowDeployModal(true);
  };

  const confirmDeployment = () => {
    if (!activeRow) return;
    const now = new Date().toISOString();
    const nextRows = rows.map((row) =>
      row.id === activeRow.id
        ? {
            ...row,
            status: 'Deployed' as NewlyHiredStatus,
            onboardingProgress: 100,
            deployedDate: new Date(deployForm.deploymentDate).toISOString(),
            employeeId: deployForm.employeeId,
            department: deployForm.department,
            supervisor: deployForm.supervisor,
            timeline: [...row.timeline, { event: 'Employee deployed to department', date: now, actor: 'HR Manager' }],
          }
        : row
    );

    const employeeRecords = getEmployeeRecords();
    if (!employeeRecords.some((record) => record.employeeId === deployForm.employeeId)) {
      employeeRecords.push({
        id: crypto.randomUUID(),
        employeeId: deployForm.employeeId,
        name: `${activeRow.employeeInfo.firstName} ${activeRow.employeeInfo.lastName}`,
        position: activeRow.position,
        department: deployForm.department,
        division: activeRow.division,
        startDate: new Date(deployForm.deploymentDate).toISOString(),
      });
      saveEmployeeRecords(employeeRecords);
    }

    updateRows(nextRows);
    setShowDeployModal(false);
    setToast('Employee deployed and synced to employee records.');
  };

  const exportRows = () => {
    const csv = toCsv(
      ['Name', 'Position', 'Department', 'Date Hired', 'Expected Start', 'Progress', 'Status'],
      filteredRows.map((row) => [
        `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`,
        row.position,
        row.department,
        formatPHDate(row.dateHired),
        formatPHDate(row.expectedStartDate),
        row.onboardingProgress,
        row.status,
      ])
    );
    downloadTextFile('newly-hired.csv', csv, 'text/csv;charset=utf-8');
    setToast('Export completed (CSV).');
  };

  const allSelected = filteredRows.length > 0 && selectedIds.length === filteredRows.length;

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Newly Hired Employees</h1>
            <p className="text-slate-600">Onboarding and pre-deployment management</p>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={() => navigate('/admin/rsp/qualified')}>
              Import From Applicants
            </button>
            <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setShowGuide(true)}>
              How to Navigate
            </button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => setToast('Manual add form is available in the detailed modal flow.')}>
              <UserPlus className="mr-1 inline h-4 w-4" /> Add New Hire
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[{ label: 'This Month', value: `${counts.thisMonth} new hires` }, { label: 'Pending Onboarding', value: counts.pending }, { label: 'In Onboarding', value: counts.inOnboarding }, { label: 'Ready to Deploy', value: counts.readyDeploy }].map((card) => (
            <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
            </article>
          ))}
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {(['All', ...STATUS_OPTIONS] as Array<'All' | NewlyHiredStatus>).map((status) => (
              <button
                key={status}
                className={`rounded-full px-3 py-1 text-sm ${statusTab === status ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                onClick={() => setStatusTab(status)}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
              <option value="all">All Departments</option>
              {departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
            </select>
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" placeholder="Search name, employee ID, position" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setToast('Onboarding email sent to selected hires.')}>Send Onboarding Email</button>
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={exportRows}><FileSpreadsheet className="mr-1 inline h-4 w-4" />Export to Excel</button>
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => setSelectedIds(event.target.checked ? filteredRows.map((row) => row.id) : [])}
                    />
                  </th>
                  <th className="px-3 py-3">Employee</th>
                  <th className="px-3 py-3">Position & Department</th>
                  <th className="px-3 py-3">Date Hired</th>
                  <th className="px-3 py-3">Expected Start Date</th>
                  <th className="px-3 py-3">Onboarding Progress</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const fullName = `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`;
                  return (
                    <tr key={row.id} className="border-t border-slate-100">
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
                      <td className="px-3 py-3 font-medium text-slate-900">{fullName}</td>
                      <td className="px-3 py-3 text-slate-600">
                        <p>{row.position}</p>
                        <p className="text-xs text-slate-500">{row.department}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{formatPHDate(row.dateHired)}</td>
                      <td className="px-3 py-3 text-slate-600">{formatPHDate(row.expectedStartDate)}</td>
                      <td className="px-3 py-3">
                        <div className="w-36">
                          <div className="mb-1 h-2 rounded-full bg-slate-200">
                            <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${row.onboardingProgress}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{row.onboardingProgress}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[row.status]}`}>{row.status}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative">
                          <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}>
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuId === row.id && (
                            <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                              <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { setActiveRow(row); setOpenMenuId(null); }}>View Details</button>
                              <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { setActiveRow(row); setActiveTab('Checklist'); setOpenMenuId(null); }}>Update Progress</button>
                              <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { setToast('Employment contract generated.'); setOpenMenuId(null); }}>Generate Employment Contract</button>
                              <button className="block w-full rounded px-2 py-1 text-left text-violet-700 hover:bg-violet-50" onClick={() => { openDeploy(row); setOpenMenuId(null); }}>Mark As Deployed</button>
                              <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { setToast('Documents download started.'); setOpenMenuId(null); }}>Download Documents</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredRows.length === 0 && (
            <div className="p-10 text-center text-slate-500">
              <CheckCircle2 className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-2 font-medium">No newly hired records found.</p>
            </div>
          )}
        </section>
      </main>

      <RecruitmentNavigationGuide open={showGuide} onClose={() => setShowGuide(false)} />

      {activeRow && (
        <div className="fixed inset-0 z-[130] bg-slate-900/70 p-4" onClick={() => setActiveRow(null)}>
          <div className="mx-auto h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{activeRow.employeeInfo.firstName} {activeRow.employeeInfo.lastName}</h2>
                <p className="text-sm text-slate-500">{activeRow.position} • {activeRow.department} • {activeRow.onboardingProgress}%</p>
              </div>
              <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setActiveRow(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-4 border-b border-slate-200 text-sm">
              {['Personal', 'Checklist', 'Documents', 'Timeline'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`px-3 py-2 text-left ${activeTab === tab ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-slate-500'}`}
                  onClick={() => setActiveTab(tab as 'Personal' | 'Checklist' | 'Documents' | 'Timeline')}
                >
                  {tab === 'Personal' ? 'Personal Information' : tab === 'Checklist' ? 'Onboarding Checklist' : tab === 'Documents' ? 'Documents' : 'Notes & Timeline'}
                </button>
              ))}
            </div>

            <div className="px-6 py-5">
              {activeTab === 'Personal' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900">Employee Details</h3>
                    <p className="mt-2 text-sm text-slate-700">Name: {activeRow.employeeInfo.firstName} {activeRow.employeeInfo.lastName}</p>
                    <p className="text-sm text-slate-700">Email: {activeRow.employeeInfo.email}</p>
                    <p className="text-sm text-slate-700">Phone: {activeRow.employeeInfo.phone}</p>
                    <p className="text-sm text-slate-700">Emergency Contact: {activeRow.employeeInfo.emergencyContact.name}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900">Employment Details</h3>
                    <p className="mt-2 text-sm text-slate-700">Position: {activeRow.position}</p>
                    <p className="text-sm text-slate-700">Department: {activeRow.department}</p>
                    <p className="text-sm text-slate-700">Employment Type: {activeRow.employmentType}</p>
                    <p className="text-sm text-slate-700">Date Hired: {formatPHDate(activeRow.dateHired)}</p>
                    <p className="text-sm text-slate-700">Expected Start Date: {formatPHDate(activeRow.expectedStartDate)}</p>
                  </div>
                </div>
              )}

              {activeTab === 'Checklist' && (
                <div className="space-y-3">
                  {activeRow.onboardingChecklist.map((item, index) => (
                    <label key={`${item.item}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={item.completed} onChange={() => toggleChecklistItem(activeRow.id, index)} />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{item.item}</p>
                          <p className="text-xs text-slate-500">{item.category}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">{item.completedDate ? `${formatPHDateTime(item.completedDate)} • ${item.completedBy}` : 'Pending'}</p>
                    </label>
                  ))}
                </div>
              )}

              {activeTab === 'Documents' && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {activeRow.documents.map((doc) => (
                    <article key={`${doc.type}-${doc.url}`} className="rounded-xl border border-slate-200 p-4">
                      <p className="font-semibold text-slate-900">{doc.type}</p>
                      <p className="mt-1 text-xs text-slate-500">{doc.verified ? 'Verified' : 'Pending verification'}</p>
                      <div className="mt-3 flex gap-2">
                        <button className="rounded-lg border border-slate-300 px-2 py-1 text-sm"><Download className="inline h-4 w-4" /> Download</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {activeTab === 'Timeline' && (
                <div className="space-y-3">
                  {activeRow.timeline.map((entry, index) => (
                    <article key={`${entry.event}-${index}`} className="rounded-xl border border-slate-200 p-3">
                      <p className="font-semibold text-slate-900">{entry.event}</p>
                      <p className="text-sm text-slate-600">{formatPHDateTime(entry.date)} • {entry.actor}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-6 py-4">
              <div className="flex gap-2">
                <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setToast('Onboarding email sent to employee.')}><Mail className="mr-1 inline h-4 w-4" />Send Email</button>
                <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setToast('Employment contract downloaded.')}><Download className="mr-1 inline h-4 w-4" />Download Contract</button>
              </div>
              <button className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white" onClick={() => openDeploy(activeRow)}>
                Mark As Deployed
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeployModal && activeRow && (
        <div className="fixed inset-0 z-[140] bg-slate-900/70 p-4" onClick={() => setShowDeployModal(false)}>
          <div className="mx-auto mt-20 w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900">Confirm Deployment</h2>
            <p className="text-sm text-slate-500">Finalize deployment and sync to employee database.</p>

            <div className="mt-4 space-y-3">
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={deployForm.deploymentDate} onChange={(event) => setDeployForm({ ...deployForm, deploymentDate: event.target.value })} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={deployForm.department} onChange={(event) => setDeployForm({ ...deployForm, department: event.target.value })} placeholder="Assigned Department" />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={deployForm.supervisor} onChange={(event) => setDeployForm({ ...deployForm, supervisor: event.target.value })} placeholder="Assigned Supervisor" />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={deployForm.employeeId} onChange={(event) => setDeployForm({ ...deployForm, employeeId: event.target.value })} placeholder="Employee ID" />

              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked readOnly /> Notify employee via email</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked readOnly /> Notify department head</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked readOnly /> Notify supervisor</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked readOnly /> Add to employee master list</label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setShowDeployModal(false)}>Cancel</button>
              <button className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white" onClick={confirmDeployment}>Confirm Deployment</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
};
