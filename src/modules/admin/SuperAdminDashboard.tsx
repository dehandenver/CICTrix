import { AlertCircle, Award, Briefcase, Building2, GraduationCap, TrendingUp, UserCheck, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../../components/Sidebar';
import { supabase } from '../../lib/supabase';
import '../../styles/admin.css';

export const SuperAdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [rspStats, setRspStats] = useState({
    totalApplicants: 0,
    totalJobs: 0,
    totalRaters: 0,
    pendingReviews: 0
  });
  const [lndStats, setLndStats] = useState({
    activeTrainings: 0,
    totalPrograms: 0
  });
  const [pmStats, setPmStats] = useState({
    evaluationStatus: 0,
    activeCycle: 'None',
    pendingReviews: 0
  });

  useEffect(() => {
    fetchSummaryStats();
  }, []);

  const fetchSummaryStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [
        applicantsRes,
        jobsRes,
        ratersRes,
        pendingRes,
        trainingsRes,
        activeTrainingsRes,
        cyclesRes,
        activeCycleRes
      ] = await Promise.all([
        supabase.from('applicants').select('id', { count: 'exact', head: true }),
        supabase.from('jobs').select('id', { count: 'exact', head: true }),
        supabase.from('raters').select('id', { count: 'exact', head: true }),
        supabase.from('applicants').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('trainings').select('id', { count: 'exact', head: true }),
        supabase.from('trainings').select('id', { count: 'exact', head: true }).gte('date', today).neq('status', 'Cancelled'),
        supabase.from('performance_cycles').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('performance_cycles').select('title').eq('status', 'Active').limit(1)
      ]);

      setRspStats({
        totalApplicants: applicantsRes.count || 0,
        totalJobs: jobsRes.count || 0,
        totalRaters: ratersRes.count || 0,
        pendingReviews: pendingRes.count || 0
      });

      setLndStats({
        activeTrainings: activeTrainingsRes.count || 0,
        totalPrograms: trainingsRes.count || 0
      });

      setPmStats({
        evaluationStatus: cyclesRes.count || 0,
        activeCycle: activeCycleRes.data?.[0]?.title || 'None',
        pendingReviews: pendingRes.count || 0
      });
    } catch (error) {
      console.error('Error fetching summary stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {/* Top Bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Super Admin Dashboard</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              System Online
            </span>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
            {[
              {
                label: 'Total Applicants',
                value: loading ? '–' : rspStats.totalApplicants,
                sub: 'RSP Division',
                icon: Users,
                iconBg: 'bg-blue-100',
                iconColor: 'text-blue-600',
                trend: '+12 this week',
                trendUp: true,
              },
              {
                label: 'Active Trainings',
                value: loading ? '–' : lndStats.activeTrainings,
                sub: 'L&D Division',
                icon: GraduationCap,
                iconBg: 'bg-emerald-100',
                iconColor: 'text-emerald-600',
                trend: `${loading ? '–' : lndStats.totalPrograms} total programs`,
                trendUp: true,
              },
              {
                label: 'Evaluation Cycles',
                value: loading ? '–' : pmStats.evaluationStatus,
                sub: 'PM Division',
                icon: Award,
                iconBg: 'bg-amber-100',
                iconColor: 'text-amber-600',
                trend: pmStats.activeCycle !== 'None' ? pmStats.activeCycle : 'No active cycle',
                trendUp: pmStats.evaluationStatus > 0,
              },
              {
                label: 'Active Departments',
                value: 5,
                sub: 'Organization',
                icon: Building2,
                iconBg: 'bg-purple-100',
                iconColor: 'text-purple-600',
                trend: `${loading ? '–' : rspStats.totalJobs} open positions`,
                trendUp: true,
              },
            ].map((card) => (
              <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{card.label}</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2 leading-none">{card.value}</p>
                    <p className="text-xs text-slate-400 mt-2">{card.sub}</p>
                  </div>
                  <div className={`h-11 w-11 rounded-xl ${card.iconBg} flex items-center justify-center flex-shrink-0 ml-3`}>
                    <card.icon className={card.iconColor} size={20} />
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className={`text-xs font-medium ${card.trendUp ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {card.trendUp ? '↑ ' : ''}{card.trend}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Division Cards */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* RSP Division */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Users size={20} />
                  </div>
                  <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-medium">RSP</span>
                </div>
                <h3 className="text-lg font-bold">Recruitment Division</h3>
                <p className="text-sm text-blue-100 mt-0.5">Selection & Placement</p>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { label: 'Job Openings', value: loading ? '–' : rspStats.totalJobs, sub: '+2 this month' },
                  { label: 'Total Applicants', value: loading ? '–' : rspStats.totalApplicants, sub: '+12 this week' },
                  { label: 'Pending Reviews', value: loading ? '–' : rspStats.pendingReviews, sub: 'Awaiting decision' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm text-slate-600 font-medium">{row.label}</p>
                      <p className="text-xs text-slate-400">{row.sub}</p>
                    </div>
                    <span className="text-xl font-bold text-slate-900">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="px-5 pb-4">
                <button
                  type="button"
                  onClick={() => navigate('/admin/rsp/jobs')}
                  className="w-full py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold transition-colors"
                >
                  Go to RSP →
                </button>
              </div>
            </div>

            {/* L&D Division */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
              <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <GraduationCap size={20} />
                  </div>
                  <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-medium">L&D</span>
                </div>
                <h3 className="text-lg font-bold">Learning & Development</h3>
                <p className="text-sm text-emerald-100 mt-0.5">Training & Programs</p>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { label: 'Training Programs', value: loading ? '–' : lndStats.totalPrograms, sub: `${loading ? '–' : lndStats.activeTrainings} upcoming` },
                  { label: 'Active Participants', value: '156', sub: '+22 this month' },
                  { label: 'Completion Rate', value: '87%', sub: '+5% vs last month' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm text-slate-600 font-medium">{row.label}</p>
                      <p className="text-xs text-slate-400">{row.sub}</p>
                    </div>
                    <span className="text-xl font-bold text-slate-900">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="px-5 pb-4">
                <button
                  type="button"
                  onClick={() => navigate('/admin/lnd')}
                  className="w-full py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold transition-colors"
                >
                  Go to L&D →
                </button>
              </div>
            </div>

            {/* PM Division */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Award size={20} />
                  </div>
                  <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-medium">PM</span>
                </div>
                <h3 className="text-lg font-bold">Performance Management</h3>
                <p className="text-sm text-orange-100 mt-0.5">IPCR & Evaluations</p>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { label: 'Active Employees', value: '184', sub: 'Across all depts' },
                  { label: 'Active Evaluations', value: loading ? '–' : pmStats.evaluationStatus, sub: pmStats.activeCycle !== 'None' ? pmStats.activeCycle : 'None active' },
                  { label: 'Avg Performance', value: '4.2', sub: 'Out of 5.0' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm text-slate-600 font-medium">{row.label}</p>
                      <p className="text-xs text-slate-400">{row.sub}</p>
                    </div>
                    <span className="text-xl font-bold text-slate-900">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="px-5 pb-4">
                <button
                  type="button"
                  onClick={() => navigate('/admin/pm')}
                  className="w-full py-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm font-semibold transition-colors"
                >
                  Go to PM →
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-5">Recent System Activity</h2>
              <div className="space-y-3">
                {[
                  { color: 'bg-blue-500', title: 'New Job Position Posted', body: 'IT Officer II · Item #ITMO2-2025-001', time: '2 hours ago' },
                  { color: 'bg-emerald-500', title: 'Training Program Completed', body: 'Project Management Fundamentals · 32 participants', time: '5 hours ago' },
                  { color: 'bg-orange-500', title: 'Performance Evaluation Updated', body: 'Q1 2025 Evaluations · 42 in progress', time: '1 day ago' },
                  { color: 'bg-purple-500', title: 'New Employee Onboarded', body: 'Administrative Officer III · Finance Dept', time: '2 days ago' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className={`w-2 h-2 rounded-full ${item.color} mt-1.5 flex-shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.body}</p>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Department Overview */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-5">Department Overview</h2>
              <div className="space-y-2">
                {[
                  { name: 'IT Department', employees: 32, openings: 3 },
                  { name: 'HR Department', employees: 18, openings: 1 },
                  { name: 'Finance Department', employees: 24, openings: 1 },
                  { name: 'Operations', employees: 45, openings: 1 },
                  { name: 'Legal Department', employees: 12, openings: 0 },
                ].map((dept) => (
                  <div key={dept.name} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Building2 size={14} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{dept.name}</p>
                        <p className="text-xs text-slate-500">{dept.employees} employees</p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${dept.openings > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
                      {dept.openings > 0 ? `${dept.openings} open` : 'No openings'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-sm">
            <h2 className="text-base font-bold mb-1">Quick Actions</h2>
            <p className="text-sm text-blue-200 mb-5">Navigate to frequently used sections</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'New Job Post', icon: Briefcase, path: '/admin/rsp/jobs' },
                { label: 'View Applicants', icon: Users, path: '/admin/rsp/qualified' },
                { label: 'Newly Hired', icon: UserPlus, path: '/admin/rsp/new-hired' },
                { label: 'Rater Setup', icon: UserCheck, path: '/admin/rsp/raters' },
              ].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className="flex flex-col items-center gap-2 py-4 px-3 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-white"
                >
                  <action.icon size={20} />
                  <span className="text-xs font-semibold">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

