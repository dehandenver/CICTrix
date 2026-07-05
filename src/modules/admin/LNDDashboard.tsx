import {
  Award,
  BarChart2,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  Info,
  LayoutDashboard,
  Plus,
  Search,
  Send,
  Settings,
  TrendingUp,
  Upload,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminHeader } from '../../components/AdminHeader';
import { supabase } from '../../lib/supabase';

type EmployeeOption = { id: string; name: string; position: string; department: string };
import { EmployeeDevelopment } from './EmployeeDevelopment';
import { PMReports } from './PMReports';
import { SeminarEnrollment } from './SeminarEnrollment';
import { TrainingCourses, type Course } from './TrainingCourses';

type DocumentRow = {
  no: number;
  initials: string;
  name: string;
  role: string;
  dept: string;
  docType: string;
  dateReq: string;
  dateSub: string;
  status: string;
  statusClass: string;
  action: 'Request' | 'View';
  actionClass: string;
  icon: any;
  request: DocumentRequest;
};

/** Derive 2-letter initials from a full_name string. */
const getDocRowInitials = (name: string): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

import { EmptyState } from '../../components/EmptyState';
import { getDocumentRequests, updateDocumentRequestStatus, type DocumentRequest } from '../../lib/api/documentRequests';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { createDocumentRequest } from '../../lib/employeeDocuments';
import { listTrainingRequestsDetailed, type TrainingRequest } from '../../lib/api/trainingRequests';
import EmployeeDirectory from './EmployeeDirectory';
import { LndSummaryOfRatings } from './LndSummaryOfRatings';

type MenuId =
  | 'dashboard'
  | 'summary-of-ratings'
  | 'training-courses'
  | 'seminar-enrollment'
  | 'employee-progress'
  | 'documents'
  | 'employees'
  | 'settings';

type MenuItem = {
  id: MenuId;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
};

type StatCardColor = 'blue' | 'green' | 'orange' | 'purple';

type StatCardProps = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: StatCardColor;
  sublabel: string;
};

// Module-scope mock data arrays removed in favor of component state

const LND_MENU: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', sublabel: 'Overview and KPIs', icon: LayoutDashboard },
  { id: 'summary-of-ratings', label: 'Summary of Ratings', sublabel: 'IPCR performance data', icon: BarChart2 },
  { id: 'training-courses', label: 'Training Courses', sublabel: 'Courses and sessions', icon: BookOpen },
  { id: 'seminar-enrollment', label: 'Seminar Enrollment', sublabel: 'Registrations and slots', icon: ClipboardCheck },
  { id: 'employee-progress', label: 'Employee Development', sublabel: 'Employees and ratings', icon: Users },
  { id: 'documents', label: 'Documents', sublabel: 'Document submissions', icon: FileText },
  { id: 'employees', label: 'Employees', sublabel: 'Directory and profiles', icon: UsersRound },
  { id: 'settings', label: 'Settings', sublabel: 'Division preferences', icon: Settings },
];


const LndSidebar = ({ activeModule, onSelect }: { activeModule: MenuId; onSelect: (id: MenuId) => void }) => {
  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white px-3 py-4 min-h-[calc(100vh-70px)]">
      <nav className="space-y-1.5">
        {LND_MENU.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={[
                'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-black hover:bg-gray-200',
              ].join(' ')}
            >
              <Icon className={isActive ? 'mt-0.5 h-5 w-5 text-white' : 'mt-0.5 h-5 w-5 text-gray-600'} />
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{item.label}</span>
                <span className={isActive ? 'text-xs text-blue-100' : 'text-xs text-black'}>{item.sublabel}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

const PlaceholderPage = ({ label }: { label: string }) => {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <FileText className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Under Construction / Implementation</h2>
        <p className="mt-2 text-sm text-gray-500">The {label} module is currently being finalized.</p>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon, color, sublabel }: StatCardProps) => {
  const colorStyles = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600',
  }[color];

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
          <p className="mt-1 text-xs text-gray-500">{sublabel}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colorStyles}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </article>
  );
};

