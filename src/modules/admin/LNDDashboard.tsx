import {
    Award,
    BookOpen,
    Building2,
    Calendar,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ClipboardCheck,
    ClipboardList,
    Eye,
    FileText,
    Info,
    LayoutDashboard,
    LineChart as LineChartIcon,
    Plus,
    Search,
    Send,
    Settings,
    Target,
    Upload,
    Users,
    UsersRound,
    X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { AdminHeader } from '../../components/AdminHeader';
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
import { EmployeeDevelopment } from './EmployeeDevelopment';
import { SeminarEnrollment } from './SeminarEnrollment';
import { type Course, TrainingCourses } from './TrainingCourses';

type Priority = 'high' | 'medium' | 'low';
type RequestStatus = 'approved' | 'pending' | 'rejected';

type MenuId =
  | 'dashboard'
  | 'training-courses'
  | 'seminar-enrollment'
  | 'employee-progress'
  | 'documents'
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
  { id: 'training-courses', label: 'Training Courses', sublabel: 'Courses and sessions', icon: BookOpen },
  { id: 'seminar-enrollment', label: 'Seminar Enrollment', sublabel: 'Registrations and slots', icon: ClipboardCheck },
  { id: 'employee-progress', label: 'Employee Development', sublabel: 'Employees and ratings', icon: Users },
  { id: 'documents', label: 'Documents', sublabel: 'Document submissions', icon: FileText },
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
                  : 'text-gray-900 hover:bg-gray-200',
              ].join(' ')}
            >
              <Icon className={isActive ? 'mt-0.5 h-5 w-5 text-white' : 'mt-0.5 h-5 w-5 text-gray-600'} />
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
    <div className="space-y-6 p-8">
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

const documentTypes = [
  'NBI Clearance',
  'Medical Certificate',
  'SALN',
  'Certificate of Training',
  'Performance Evaluation Form',
  'Updated Resume/CV',
];

