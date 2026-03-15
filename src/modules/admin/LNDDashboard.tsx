import {
  Award,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LineChart as LineChartIcon,
  LogOut,
  Settings,
  Target,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { TrainingCourses } from './TrainingCourses';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Priority = 'high' | 'medium' | 'low';
type RequestStatus = 'approved' | 'pending' | 'rejected';

type MenuId =
  | 'dashboard'
  | 'training-courses'
  | 'analytics'
  | 'compliance'
  | 'participants'
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

const competencyGaps = [
  { skill: 'Strategic Planning', currentLevel: 62, targetLevel: 88, gap: 26, priority: 'high' as Priority },
  { skill: 'Data Analytics', currentLevel: 54, targetLevel: 82, gap: 28, priority: 'high' as Priority },
  { skill: 'Public Communication', currentLevel: 71, targetLevel: 85, gap: 14, priority: 'medium' as Priority },
  { skill: 'Policy Compliance', currentLevel: 79, targetLevel: 90, gap: 11, priority: 'low' as Priority },
];

const upcomingSeminars = [
  { id: 'SEM-001', title: 'Leadership for Public Service', date: 'Mar 21, 2026', participants: 42, instructor: 'Dr. Maria Santos' },
  { id: 'SEM-002', title: 'Cybersecurity Awareness for Offices', date: 'Mar 25, 2026', participants: 58, instructor: 'Engr. Paul Rivera' },
  { id: 'SEM-003', title: 'Records Management Modernization', date: 'Apr 02, 2026', participants: 33, instructor: 'Atty. Liza Cruz' },
];

const trainingRequests = [
  {
    id: 'TR-1001',
    employee: 'Juan Dela Cruz',
    position: 'Administrative Officer II',
    requestedTraining: 'Advanced Project Monitoring',
    department: 'Planning Office',
    dateRequested: 'Mar 08, 2026',
    status: 'approved' as RequestStatus,
  },
  {
    id: 'TR-1002',
    employee: 'Ana Reyes',
    position: 'HR Assistant',
    requestedTraining: 'Competency-Based Interviewing',
    department: 'HRMO',
    dateRequested: 'Mar 10, 2026',
    status: 'pending' as RequestStatus,
  },
  {
    id: 'TR-1003',
    employee: 'Carlos Mendoza',
    position: 'IT Officer II',
    requestedTraining: 'Cloud Infrastructure Operations',
    department: 'MIS Office',
    dateRequested: 'Mar 11, 2026',
    status: 'rejected' as RequestStatus,
  },
  {
    id: 'TR-1004',
    employee: 'Sofia Ramirez',
    position: 'Municipal Budget Officer',
    requestedTraining: 'Public Finance Analytics',
    department: 'Budget Office',
    dateRequested: 'Mar 12, 2026',
    status: 'approved' as RequestStatus,
  },
];

const topPrograms = [
  { id: 'TP-01', title: 'Leadership Essentials', rating: 4.9, completionRate: 93, participants: 210 },
  { id: 'TP-02', title: 'Technical Skills Upskilling', rating: 4.8, completionRate: 89, participants: 178 },
  { id: 'TP-03', title: 'Workplace Communication Mastery', rating: 4.7, completionRate: 91, participants: 165 },
];

const monthlyTrainingData = [
  { name: 'Week 1', Leadership: 10, Technical: 16, SoftSkills: 9, Compliance: 12 },
  { name: 'Week 2', Leadership: 14, Technical: 18, SoftSkills: 11, Compliance: 13 },
  { name: 'Week 3', Leadership: 12, Technical: 20, SoftSkills: 15, Compliance: 14 },
  { name: 'Week 4', Leadership: 18, Technical: 22, SoftSkills: 17, Compliance: 16 },
];

const LND_MENU: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', sublabel: 'Overview and KPIs', icon: LayoutDashboard },
  { id: 'training-courses', label: 'Training Programs', sublabel: 'Courses and sessions', icon: BookOpen },
  { id: 'analytics', label: 'Performance Trends', sublabel: 'Insights and growth', icon: TrendingUp },
  { id: 'compliance', label: 'Compliance', sublabel: 'Completion tracking', icon: CheckCircle },
  { id: 'participants', label: 'Participants', sublabel: 'Employees and ratings', icon: Users },
  { id: 'settings', label: 'Settings', sublabel: 'Division preferences', icon: Settings },
];

const priorityColor = (priority: Priority) => {
  if (priority === 'high') return 'bg-red-100 text-red-700';
  if (priority === 'medium') return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
};

const statusColor = (status: RequestStatus) => {
  if (status === 'approved') return 'bg-green-100 text-green-700';
  if (status === 'pending') return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
};

const TopNav = () => {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-gray-200 bg-white shadow-sm">
      <div className="flex h-full items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-sm font-bold text-white">
            HR
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Government HRIS</p>
            <p className="text-xs text-gray-500">Human Resource Information System</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900" type="button" aria-label="Help">
            <HelpCircle className="h-5 w-5" />
          </button>
          <button className="relative rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900" type="button" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
          </button>
          <span className="mx-2 h-6 w-px bg-gray-200" />
          <div className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-50">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 text-white">
              <User className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Alex Gonzales</p>
              <p className="text-xs text-gray-500">L&D Division</p>
            </div>
          </div>
          <button className="ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50" type="button">
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};

