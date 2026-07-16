import {
  Award,
  BarChart2,
  Sparkles,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
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
  ShieldCheck,
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

import { SeminarEnrollment } from './SeminarEnrollment';
import { TrainingCalendar } from './TrainingCalendar';
import { TrainingPlan } from './TrainingPlan';
import { TrainingCourses } from './TrainingCourses';
import { CATEGORY_COLORS, TRAINING_CATEGORIES } from './trainingCategories';

import { EmptyState } from '../../components/EmptyState';
import { listTrainingRequestsDetailed, type TrainingRequest } from '../../lib/api/trainingRequests';
import EmployeeDirectory from './EmployeeDirectory';
import { LndSummaryOfRatings } from './LndSummaryOfRatings';
import { LndTrainingRequests } from './LndTrainingRequests';
import { LndTrainingEvaluation } from './LndTrainingEvaluation';

type MenuId =
  | 'dashboard'
  | 'summary-of-ratings'
  | 'training-calendar'
  | 'training-plan'
  | 'training-requests'
  | 'training-courses'
  | 'seminar-enrollment'
  | 'training-evaluation'
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
  { id: 'training-calendar', label: 'Training Calendar', sublabel: 'This year’s trainings', icon: CalendarDays },
  { id: 'training-plan', label: 'Training Plan', sublabel: 'Next year’s plan', icon: CalendarClock },
  { id: 'training-requests', label: 'Training Requests', sublabel: 'Department head submissions', icon: ClipboardList },
  { id: 'training-courses', label: 'Training Courses', sublabel: 'Courses and sessions', icon: BookOpen },
  { id: 'seminar-enrollment', label: 'Seminar Enrollment', sublabel: 'Registrations and slots', icon: ClipboardCheck },
  { id: 'training-evaluation', label: 'Training Evaluation', sublabel: 'Pre/post-test results', icon: TrendingUp },
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

// Categories and their colors are defined in ./trainingCategories so that
// TrainingCourses and SeminarEnrollment can share them without importing this
// module (which imports them). Re-exported here for existing callers.
export { CATEGORY_COLORS };

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
  const [viewDeptDetails, setViewDeptDetails] = useState<string | null>(null);

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
      count: requests.filter(r => r.category === cat && r.requested_at?.startsWith(currentYear)).length,
    }));
    return counts.reduce((best, cur) => (cur.count > best.count ? cur : best), { cat: '' as string, count: 0 });
  }, [requests, currentYear]);

  // Per-department request counts — shown in the stacked bar legend
  const deptCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests) {
      const dept = r.employees?.department;
      if (dept) map.set(dept, (map.get(dept) ?? 0) + 1);
    }
    return map;
  }, [requests]);

  // Stacked bar: one entry per category, departments as segment keys — current year only
  const categoryChartData = useMemo(() =>
    TRAINING_CATEGORIES.map(cat => {
      const entry: Record<string, any> = { category: cat };
      for (const dept of departments) {
        entry[dept] = requests.filter(r =>
          r.category === cat &&
          r.employees?.department === dept &&
          r.requested_at?.startsWith(currentYear)
        ).length;
      }
      return entry;
    }),
    [requests, departments, currentYear]
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

  // Full request history for the department drill-down modal, most recent first
  const deptDetailRequests = useMemo(() => {
    if (!viewDeptDetails) return [];
    return requests
      .filter(r => r.employees?.department === viewDeptDetails)
      .sort((a, b) => (b.requested_at ?? '').localeCompare(a.requested_at ?? ''));
  }, [requests, viewDeptDetails]);

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
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              style={{
                backgroundColor: topCategoryEntry.cat && CATEGORY_COLORS[topCategoryEntry.cat]
                  ? `${CATEGORY_COLORS[topCategoryEntry.cat]}22`
                  : 'rgb(254 215 170)',
                color: topCategoryEntry.cat && CATEGORY_COLORS[topCategoryEntry.cat]
                  ? CATEGORY_COLORS[topCategoryEntry.cat]
                  : 'rgb(194 65 12)',
              }}
            >
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
          <p className="text-xs text-gray-400 mt-0.5">Top requested competency per department · all requests · sorted by demand</p>
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
                  <div className="col-span-2 flex">
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
                      onClick={() => setViewDeptDetails(row.department)}
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

      {/* Department request history drill-down */}
      {viewDeptDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setViewDeptDetails(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-6 pb-2 sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{viewDeptDetails}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{deptDetailRequests.length} training request{deptDetailRequests.length === 1 ? '' : 's'}</p>
              </div>
              <button type="button" onClick={() => setViewDeptDetails(null)} className="text-slate-400 hover:text-slate-600 transition">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 pb-6 pt-4">
              {deptDetailRequests.length === 0 ? (
                <EmptyState title="No requests" description="This department has no training requests yet." />
              ) : (
                <div className="divide-y divide-gray-100">
                  {deptDetailRequests.map(r => {
                    const name = [r.employees?.first_name, r.employees?.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
                    return (
                      <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
                          <p className="text-xs text-slate-500 truncate">{r.competency ?? r.title}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.category && (
                            <span
                              className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                              style={{ backgroundColor: `${CATEGORY_COLORS[r.category]}1a`, color: CATEGORY_COLORS[r.category] }}
                            >
                              {r.category}
                            </span>
                          )}
                          <span className="text-xs text-slate-400 w-20 text-right">
                            {r.requested_at ? new Date(r.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const LNDDashboard = ({ isDashboardView = true }: { isDashboardView?: boolean }) => {
  const [activeModule, setActiveModule] = useState<MenuId>('dashboard');

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
          ) : activeModule === 'summary-of-ratings' ? (
            <LndSummaryOfRatings />
          ) : activeModule === 'training-calendar' ? (
            <TrainingCalendar />
          ) : activeModule === 'training-plan' ? (
            <TrainingPlan />
          ) : activeModule === 'training-requests' ? (
            <LndTrainingRequests />
          ) : activeModule === 'training-courses' ? (
            <TrainingCourses />
          ) : activeModule === 'seminar-enrollment' ? (
            <SeminarEnrollment />
          ) : activeModule === 'training-evaluation' ? (
            <LndTrainingEvaluation />
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