// ── Dashboard constants ───────────────────────────────────────────────────────

const TRAINING_CATEGORIES = [
  'Cultural Transformation',
  'Employee Development',
  'Leadership',
  'Technical',
] as const;

/** Fixed category colors — used consistently across all LnD pages (calendar chips, request tags, etc.). */
export const CATEGORY_COLORS: Record<string, string> = {
  'Cultural Transformation': '#7c3aed',
  'Employee Development': '#0891b2',
  'Leadership': '#d97706',
  'Technical': '#16a34a',
};

const COMPETENCY_LIST = [
  'Knowledge of Local Governance',
  'Public Administration Principles',
  'Community Engagement Skills',
  'Project Management in a Public Setting',
  'Fiscal Management/Budgeting for LGU',
  'Transparency and Accountability Practices',
  'Disaster Risk Reduction and Management',
  'Digital Literacy for Government Services',
  'Ethical Conduct and Public Service Standards',
  'Technical Writing for Government Documents',
  'Data and Records Management and Organization',
  'Public Communication Skills',
] as const;

const COMPETENCY_SHORT: Record<string, string> = {
  'Knowledge of Local Governance': 'Local governance',
  'Public Administration Principles': 'Public admin principles',
  'Community Engagement Skills': 'Community engagement',
  'Project Management in a Public Setting': 'Project mgmt (public)',
  'Fiscal Management/Budgeting for LGU': 'Fiscal mgmt/budgeting',
  'Transparency and Accountability Practices': 'Transparency/accountability',
  'Disaster Risk Reduction and Management': 'DRRM',
  'Digital Literacy for Government Services': 'Digital literacy',
  'Ethical Conduct and Public Service Standards': 'Ethical conduct',
  'Technical Writing for Government Documents': 'Technical writing',
  'Data and Records Management and Organization': 'Data/records mgmt',
  'Public Communication Skills': 'Public communication',
};

/** Fixed department color palette — separate from category colors to avoid confusion. */
const DEPT_PALETTE = [
  '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
  '#db2777', '#0891b2', '#65a30d', '#ea580c', '#6366f1',
];

// ── Dashboard component ───────────────────────────────────────────────────────

