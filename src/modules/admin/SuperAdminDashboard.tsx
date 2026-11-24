import { AlertCircle, Award, Building2, GraduationCap, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminHeader } from '../../components/AdminHeader';
import { Sidebar } from '../../components/Sidebar';
import {
  fetchSuperAdminDashboardStats,
  type SuperAdminDashboardStats,
} from '../../lib/api/superAdminStats';
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

const ACTIVITY_STYLES = {
  rsp: {
    box: 'border-blue-200 bg-blue-50',
    accent: 'border-blue-600',
    title: 'text-blue-900',
    detail: 'text-blue-700',
    time: 'text-blue-500',
  },
  lnd: {
    box: 'border-emerald-200 bg-emerald-50',
    accent: 'border-emerald-600',
    title: 'text-emerald-900',
    detail: 'text-emerald-700',
    time: 'text-emerald-600',
  },
  pm: {
    box: 'border-amber-200 bg-amber-50',
    accent: 'border-amber-600',
    title: 'text-amber-900',
    detail: 'text-amber-800',
    time: 'text-amber-700',
  },
} as const;

const formatActivityDate = (iso: string) => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const SuperAdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SuperAdminDashboardStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetchSuperAdminDashboardStats();
      if (cancelled) return;
      if (res.ok === false) {
        setError(res.error);
        setStats(null);
      } else {
        setStats(res.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

            {error && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
              >
                Unable to load live dashboard metrics: {error}
              </div>
            )}

            {/* Summary Cards */}
            <div className="mb-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Total applicants"
                value={loading ? '…' : (stats?.rsp.totalApplicants ?? '—')}
                caption="RSP Division"
                icon={Users}
              />
              <KpiCard
                title="Upcoming trainings"
                value={loading ? '…' : (stats?.lnd.upcomingSessions ?? '—')}
                caption="L&D Division"
                icon={GraduationCap}
              />
              <KpiCard
                title="Active evaluation cycles"
                value={loading ? '…' : (stats?.pm.activeCycleCount ?? '—')}
                caption="PM Division"
                icon={Award}
              />
              <KpiCard
                title="Active offices"
                value={loading ? '…' : (stats?.departments.length ?? '—')}
                caption="Top-level LGU offices"
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
                      <p className="text-[13px] font-medium text-[#515F69]">Open Job Postings</p>
                    </div>
                    <p className="text-2xl font-bold leading-8 text-[#040E6B]">
                      {loading ? '…' : (stats?.rsp.openJobs ?? '—')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-[#515F69]">Total Applicants</p>
                    </div>
                    <p className="text-2xl font-bold leading-8 text-[#040E6B]">
                      {loading ? '…' : (stats?.rsp.totalApplicants ?? '—')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-[#515F69]">Shortlisted / In Evaluation</p>
                      <p className="text-xs text-slate-500">
                        {loading ? '…' : `${stats?.rsp.pendingScreening ?? 0} pending screening`}
                      </p>
                    </div>
                    <p className="text-2xl font-bold leading-8 text-[#040E6B]">
                      {loading ? '…' : (stats?.rsp.shortlisted ?? '—')}
                    </p>
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
                      <p className="text-[13px] font-medium text-[#515F69]">Training Sessions</p>
                      <p className="text-xs text-slate-500">
                        {loading ? '…' : `${stats?.lnd.upcomingSessions ?? 0} upcoming`}
                      </p>
                    </div>
                    <p className="text-2xl font-bold leading-8 text-[#040E6B]">
                      {loading ? '…' : (stats?.lnd.totalSessions ?? '—')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-[#515F69]">Active Participants</p>
                    </div>
                    <p className="text-2xl font-bold leading-8 text-[#040E6B]">
                      {loading ? '…' : (stats?.lnd.activeParticipants ?? '—')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-[#515F69]">Attendance Completion Rate</p>
                      <p className="text-xs text-slate-500">Present vs active enrollments</p>
                    </div>
                    <p className="text-2xl font-bold leading-8 text-[#040E6B]">
                      {loading
                        ? '…'
                        : stats?.lnd.completionRatePct != null
                          ? `${stats.lnd.completionRatePct}%`
                          : '—'}
                    </p>
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
                      <p className="text-xs text-slate-500">Across all offices</p>
                    </div>
                    <p className="text-2xl font-bold leading-8 text-[#040E6B]">
                      {loading ? '…' : (stats?.pm.activeEmployees ?? '—')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-[#515F69]">In Progress</p>
                      <p className="text-xs text-slate-500">Active Phase 2 ratings</p>
                    </div>
                    <p className="text-2xl font-bold leading-8 text-[#040E6B]">
                      {loading ? '…' : (stats?.pm.inProgressEvaluations ?? '—')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-[#515F69]">Avg Performance</p>
                      <p className="text-xs text-slate-500">Out of 5.0</p>
                    </div>
                    <p className="text-2xl font-bold leading-8 text-[#040E6B]">
                      {loading
                        ? '…'
                        : stats?.pm.avgPerformanceScore != null
                          ? stats.pm.avgPerformanceScore.toFixed(2)
                          : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Management Summary */}
            <div className="mt-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Performance Management</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 hover:shadow-lg transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Active Evaluation Cycle</p>
                      <p className="text-lg font-bold text-slate-900">
                        {loading ? 'Loading...' : (stats?.pm.activeCycleTitle ?? 'None')}
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
                      <p className="text-sm font-medium text-slate-600 mb-1">Pending Target Reviews</p>
                      <p className="text-4xl font-bold bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
                        {loading ? '…' : (stats?.pm.pendingReviews ?? '—')}
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
                </div>
                {loading ? (
                  <p className="text-sm text-slate-500">Loading recent activity…</p>
                ) : !stats || stats.recentActivity.length === 0 ? (
                  <p className="text-sm text-slate-500">No recent division records found.</p>
                ) : (
                  <div className="space-y-4">
                    {stats.recentActivity.map((item) => {
                      const style = ACTIVITY_STYLES[item.category];
                      return (
                        <div key={item.id} className={`rounded-xl border p-4 ${style.box}`}>
                          <div className={`border-l-4 pl-4 ${style.accent}`}>
                            <p className={`text-sm font-semibold ${style.title}`}>{item.title}</p>
                            <p className={`text-xs ${style.detail}`}>{item.detail}</p>
                            <p className={`text-xs mt-1 ${style.time}`}>{formatActivityDate(item.timestamp)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Department Overview */}
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Office Overview</h2>
                  <Building2 size={18} className="text-slate-400" />
                </div>
                {loading ? (
                  <p className="text-sm text-slate-500">Loading offices…</p>
                ) : !stats || stats.departments.length === 0 ? (
                  <p className="text-sm text-slate-500">No active offices recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {stats.departments.map((dept) => (
                      <div key={dept.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{dept.name}</p>
                          <p className="text-xs text-slate-500">
                            {dept.employees} active employee{dept.employees === 1 ? '' : 's'} · {dept.openings} open position
                            {dept.openings === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-slate-500">
                          {dept.openings > 0 ? 'Hiring' : 'Active'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
