import { useState, type ReactNode } from 'react';
import {
  Briefcase,
  Plus,
  Users,
  AlertTriangle,
  CalendarClock,
  Award,
  Clock,
  BookOpen,
  Upload,
  Settings,
  FileText,
  UserCheck,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import { Button } from './Button';

type TabKey = 'planning' | 'critical' | 'registry';

type CriticalPosition = {
  id: string;
  title: string;
  department: string;
  incumbent: string;
  experienceYears: number;
  trainingHours: number;
  eligibility: string;
  courses: string[];
  footer: string;
};

type PositionForm = {
  title: string;
  department: string;
  incumbent: string;
  incumbentStatus: 'Active' | 'On Leave' | 'Retiring';
  statusDetail: string;
  yearsExperience: string;
  trainingHours: string;
  civilServiceEligibility: string;
  courses: string;
  includeInPlanning: boolean;
};

const blankPositionForm = (): PositionForm => ({
  title: 'New Position',
  department: 'Administration',
  incumbent: 'Vacant',
  incumbentStatus: 'Active',
  statusDetail: 'Newly created',
  yearsExperience: '3',
  trainingHours: '40',
  civilServiceEligibility: 'Career Service Professional (R.A. 1080)',
  courses: 'BS Psychology\nBS Human Resource Development Management',
  includeInPlanning: true,
});

const DEPARTMENTS = [
  'Human Resources',
  'Administration',
  'Information Technology',
  'Finance',
  'Operations',
];

const INITIAL_POSITIONS: CriticalPosition[] = [
  {
    id: 'hr-officer-iv',
    title: 'HR Officer IV',
    department: 'Human Resources',
    incumbent: 'Atty. Elena R. Mercado',
    experienceYears: 3,
    trainingHours: 80,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: ['BS Psychology', 'BS Human Resource Development Management', 'AB Behavioral Science'],
    footer: 'Retirement effective 2026-08-31',
  },
  {
    id: 'municipal-administrator',
    title: 'Municipal Administrator',
    department: 'Administration',
    incumbent: 'Mr. Roberto S. Lim',
    experienceYears: 5,
    trainingHours: 120,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: ['Master in Public Administration', 'MA Local Governance', 'MS Public Management'],
    footer: 'Currently in role',
  },
  {
    id: 'it-division-chief',
    title: 'IT Division Chief',
    department: 'Information Technology',
    incumbent: 'Engr. Roberto P. Aquino',
    experienceYears: 8,
    trainingHours: 96,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: ['BS Computer Science', 'BS Information Technology', 'MS Information Systems'],
    footer: 'Medical leave until 2026-06-15',
  },
  {
    id: 'finance-director',
    title: 'Finance Director',
    department: 'Finance',
    incumbent: 'Mr. Antonio V. delos Reyes',
    experienceYears: 10,
    trainingHours: 140,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: ['BS Accountancy', 'BS Management Accounting', 'CPA'],
    footer: 'Retirement effective 2027-01-15',
  },
  {
    id: 'drrm-officer',
    title: 'DRRM Officer',
    department: 'Operations',
    incumbent: 'Mr. Felipe S. Garcia',
    experienceYears: 5,
    trainingHours: 80,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: ['BS Disaster Risk Management', 'BS Environmental Science', 'BS Geology'],
    footer: 'Currently in role',
  },
  {
    id: 'new-position-1',
    title: 'New Position',
    department: 'Administration',
    incumbent: 'Vacant',
    experienceYears: 3,
    trainingHours: 40,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: [],
    footer: 'Newly created',
  },
];

type SuccessorStatus = 'designated' | 'promoted' | 'vacated';

type Successor = {
  id: string;
  name: string;
  initials: string;
  currentPosition: string;
  targetPositionId: string;
  readinessScore: number;
  readiness: 'Ready Now' | '1-2 Years' | '3-5 Years';
  status: SuccessorStatus;
};

const INITIAL_SUCCESSORS: Successor[] = [
  {
    id: 's-1',
    name: 'Ashley Johnson',
    initials: 'AJ',
    currentPosition: 'Senior Recruiter',
    targetPositionId: 'hr-officer-iv',
    readinessScore: 92,
    readiness: 'Ready Now',
    status: 'designated',
  },
  {
    id: 's-2',
    name: 'Michael Ross',
    initials: 'MR',
    currentPosition: 'Compensation Specialist',
    targetPositionId: 'hr-officer-iv',
    readinessScore: 78,
    readiness: '1-2 Years',
    status: 'designated',
  },
  {
    id: 's-3',
    name: 'Maria Rodriguez',
    initials: 'MR',
    currentPosition: 'IT Division Head',
    targetPositionId: 'it-division-chief',
    readinessScore: 85,
    readiness: 'Ready Now',
    status: 'designated',
  },
  {
    id: 's-4',
    name: 'Joseph Tan',
    initials: 'JT',
    currentPosition: 'Senior Systems Analyst',
    targetPositionId: 'it-division-chief',
    readinessScore: 71,
    readiness: '1-2 Years',
    status: 'designated',
  },
  {
    id: 's-5',
    name: 'Carmela Reyes',
    initials: 'CR',
    currentPosition: 'Assistant Administrator',
    targetPositionId: 'municipal-administrator',
    readinessScore: 88,
    readiness: 'Ready Now',
    status: 'designated',
  },
  {
    id: 's-6',
    name: 'Daniel Lim',
    initials: 'DL',
    currentPosition: 'Budget Officer',
    targetPositionId: 'finance-director',
    readinessScore: 74,
    readiness: '1-2 Years',
    status: 'designated',
  },
  {
    id: 's-7',
    name: 'Patricia Santos',
    initials: 'PS',
    currentPosition: 'Senior Accountant',
    targetPositionId: 'finance-director',
    readinessScore: 63,
    readiness: '3-5 Years',
    status: 'designated',
  },
  {
    id: 's-8',
    name: 'Ramon Cruz',
    initials: 'RC',
    currentPosition: 'Emergency Response Lead',
    targetPositionId: 'drrm-officer',
    readinessScore: 91,
    readiness: 'Ready Now',
    status: 'promoted',
  },
  {
    id: 's-9',
    name: 'Jose Bautista',
    initials: 'JB',
    currentPosition: 'Field Operations Supervisor',
    targetPositionId: 'drrm-officer',
    readinessScore: 67,
    readiness: '1-2 Years',
    status: 'vacated',
  },
];

export const SuccessionPlanningPage = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('planning');
  const [replacementType, setReplacementType] = useState<'permanent' | 'temporary'>('permanent');
  const [department, setDepartment] = useState<string>('');
  const [criticalPosition, setCriticalPosition] = useState<string>('');
  const [positions, setPositions] = useState<CriticalPosition[]>(INITIAL_POSITIONS);
  const [successors] = useState<Successor[]>(INITIAL_SUCCESSORS);
  const [registryFilter, setRegistryFilter] = useState<'all' | SuccessorStatus>('all');

  const selectedPositionObj = positions.find(p => p.title === criticalPosition);
  const successorsForSelected = selectedPositionObj
    ? successors.filter(s => s.targetPositionId === selectedPositionObj.id)
    : [];

  const designatedCount = successors.filter(s => s.status === 'designated').length;
  const promotedCount = successors.filter(s => s.status === 'promoted').length;
  const vacatedCount = successors.filter(s => s.status === 'vacated').length;
  const readyNowCount = successors.filter(s => s.readinessScore >= 90 && s.status === 'designated').length;
  const successorPoolCount = successors.filter(s => s.readinessScore >= 60 && s.status === 'designated').length;
  const retiringSoonCount = positions.filter(p => /retirement/i.test(p.footer)).length;

  const filteredRegistry = registryFilter === 'all'
    ? successors
    : successors.filter(s => s.status === registryFilter);

  const [addPositionOpen, setAddPositionOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [positionForm, setPositionForm] = useState<PositionForm>(blankPositionForm());

  const positionTitlesInDept = positions
    .filter(p => !department || p.department === department)
    .map(p => p.title);

  const openAddPosition = () => {
    setEditingId(null);
    setPositionForm(blankPositionForm());
    setAddPositionOpen(true);
  };

  const openEditPosition = (id: string) => {
    const p = positions.find(x => x.id === id);
    if (!p) return;
    setEditingId(id);
    setPositionForm({
      title: p.title,
      department: p.department,
      incumbent: p.incumbent,
      incumbentStatus: 'Active',
      statusDetail: p.footer,
      yearsExperience: String(p.experienceYears),
      trainingHours: String(p.trainingHours),
      civilServiceEligibility: p.eligibility,
      courses: p.courses.join('\n'),
      includeInPlanning: true,
    });
    setAddPositionOpen(true);
  };

  const closeAddPosition = () => setAddPositionOpen(false);

  const updateForm = <K extends keyof PositionForm>(key: K, value: PositionForm[K]) => {
    setPositionForm(prev => ({ ...prev, [key]: value }));
  };

  const savePosition = () => {
    const courses = positionForm.courses
      .split('\n')
      .map(c => c.trim())
      .filter(Boolean);

    const next: CriticalPosition = {
      id: editingId ?? `pos-${Date.now()}`,
      title: positionForm.title || 'New Position',
      department: positionForm.department,
      incumbent: positionForm.incumbent,
      experienceYears: Number(positionForm.yearsExperience) || 0,
      trainingHours: Number(positionForm.trainingHours) || 0,
      eligibility: positionForm.civilServiceEligibility,
      courses,
      footer: positionForm.statusDetail,
    };

    setPositions(prev => {
      if (editingId) return prev.map(p => (p.id === editingId ? next : p));
      return [...prev, next];
    });
    setAddPositionOpen(false);
  };

  const deletePosition = () => {
    if (!editingId) return;
    setPositions(prev => prev.filter(p => p.id !== editingId));
    setAddPositionOpen(false);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'planning', label: 'Succession Planning' },
    { key: 'critical', label: 'Critical Positions' },
    { key: 'registry', label: 'Successor Registry' },
  ];

  return (
    <div className="space-y-6">
      {/* Page header with right-aligned tab pills */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Succession Planning</h1>
          <p className="text-sm text-gray-500 mt-1">
            Dynamic competency-based system. Standards come from the Critical Position table.
          </p>
        </div>
        <div className="inline-flex bg-gray-100 rounded-lg p-1 self-start">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'planning' && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<AlertTriangle size={18} />}
              iconBg="bg-red-50 text-red-500"
              tag="Active standards"
              value={positions.length}
              label="Critical Positions"
            />
            <StatCard
              icon={<CalendarClock size={18} />}
              iconBg="bg-orange-50 text-orange-500"
              tag="From standards"
              value={retiringSoonCount}
              label="Retiring Soon"
            />
            <StatCard
              icon={<Award size={18} />}
              iconBg="bg-green-50 text-green-600"
              tag="Score ≥ 90"
              value={readyNowCount}
              label="Ready Now"
            />
            <StatCard
              icon={<Users size={18} />}
              iconBg="bg-blue-50 text-blue-600"
              tag="Score ≥ 60"
              value={successorPoolCount}
              label="Successor Pool"
            />
          </div>

          {/* Replacement selector card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {replacementType === 'permanent' ? 'Permanent Replacement' : 'Temporary Replacement'}
                </h3>
                <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                  {replacementType === 'permanent'
                    ? 'Cross-department · Non-negotiables: required trainings, years of experience, and civil service eligibility.'
                    : 'Within-department · Interim coverage while the incumbent is on leave or detail.'}
                </p>
              </div>
              <div className="inline-flex bg-gray-50 border border-gray-200 rounded-lg p-1 shrink-0">
                <button
                  onClick={() => setReplacementType('permanent')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                    replacementType === 'permanent'
                      ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Permanent
                </button>
                <button
                  onClick={() => setReplacementType('temporary')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                    replacementType === 'temporary'
                      ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Temporary
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  <Briefcase size={14} /> Department
                </label>
                <select
                  value={department}
                  onChange={(e) => { setDepartment(e.target.value); setCriticalPosition(''); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  <Briefcase size={14} /> Critical Position
                </label>
                <select
                  value={criticalPosition}
                  onChange={(e) => setCriticalPosition(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select critical position...</option>
                  {positionTitlesInDept.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Selection results */}
          {criticalPosition && selectedPositionObj ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selectedPositionObj.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedPositionObj.department} · Incumbent: {selectedPositionObj.incumbent}
                  </p>
                </div>
                <span className="text-xs text-gray-500">
                  {successorsForSelected.length} candidate{successorsForSelected.length === 1 ? '' : 's'}
                </span>
              </div>
              {successorsForSelected.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  No successor candidates assigned to this position yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {successorsForSelected.map(s => (
                    <SuccessorRow key={s.id} successor={s} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 text-gray-400 mb-3">
                <Briefcase size={22} />
              </div>
              <p className="text-sm text-gray-500">
                Select a department and critical position to view successor candidates.
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === 'critical' && (
        <>
          {/* Management header card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Critical Position Management</h3>
              <p className="text-sm text-gray-500 mt-1">
                Define qualification standards. Only positions marked critical appear in succession planning.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" className="flex items-center gap-2">
                <Upload size={16} /> Import Standards
              </Button>
              <Button onClick={openAddPosition} className="flex items-center gap-2">
                <Plus size={16} /> Add Position
              </Button>
            </div>
          </div>

          {/* Position cards grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {positions.map(p => (
              <PositionCard key={p.id} position={p} onEdit={() => openEditPosition(p.id)} />
            ))}
          </div>
        </>
      )}

      {activeTab === 'registry' && (
        <>
          {/* Registry header */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Successor Registry</h3>
              <p className="text-sm text-gray-500 mt-1">
                Repository of designated successors. Promote when the incumbent retires, resigns, or vacates the post.
              </p>
            </div>
            <Button variant="secondary" className="flex items-center gap-2 shrink-0">
              <FileText size={16} /> Print / Export
            </Button>
          </div>

          {/* Registry stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<UserCheck size={18} />}
              iconBg="bg-blue-50 text-blue-600"
              tag="Awaiting vacancy"
              value={designatedCount}
              label="Designated"
            />
            <StatCard
              icon={<CheckCircle2 size={18} />}
              iconBg="bg-green-50 text-green-600"
              tag="Already filled"
              value={promotedCount}
              label="Promoted"
            />
            <StatCard
              icon={<XCircle size={18} />}
              iconBg="bg-red-50 text-red-500"
              tag="Superseded / removed"
              value={vacatedCount}
              label="Vacated"
            />
          </div>

          {/* Filter pills */}
          <div className="flex gap-2">
            {(['all', 'designated', 'promoted', 'vacated'] as const).map(f => (
              <button
                key={f}
                onClick={() => setRegistryFilter(f)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition ${
                  registryFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Registry table */}
          {filteredRegistry.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16 px-6 text-center text-sm text-gray-500">
              No successors in this category.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Current Position</th>
                    <th className="px-5 py-3 font-semibold">Target Critical Role</th>
                    <th className="px-5 py-3 font-semibold">Readiness</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRegistry.map(s => {
                    const target = positions.find(p => p.id === s.targetPositionId);
                    return (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                              {s.initials}
                            </div>
                            <span className="font-semibold text-gray-900">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{s.currentPosition}</td>
                        <td className="px-5 py-3 text-gray-900 font-medium">
                          {target?.title ?? '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  s.readinessScore >= 85 ? 'bg-green-500'
                                  : s.readinessScore >= 70 ? 'bg-yellow-500'
                                  : 'bg-orange-500'
                                }`}
                                style={{ width: `${s.readinessScore}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-gray-700">{s.readinessScore}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={s.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {addPositionOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeAddPosition}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-6 pb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingId ? 'Edit Critical Position' : 'Add Critical Position'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Update qualification standards. Changes apply immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddPosition}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 pb-4 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Position Title">
                  <input
                    type="text"
                    value={positionForm.title}
                    onChange={(e) => updateForm('title', e.target.value)}
                    className="form-input"
                  />
                </FormField>
                <FormField label="Department">
                  <input
                    type="text"
                    value={positionForm.department}
                    onChange={(e) => updateForm('department', e.target.value)}
                    className="form-input"
                  />
                </FormField>
                <FormField label="Incumbent">
                  <input
                    type="text"
                    value={positionForm.incumbent}
                    onChange={(e) => updateForm('incumbent', e.target.value)}
                    className="form-input"
                  />
                </FormField>
                <FormField label="Incumbent Status">
                  <select
                    value={positionForm.incumbentStatus}
                    onChange={(e) => updateForm('incumbentStatus', e.target.value as PositionForm['incumbentStatus'])}
                    className="form-input bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Retiring">Retiring</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Status Detail">
                <input
                  type="text"
                  value={positionForm.statusDetail}
                  onChange={(e) => updateForm('statusDetail', e.target.value)}
                  className="form-input"
                />
              </FormField>

              <FormField label="Required Years of Experience">
                <input
                  type="number"
                  min={0}
                  value={positionForm.yearsExperience}
                  onChange={(e) => updateForm('yearsExperience', e.target.value)}
                  className="form-input"
                />
              </FormField>

              <FormField label="Required Training Hours">
                <input
                  type="number"
                  min={0}
                  value={positionForm.trainingHours}
                  onChange={(e) => updateForm('trainingHours', e.target.value)}
                  className="form-input"
                />
              </FormField>

              <FormField label="Required Civil Service Eligibility">
                <input
                  type="text"
                  value={positionForm.civilServiceEligibility}
                  onChange={(e) => updateForm('civilServiceEligibility', e.target.value)}
                  className="form-input"
                />
              </FormField>

              <FormField label="Required Courses (one per line)">
                <textarea
                  rows={4}
                  value={positionForm.courses}
                  onChange={(e) => updateForm('courses', e.target.value)}
                  className="form-input font-mono text-sm resize-y"
                />
              </FormField>

              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                  Critical Status
                </p>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={positionForm.includeInPlanning}
                    onChange={(e) => updateForm('includeInPlanning', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Include this position in succession planning
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200">
              {editingId ? (
                <button
                  type="button"
                  onClick={deletePosition}
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Delete position
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={closeAddPosition}>Cancel</Button>
                <Button onClick={savePosition}>Save changes</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .form-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #d1d5db;
          padding: 0.5rem 0.75rem;
          outline: none;
        }
        .form-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f6;
        }
      `}</style>
    </div>
  );
};

type StatCardProps = {
  icon: ReactNode;
  iconBg: string;
  tag: string;
  value: number | string;
  label: string;
};

const StatCard = ({ icon, iconBg, tag, value, label }: StatCardProps) => (
  <div className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex items-start justify-between mb-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
      <span className="text-xs text-gray-500">{tag}</span>
    </div>
    <p className="text-3xl font-bold text-gray-900 leading-tight">{value}</p>
    <p className="text-sm text-gray-500 mt-1">{label}</p>
  </div>
);

type PositionCardProps = {
  position: CriticalPosition;
  onEdit: () => void;
};

const PositionCard = ({ position, onEdit }: PositionCardProps) => (
  <div className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex items-start justify-between mb-1">
      <div className="flex items-center gap-2">
        <h4 className="text-base font-bold text-gray-900">{position.title}</h4>
        <span className="bg-red-50 text-red-600 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
          Critical
        </span>
      </div>
      <button className="text-xs font-medium text-gray-600 border border-gray-200 rounded-md px-2.5 py-1 hover:bg-gray-50">
        Unmark
      </button>
    </div>
    <p className="text-sm text-gray-500 mb-4">
      {position.department} · Incumbent: {position.incumbent}
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      <InfoPill icon={<Clock size={14} />} label="Experience:" value={`${position.experienceYears} yrs`} />
      <InfoPill
        icon={<Award size={14} />}
        label="Eligibility:"
        value={position.eligibility}
      />
      <InfoPill icon={<BookOpen size={14} />} label="Training Hours:" value={`${position.trainingHours} hrs`} />
    </div>

    <div className="mb-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        <BookOpen size={13} /> Required Course
      </div>
      <div className="flex flex-wrap gap-2">
        {position.courses.length === 0 ? (
          <span className="text-xs text-gray-400 italic">No courses specified</span>
        ) : (
          position.courses.map(c => (
            <span key={c} className="text-xs text-gray-700 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md">
              {c}
            </span>
          ))
        )}
      </div>
    </div>

    <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
      <span className="text-gray-500">{position.footer}</span>
      <button
        onClick={onEdit}
        className="flex items-center gap-1 text-blue-600 font-medium hover:text-blue-700"
      >
        <Settings size={12} /> Click to edit
      </button>
    </div>
  </div>
);

type InfoPillProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

const InfoPill = ({ icon, label, value }: InfoPillProps) => (
  <div className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 text-xs">
    <span className="text-gray-400 mt-0.5">{icon}</span>
    <span className="text-gray-500">{label}</span>
    <span className="text-gray-900 font-medium">{value}</span>
  </div>
);

type FormFieldProps = {
  label: string;
  children: ReactNode;
};

const FormField = ({ label, children }: FormFieldProps) => (
  <div>
    <label className="block text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1.5">
      {label}
    </label>
    {children}
  </div>
);

const readinessStyle = (score: number) => {
  if (score >= 85) return { bar: 'bg-green-500', text: 'text-green-700', pill: 'bg-green-100 text-green-700' };
  if (score >= 70) return { bar: 'bg-yellow-500', text: 'text-yellow-700', pill: 'bg-yellow-100 text-yellow-700' };
  return { bar: 'bg-orange-500', text: 'text-orange-700', pill: 'bg-orange-100 text-orange-700' };
};

const SuccessorRow = ({ successor }: { successor: Successor }) => {
  const s = readinessStyle(successor.readinessScore);
  return (
    <div className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-300 transition">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
          {successor.initials}
        </div>
        <div>
          <p className="font-semibold text-gray-900 leading-tight">{successor.name}</p>
          <p className="text-xs text-gray-500">{successor.currentPosition} · {successor.readiness}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2">
          <div className="h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full ${s.bar}`} style={{ width: `${successor.readinessScore}%` }} />
          </div>
        </div>
        <span className={`text-sm font-bold ${s.text}`}>{successor.readinessScore}% Match</span>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: SuccessorStatus }) => {
  const map: Record<SuccessorStatus, { label: string; cls: string }> = {
    designated: { label: 'Designated', cls: 'bg-blue-100 text-blue-700' },
    promoted: { label: 'Promoted', cls: 'bg-green-100 text-green-700' },
    vacated: { label: 'Vacated', cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>
  );
};
