import { useEffect, useState } from 'react';
import { Users, GraduationCap, Award, Building2 } from 'lucide-react';
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
    evaluationStatus: 0
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
        cyclesRes
      ] = await Promise.all([
        supabase.from('applicants').select('id', { count: 'exact', head: true }),
        supabase.from('jobs').select('id', { count: 'exact', head: true }),
        supabase.from('raters').select('id', { count: 'exact', head: true }),
        supabase.from('applicants').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('trainings').select('id', { count: 'exact', head: true }),
        supabase.from('trainings').select('id', { count: 'exact', head: true }).gte('date', today).neq('status', 'Cancelled'),
        supabase.from('performance_cycles').select('id', { count: 'exact', head: true }).eq('status', 'Active')
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
        evaluationStatus: cyclesRes.count || 0
      });
    } catch (error) {
      console.error('Error fetching summary stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Super Admin Dashboard</h1>
            <p className="text-slate-500 mt-2">Comprehensive overview of all HRIS divisions</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Applicants</p>
                  <p className="text-3xl font-semibold text-slate-900 mt-2">
                    {loading ? '...' : rspStats.totalApplicants}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">RSP Division</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Users className="text-blue-600" size={22} />
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Active Trainings</p>
                  <p className="text-3xl font-semibold text-slate-900 mt-2">
                    {loading ? '...' : lndStats.activeTrainings}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">L&D Division</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <GraduationCap className="text-emerald-600" size={22} />
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Evaluation Status</p>
                  <p className="text-3xl font-semibold text-slate-900 mt-2">
                    {loading ? '...' : pmStats.evaluationStatus}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">PM Division</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Award className="text-amber-600" size={22} />
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Department Summary</p>
                  <p className="text-3xl font-semibold text-slate-900 mt-2">5</p>
                  <p className="text-xs text-slate-400 mt-2">Active Departments</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Building2 className="text-purple-600" size={22} />
                </div>
              </div>
            </div>
          </div>

          {/* Division Cards */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
              <div className="bg-blue-600 text-white p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">RSP Division</h3>
                  <p className="text-sm text-blue-100">Recruitment, Selection & Placement</p>
                </div>
                <Users size={22} />
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Job Openings</p>
                    <p className="text-xs text-slate-400">+2 this month</p>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900">{loading ? '...' : rspStats.totalJobs}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Total Applicants</p>
                    <p className="text-xs text-slate-400">+12 this week</p>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900">{loading ? '...' : rspStats.totalApplicants}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Shortlisted</p>
                    <p className="text-xs text-slate-400">{loading ? '...' : rspStats.pendingReviews} pending</p>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900">{loading ? '...' : rspStats.pendingReviews}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
              <div className="bg-emerald-600 text-white p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">L&D Division</h3>
                  <p className="text-sm text-emerald-100">Learning & Development</p>
                </div>
                <GraduationCap size={22} />
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Training Programs</p>
                    <p className="text-xs text-slate-400">{loading ? '...' : lndStats.activeTrainings} upcoming</p>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900">{loading ? '...' : lndStats.totalPrograms}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Active Participants</p>
                    <p className="text-xs text-slate-400">+22 this month</p>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900">156</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Completion Rate</p>
                    <p className="text-xs text-slate-400">+5% vs last month</p>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900">87%</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
              <div className="bg-orange-500 text-white p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">PM Division</h3>
                  <p className="text-sm text-orange-100">Performance Management</p>
                </div>
                <Award size={22} />
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Active Employees</p>
                    <p className="text-xs text-slate-400">Across all depts</p>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900">184</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">In Progress</p>
                    <p className="text-xs text-slate-400">Evaluations ongoing</p>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900">{loading ? '...' : rspStats.pendingReviews}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Avg Performance</p>
                    <p className="text-xs text-slate-400">Out of 5.0</p>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900">4.2</p>
                </div>
              </div>
            </div>
          </div>

          {/* Lower Panels */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
            {/* Recent System Activity */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
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
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
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
          <div className="mt-8 bg-blue-600 rounded-2xl p-6 text-white shadow-sm">
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
  );
};