const Sidebar = ({ activeModule, onSelect }: { activeModule: MenuId; onSelect: (id: MenuId) => void }) => {
  return (
    <aside className="fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 overflow-y-auto border-r border-gray-200 bg-white">
      <nav className="space-y-1 p-3">
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
                  : 'text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              <Icon className={isActive ? 'mt-0.5 h-5 w-5 text-white' : 'mt-0.5 h-5 w-5 text-gray-500'} />
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{item.label}</span>
                <span className={isActive ? 'text-xs text-blue-100' : 'text-xs text-gray-500'}>{item.sublabel}</span>
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

const LndDashboardContent = () => {
  const approvedCount = useMemo(
    () => trainingRequests.filter((request) => request.status === 'approved').length,
    []
  );

  return (
    <div className="space-y-6 p-8 pt-24">
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Dashboard
        </p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Learning & Development</h1>
        <p className="mt-1 text-sm text-gray-500">Monitor training programs, competency development, and completion performance.</p>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Employees" value="1,248" icon={Users} color="blue" sublabel="Workforce covered" />
        <StatCard label="Training Programs" value="36" icon={BookOpen} color="green" sublabel="Active modules" />
        <StatCard label="Active Participants" value="742" icon={Award} color="orange" sublabel="In current cycle" />
        <StatCard label="Completed Trainings" value="584" icon={ClipboardCheck} color="purple" sublabel="This quarter" />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Trainings Conducted (This Month)</h2>
          <p className="text-xs text-gray-500">Weekly trend by category</p>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={monthlyTrainingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Leadership" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Technical" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="SoftSkills" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Compliance" stroke="#9333ea" strokeWidth={2.5} dot={{ r: 4 }} />
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Target className="h-5 w-5 text-blue-600" />
            Competency Gaps Analysis
          </h2>
          <button type="button" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View Details</button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {competencyGaps.map((item) => (
            <article key={item.skill} className="rounded-xl border border-gray-200 p-4">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{item.skill}</h3>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${priorityColor(item.priority)}`}>
                    {item.priority}
                  </span>
                </div>
                <p className="text-sm font-semibold text-red-600">Gap {item.gap}%</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Current Level</p>
                  <div className="h-2.5 rounded-full bg-gray-200">
                    <div className="h-2.5 rounded-full bg-orange-500" style={{ width: `${item.currentLevel}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-gray-600">{item.currentLevel}%</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Target Level</p>
                  <div className="h-2.5 rounded-full bg-gray-200">
                    <div className="h-2.5 rounded-full bg-blue-600" style={{ width: `${item.targetLevel}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-gray-600">{item.targetLevel}%</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Calendar className="h-5 w-5 text-blue-600" />
            Upcoming Seminars
          </h2>
          <div className="space-y-3">
            {upcomingSeminars.map((seminar) => (
              <div key={seminar.id} className="rounded-xl border border-gray-200 p-3 transition hover:bg-gray-50">
                <p className="text-sm font-semibold text-gray-900">{seminar.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span>{seminar.date}</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {seminar.participants} participants
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-600">Instructor: {seminar.instructor}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-gray-900">
            <LineChartIcon className="h-5 w-5 text-blue-600" />
            Top Performing Programs
          </h2>
          <div className="space-y-3">
            {topPrograms.map((program, index) => (
              <div key={program.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {index + 1}
                  </span>
                  <p className="flex-1 text-sm font-semibold text-gray-900">{program.title}</p>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <p className="text-gray-600">Rating: <span className="font-semibold text-gray-900">{program.rating} <span className="text-yellow-500">★</span></span></p>
                  <p className="text-gray-600">Completion: <span className="font-semibold text-gray-900">{program.completionRate}%</span></p>
                  <p className="text-gray-600">Participants: <span className="font-semibold text-gray-900">{program.participants}</span></p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Training Requests</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                <th className="px-3 py-3">Employee</th>
                <th className="px-3 py-3">Position</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Requested Training</th>
                <th className="px-3 py-3">Date Requested</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {trainingRequests.map((request) => (
                <tr key={request.id} className="border-b border-gray-100 text-sm hover:bg-gray-50">
                  <td className="px-3 py-3 font-medium text-gray-900">{request.employee}</td>
                  <td className="px-3 py-3 text-gray-700">{request.position}</td>
                  <td className="px-3 py-3 text-gray-700">{request.department}</td>
                  <td className="px-3 py-3 text-gray-700">{request.requestedTraining}</td>
                  <td className="px-3 py-3 text-gray-700">{request.dateRequested}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusColor(request.status)}`}>
                      {request.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">Approved requests this cycle: {approvedCount}</p>
      </section>
    </div>
  );
};

export const LNDDashboard = ({ isDashboardView = true }: { isDashboardView?: boolean }) => {
  const [activeModule, setActiveModule] = useState<MenuId>('dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="flex pt-16">
        <Sidebar activeModule={activeModule} onSelect={setActiveModule} />
        <main className="ml-64 flex-1">
          {activeModule === 'dashboard' ? (
            <LndDashboardContent />
          ) : activeModule === 'training-courses' ? (
            <TrainingCourses />
          ) : (
            <PlaceholderPage label={LND_MENU.find((item) => item.id === activeModule)?.label || 'Module'} />
          )}
        </main>
      </div>
      {!isDashboardView ? null : null}
    </div>
  );
};
