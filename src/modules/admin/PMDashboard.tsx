import {
    AlertCircle,
    AlertTriangle,
    BarChart3,
    Bell,
    BookOpen,
    CalendarCheck2,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronUp,
    ClipboardList,
    Clock,
    Database,
    Download,
    Edit2,
    Eye,
    FileCheck2,
    FileText,
    Globe,
    HelpCircle,
    LayoutDashboard,
    LogOut,
    Mail,
    MoreHorizontal,
    Palette,
    Plus,
    Search,
    Settings,
    Shield,
    SlidersHorizontal,
    Target,
    Trash2,
    TrendingUp,
    User,
    UserCircle2,
    Users,
    XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { LogoutConfirmPopover } from '../../components/LogoutConfirmPopover';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { Sidebar } from '../../components/Sidebar';
import { supabase } from '../../lib/supabase';
import '../../styles/admin.css';

interface EvaluationCycle {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  status: 'Active' | 'Completed' | 'Planned';
  created_at: string;
}

interface PerformanceStats {
  activeCycle: string;
  pendingReviews: number;
}

const FALLBACK_CYCLES: EvaluationCycle[] = [
  {
    id: 1,
    title: 'Q1 2026 Performance Review',
    start_date: '2026-01-15',
    end_date: '2026-03-31',
    status: 'Active',
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    title: 'Annual 2025 Evaluation',
    start_date: '2025-10-01',
    end_date: '2025-12-20',
    status: 'Completed',
    created_at: new Date().toISOString(),
  },
];

export const PMDashboard = ({ isDashboardView = true }: { isDashboardView?: boolean }) => {
  const [stats, setStats] = useState<PerformanceStats>({
    activeCycle: 'None',
    pendingReviews: 0
  });
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  const [showCycleDialog, setShowCycleDialog] = useState(false);
  const [editingCycle, setEditingCycle] = useState<EvaluationCycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<
    'dashboard' | 'evaluation-status' | 'performance-reviews' | 'goals' | 'ipcr' | 'analytics' | 'reports' | 'settings'
  >('dashboard');
  const [newCycle, setNewCycle] = useState<{
    title: string;
    start_date: string;
    end_date: string;
    status: 'Active' | 'Completed' | 'Planned';
  }>({
    title: '',
    start_date: '',
    end_date: '',
    status: 'Planned'
  });

  // Pagination state for Performance Reviews table
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewRowsPerPage, setReviewRowsPerPage] = useState(20);

  const reviewsData = [
    { name: 'Manuel Reyes', id: 'EMP-0142', pos: 'HR Officer I', dept: 'Operations', score: 4.4, rating: 'Very Satisfactory', date: 'Feb 27, 2025' },
    { name: 'Valentina Santos', id: 'EMP-0141', pos: 'IT Officer II', dept: 'HR Department', score: 4.2, rating: 'Very Satisfactory', date: 'Feb 24, 2025' },
    { name: 'Diego Flores', id: 'EMP-0140', pos: 'HR Assistant', dept: 'Finance', score: 4.9, rating: 'Outstanding', date: 'Feb 21, 2025' },
    { name: 'Sofia Morales', id: 'EMP-0139', pos: 'Admin Officer II', dept: 'IT Department', score: 4.3, rating: 'Very Satisfactory', date: 'Feb 18, 2025' },
    { name: 'Antonio Mercado', id: 'EMP-0136', pos: 'Legal Officer I', dept: 'Operations', score: 4.1, rating: 'Very Satisfactory', date: 'Feb 9, 2025' },
    { name: 'Teresa dela Cruz', id: 'EMP-0135', pos: 'Finance Officer I', dept: 'HR Department', score: 4.8, rating: 'Outstanding', date: 'Feb 6, 2025' },
    { name: 'Pedro Gutierrez', id: 'EMP-0134', pos: 'IT Support Specialist', dept: 'Finance', score: 4.2, rating: 'Very Satisfactory', date: 'Feb 3, 2025' },
    { name: 'Gloria Rivera', id: 'EMP-0133', pos: 'Systems Analyst', dept: 'IT Department', score: 3.9, rating: 'Satisfactory', date: 'Jan 31, 2025' },
    { name: 'Fernando Fernandez', id: 'EMP-0132', pos: 'HR Officer I', dept: 'Admin Services', score: 4.5, rating: 'Outstanding', date: 'Jan 28, 2025' },
    { name: 'Liza Lopez', id: 'EMP-0131', pos: 'IT Officer II', dept: 'Legal', score: 4.0, rating: 'Very Satisfactory', date: 'Jan 25, 2025' },
    { name: 'Miguel Lim', id: 'EMP-0130', pos: 'HR Assistant', dept: 'Operations', score: 4.7, rating: 'Outstanding', date: 'Jan 22, 2025' },
    { name: 'Ricardo Cruz', id: 'EMP-0129', pos: 'Admin Officer II', dept: 'HR Department', score: 4.3, rating: 'Very Satisfactory', date: 'Jan 19, 2025' },
    { name: 'Carmen Mendoza', id: 'EMP-0128', pos: 'Accounting Clerk', dept: 'Finance', score: 3.7, rating: 'Satisfactory', date: 'Jan 16, 2025' },
    { name: 'Jose Navarro', id: 'EMP-0127', pos: 'Admin Assistant II', dept: 'IT Department', score: 4.9, rating: 'Outstanding', date: 'Jan 13, 2025' },
    { name: 'Elena Castillo', id: 'EMP-0126', pos: 'Legal Officer I', dept: 'Admin Services', score: 4.1, rating: 'Very Satisfactory', date: 'Jan 10, 2025' },
    { name: 'Roberto Ramos', id: 'EMP-0125', pos: 'Finance Officer I', dept: 'Legal', score: 4.4, rating: 'Very Satisfactory', date: 'Jan 7, 2025' },
    { name: 'Ana Gonzales', id: 'EMP-0124', pos: 'IT Support Specialist', dept: 'Operations', score: 3.8, rating: 'Satisfactory', date: 'Jan 4, 2025' },
    { name: 'Juan Diaz', id: 'EMP-0123', pos: 'Systems Analyst', dept: 'HR Department', score: 4.6, rating: 'Outstanding', date: 'Jan 1, 2025' },
  ];
  const reviewTotalPages = Math.ceil(reviewsData.length / reviewRowsPerPage);
  const reviewStartIdx = (reviewPage - 1) * reviewRowsPerPage;
  const reviewPageData = reviewsData.slice(reviewStartIdx, reviewStartIdx + reviewRowsPerPage);

  useEffect(() => {
    fetchCycles();
  }, []);

  useEffect(() => {
    calculateStats();
  }, [cycles]);

  const fetchCycles = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from('performance_cycles')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;
      const safeCycles = (Array.isArray(data) ? data : []).map((item: any, index: number) => ({
        id: Number(item?.id ?? index + 1),
        title: String(item?.title ?? `Cycle ${index + 1}`),
        start_date: String(item?.start_date ?? ''),
        end_date: String(item?.end_date ?? ''),
        status: (item?.status === 'Active' || item?.status === 'Completed' ? item.status : 'Planned') as 'Active' | 'Completed' | 'Planned',
        created_at: String(item?.created_at ?? new Date().toISOString()),
      }));
      setCycles(safeCycles);
    } catch (error) {
      console.error('Error fetching evaluation cycles:', error);
      setCycles(FALLBACK_CYCLES);
      setErrorMessage('Using local sample evaluation data (live source unavailable).');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const activeCycle = cycles.find(c => c.status === 'Active');
    setStats({
      activeCycle: activeCycle?.title || 'None',
      pendingReviews: 12 // Dummy for now
    });
  };

  const handleAddCycle = async () => {
    if (!newCycle.title || !newCycle.start_date || !newCycle.end_date) {
      alert('Please fill in all fields');
      return;
    }

    try {
      if (editingCycle) {
        const { error } = await (supabase as any)
          .from('performance_cycles')
          .update(newCycle)
          .eq('id', editingCycle.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('performance_cycles')
          .insert([newCycle]);
        if (error) throw error;
      }
      
      await fetchCycles();
      setShowCycleDialog(false);
      setEditingCycle(null);
      setNewCycle({ title: '', start_date: '', end_date: '', status: 'Planned' });
    } catch (error) {
      console.error('Error saving evaluation cycle:', error);
      alert('Failed to save evaluation cycle');
    }
  };

  const handleDeleteCycle = async (id: number) => {
    if (!confirm('Are you sure you want to delete this evaluation cycle?')) return;

    try {
      const { error } = await supabase
        .from('performance_cycles')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchCycles();
    } catch (error) {
      console.error('Error deleting evaluation cycle:', error);
      alert('Failed to delete evaluation cycle');
    }
  };

  const handleEditCycle = (cycle: EvaluationCycle) => {
    setEditingCycle(cycle);
    setNewCycle({
      title: cycle.title,
      start_date: cycle.start_date,
      end_date: cycle.end_date,
      status: cycle.status as 'Active' | 'Completed' | 'Planned'
    });
    setShowCycleDialog(true);
  };

  if (isDashboardView) {
    const sideNavItems = [
      { key: 'dashboard', label: 'Dashboard', subtitle: '', icon: LayoutDashboard },
      { key: 'evaluation-status', label: 'Employee Evaluation Status', subtitle: 'Track progress', icon: ClipboardList },
      { key: 'performance-reviews', label: 'Performance Reviews', subtitle: 'Upcoming reviews', icon: CalendarCheck2 },
      { key: 'goals', label: 'DPCR', subtitle: 'Individual performance', icon: FileCheck2 },
      { key: 'ipcr', label: 'Summary of Ratings', subtitle: 'IPCR ratings per dept', icon: BarChart3 },
      { key: 'reports', label: 'Documents', subtitle: 'Document submissions', icon: FileText },
      { key: 'analytics', label: 'Analytics', subtitle: 'Performance insights', icon: TrendingUp },
      { key: 'settings', label: 'Settings', subtitle: '', icon: Settings },
    ] as const;

    return (
      <div className="min-h-screen bg-slate-100 text-slate-800">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-600 text-white grid place-content-center text-lg font-bold">HR</div>
              <div>
                <h1 className="text-lg font-bold leading-none">Government HRIS</h1>
                <p className="text-xs text-slate-500">Human Resource Information System</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <button className="rounded-full p-2 hover:bg-slate-100" type="button"><HelpCircle className="h-5 w-5" /></button>
              <button className="rounded-full p-2 hover:bg-slate-100 relative" type="button">
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-1 inline-block h-2 w-2 rounded-full bg-red-500" />
              </button>
              <div className="h-8 w-px bg-slate-200" />
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-600 text-white grid place-content-center">
                  <UserCircle2 className="h-6 w-6" />
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-slate-800">interviewer</p>
                  <p className="text-xs text-slate-500">PM Division</p>
                </div>
              </div>
              <LogoutConfirmPopover />
            </div>
          </div>
        </header>

        <div className="flex">
          <aside className="w-64 shrink-0 border-r border-slate-200 bg-white px-3 py-4 min-h-[calc(100vh-70px)]">
            <nav className="space-y-1.5">
              {sideNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.key;
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => setActiveSection(item.key)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                      isActive ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`mt-0.5 h-5 w-5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                      <div>
                        <p className="text-sm font-semibold leading-tight">{item.label}</p>
                        {item.subtitle ? (
                          <p className={`text-xs ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>{item.subtitle}</p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="flex-1 p-6">
            {activeSection === 'dashboard' && (
              <>
                {/* ── Header Area ── */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-blue-600 font-medium">Performance Management <span className="mx-1 text-slate-400">&gt;</span> <span className="text-slate-500">Dashboard</span></p>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                    <Clock className="h-4 w-4" /> How to Navigate
                  </button>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">PM Dashboard</h2>
                <p className="text-sm text-slate-500 mt-0.5">Performance evaluation overview — FY 2025</p>

                {errorMessage && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    {errorMessage}
                  </div>
                )}

                {/* ── KPI Cards Row ── */}
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <p className="text-xs font-medium text-slate-500">Completed Evaluations</p>
                    </div>
                    <p className="text-3xl font-extrabold text-slate-900 leading-none">142</p>
                    <p className="text-xs text-slate-400 mt-1">FY 2025 total</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <p className="text-xs font-medium text-slate-500">Pending IPCR Reviews</p>
                    </div>
                    <p className="text-3xl font-extrabold text-orange-500 leading-none">24</p>
                    <p className="text-xs text-slate-400 mt-1">Awaiting validation</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <p className="text-xs font-medium text-slate-500">Urgent Training Approvals</p>
                    </div>
                    <p className="text-3xl font-extrabold text-slate-900 leading-none">7</p>
                    <p className="text-xs text-slate-400 mt-1">Due within 3 days</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-blue-500" />
                      <p className="text-xs font-medium text-slate-500">Expiring Certifications</p>
                    </div>
                    <p className="text-3xl font-extrabold text-slate-900 leading-none">12</p>
                    <p className="text-xs text-slate-400 mt-1">Next 30 days</p>
                  </div>
                </div>

                {/* ── Middle Section (60/40) ── */}
                <div className="mt-6 grid grid-cols-1 xl:grid-cols-5 gap-6">
                  {/* Left – Action Required Queue (60%) */}
                  <section className="xl:col-span-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <header className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
                        <h3 className="text-sm font-bold text-slate-800">Action Required Queue</h3>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">4 pending</span>
                      </div>
                      <button type="button" className="text-xs font-medium text-blue-600 hover:underline">View all</button>
                    </header>
                    {/* Column headers */}
                    <div className="grid grid-cols-12 items-center gap-2 px-5 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-50">
                      <div className="col-span-3">Employee</div>
                      <div className="col-span-3">Department</div>
                      <div className="col-span-3">Request Type</div>
                      <div className="col-span-3 text-right">Action</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {[
                        { name: 'Elena Mercado', dept: 'Finance', type: 'IPCR Validation', typeColor: 'bg-emerald-100 text-emerald-700' },
                        { name: 'Jose Reyes', dept: 'IT Department', type: 'Performance Evaluation', typeColor: 'bg-emerald-100 text-emerald-700' },
                        { name: 'Carmen Diaz', dept: 'IT Department', type: 'IPCR Validation', typeColor: 'bg-emerald-100 text-emerald-700' },
                        { name: 'Ricardo Lim', dept: 'Finance', type: 'Rating Dispute', typeColor: 'bg-slate-100 text-slate-600' },
                      ].map((row) => (
                        <div key={row.name} className="grid grid-cols-12 items-center gap-2 px-5 py-3.5 text-sm hover:bg-slate-50/60 transition">
                          <div className="col-span-3 font-semibold text-slate-800">{row.name}</div>
                          <div className="col-span-3 text-slate-500">{row.dept}</div>
                          <div className="col-span-3">
                            <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${row.typeColor}`}>{row.type}</span>
                          </div>
                          <div className="col-span-3 text-right">
                            <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
                              Review <span className="text-slate-400">&gt;</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Right – Performance Distribution Donut (40%) */}
                  <section className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-slate-500" />
                        <h3 className="text-sm font-bold text-slate-800">Performance Distribution</h3>
                      </div>
                      <span className="text-xs text-slate-400">Q3 2025</span>
                    </div>
                    <div className="flex flex-col items-center">
                      {/* SVG Donut Chart – 5 segments: 70+76+30+7+2 = 185, circumference=289 */}
                      <svg viewBox="0 0 120 120" className="w-44 h-44">
                        {/* Outstanding green: 70/185 = 37.8% → 109 */}
                        <circle cx="60" cy="60" r="46" fill="none" stroke="#22c55e" strokeWidth="18"
                          strokeDasharray="109 289" strokeDashoffset="0"
                          transform="rotate(-90 60 60)" />
                        {/* Very Satisfactory blue: 76/185 = 41.1% → 119 */}
                        <circle cx="60" cy="60" r="46" fill="none" stroke="#3b82f6" strokeWidth="18"
                          strokeDasharray="119 289" strokeDashoffset="-109"
                          transform="rotate(-90 60 60)" />
                        {/* Satisfactory yellow: 30/185 = 16.2% → 47 */}
                        <circle cx="60" cy="60" r="46" fill="none" stroke="#eab308" strokeWidth="18"
                          strokeDasharray="47 289" strokeDashoffset="-228"
                          transform="rotate(-90 60 60)" />
                        {/* Unsatisfactory orange: 7/185 = 3.8% → 11 */}
                        <circle cx="60" cy="60" r="46" fill="none" stroke="#f97316" strokeWidth="18"
                          strokeDasharray="11 289" strokeDashoffset="-275"
                          transform="rotate(-90 60 60)" />
                        {/* Poor red: 2/185 = 1.1% → 3 */}
                        <circle cx="60" cy="60" r="46" fill="none" stroke="#ef4444" strokeWidth="18"
                          strokeDasharray="3 289" strokeDashoffset="-286"
                          transform="rotate(-90 60 60)" />
                        <text x="60" y="56" textAnchor="middle" fill="#1e293b" fontSize="22" fontWeight="700">185</text>
                        <text x="60" y="72" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="500">Evaluated</text>
                      </svg>
                      {/* Legend */}
                      <div className="mt-4 w-full space-y-1.5">
                        {[
                          { label: 'Outstanding', value: 70, color: '#22c55e' },
                          { label: 'Very Satisfactory', value: 76, color: '#3b82f6' },
                          { label: 'Satisfactory', value: 30, color: '#eab308' },
                          { label: 'Unsatisfactory', value: 7, color: '#f97316' },
                          { label: 'Poor', value: 2, color: '#ef4444' },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                              <span className="text-slate-600">{item.label}</span>
                            </div>
                            <span className="font-semibold text-slate-800">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>

                {/* ── Bottom Section (50/50) ── */}
                <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <header className="px-5 py-3.5 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-slate-500" />
                        <h3 className="text-sm font-bold text-slate-800">Competency & Succession Watchlist</h3>
                      </div>
                    </header>
                    <div className="p-5 space-y-6">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Skill Gap Alerts by Department</p>
                        <div className="space-y-3">
                          {[
                            { dept: 'Finance', value: 72 },
                            { dept: 'IT Dept', value: 58 },
                            { dept: 'Admin', value: 45 },
                            { dept: 'HR Dept', value: 38 },
                            { dept: 'Engineering', value: 25 },
                          ].map((d) => (
                            <div key={d.dept} className="flex items-center gap-3 text-xs">
                              <span className="w-20 text-slate-600 shrink-0">{d.dept}</span>
                              <div className="flex-1 h-2.5 rounded-full bg-slate-100">
                                <div className="h-2.5 rounded-full bg-blue-500" style={{ width: `${d.value}%` }} />
                              </div>
                              <span className="w-8 text-right font-semibold text-slate-700">{d.value}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Upcoming Retirements (Next 12 Months)</p>
                        <div className="divide-y divide-slate-100">
                          {[
                            { name: 'Alfredo Santos', role: 'Director III', date: 'Aug 2025', dateColor: 'bg-orange-100 text-orange-700' },
                            { name: 'Lourdes Castillo', role: 'Admin Officer V', date: 'Nov 2025', dateColor: 'bg-orange-100 text-orange-700' },
                            { name: 'Eduardo Ramos', role: 'Senior Budget Analyst', date: 'Feb 2026', dateColor: 'bg-emerald-100 text-emerald-700' },
                          ].map((r) => (
                            <div key={r.name} className="flex items-center justify-between py-2.5 text-xs">
                              <div>
                                <p className="font-semibold text-slate-800">{r.name}</p>
                                <p className="text-slate-400">{r.role}</p>
                              </div>
                              <span className={`rounded-full px-3 py-0.5 text-[11px] font-semibold ${r.dateColor}`}>{r.date}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <header className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-slate-500" />
                        <h3 className="text-sm font-bold text-slate-800">IPCR Submissions</h3>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">6 total</span>
                    </header>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50/80 text-left">
                            <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Employee</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Dept.</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Period</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Rating</th>
                            <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {[
                            { name: 'Maria Santos', position: 'IT Officer II', dept: 'IT Department', period: 'Q1 2025', rating: '4.66', status: 'Approved', statusColor: 'bg-emerald-100 text-emerald-700' },
                            { name: 'Carlos Mendoza', position: 'Accountant II', dept: 'Finance', period: 'Q1 2025', rating: '4.50', status: 'Approved', statusColor: 'bg-emerald-100 text-emerald-700' },
                            { name: 'Juan dela Cruz', position: 'HR Officer I', dept: 'HR Dept', period: 'Q2 2025', rating: '4.20', status: 'Under Review', statusColor: 'bg-orange-100 text-orange-700' },
                            { name: 'Ana Reyes', position: 'Admin Officer III', dept: 'Admin', period: 'Q2 2025', rating: '3.80', status: 'Submitted', statusColor: 'bg-blue-100 text-blue-700' },
                            { name: 'Roberto Cruz', position: 'Systems Analyst', dept: 'IT Department', period: 'Q1 2025', rating: '4.50', status: 'Approved', statusColor: 'bg-emerald-100 text-emerald-700' },
                          ].map((row) => (
                            <tr key={row.name + row.period} className="hover:bg-slate-50/60 transition">
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-800">{row.name}</p>
                                <p className="text-slate-400">{row.position}</p>
                              </td>
                              <td className="px-4 py-3 text-slate-500">{row.dept}</td>
                              <td className="px-4 py-3 text-slate-500">{row.period}</td>
                              <td className="px-4 py-3">
                                <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">{row.rating}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${row.statusColor}`}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button type="button" className="rounded-md p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition" title="View">
                                  <Eye className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </>
            )}

            {activeSection === 'evaluation-status' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-blue-600 font-medium">Performance Management <span className="mx-1 text-slate-400">&gt;</span> <span className="text-slate-500">Employee Evaluation Status</span></p>
                  <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                    <CalendarDays className="h-4 w-4" /> Jan – Jun 2025 (1st Semester) <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Employee Evaluation Status</h2>
                <p className="text-sm text-slate-500 mt-0.5">Track the complete progress of performance evaluations across your organization</p>

                {/* 5 KPI Cards */}
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">Overall Completion</p>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-blue-100"><BarChart3 className="h-5 w-5 text-blue-600" /></span>
                      <div><p className="text-2xl font-extrabold text-slate-900 leading-none">51%</p><p className="text-xs text-slate-400 mt-0.5">of 35 employees</p></div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">Approved</p>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-emerald-100"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></span>
                      <div><p className="text-2xl font-extrabold text-emerald-600 leading-none">18</p><p className="text-xs text-slate-400 mt-0.5">Fully completed</p></div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">In Progress</p>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-orange-100"><Clock className="h-5 w-5 text-orange-500" /></span>
                      <div><p className="text-2xl font-extrabold text-orange-500 leading-none">13</p><p className="text-xs text-slate-400 mt-0.5">Under supervisor review</p></div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">Planning</p>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-blue-100"><SlidersHorizontal className="h-5 w-5 text-blue-600" /></span>
                      <div><p className="text-2xl font-extrabold text-slate-900 leading-none">3</p><p className="text-xs text-slate-400 mt-0.5">Self-evaluation stage</p></div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">Rejected</p>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-100"><XCircle className="h-5 w-5 text-red-500" /></span>
                      <div><p className="text-2xl font-extrabold text-red-500 leading-none">1</p><p className="text-xs text-slate-400 mt-0.5">Requires resubmission</p></div>
                    </div>
                  </div>
                </div>

                {/* Stacked Bar Chart */}
                <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-bold text-slate-800">Evaluation Completion by Department</h3>
                    <span className="text-xs text-slate-400">Jan – Jun 2025 (1st Semester)</span>
                  </div>
                  <svg viewBox="0 0 500 220" className="w-full" style={{ maxHeight: 260 }}>
                    {/* Y-axis labels & gridlines */}
                    {[0, 2, 4, 6, 8, 10].map((v) => {
                      const y = 180 - (v / 10) * 170;
                      return (
                        <g key={v}>
                          <text x="20" y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{v}</text>
                          <line x1="28" y1={y} x2="490" y2={y} stroke="#e2e8f0" strokeWidth="0.5" />
                        </g>
                      );
                    })}
                    {/* Bars */}
                    {[
                      { dept: 'Finance', approved: 6, review: 2, self: 1, planning: 1, rejected: 0 },
                      { dept: 'IT Dept', approved: 4, review: 3, self: 1, planning: 1, rejected: 0 },
                      { dept: 'HR', dept2: 'Department', approved: 5, review: 2, self: 1, planning: 0, rejected: 0 },
                      { dept: 'Admin', dept2: 'Services', approved: 5, review: 2, self: 1, planning: 1, rejected: 0 },
                      { dept: 'Engineering', approved: 3, review: 1, self: 1, planning: 0, rejected: 1 },
                    ].map((d, i) => {
                      const x = 55 + i * 92;
                      const bw = 42;
                      const unitH = 17;
                      const baseY = 180;
                      let cy = baseY;
                      const segments = [
                        { val: d.approved, color: '#22c55e' },
                        { val: d.review, color: '#fb923c' },
                        { val: d.self, color: '#22d3ee' },
                        { val: d.planning, color: '#2563eb' },
                        { val: d.rejected, color: '#ef4444' },
                      ];
                      return (
                        <g key={d.dept}>
                          {segments.map((seg, si) => {
                            if (seg.val === 0) return null;
                            const h = seg.val * unitH;
                            cy -= h;
                            return <rect key={si} x={x} y={cy} width={bw} height={h} fill={seg.color} rx={si === segments.length - 1 || (segments.slice(si + 1).every(s => s.val === 0)) ? 2 : 0} />;
                          })}
                          <text x={x + bw / 2} y={195} textAnchor="middle" fontSize="10" fill="#64748b">{d.dept}</text>
                          {'dept2' in d && d.dept2 && <text x={x + bw / 2} y={206} textAnchor="middle" fontSize="10" fill="#64748b">{d.dept2 as string}</text>}
                        </g>
                      );
                    })}
                  </svg>
                  {/* Legend */}
                  <div className="flex items-center justify-center gap-5 mt-2 text-xs text-slate-600">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" /> Approved</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-400 inline-block" /> Supervisor Review</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-cyan-400 inline-block" /> Self Evaluation</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600 inline-block" /> Planning</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" /> Rejected</span>
                  </div>
                </section>

                {/* Employee Table */}
                <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm" placeholder="Search by name or position..." />
                    </div>
                    <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"><option>All Departments</option></select>
                    <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"><option>All Statuses</option></select>
                    <div className="flex-1" />
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400 cursor-default">Bulk Actions <ChevronDown className="h-3.5 w-3.5" /></button>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-12 items-center px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <div className="col-span-1 flex items-center gap-2"><input type="checkbox" className="rounded border-slate-300 h-4 w-4" /><span className="text-blue-600 normal-case text-xs font-medium">Showing 1–10 of 35 employees</span></div>
                    <div className="col-span-3 pl-8">Employee</div>
                    <div className="col-span-3">Position</div>
                    <div className="col-span-3">Status</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  {/* Department groups */}
                  {[
                    {
                      dept: 'Finance', count: 9, pct: 56, approved: 5, review: 2, self: 1, planning: 1,
                      employees: [
                        { name: 'Carlos Mendoza', position: 'Accountant II', status: 'Approved' },
                        { name: 'Elena Mercado', position: 'Budget Officer III', status: 'Approved' },
                        { name: 'Miguel Santos', position: 'Finance Officer II', status: 'Approved' },
                        { name: 'Diana Cruz', position: 'Accountant I', status: 'Approved' },
                        { name: 'Patricia Ramos', position: 'Budget Analyst', status: 'Approved' },
                        { name: 'Ricardo Lim', position: 'Finance Officer I', status: 'Supervisor Review' },
                      ],
                    },
                    {
                      dept: 'IT Department', count: 7, pct: 50, approved: 3, review: 2, self: 1, planning: 1,
                      employees: [
                        { name: 'Roberto Cruz', position: 'Systems Analyst', status: 'Approved' },
                        { name: 'Kevin Tan', position: 'Database Administrator', status: 'Approved' },
                        { name: 'Angela Lim', position: 'Web Developer', status: 'Approved' },
                        { name: 'Jose Reyes', position: 'IT Support Specialist', status: 'Supervisor Review' },
                        { name: 'Carmen Diaz', position: 'Network Administrator', status: 'Supervisor Review' },
                      ],
                    },
                  ].map((group) => (
                    <div key={group.dept} className="border-b border-slate-100">
                      {/* Group header */}
                      <div className="flex items-center gap-3 px-5 py-3 bg-slate-50/50 border-b border-slate-100">
                        <input type="checkbox" className="rounded border-slate-300 h-4 w-4" />
                        <span className="font-bold text-sm text-slate-800">{group.dept}</span>
                        <span className="text-xs text-slate-400">{group.count} employees</span>
                        <div className="flex-1 flex items-center gap-3 ml-4">
                          <div className="w-24 h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-amber-400" style={{ width: `${group.pct}%` }} /></div>
                          <span className="text-xs font-semibold text-emerald-600">{group.pct}% Complete</span>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">{group.approved} Approved</span>
                          {group.review > 0 && <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">{group.review} Supervisor Review</span>}
                          {group.self > 0 && <span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-700">{group.self} Self Evaluation</span>}
                          {group.planning > 0 && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">{group.planning} Planning</span>}
                        </div>
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      </div>
                      {/* Employee rows */}
                      {group.employees.map((emp) => {
                        const statusColors: Record<string, string> = { 'Approved': 'bg-emerald-100 text-emerald-700', 'Supervisor Review': 'bg-orange-100 text-orange-700', 'Self Evaluation': 'bg-cyan-100 text-cyan-700', 'Planning': 'bg-blue-100 text-blue-700', 'Rejected': 'bg-red-100 text-red-700' };
                        const dotColors: Record<string, string> = { 'Approved': 'bg-emerald-500', 'Supervisor Review': 'bg-orange-500', 'Self Evaluation': 'bg-cyan-500', 'Planning': 'bg-blue-600', 'Rejected': 'bg-red-500' };
                        return (
                          <div key={emp.name} className="grid grid-cols-12 items-center px-5 py-3.5 text-sm hover:bg-slate-50/60 transition border-b border-slate-50 last:border-b-0">
                            <div className="col-span-1"><input type="checkbox" className="rounded border-slate-300 h-4 w-4" /></div>
                            <div className="col-span-3 font-semibold text-slate-800">{emp.name}</div>
                            <div className="col-span-3 text-slate-400">{emp.position}</div>
                            <div className="col-span-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold ${statusColors[emp.status]}`}><span className={`h-1.5 w-1.5 rounded-full ${dotColors[emp.status]}`} />{emp.status}</span></div>
                            <div className="col-span-2 flex items-center justify-end gap-2">
                              <button type="button" className="p-1 text-slate-400 hover:text-blue-600 transition" title="View"><Eye className="h-4 w-4" /></button>
                              <button type="button" className="p-1 text-slate-400 hover:text-slate-600 transition"><MoreHorizontal className="h-4 w-4" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Footer */}
                  <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Approved: 18</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-400" /> Supervisor Review: 8</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" /> Self Evaluation: 5</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" /> Planning: 3</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Rejected: 1</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Rows per page:</span>
                      <span className="flex items-center gap-1">{[10, 20, 30].map(n => <button key={n} type="button" className={`h-6 w-7 rounded ${n === 10 ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-100 text-slate-600'} text-xs`}>{n}</button>)}</span>
                      <span>1–10 of 35</span>
                      <span className="flex items-center gap-1">
                        {[1, 2, 3, 4].map(n => <button key={n} type="button" className={`h-6 w-6 rounded ${n === 1 ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-100 text-slate-600'} text-xs`}>{n}</button>)}
                        <button type="button" className="h-6 w-6 rounded bg-slate-100 text-slate-600 text-xs">&gt;</button>
                      </span>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeSection === 'performance-reviews' && (
              <>
                {/* Header */}
                <div className="mb-1">
                  <p className="text-sm text-blue-600 font-medium">Performance Management <span className="mx-1 text-slate-400">&gt;</span> <span className="text-slate-500">Performance Reviews</span></p>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Completed Performance Reviews</h2>
                <p className="text-sm text-slate-500 mt-0.5">Archive of all finalized evaluation records across the organization</p>

                {/* Toolbar */}
                <div className="mt-5 flex items-center gap-4">
                  <div className="relative flex-1 max-w-lg">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm" placeholder="Search employee by name, ID, or department..." />
                  </div>
                  <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"><option>All Departments</option></select>
                  <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm">
                    <Download className="h-4 w-4" /> Export CSV / Excel
                  </button>
                </div>

                {/* Table */}
                <section className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {/* Record count */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                    <span className="text-sm text-slate-700"><span className="font-bold">142</span> Records Found</span>
                    <span className="text-xs text-slate-400 italic">Jan 2024 – Feb 2025</span>
                  </div>
                  {/* Column headers */}
                  <div className="grid grid-cols-12 items-center px-5 py-2.5 bg-slate-800 text-[11px] font-semibold text-white uppercase tracking-wider">
                    <div className="col-span-2">Employee ↕</div>
                    <div className="col-span-2">Position</div>
                    <div className="col-span-2">Department ↕</div>
                    <div className="col-span-2">Final Score (out of 5.0) ↕</div>
                    <div className="col-span-2">Review Date ↓</div>
                    <div className="col-span-2">Actions</div>
                  </div>
                  {/* Rows */}
                  <div className="divide-y divide-slate-100">
                    {reviewPageData.map((row) => {
                      const ratingColor = row.rating === 'Outstanding' ? 'text-emerald-600' : row.rating === 'Very Satisfactory' ? 'text-blue-600' : 'text-orange-500';
                      return (
                        <div key={row.id} className="grid grid-cols-12 items-center px-5 py-3.5 text-sm hover:bg-slate-50/60 transition">
                          <div className="col-span-2">
                            <p className="font-semibold text-slate-800">{row.name}</p>
                            <p className="text-xs text-slate-400">{row.id}</p>
                          </div>
                          <div className="col-span-2 text-slate-500">{row.pos}</div>
                          <div className="col-span-2 text-slate-500">{row.dept}</div>
                          <div className="col-span-2 flex items-center gap-2">
                            <span className="font-bold text-slate-800">{row.score.toFixed(1)}</span>
                            <span className={`text-xs font-medium ${ratingColor}`}>{row.rating}</span>
                          </div>
                          <div className="col-span-2 text-slate-500">{row.date}</div>
                          <div className="col-span-2 flex items-center gap-3">
                            <button type="button" className="text-xs font-semibold text-blue-600 hover:underline">View Review</button>
                            <span className="text-slate-300">|</span>
                            <button type="button" className="text-xs font-medium text-slate-400 hover:text-slate-600">Download IPCR</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Footer with functional pagination */}
                  <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-600">
                      Showing {reviewStartIdx + 1} – {Math.min(reviewStartIdx + reviewRowsPerPage, reviewsData.length)} of {reviewsData.length} records
                    </span>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Rows:</span>
                      {[10, 20, 50].map(n => (
                        <button key={n} type="button"
                          onClick={() => { setReviewRowsPerPage(n); setReviewPage(1); }}
                          className={`h-6 w-7 rounded ${n === reviewRowsPerPage ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} text-xs transition`}
                        >{n}</button>
                      ))}
                      <span className="ml-2 flex items-center gap-1">
                        <button type="button" disabled={reviewPage === 1}
                          onClick={() => setReviewPage(p => Math.max(1, p - 1))}
                          className={`px-2 py-1 rounded border border-slate-200 text-xs transition ${reviewPage === 1 ? 'text-slate-300 cursor-default' : 'text-slate-600 hover:bg-slate-100'}`}
                        >&lt; Previous</button>
                        {Array.from({ length: reviewTotalPages }, (_, i) => i + 1).map(n => {
                          if (reviewTotalPages <= 5 || n === 1 || n === reviewTotalPages || Math.abs(n - reviewPage) <= 1) {
                            return (
                              <button key={n} type="button" onClick={() => setReviewPage(n)}
                                className={`h-6 w-6 rounded text-xs transition ${n === reviewPage ? 'bg-blue-600 text-white font-semibold' : 'border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                              >{n}</button>
                            );
                          }
                          if (n === 2 && reviewPage > 3) return <span key={n} className="text-slate-400">…</span>;
                          if (n === reviewTotalPages - 1 && reviewPage < reviewTotalPages - 2) return <span key={n} className="text-slate-400">…</span>;
                          return null;
                        })}
                        <button type="button" disabled={reviewPage === reviewTotalPages}
                          onClick={() => setReviewPage(p => Math.min(reviewTotalPages, p + 1))}
                          className={`px-2 py-1 rounded border border-slate-200 text-xs transition ${reviewPage === reviewTotalPages ? 'text-slate-300 cursor-default' : 'text-slate-600 hover:bg-slate-100'}`}
                        >Next &gt;</button>
                      </span>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeSection === 'goals' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <button type="button" className="p-1 text-slate-400 hover:text-slate-600 transition"><ChevronLeft className="h-5 w-5" /></button>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">DPCR System</h2>
                      <p className="text-sm text-slate-500">Departmental Performance Commitment and Review</p>
                    </div>
                  </div>
                  <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm">
                    <Plus className="h-4 w-4" /> New IPCR
                  </button>
                </div>
                <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-300 rounded-full mb-6" />

                {/* Department IPCR Reports */}
                <h3 className="text-base font-bold text-slate-800 mb-1">Department IPCR Reports</h3>
                <p className="text-sm text-slate-500 mb-4">Click a department card to view its summary and individual employee IPCR forms</p>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                  {[
                    { dept: 'IT Department', count: 3, score: 4.20, rating: 'Very Satisfactory', hasData: true },
                    { dept: 'Finance Department', count: 2, score: 4.33, rating: 'Very Satisfactory', hasData: true },
                    { dept: 'HR Department', count: 0, score: 0, rating: '', hasData: false },
                    { dept: 'Operations', count: 0, score: 0, rating: '', hasData: false },
                    { dept: 'Legal Department', count: 0, score: 0, rating: '', hasData: false },
                  ].map((d) => (
                    <div key={d.dept} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition cursor-pointer">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-50"><FileText className="h-5 w-5 text-blue-500" /></span>
                        <div>
                          <p className="font-bold text-sm text-slate-800">{d.dept}</p>
                          <p className="text-xs text-blue-500">{d.count} evaluated</p>
                        </div>
                      </div>
                      {d.hasData ? (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-slate-400">Avg. Score</span>
                            <span className="text-2xl font-extrabold text-blue-600">{d.score.toFixed(2)}</span>
                          </div>
                          <span className="inline-block rounded-full border border-blue-300 bg-blue-50 px-3 py-0.5 text-xs font-semibold text-blue-700 mb-3">{d.rating}</span>
                        </>
                      ) : (
                        <p className="text-xs text-slate-400 italic mb-3">No completed IPCRs yet</p>
                      )}
                      <button type="button" className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">
                        <Eye className="h-3.5 w-3.5" /> View Department Report & IPCRs
                      </button>
                    </div>
                  ))}
                </div>

                {/* IPCR Submissions */}
                <h3 className="text-base font-bold text-slate-800 mb-1">IPCR Submissions</h3>
                <p className="text-sm text-slate-500 mb-4">All employee IPCR submissions — click "View IPCR" to open the full performance form</p>

                <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100">
                    <div className="relative flex-1 max-w-lg">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm" placeholder="Search employee name, department..." />
                    </div>
                    <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"><option>All Departments</option></select>
                    <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"><option>All Statuses</option></select>
                    <span className="text-xs text-slate-400">6 of 6 records</span>
                  </div>
                  {/* Column headers */}
                  <div className="grid grid-cols-12 items-center px-5 py-2.5 bg-slate-800 text-[11px] font-semibold text-white uppercase tracking-wider">
                    <div className="col-span-2">Department</div>
                    <div className="col-span-2">Employee Name</div>
                    <div className="col-span-2">Date of Submission</div>
                    <div className="col-span-2 text-center">Total Score</div>
                    <div className="col-span-2 text-center">Status</div>
                    <div className="col-span-2 text-right">Action</div>
                  </div>
                  {/* Rows */}
                  <div className="divide-y divide-slate-100">
                    {[
                      { dept: 'IT Department', deptColor: 'bg-blue-100 text-blue-700 border-blue-200', initials: 'MS', name: 'Maria Santos', position: 'IT Officer II', date: 'January 15, 2024', score: 4.58, rating: 'Outstanding', status: 'Submitted', hasScore: true },
                      { dept: 'IT Department', deptColor: 'bg-blue-100 text-blue-700 border-blue-200', initials: 'Jd', name: 'Juan dela Cruz', position: 'Systems Analyst', date: 'January 18, 2024', score: 4.23, rating: 'Very Satisfactory', status: 'Submitted', hasScore: true },
                      { dept: 'IT Department', deptColor: 'bg-blue-100 text-blue-700 border-blue-200', initials: 'AR', name: 'Ana Reyes', position: 'IT Support Specialist', date: 'January 20, 2024', score: 3.79, rating: 'Very Satisfactory', status: 'Submitted', hasScore: true },
                      { dept: 'Finance Department', deptColor: 'bg-emerald-100 text-emerald-700 border-emerald-200', initials: 'CM', name: 'Carlos Mendoza', position: 'Accountant II', date: 'January 12, 2024', score: 4.50, rating: 'Outstanding', status: 'Submitted', hasScore: true },
                      { dept: 'Finance Department', deptColor: 'bg-emerald-100 text-emerald-700 border-emerald-200', initials: 'EM', name: 'Elena Mercado', position: 'Budget Officer I', date: 'January 14, 2024', score: 4.17, rating: 'Very Satisfactory', status: 'Submitted', hasScore: true },
                      { dept: 'HR Department', deptColor: 'bg-purple-100 text-purple-700 border-purple-200', initials: 'RC', name: 'Roberto Cruz', position: 'HR Officer I', date: '', score: 0, rating: '', status: 'Monitoring Phase', hasScore: false },
                    ].map((row, idx) => (
                      <div key={idx} className="grid grid-cols-12 items-center px-5 py-4 text-sm hover:bg-slate-50/60 transition">
                        <div className="col-span-2">
                          <span className={`inline-block rounded-full border px-3 py-0.5 text-[11px] font-semibold ${row.deptColor}`}>{row.dept}</span>
                        </div>
                        <div className="col-span-2 flex items-center gap-2.5">
                          <span className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-200 text-xs font-bold text-slate-600">{row.initials}</span>
                          <div>
                            <p className="font-semibold text-slate-800">{row.name}</p>
                            <p className="text-xs text-slate-400">{row.position}</p>
                          </div>
                        </div>
                        <div className="col-span-2 text-slate-500">{row.date || <span className="italic text-slate-400">Not yet submitted</span>}</div>
                        <div className="col-span-2 text-center">
                          {row.hasScore ? (
                            <div>
                              <p className="text-lg font-extrabold text-blue-600">{row.score.toFixed(2)}</p>
                              <p className={`text-[11px] font-medium ${row.rating === 'Outstanding' ? 'text-emerald-600' : 'text-blue-500'}`}>{row.rating}</p>
                            </div>
                          ) : <span className="text-slate-400">—</span>}
                        </div>
                        <div className="col-span-2 text-center">
                          {row.status === 'Submitted' ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Submitted</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-0.5 text-[11px] font-semibold text-orange-700"><Clock className="h-3 w-3" /> Monitoring Phase</span>
                          )}
                        </div>
                        <div className="col-span-2 text-right">
                          {row.hasScore ? (
                            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition">
                              <Eye className="h-3.5 w-3.5" /> View IPCR
                            </button>
                          ) : <span className="text-xs text-slate-400 italic">Not available</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {activeSection === 'ipcr' && (
              <>
                <h2 className="text-3xl font-bold text-slate-900">IPCR</h2>
                <p className="mt-1 text-slate-600">Individual Performance Commitment and Review</p>

                <section className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Department IPCR Reports</h3>
                  <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
                    <p className="text-sm text-slate-500 text-center">No department IPCR reports available</p>
                  </div>
                </section>

                <section className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">Individual Employee IPCRs</h3>
                  <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
                    <p className="text-sm text-slate-500 text-center">No individual IPCRs available</p>
                  </div>
                </section>
              </>
            )}

            {activeSection === 'analytics' && (
              <>
                <h2 className="text-3xl font-bold text-slate-900">Analytics</h2>
                <p className="mt-1 text-slate-600">Comprehensive performance insights and trends</p>

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Overall Avg Rating</p>
                        <p className="text-3xl font-bold mt-2 text-slate-400">--</p>
                      </div>
                      <div className="h-12 w-12 rounded-lg bg-blue-100 grid place-content-center">
                        <TrendingUp className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Top Performers</p>
                        <p className="text-3xl font-bold mt-2 text-slate-400">--</p>
                      </div>
                      <div className="h-12 w-12 rounded-lg bg-emerald-100 grid place-content-center">
                        <TrendingUp className="h-6 w-6 text-emerald-600" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Departments</p>
                        <p className="text-3xl font-bold mt-2 text-slate-400">--</p>
                      </div>
                      <div className="h-12 w-12 rounded-lg bg-slate-100 grid place-content-center">
                        <FileText className="h-6 w-6 text-slate-600" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Performance by Department</h3>
                      <FileText className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="py-12 text-center text-sm text-slate-500">
                      No department performance data available
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Performance Distribution</h3>
                      <BarChart3 className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="py-12 text-center text-sm text-slate-500">
                      No performance distribution data available
                    </div>
                  </section>
                </div>

                <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold mb-4">Quarterly Performance Trends</h3>
                  <div className="py-12 text-center text-sm text-slate-500">
                    No quarterly trend data available
                  </div>
                </section>

                <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Top Performers</h3>
                    <select className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                      <option>All Departments</option>
                    </select>
                  </div>
                  <div className="py-12 text-center text-sm text-slate-500">
                    No top performer data available
                  </div>
                </section>
              </>
            )}

            {activeSection === 'reports' && (
              <>
                <h2 className="text-3xl font-bold text-slate-900">Department Reports</h2>
                <p className="mt-1 text-slate-600">Performance reports with adjectival ratings</p>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                    <option>All Departments</option>
                  </select>
                  <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                    <option>Q1 2024 (Jan-Mar)</option>
                  </select>
                </div>

                <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
                  <p className="text-sm text-slate-500 text-center">No department reports available</p>
                </div>
              </>
            )}

            {activeSection === 'settings' && (
              <>
                <h2 className="text-3xl font-bold text-slate-900">Settings</h2>
                <p className="mt-1 text-slate-600">Configure your system preferences and account settings</p>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-4 gap-6">
                  <aside className="xl:col-span-1 space-y-2">
                    {[
                      { id: 'profile', label: 'Profile Settings', icon: User },
                      { id: 'notifications', label: 'Notifications', icon: Bell },
                      { id: 'security', label: 'Security', icon: Shield },
                      { id: 'system', label: 'System Settings', icon: Database },
                      { id: 'email', label: 'Email Configuration', icon: Mail },
                      { id: 'appearance', label: 'Appearance', icon: Palette },
                      { id: 'localization', label: 'Localization', icon: Globe },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const isActive = tab.id === 'profile';
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition ${
                            isActive ? 'bg-blue-50 text-blue-600 font-medium' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
                          <span className="text-sm">{tab.label}</span>
                        </button>
                      );
                    })}
                  </aside>

                  <div className="xl:col-span-3">
                    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-2xl font-bold text-slate-900">Profile Settings</h3>
                      <p className="mt-1 text-sm text-slate-600">Personal information is view-only in this screen.</p>

                      <div className="mt-6 flex items-center gap-4">
                        <div className="h-24 w-24 rounded-full bg-blue-100 grid place-content-center">
                          <UserCircle2 className="h-12 w-12 text-blue-600" />
                        </div>
                        <div>
                          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
                            Change Photo
                          </button>
                          <p className="mt-1 text-xs text-slate-500">JPG, PNG or GIF. Max size 2MB</p>
                        </div>
                      </div>

                      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">First Name</label>
                          <input type="text" className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm" placeholder="Enter first name" readOnly />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Last Name</label>
                          <input type="text" className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm" placeholder="Enter last name" readOnly />
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                        <input type="email" className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm" placeholder="Enter email address" readOnly />
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                        <input type="text" className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm bg-slate-50" value="PM" disabled />
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Department</label>
                        <select className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm" disabled>
                          <option>Select department</option>
                          <option>Human Resource Management Office</option>
                          <option>Finance Department</option>
                          <option>IT Department</option>
                        </select>
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Bio</label>
                        <textarea className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm" rows={4} placeholder="Tell us about yourself..." readOnly></textarea>
                      </div>

                      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Personal information updates must be handled outside this screen.
                      </div>
                    </section>
                  </div>
                </div>
              </>
            )}

            {!['dashboard', 'evaluation-status', 'performance-reviews', 'goals', 'ipcr', 'analytics', 'reports', 'settings'].includes(activeSection) && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900 capitalize">{activeSection.replace('-', ' ')}</h2>
                <p className="mt-2 text-slate-600">Section scaffold is ready. Share the next screenshots and I'll match this page exactly.</p>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Performance Management System</h1>
            <Button onClick={() => {
              setEditingCycle(null);
              setNewCycle({ title: '', start_date: '', end_date: '', status: 'Planned' });
              setShowCycleDialog(true);
            }} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Evaluation Cycle
            </Button>
          </div>

          {errorMessage && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-600">Loading evaluation cycles...</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Cycle Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Start Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">End Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Action</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900">Options</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                        No evaluation cycles created yet.
                      </td>
                    </tr>
                  ) : (
                    cycles.map((cycle) => (
                      <tr key={cycle.id} className="border-b border-slate-200 hover:bg-slate-50 transition">
                        <td className="px-6 py-4 text-sm text-slate-900 font-medium">{cycle.title}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{new Date(cycle.start_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{new Date(cycle.end_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            cycle.status === 'Active' ? 'bg-blue-100 text-blue-800' :
                            cycle.status === 'Completed' ? 'bg-green-100 text-green-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            {cycle.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <button className="text-blue-900 hover:text-blue-700 transition flex items-center gap-1 font-medium">
                            <Eye className="w-4 h-4" />
                            View Status
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button 
                            onClick={() => handleEditCycle(cycle)}
                            className="text-blue-900 hover:text-blue-700 transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteCycle(cycle.id)}
                            className="text-red-600 hover:text-red-800 transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create/Edit Evaluation Cycle Dialog */}
      <Dialog 
        open={showCycleDialog} 
        onClose={() => {
          setShowCycleDialog(false);
          setEditingCycle(null);
          setNewCycle({ title: '', start_date: '', end_date: '', status: 'Planned' });
        }}
        title={editingCycle ? 'Edit Evaluation Cycle' : 'Create New Evaluation Cycle'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cycle Name *</label>
            <Input
              type="text"
              placeholder="e.g., Annual Review 2026"
              value={newCycle.title}
              onChange={(e) => setNewCycle({ ...newCycle, title: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
            <Input
              type="date"
              value={newCycle.start_date}
              onChange={(e) => setNewCycle({ ...newCycle, start_date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End Date *</label>
            <Input
              type="date"
              value={newCycle.end_date}
              onChange={(e) => setNewCycle({ ...newCycle, end_date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={newCycle.status}
              onChange={(e) => setNewCycle({ ...newCycle, status: e.target.value as 'Active' | 'Completed' | 'Planned' })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/30 focus:border-blue-900"
            >
              <option value="Planned">Planned</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              onClick={handleAddCycle}
              className="flex-1 bg-blue-900 text-white"
            >
              {editingCycle ? 'Update Cycle' : 'Create Cycle'}
            </Button>
            <Button 
              onClick={() => {
                setShowCycleDialog(false);
                setEditingCycle(null);
                setNewCycle({ title: '', start_date: '', end_date: '', status: 'Planned' });
              }}
              className="flex-1 bg-slate-300 text-slate-900"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