const LNDDocuments = () => {
  // Individual request modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestEmployee, setRequestEmployee] = useState<{ name: string; role: string; dept: string; initials: string } | null>(null);
  const [requestDocType, setRequestDocType] = useState('');
  const [requestDueDate, setRequestDueDate] = useState('');

  // Bulk request modal state
  const [showBulkRequestModal, setShowBulkRequestModal] = useState(false);
  const [bulkDocName, setBulkDocName] = useState('');
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkDueDate, setBulkDueDate] = useState<Date | null>(null);
  const [bulkCalendarMonth, setBulkCalendarMonth] = useState(new Date().getMonth());
  const [bulkCalendarYear, setBulkCalendarYear] = useState(new Date().getFullYear());
  const [bulkSendTo, setBulkSendTo] = useState<'all' | 'department' | 'selected'>('all');
  const totalEmployees = 24;

  // ── Individual request helpers ──────────────────────────────────────
  const openRequestModal = (employee?: { name: string; role: string; dept: string; initials: string }) => {
    setRequestEmployee(employee || null);
    setRequestDocType('');
    setRequestDueDate('');
    setShowRequestModal(true);
  };

  const closeRequestModal = () => {
    setShowRequestModal(false);
    setRequestEmployee(null);
    setRequestDocType('');
    setRequestDueDate('');
  };

  const handleSendRequest = () => {
    if (!requestDocType || !requestDueDate) {
      alert('Please select a document type and due date.');
      return;
    }
    alert(`Request sent for "${requestDocType}" due ${requestDueDate}${requestEmployee ? ` to ${requestEmployee.name}` : ''}.`);
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
    setShowBulkRequestModal(true);
  };

  const closeBulkRequestModal = () => {
    setShowBulkRequestModal(false);
  };

  const handleBulkSendRequest = () => {
    if (!bulkDocName || !bulkDescription || !bulkDueDate) {
      alert('Please fill in all required fields.');
      return;
    }
    alert(`Bulk request for "${bulkDocName}" sent to ${totalEmployees} employees, due ${bulkDueDate.toLocaleDateString()}.`);
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

  // ── Table row data ──────────────────────────────────────────────────
  const rows = [
    { no: 1, initials: 'SM', name: 'Santos, Maria G.', role: 'IT Officer II', dept: 'IT Department', docType: 'IPCR', dateReq: 'Mar 1, 2025', dateSub: 'Mar 12, 2025', status: 'Submitted', statusClass: 'border-blue-200 bg-blue-50 text-blue-600', action: 'View' as const, actionClass: 'border-purple-200 text-purple-600 hover:bg-purple-50', icon: Eye },
    { no: 2, initials: 'DC', name: 'Dela Cruz, Juan P.', role: 'Systems Analyst', dept: 'IT Department', docType: 'Accomplishment Report', dateReq: 'Mar 1, 2025', dateSub: 'Mar 10, 2025', status: 'Approved', statusClass: 'border-emerald-200 bg-emerald-50 text-emerald-600', action: 'Request' as const, actionClass: 'bg-blue-600 text-white hover:bg-blue-700 border-transparent', icon: ClipboardList },
    { no: 3, initials: 'RA', name: 'Reyes, Ana T.', role: 'Network Administrator', dept: 'IT Department', docType: 'IPCR', dateReq: 'Mar 1, 2025', dateSub: '', status: 'Pending', statusClass: 'border-orange-200 bg-orange-50 text-orange-600', action: 'Request' as const, actionClass: 'bg-blue-600 text-white hover:bg-blue-700 border-transparent', icon: ClipboardList },
    { no: 4, initials: 'AR', name: 'Aguilar, Ricardo M.', role: 'IT Support Specialist', dept: 'IT Department', docType: 'Service Record', dateReq: 'Mar 3, 2025', dateSub: 'Mar 18, 2025', status: 'Under Review', statusClass: 'border-purple-200 bg-purple-50 text-purple-600', action: 'View' as const, actionClass: 'border-purple-200 text-purple-600 hover:bg-purple-50', icon: Eye },
    { no: 5, initials: 'BL', name: 'Bautista, Lourdes S.', role: 'Database Administrator', dept: 'IT Department', docType: 'Position Description Form', dateReq: 'Feb 15, 2025', dateSub: '', status: 'Overdue', statusClass: 'border-red-200 bg-red-50 text-red-600', action: 'Request' as const, actionClass: 'bg-blue-600 text-white hover:bg-blue-700 border-transparent', icon: ClipboardList },
  ];

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
          <button type="button" onClick={openBulkRequestModal} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm">
            <Plus className="h-4 w-4" /> New Request
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Total Requests</p>
            <p className="text-3xl font-bold text-slate-900 leading-none">24</p>
          </div>
          <div className="rounded-xl border border-orange-300 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-orange-500 uppercase tracking-wider mb-1.5">Pending</p>
            <p className="text-3xl font-bold text-orange-500 leading-none">8</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider mb-1.5">Overdue</p>
            <p className="text-3xl font-bold text-red-500 leading-none">3</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider mb-1.5">Approved</p>
            <p className="text-3xl font-bold text-emerald-500 leading-none">5</p>
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
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-4">
          {/* Dark Header */}
          <div className="bg-[#1e293b] px-5 py-3 flex items-center justify-between text-white">
            <div className="flex items-center gap-4">
              <div>
                <h3 className="text-base font-bold leading-tight">IT Department</h3>
                <p className="text-xs text-slate-400">6 requests - 2 pages</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-orange-500 px-2.5 py-0.5 text-[11px] font-bold text-white">2 Pending</span>
                <span className="inline-flex items-center rounded-full bg-blue-500 px-2.5 py-0.5 text-[11px] font-bold text-white">1 Submitted</span>
                <span className="inline-flex items-center rounded-full bg-[#a855f7] px-2.5 py-0.5 text-[11px] font-bold text-white">1 Under Review</span>
                <span className="inline-flex items-center rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold text-white">1 Approved</span>
                <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-bold text-white">1 Overdue</span>
              </div>
            </div>
            <div className="flex items-center gap-2 cursor-pointer hover:text-slate-300">
              <span className="text-sm font-semibold">6 employees</span>
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
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-12 items-start px-5 py-3 text-sm hover:bg-slate-50/50 transition">
                <div className="col-span-1 text-slate-500 pt-1.5">{row.no}</div>
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
                        openRequestModal({ name: row.name, role: row.role, dept: row.dept, initials: row.initials });
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
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700">1–5</span> of <span className="font-semibold text-slate-700">6</span> requests
            </span>
            <div className="flex items-center gap-1 text-lg text-slate-400">
              <button type="button" className="px-1 hover:text-blue-600 transition disabled:opacity-50" disabled>&laquo;</button>
              <button type="button" className="px-1 hover:text-blue-600 transition disabled:opacity-50" disabled>&lsaquo;</button>
              <button type="button" className="h-7 w-7 rounded bg-blue-600 text-white text-xs font-semibold mx-1">1</button>
              <button type="button" className="h-7 w-7 rounded bg-transparent text-slate-600 hover:bg-slate-100 text-xs font-medium mr-1">2</button>
              <button type="button" className="px-1 hover:text-blue-600 transition">&rsaquo;</button>
              <button type="button" className="px-1 hover:text-blue-600 transition">&raquo;</button>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
              DISTRIBUTION:
              <span className="inline-block rounded bg-orange-100 px-2 py-0.5 text-orange-700 normal-case ml-1">2 Pending</span>
              <span className="inline-block rounded bg-blue-100 px-2 py-0.5 text-blue-700 normal-case">1 Submitted</span>
              <span className="inline-block rounded bg-purple-100 px-2 py-0.5 text-purple-700 normal-case">1 Under Review</span>
              <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-emerald-700 normal-case">1 Approved</span>
              <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-red-700 normal-case">1 Overdue</span>
            </div>
          </div>
        </div>
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
                Send to {totalEmployees} Employees
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const LNDDashboard = ({ isDashboardView = true }: { isDashboardView?: boolean }) => {
  const [activeModule, setActiveModule] = useState<MenuId>('dashboard');
  const [courses, setCourses] = useState<Course[]>([]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <AdminHeader userName="Alex Gonzales" divisionLabel="L&D Division" />
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
            <LNDDocuments />
          ) : (
            <PlaceholderPage label={LND_MENU.find((item) => item.id === activeModule)?.label || 'Module'} />
          )}
        </main>
      </div>
      {!isDashboardView ? null : null}
    </div>
  );
};
