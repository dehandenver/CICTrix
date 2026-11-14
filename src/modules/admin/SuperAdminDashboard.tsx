import { AlertCircle, Award, Building2, GraduationCap, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminHeader } from '../../components/AdminHeader';
import { Sidebar } from '../../components/Sidebar';
import { supabase } from '../../lib/supabase';
import '../../styles/admin.css';
import '../../styles/dashboard-scale.css';

/**
 * KPI card per DESIGN_IDENTITY §9.7: icon chip, title, value.
 *
 * One component rather than four copies, and one chip colour rather than four.
 * §9.7 reserves status colours for KPIs that are themselves a status — "all
 * chips are brand blue, so a dashboard doesn't become a rainbow". None of these
 * four is a status metric.
 */
const KpiCard = ({
  title,
  value,
  caption,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  caption: string;
  icon: typeof Users;
}) => (
  <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[#515F69]">{title}</p>
        <p className="mt-2 text-2xl font-bold leading-8 text-[#040E6B]">{value}</p>
        <p className="mt-2 text-xs text-[#515F69]">{caption}</p>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#EEF0FF]">
        <Icon className="text-[#363EE8]" size={20} strokeWidth={1.75} />
      </div>
    </div>
  </div>
);

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
        (supabase as any).from('jobs').select('id', { count: 'exact', head: true }),
        (supabase as any).from('raters').select('id', { count: 'exact', head: true }),
        supabase.from('applicants').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
        (supabase as any).from('trainings').select('id', { count: 'exact', head: true }),
        (supabase as any).from('trainings').select('id', { count: 'exact', head: true }).gte('date', today).neq('status', 'Cancelled'),
        (supabase as any).from('performance_cycles').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
        (supabase as any).from('performance_cycles').select('title').eq('status', 'Active').limit(1)
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
        activeCycle: (activeCycleRes as any).data?.[0]?.title || 'None',
        pendingReviews: pendingRes.count || 0
      });
    } catch (error) {
      console.error('Error fetching summary stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 ds-remap abyan-tokens">
      <AdminHeader userName="Super Admin" divisionLabel="System Administrator" />
      <div className="flex flex-col md:flex-row">
      <Sidebar />
      {/* dash-lg: dashboard text enlarged (src/styles/dashboard-scale.css). */}
      <main className="dash-lg min-w-0 flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold leading-8 text-[#040E6B]">Super Admin Dashboard</h1>
            <p className="mt-2 text-sm text-[#515F69]">
              Overview of all HRIS divisions. Viewing only — the division portals are operated by their own
              administrators.
            </p>
          </div>

          {/* Summary Cards */}
          <div className="mb-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Total applicants"
              value={loading ? '…' : rspStats.totalApplicants}
              caption="RSP Division"
              icon={Users}
            />
            <KpiCard
              title="Active trainings"
              value={loading ? '…' : lndStats.activeTrainings}
              caption="L&D Division"
              icon={GraduationCap}
            />
            <KpiCard
              title="Evaluation status"
              value={loading ? '…' : pmStats.evaluationStatus}
              caption="PM Division"
              icon={Award}
            />
            <KpiCard
              title="Department summary"
              value={5}
              caption="Active departments"
              icon={Building2}
            />
          </div>

          {/* Division Cards */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
              <div className="flex items-center justify-between bg-[#363EE8] p-5 text-white">
                <div>
                  <h3 className="text-lg font-semibold">RSP Division</h3>
                  <p className="text-sm text-white/85">Recruitment, Selection & Placement</p>
                </div>
                <Users size={22} />
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#515F69]">Job Openings</p>
                  </div>
                  <p className="text-2xl font-bold leading-8 text-[#040E6B]">{loading ? '...' : rspStats.totalJobs}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#515F69]">Total Applicants</p>
                  </div>
                  <p className="text-2xl font-bold leading-8 text-[#040E6B]">{loading ? '...' : rspStats.totalApplicants}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#515F69]">Shortlisted</p>
                    <p className="text-xs text-slate-400">{loading ? '...' : rspStats.pendingReviews} pending</p>
                  </div>
                  <p className="text-2xl font-bold leading-8 text-[#040E6B]">{loading ? '...' : rspStats.pendingReviews}</p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
              <div className="flex items-center justify-between bg-[#363EE8] p-5 text-white">
                <div>
                  <h3 className="text-lg font-semibold">L&D Division</h3>
                  <p className="text-sm text-white/85">Learning & Development</p>
                </div>
                <GraduationCap size={22} />
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#515F69]">Training Programs</p>
                    <p className="text-xs text-slate-400">{loading ? '...' : lndStats.activeTrainings} upcoming</p>
                  </div>
                  <p className="text-2xl font-bold leading-8 text-[#040E6B]">{loading ? '...' : lndStats.totalPrograms}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#515F69]">Active Participants</p>
                  </div>
                  <p className="text-2xl font-bold leading-8 text-[#040E6B]">156</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#515F69]">Completion Rate</p>
                    <p className="text-xs text-slate-400">+5% vs last month</p>
                  </div>
                  <p className="text-2xl font-bold leading-8 text-[#040E6B]">87%</p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
              <div className="flex items-center justify-between bg-[#363EE8] p-5 text-white">
                <div>
                  <h3 className="text-lg font-semibold">PM Division</h3>
                  <p className="text-sm text-white/85">Performance Management</p>
                </div>
                <Award size={22} />
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#515F69]">Active Employees</p>
                    <p className="text-xs text-slate-400">Across all depts</p>
                  </div>
                  <p className="text-2xl font-bold leading-8 text-[#040E6B]">184</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#515F69]">In Progress</p>
                    <p className="text-xs text-slate-400">Evaluations ongoing</p>
                  </div>
                  <p className="text-2xl font-bold leading-8 text-[#040E6B]">{loading ? '...' : rspStats.pendingReviews}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#515F69]">Avg Performance</p>
                    <p className="text-xs text-slate-400">Out of 5.0</p>
                  </div>
                  <p className="text-2xl font-bold leading-8 text-[#040E6B]">4.2</p>
                </div>
              </div>
            </div>
          </div>

          {/* PM Dashboard Interface (copied from PM dashboard) */}
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Performance Management</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 hover:shadow-lg transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Active Evaluation Cycle</p>
                    <p className="text-lg font-bold text-slate-900">
                      {loading ? 'Loading...' : pmStats.activeCycle}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-900/10 rounded-lg">
                    <TrendingUp className="w-8 h-8 text-blue-900" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 hover:shadow-lg transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Pending Reviews</p>
                    <p className="text-4xl font-bold bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
                      {loading ? '...' : pmStats.pendingReviews}
                    </p>
                  </div>
                  <div className="p-3 bg-red-600/10 rounded-lg">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lower Panels */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
            {/* Recent System Activity */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Recent System Activity</h2>
                <span className="text-slate-400">∿</span>
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="border-l-4 border-blue-600 pl-4">
                    <p className="text-sm font-semibold text-blue-900">New Job Position Posted</p>
                    <p className="text-xs text-blue-700">IT Officer II - Item #ITMO2-2025-001</p>
                    <p className="text-xs text-blue-500 mt-1">2 hours ago</p>
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="border-l-4 border-emerald-600 pl-4">
                    <p className="text-sm font-semibold text-emerald-900">Training Program Completed</p>
                    <p className="text-xs text-emerald-700">Project Management Fundamentals - 32 participants</p>
                    <p className="text-xs text-emerald-500 mt-1">5 hours ago</p>
                  </div>
                </div>
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <div className="border-l-4 border-orange-600 pl-4">
                    <p className="text-sm font-semibold text-orange-900">Performance Evaluation Updated</p>
                    <p className="text-xs text-orange-700">Q1 2025 evaluations - 42 in progress</p>
                    <p className="text-xs text-orange-500 mt-1">1 day ago</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Department Overview */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Department Overview</h2>
                <span className="text-slate-400">🏢</span>
              </div>
              <div className="space-y-3">
                {[
                  { name: 'IT Department', employees: 32, openings: 3, trend: 'up' },
                  { name: 'HR Department', employees: 18, openings: 1, trend: 'up' },
                  { name: 'Finance Department', employees: 24, openings: 1, trend: 'up' },
                  { name: 'Operations', employees: 45, openings: 1, trend: 'up' },
                  { name: 'Legal Department', employees: 12, openings: 0, trend: 'flat' }
                ].map((dept) => (
                  <div key={dept.name} className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{dept.name}</p>
                      <p className="text-xs text-slate-500">
                        {dept.employees} employees • {dept.openings} open position{dept.openings === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className={`text-sm ${dept.trend === 'flat' ? 'text-slate-400' : 'text-emerald-600'}`}>
                      {dept.trend === 'flat' ? '∿' : '↗'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-8 rounded-xl bg-[#363EE8] p-6 text-white">
            <h2 className="text-lg font-semibold">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <button className="h-14 rounded-xl bg-white/15 hover:bg-white/20 transition" type="button" />
              <button className="h-14 rounded-xl bg-white/15 hover:bg-white/20 transition" type="button" />
              <button className="h-14 rounded-xl bg-white/15 hover:bg-white/20 transition" type="button" />
              <button className="h-14 rounded-xl bg-white/15 hover:bg-white/20 transition" type="button" />
            </div>
          </div>
        </div>
      </main>
      </div>
    </div>
  );
};
