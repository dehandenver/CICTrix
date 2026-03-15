import {
    AlertCircle,
    BarChart3,
    Bell,
    CalendarCheck2,
    ClipboardList,
    Database,
    Edit2,
    Eye,
    FileCheck2,
    FileText,
    Globe,
    HelpCircle,
    LayoutDashboard,
    LogOut,
    Mail,
    Palette,
    Plus,
    Search,
    Settings,
    Shield,
    Target,
    Trash2,
    TrendingUp,
    User,
    UserCircle2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
        const { error } = await supabase
          .from('performance_cycles')
          .update(newCycle)
          .eq('id', editingCycle.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
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
      { key: 'goals', label: 'Goals & Objectives', subtitle: 'Track progress', icon: Target },
      { key: 'ipcr', label: 'IPCR', subtitle: 'Individual performance', icon: FileCheck2 },
      { key: 'analytics', label: 'Analytics', subtitle: 'Performance insights', icon: BarChart3 },
      { key: 'reports', label: 'Department Reports', subtitle: 'Adjectival ratings', icon: FileText },
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
              <button type="button" className="ml-2 inline-flex items-center gap-2 text-red-600 font-semibold text-sm">
                <LogOut className="h-4 w-4" /> Logout
              </button>
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
                <p className="text-sm text-slate-500 mb-2">Performance Management <span className="mx-1">/</span> Dashboard</p>
                <h2 className="text-3xl font-bold text-slate-900">PM Dashboard</h2>
                <p className="mt-1 text-slate-600">Overview of employee performance and evaluation activities</p>

                {errorMessage && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {errorMessage}
                  </div>
                )}

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Evaluations in Progress</p>
                        <p className="text-3xl font-bold mt-2">{loading ? '...' : stats.pendingReviews + 30}</p>
                      </div>
                      <div className="h-12 w-12 rounded-lg bg-amber-100 grid place-content-center">
                        <ClipboardList className="h-6 w-6 text-amber-600" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Completed Evaluations</p>
                        <p className="text-3xl font-bold mt-2">142</p>
                      </div>
                      <div className="h-12 w-12 rounded-lg bg-emerald-100 grid place-content-center">
                        <TrendingUp className="h-6 w-6 text-emerald-600" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Performance Alerts</p>
                        <p className="text-3xl font-bold mt-2">6</p>
                      </div>
                      <div className="h-12 w-12 rounded-lg bg-rose-100 grid place-content-center">
                        <AlertCircle className="h-6 w-6 text-rose-600" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <header className="px-5 py-3 border-b border-slate-200"><h3 className="text-lg font-semibold">Recent Evaluations</h3></header>
                    <div className="p-4">
                      <p className="text-sm text-slate-500 text-center py-8">No recent evaluations</p>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <header className="px-5 py-3 border-b border-slate-200"><h3 className="text-lg font-semibold">Upcoming Reviews</h3></header>
                    <div className="p-4">
                      <p className="text-sm text-slate-500 text-center py-8">No upcoming reviews scheduled</p>
                    </div>
                  </section>
                </div>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold mb-4">Performance Distribution</h3>
                    <div className="space-y-4">
                      {[
                        { label: 'Outstanding (4.5-5.0)', count: 65, pct: 35, color: 'bg-emerald-600' },
                        { label: 'Very Satisfactory (3.5-4.4)', count: 78, pct: 42, color: 'bg-blue-600' },
                        { label: 'Satisfactory (2.5-3.4)', count: 33, pct: 18, color: 'bg-teal-600' },
                        { label: 'Unsatisfactory (1.5-2.4)', count: 8, pct: 4, color: 'bg-orange-600' },
                        { label: 'Poor (1.0-1.4)', count: 2, pct: 1, color: 'bg-rose-600' },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span>{item.label}</span>
                            <span className="font-semibold">{item.count} <span className="text-xs text-slate-500">({item.pct}%)</span></span>
                          </div>
                          <div className="h-3 rounded-full bg-slate-200">
                            <div className={`h-3 rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold mb-4">Recent Performance Alerts</h3>
                    <div className="space-y-3">
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                        <p className="text-sm font-semibold text-rose-700">Low KPI Completion</p>
                        <p className="text-xs text-rose-600">3 employees below 65% completion rate</p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm font-semibold text-amber-700">Evaluation Overdue</p>
                        <p className="text-xs text-amber-600">5 employees pending evaluation</p>
                      </div>
                      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                        <p className="text-sm font-semibold text-yellow-700">Performance Review Due</p>
                        <p className="text-xs text-yellow-600">Q1 reviews due in 2 weeks</p>
                      </div>
                    </div>
                  </section>
                </div>
              </>
            )}

            {activeSection === 'evaluation-status' && (
              <>
                <p className="text-sm text-slate-500 mb-2">Performance Management <span className="mx-1">/</span> Employee Evaluation Status</p>
                <h2 className="text-3xl font-bold text-slate-900">Employee Evaluation Status</h2>
                <p className="mt-1 text-slate-600">Track the progress of performance evaluations across departments</p>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <section className="xl:col-span-2 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold mb-4">Evaluation Progress by Department</h3>
                    <div className="h-64 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                      <div className="h-full grid grid-cols-6 items-end gap-3">
                        {[78, 82, 80, 79, 84, 81].map((value, idx) => (
                          <div key={idx} className="h-full flex flex-col justify-end">
                            <div className="w-full rounded-t-md bg-green-600" style={{ height: `${Math.max(18, value * 0.15)}%` }} />
                            <div className="w-full rounded-t-md bg-blue-500" style={{ height: `${Math.max(32, value * 0.5)}%` }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                    <h3 className="text-lg font-semibold">Overview</h3>
                    <div className="rounded-lg bg-blue-50 p-3"><p className="text-xs text-blue-600">Total Employees</p><p className="text-2xl font-bold text-blue-700">186</p></div>
                    <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-600">Submitted</p><p className="text-2xl font-bold text-emerald-700">37</p></div>
                    <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs text-amber-600">Pending Review</p><p className="text-2xl font-bold text-amber-700">112</p></div>
                  </section>
                </div>

                <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm" placeholder="Search by name or position..." />
                    </div>
                    <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm"><option>All Departments</option></select>
                    <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm"><option>All Statuses</option></select>
                  </div>

                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-12 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500">
                      <div className="col-span-3">Employee Name</div>
                      <div className="col-span-3">Position</div>
                      <div className="col-span-3">Evaluation Status</div>
                      <div className="col-span-2">Review Period</div>
                      <div className="col-span-1">Actions</div>
                    </div>
                    <div className="px-4 py-12 text-center text-sm text-slate-500">
                      No employee evaluation records found
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeSection === 'performance-reviews' && (
              <>
                <h2 className="text-3xl font-bold text-slate-900">Performance Reviews</h2>
                <p className="mt-1 text-slate-600">Annual performance review records for all employees (186 employees)</p>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Completed Reviews</p><p className="text-3xl font-bold text-emerald-600">142</p></div>
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Pending Reviews</p><p className="text-3xl font-bold">44</p></div>
                </div>

                <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold mb-3">Filters</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm"><option>All Departments</option></select>
                    <select className="rounded-lg border border-slate-300 px-4 py-2 text-sm"><option>All Ratings</option></select>
                  </div>
                </section>

                <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <header className="px-5 py-3 border-b border-slate-200"><h3 className="text-lg font-semibold">Completed Reviews (2025) - 142 reviews</h3></header>
                  <div className="grid grid-cols-6 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500">
                    <div>Employee</div><div>Department</div><div>Review Date</div><div>Performance Rating</div><div>Score</div><div>Status</div>
                  </div>
                  <div className="px-4 py-12 text-center text-sm text-slate-500">
                    No completed reviews found
                  </div>
                </section>
              </>
            )}

            {activeSection === 'goals' && (
              <>
                <h2 className="text-3xl font-bold text-slate-900">Goals & Objectives</h2>
                <p className="mt-1 text-slate-600">Track employee goals and objectives status</p>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Total Goals</p><p className="text-3xl font-bold">8</p></div>
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Completed Goals</p><p className="text-3xl font-bold text-emerald-600">2</p></div>
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Under Review</p><p className="text-3xl font-bold text-amber-600">2</p></div>
                </div>

                <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
                  <p className="text-sm text-slate-500 text-center">No employee goals data available</p>
                </div>
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