const LndDashboardContent = () => {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<TrainingRequest[]>([]);
  const [selectedRadarDept, setSelectedRadarDept] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listTrainingRequestsDetailed();
        if (cancelled) return;
        setRequests(data);
        const depts = Array.from(new Set(data.map((r: TrainingRequest) => r.employees?.department).filter(Boolean)));
        if (depts.length > 0) setSelectedRadarDept(depts[0] as string);
      } catch (err) {
        console.error('LND dashboard error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const currentYear = new Date().getFullYear().toString();

  const departments = useMemo(
    () => Array.from(new Set(requests.map(r => r.employees?.department).filter(Boolean))) as string[],
    [requests]
  );

  const deptColorMap = useMemo(() => {
    const map = new Map<string, string>();
    departments.forEach((dept, i) => map.set(dept, DEPT_PALETTE[i % DEPT_PALETTE.length]));
    return map;
  }, [departments]);

  const ytdCount = useMemo(
    () => requests.filter(r => r.requested_at?.startsWith(currentYear)).length,
    [requests, currentYear]
  );

  const topCategoryEntry = useMemo(() => {
    const counts = TRAINING_CATEGORIES.map(cat => ({
      cat,
      count: requests.filter(r => r.category === cat).length,
    }));
    return counts.reduce((best, cur) => (cur.count > best.count ? cur : best), { cat: '' as string, count: 0 });
  }, [requests]);

  // Per-department request counts — shown in the stacked bar legend
  const deptCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests) {
      const dept = r.employees?.department;
      if (dept) map.set(dept, (map.get(dept) ?? 0) + 1);
    }
    return map;
  }, [requests]);

  // Stacked bar: one entry per category, departments as segment keys
  const categoryChartData = useMemo(() =>
    TRAINING_CATEGORIES.map(cat => {
      const entry: Record<string, any> = { category: cat };
      for (const dept of departments) {
        entry[dept] = requests.filter(r => r.category === cat && r.employees?.department === dept).length;
      }
      return entry;
    }),
    [requests, departments]
  );

  // Radar: demand share per competency for the selected department
  const radarData = useMemo(() => {
    const deptReqs = requests.filter(r => r.employees?.department === selectedRadarDept);
    const total = deptReqs.length || 1;
    return COMPETENCY_LIST.map(comp => ({
      subject: COMPETENCY_SHORT[comp] ?? comp,
      fullName: comp,
      value: Math.round(deptReqs.filter(r => r.competency === comp).length / total * 100),
    }));
  }, [requests, selectedRadarDept]);

  // Demand table: one row per department, top competency + priority + demand %
  const demandTableData = useMemo(() => {
    return departments.map(dept => {
      const deptReqs = requests.filter(r => r.employees?.department === dept);
      const total = deptReqs.length || 1;
      const compCounts = new Map<string, number>();
      for (const r of deptReqs) {
        if (r.competency) compCounts.set(r.competency, (compCounts.get(r.competency) ?? 0) + 1);
      }
      let topComp = '—', topCount = 0;
      for (const [comp, cnt] of compCounts) {
        if (cnt > topCount) { topComp = comp; topCount = cnt; }
      }
      const demand = Math.round(topCount / total * 100);
      const priority: 'high' | 'medium' | 'emerging' = demand >= 60 ? 'high' : demand >= 30 ? 'medium' : 'emerging';
      return { department: dept, topCompetency: topComp, demand, priority };
    }).sort((a, b) => b.demand - a.demand);
  }, [requests, departments]);

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Dashboard
        </p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Dashboard & Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">Training volume, category demand, and competency gaps at a glance.</p>
      </section>

      {/* Metric Cards */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3 relative">
        {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-2xl" />}
        <StatCard label="Total training requests (office accounts)" value={ytdCount.toString()} icon={ClipboardList} color="blue" sublabel="Year to date" />
        <article className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:shadow-md">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1 pr-3">
              <p className="text-sm font-medium text-gray-500">Most requested category, YTD</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 leading-tight truncate">
                {topCategoryEntry.count > 0 ? topCategoryEntry.cat : '—'}
              </p>
              {topCategoryEntry.count > 0 && (
                <p className="mt-1 text-xs text-gray-500">{topCategoryEntry.count} requests</p>
              )}
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Award className="h-6 w-6" />
            </div>
          </div>
        </article>
        <StatCard label="Departments reporting" value={departments.length.toString()} icon={Building2} color="green" sublabel="With active requests" />
      </section>

      {/* Category chart — stacked bar, 4 categories × departments */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 relative min-h-[380px]">
        {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-2xl" />}
        <div className="mb-1">
          <h2 className="text-sm font-semibold text-gray-700">Training requests by category and department, current year</h2>
        </div>
        {departments.length === 0 && !loading ? (
          <div className="mt-6"><EmptyState title="No request data" description="No training requests have been submitted yet." /></div>
        ) : (
          <div className="h-[310px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#374151' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-lg text-xs min-w-[160px]">
                        <p className="mb-2 font-semibold text-gray-800">{label}</p>
                        {payload.map((entry: any) => (
                          <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: entry.fill }} />
                            <span className="flex-1 truncate text-gray-600">{entry.dataKey}</span>
                            <span className="font-semibold text-gray-800">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend
                  content={() => (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 justify-center">
                      {departments.map(dept => (
                        <div key={dept} className="flex items-center gap-1.5 text-xs text-gray-600">
                          <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: deptColorMap.get(dept) }} />
                          {dept} ({deptCounts.get(dept) ?? 0})
                        </div>
                      ))}
                    </div>
                  )}
                />
                {departments.map(dept => (
                  <Bar key={dept} dataKey={dept} stackId="a" fill={deptColorMap.get(dept)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Competency radar — one department at a time via dropdown */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 relative min-h-[420px]">
        {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-2xl" />}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Competency profile by department</h2>
            <p className="text-xs text-gray-400 mt-0.5">Each axis shows that competency's share of the department's total requests</p>
          </div>
          {departments.length > 0 && (
            <select
              value={selectedRadarDept}
              onChange={e => setSelectedRadarDept(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          )}
        </div>
        {departments.length === 0 && !loading ? (
          <EmptyState title="No data" description="No training requests available for competency analysis." />
        ) : (
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#374151' }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickCount={4} />
                <Radar
                  name={selectedRadarDept}
                  dataKey="value"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0]?.payload;
                    return (
                      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-lg text-xs">
                        <p className="font-semibold text-gray-800 mb-1">{item?.fullName}</p>
                        <p className="text-gray-600">Demand: <span className="font-semibold text-gray-900">{item?.value}%</span></p>
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Competency demand table */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 relative">
        {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-2xl" />}
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Competency demand by department</h2>
        </div>
        {demandTableData.length === 0 && !loading ? (
          <EmptyState title="No demand data" description="No department competency demand data available yet." />
        ) : (
          <>
            <div className="grid grid-cols-12 items-center px-4 py-2.5 text-xs font-medium text-gray-500 border-b border-gray-100">
              <div className="col-span-3">Department</div>
              <div className="col-span-4">Top requested competency</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Demand level</div>
              <div className="col-span-1" />
            </div>
            <div className="divide-y divide-gray-100">
              {demandTableData.map(row => (
                <div key={row.department} className="grid grid-cols-12 items-center px-4 py-3.5 hover:bg-gray-50/50 transition">
                  <div className="col-span-3 text-sm font-bold text-gray-900">{row.department}</div>
                  <div className="col-span-4 text-xs text-gray-600 leading-snug pr-3">{row.topCompetency}</div>
                  <div className="col-span-2 flex justify-center">
                    {row.priority === 'high' && (
                      <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-700">High priority</span>
                    )}
                    {row.priority === 'medium' && (
                      <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-700">Medium priority</span>
                    )}
                    {row.priority === 'emerging' && (
                      <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-blue-100 text-blue-700">Emerging need</span>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${row.demand}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-9 shrink-0 text-right">{row.demand}%</span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition whitespace-nowrap"
                    >
                      View details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

const documentTypes = [
  'NBI Clearance',
  'Medical Certificate',
  'SALN',
  'Certificate of Training',
  'Performance Evaluation Form',
  'Updated Resume/CV',
];

interface LNDDocumentsProps {
  showPMReports: boolean;
  setShowPMReports: (open: boolean) => void;
  selectedReportId: string | null;
  /** Caller clears its own selectedReportId once PMReports has consumed it. */
  onSelectionConsumed: () => void;
}

const LNDDocuments = ({ showPMReports, setShowPMReports, selectedReportId, onSelectionConsumed }: LNDDocumentsProps) => {
  // Individual request modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestEmployee, setRequestEmployee] = useState<{ id?: string; name: string; role: string; dept: string; initials: string } | null>(null);
  const [requestDocType, setRequestDocType] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [requestDueDate, setRequestDueDate] = useState('');

  // Bulk request modal state
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
          position: row.current_position ?? '—',
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

  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [dbDocumentRows, setDbDocumentRows] = useState<DocumentRow[]>([]);
  const [reviewingRequest, setReviewingRequest] = useState<DocumentRequest | null>(null);
  const [reviewDecisionPending, setReviewDecisionPending] = useState<'Approved' | 'Rejected' | null>(null);

  const refreshLNDDocumentRequests = async () => {
    const result = await getDocumentRequests({ source: 'LND' });
    if (!result.success || !Array.isArray(result.data)) {
      setDbDocumentRows([]);
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const mapped: DocumentRow[] = (result.data as DocumentRequest[]).map((req, idx) => {
      let statusLabel: string = req.status;
      if (statusLabel === 'Pending' && req.due_date) {
        const due = new Date(req.due_date);
        if (!Number.isNaN(due.getTime()) && due < today) statusLabel = 'Overdue';
      }
      let statusClass = 'border-slate-200 bg-slate-50 text-slate-600';
      if (statusLabel === 'Approved') statusClass = 'border-emerald-200 bg-emerald-50 text-emerald-600';
      if (statusLabel === 'Pending') statusClass = 'border-orange-200 bg-orange-50 text-orange-600';
      if (statusLabel === 'Submitted') statusClass = 'border-blue-200 bg-blue-50 text-blue-600';
      if (statusLabel === 'Overdue' || statusLabel === 'Rejected') statusClass = 'border-red-200 bg-red-50 text-red-600';
      const action: 'Request' | 'View' = req.status === 'Submitted' || req.status === 'Approved' ? 'View' : 'Request';
      const actionClass = action === 'View'
        ? 'border-purple-200 text-purple-600 hover:bg-purple-50'
        : 'bg-blue-600 text-white hover:bg-blue-700 border-transparent';
      const icon = action === 'View' ? Eye : ClipboardList;
      return {
        no: idx + 1,
        initials: getDocRowInitials(req.employee_name ?? ''),
        name: req.employee_name ?? 'Unnamed',
        role: 'Employee',
        dept: req.department ?? 'Unassigned Department',
        docType: req.document_type || '—',
        dateReq: new Date(req.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        dateSub: req.status !== 'Pending' ? new Date(req.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
        status: statusLabel,
        statusClass,
        action,
        actionClass,
        icon,
        request: req,
      };
    });
    setDbDocumentRows(mapped);
  };

  const handleLNDReviewDecision = async (status: 'Approved' | 'Rejected') => {
    if (!reviewingRequest) return;
    setReviewDecisionPending(status);
    const result = await updateDocumentRequestStatus(reviewingRequest.id, status);
    setReviewDecisionPending(null);
    if (!result.success) {
      alert((result as any).error);
      return;
    }
    setReviewingRequest(null);
    await refreshLNDDocumentRequests();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getDocumentRequests({ source: 'LND' });
        if (cancelled) return;
        
        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
          setDbDocumentRows([]);
          return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const mapped: DocumentRow[] = (result.data as DocumentRequest[]).map((req, idx) => {
          let statusLabel: string = req.status;
          if (statusLabel === 'Pending' && req.due_date) {
            const due = new Date(req.due_date);
            if (!Number.isNaN(due.getTime()) && due < today) {
              statusLabel = 'Overdue';
            }
          }

          let statusClass = 'border-slate-200 bg-slate-50 text-slate-600';
          if (statusLabel === 'Approved') statusClass = 'border-emerald-200 bg-emerald-50 text-emerald-600';
          if (statusLabel === 'Pending') statusClass = 'border-orange-200 bg-orange-50 text-orange-600';
          if (statusLabel === 'Submitted') statusClass = 'border-blue-200 bg-blue-50 text-blue-600';
          if (statusLabel === 'Overdue' || statusLabel === 'Rejected') statusClass = 'border-red-200 bg-red-50 text-red-600';

          const action = req.status === 'Submitted' || req.status === 'Approved' ? 'View' : 'Request';
          const actionClass = action === 'View' 
            ? 'border-purple-200 text-purple-600 hover:bg-purple-50' 
            : 'bg-blue-600 text-white hover:bg-blue-700 border-transparent';
          const icon = action === 'View' ? Eye : ClipboardList;

          return {
            no: idx + 1,
            initials: getDocRowInitials(req.employee_name ?? ''),
            name: req.employee_name ?? 'Unnamed',
            role: 'Employee', // Role not available in DocumentRequest type currently
            dept: req.department ?? 'Unassigned Department',
            docType: req.document_type || '—',
            dateReq: new Date(req.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            dateSub: req.status !== 'Pending' ? new Date(req.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
            status: statusLabel,
            statusClass,
            action,
            actionClass,
            icon,
            request: req,
          };
        });
        setDbDocumentRows(mapped);
      } catch (err) {
        console.error('Error loading documents', err);
      } finally {
        if (!cancelled) setDocumentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Individual request helpers ──────────────────────────────────────
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
      requestedBy: 'LND Admin',
      source: 'LND'
    });
    if (!res.success) {
      alert(`Failed to send request: ${(res as any).error}`);
      return;
    }
    window.dispatchEvent(new CustomEvent('EMPLOYEE_DOCUMENTS_UPDATED'));
    alert(`Request sent for "${requestDocType}" due ${requestDueDate}${requestEmployee.name ? ` to ${requestEmployee.name}` : ''}.`);
    closeRequestModal();
  };

  // ── Bulk request helpers ────────────────────────────────────────────
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
          requestedBy: 'LND Admin',
          source: 'LND'
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

  // ── Calendar utilities ──────────────────────────────────────────────
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

  // Remove fallbackRows and use live data rows
  const rows = dbDocumentRows;
  
  // Calculate summary for KPIs
  // Transform to DocumentRequest type mock to use the summarizeRequests function, or calculate locally based on DocumentRow structure.
  const total = rows.length;
  const pending = rows.filter(r => r.status === 'Pending').length;
  const overdue = rows.filter(r => r.status === 'Overdue').length;
  const approved = rows.filter(r => r.status === 'Approved').length;
  
  // Group by department
  const groupedDepts = new Map<string, DocumentRow[]>();
  rows.forEach(r => {
    const list = groupedDepts.get(r.dept);
    if (list) list.push(r);
    else groupedDepts.set(r.dept, [r]);
  });
  const groupedDepartments = Array.from(groupedDepts.entries())
    .map(([dept, requests]) => ({ dept, requests }))
    .sort((a, b) => a.dept.localeCompare(b.dept));

  if (showPMReports) {
    return (
      <PMReports
        onBack={() => {
          setShowPMReports(false);
          onSelectionConsumed();
        }}
        selectedReportId={selectedReportId}
        onSelectionConsumed={onSelectionConsumed}
      />
    );
  }

  return (
    <>
      <div className="space-y-4 p-6 md:p-8">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-blue-600 font-medium">
            L&amp;D Division <span className="mx-1 text-slate-400">/</span> <span className="text-slate-500">Documents</span>
          </p>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Documents</h2>
            <p className="text-sm text-slate-500 mt-1">Request and track document submissions from employees, organized by department</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPMReports(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              title="View Summary of Ratings forwarded by Performance Management"
            >
              <FileText className="h-3.5 w-3.5" /> Summary of Ratings (PM)
            </button>
            <button type="button" onClick={openBulkRequestModal} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm">
              <Plus className="h-4 w-4" /> New Request
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 relative">
          {documentsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-xl" />}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Total Requests</p>
            <p className="text-3xl font-bold text-slate-900 leading-none">{total}</p>
          </div>
          <div className="rounded-xl border border-orange-300 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-orange-500 uppercase tracking-wider mb-1.5">Pending</p>
            <p className="text-3xl font-bold text-orange-500 leading-none">{pending}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider mb-1.5">Overdue</p>
            <p className="text-3xl font-bold text-red-500 leading-none">{overdue}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider mb-1.5">Approved</p>
            <p className="text-3xl font-bold text-emerald-500 leading-none">{approved}</p>
          </div>
        </div>

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
        {groupedDepartments.length === 0 && !documentsLoading ? (
          <EmptyState title="No document requests" description="There are no document requests matching the current filters." />
        ) : (
          groupedDepartments.map(({ dept, requests }) => {
            const deptPending = requests.filter(r => r.status === 'Pending').length;
            const deptSubmitted = requests.filter(r => r.status === 'Submitted').length;
            const deptUnderReview = requests.filter(r => r.status === 'Under Review').length;
            const deptApproved = requests.filter(r => r.status === 'Approved').length;
            const deptOverdue = requests.filter(r => r.status === 'Overdue').length;

            return (
              <div key={dept} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-4 relative">
                {documentsLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10" />}
                {/* Dark Header */}
                <div className="bg-[#1e293b] px-5 py-3 flex items-center justify-between text-white">
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="text-base font-bold leading-tight">{dept}</h3>
                      <p className="text-xs text-slate-400">{requests.length} request(s)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {deptPending > 0 && <span className="inline-flex items-center rounded-full bg-orange-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{deptPending} Pending</span>}
                      {deptSubmitted > 0 && <span className="inline-flex items-center rounded-full bg-blue-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{deptSubmitted} Submitted</span>}
                      {deptUnderReview > 0 && <span className="inline-flex items-center rounded-full bg-[#a855f7] px-2.5 py-0.5 text-[11px] font-bold text-white">{deptUnderReview} Under Review</span>}
                      {deptApproved > 0 && <span className="inline-flex items-center rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{deptApproved} Approved</span>}
                      {deptOverdue > 0 && <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{deptOverdue} Overdue</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 cursor-pointer hover:text-slate-300">
                    <span className="text-sm font-semibold">{new Set(requests.map(r => r.name)).size} employees</span>
                    <ChevronUp className="h-4 w-4" />
                  </div>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-12 items-center px-5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 bg-slate-50">
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
                  {requests.map((row, i) => (
                    <div key={`${row.name}-${i}`} className="grid grid-cols-12 items-start px-5 py-3 text-sm hover:bg-slate-50/50 transition">
                      <div className="col-span-1 text-slate-500 pt-1.5">{i + 1}</div>
                      <div className="col-span-3 flex items-start gap-3">
                        <span className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-[11px] font-bold text-blue-600 shrink-0">
                          {row.initials}
                        </span>
                        <div className="flex flex-col pt-1.5">
                          <p className="font-semibold text-slate-800 leading-none">{row.name}</p>
                          <p className="text-[11px] text-slate-400 mt-1">{row.role}</p>
                        </div>
                      </div>
                      <div className="col-span-2 flex items-center gap-2 text-slate-600 pt-1.5">
                        <FileText className="h-4 w-4 text-slate-400" />
                        {row.docType}
                      </div>
                      <div className="col-span-2 text-slate-600 pt-1.5">{row.dateReq}</div>
                      <div className="col-span-2 text-slate-600 pt-1.5">{row.dateSub}</div>
                      <div className="col-span-1 flex justify-center pt-1.5">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${row.statusClass}`}>
                          {row.status}
                        </span>
                      </div>
                      <div className="col-span-1 flex justify-end pt-1">
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition border ${row.actionClass}`}
                          onClick={() => {
                            if (row.action === 'Request') {
                              openRequestModal({ id: row.request.employee_id, name: row.name, role: row.role, dept: row.dept, initials: row.initials });
                            } else if (row.action === 'View') {
                              setReviewingRequest(row.request);
                            }
                          }}
                        >
                          <row.icon className="h-3.5 w-3.5" />
                          {row.action}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Table Footer */}
                <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <span className="text-xs text-slate-500">
                    Showing <span className="font-semibold text-slate-700">1–{requests.length}</span> of <span className="font-semibold text-slate-700">{requests.length}</span> requests
                  </span>
                  <div className="flex items-center gap-1 text-lg text-slate-400">
                    <button type="button" className="px-1 hover:text-blue-600 transition disabled:opacity-50" disabled>&laquo;</button>
                    <button type="button" className="px-1 hover:text-blue-600 transition disabled:opacity-50" disabled>&lsaquo;</button>
                    <button type="button" className="h-7 w-7 rounded bg-blue-600 text-white text-xs font-semibold mx-1">1</button>
                    <button type="button" className="px-1 hover:text-blue-600 transition disabled:opacity-50" disabled>&rsaquo;</button>
                    <button type="button" className="px-1 hover:text-blue-600 transition disabled:opacity-50" disabled>&raquo;</button>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    DISTRIBUTION:
                    {deptPending > 0 && <span className="inline-block rounded bg-orange-100 px-2 py-0.5 text-orange-700 normal-case ml-1">{deptPending} Pending</span>}
                    {deptSubmitted > 0 && <span className="inline-block rounded bg-blue-100 px-2 py-0.5 text-blue-700 normal-case">{deptSubmitted} Submitted</span>}
                    {deptUnderReview > 0 && <span className="inline-block rounded bg-purple-100 px-2 py-0.5 text-purple-700 normal-case">{deptUnderReview} Under Review</span>}
                    {deptApproved > 0 && <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-emerald-700 normal-case">{deptApproved} Approved</span>}
                    {deptOverdue > 0 && <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-red-700 normal-case">{deptOverdue} Overdue</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Individual Request Document Modal ────────────────────────── */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeRequestModal}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
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
                  placeholder="e.g. Please upload your Certificate of Training."
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                />
              </div>

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

      {/* ── Bulk Document Request Modal ──────────────────────────────── */}
      {showBulkRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeBulkRequestModal}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
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
                      <select 
                        value={bulkSelectedDepartment} 
                        onChange={(e) => setBulkSelectedDepartment(e.target.value)} 
                        className="w-full rounded-lg border border-blue-500 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 shadow-sm">
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
                onClick={() => void handleLNDReviewDecision('Rejected')}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {reviewDecisionPending === 'Rejected' ? 'Rejecting…' : 'Reject'}
              </button>
              <button
                type="button"
                disabled={!!reviewDecisionPending}
                onClick={() => void handleLNDReviewDecision('Approved')}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {reviewDecisionPending === 'Approved' ? 'Approving…' : 'Approve'}
              </button>
            </>
          ) : null
        }
      />
    </>
  );
};

export const LNDDashboard = ({ isDashboardView = true }: { isDashboardView?: boolean }) => {
  const [activeModule, setActiveModule] = useState<MenuId>('dashboard');
  const [courses, setCourses] = useState<Course[]>([]);

  // Lifted so AdminHeader notifications can deep-link into a specific report.
  const [showPMReports, setShowPMReports] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <AdminHeader
        userName="Alex Gonzales"
        divisionLabel="L&D Division"
      />
      <div className="flex">
        <LndSidebar activeModule={activeModule} onSelect={setActiveModule} />
        <main className="flex-1">
          {activeModule === 'dashboard' ? (
            <LndDashboardContent />
          ) : activeModule === 'training-courses' ? (
            <TrainingCourses courses={courses} onAddCourse={(newCourse) => setCourses((prev) => [...prev, newCourse])} />
          ) : activeModule === 'seminar-enrollment' ? (
            <SeminarEnrollment />
          ) : activeModule === 'employee-progress' ? (
            <EmployeeDevelopment />
          ) : activeModule === 'documents' ? (
            <LNDDocuments
              showPMReports={showPMReports}
              setShowPMReports={setShowPMReports}
              selectedReportId={selectedReportId}
              onSelectionConsumed={() => setSelectedReportId(null)}
            />
          ) : activeModule === 'employees' ? (
            <EmployeeDirectory />
          ) : (
            <PlaceholderPage label={LND_MENU.find((item) => item.id === activeModule)?.label || 'Module'} />
          )}
        </main>
      </div>
      {!isDashboardView ? null : null}
    </div>
  );
};
