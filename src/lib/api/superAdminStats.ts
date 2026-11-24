/**
 * Super Admin Dashboard live summary service.
 *
 * Centralizes read-only cross-division metrics against the canonical tables
 * (`job_postings`, `applicants`, `raters`, `training_sessions`,
 * `training_enrollments`, `departments`, `employees_with_department`,
 * `performance_cycles`, `target_settings`, `performance_evaluations`) using
 * exact counts and paginated reads instead of hardcoded placeholders or legacy
 * tables.
 */

import { supabase as supabaseClient } from '../supabase';
import { DIVISION_PARENT_COLUMN } from './departments';
import { fetchAllRows } from './fetchAllRows';
import { todayManilaIso } from '../../utils/manilaDate';

const supabase = supabaseClient as any;

export interface SuperAdminDepartmentSummary {
  id: string;
  name: string;
  employees: number;
  openings: number;
}

export interface SuperAdminActivityItem {
  id: string;
  category: 'rsp' | 'lnd' | 'pm';
  title: string;
  detail: string;
  timestamp: string;
}

export interface SuperAdminDashboardStats {
  rsp: {
    totalApplicants: number;
    openJobs: number;
    totalRaters: number;
    shortlisted: number;
    pendingScreening: number;
  };
  lnd: {
    totalSessions: number;
    upcomingSessions: number;
    activeParticipants: number;
    completionRatePct: number | null;
  };
  pm: {
    activeEmployees: number;
    activeCycleCount: number;
    activeCycleTitle: string;
    inProgressEvaluations: number;
    pendingReviews: number;
    avgPerformanceScore: number | null;
  };
  departments: SuperAdminDepartmentSummary[];
  recentActivity: SuperAdminActivityItem[];
}

export type SuperAdminStatsResult =
  | { ok: true; data: SuperAdminDashboardStats }
  | { ok: false; error: string };

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();

const OPEN_JOB_STATUSES = new Set(['open', 'active', 'published']);

export async function fetchSuperAdminDashboardStats(
  now: Date = new Date(),
): Promise<SuperAdminStatsResult> {
  try {
    const today = todayManilaIso(now);

    const [
      applicantsRes,
      shortlistedRes,
      pendingScreeningRes,
      ratersRes,
      jobPostingsRes,
      sessionsRes,
      enrollmentsRes,
      departmentsRes,
      activeEmployeesRes,
      cyclesRes,
      targetSettingsRes,
      evaluationsRes,
    ] = await Promise.all([
      supabase.from('applicants').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase
        .from('applicants')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('status', ['Shortlisted', 'Qualified', 'Interview/Exam Scheduled', 'For Evaluation']),
      supabase
        .from('applicants')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('status', ['New Application', 'Submitted', 'Pending', 'Under Initial Screening', 'Under Review']),
      supabase.from('raters').select('id', { count: 'exact', head: true }),
      fetchAllRows<any>((from, to) =>
        supabase
          .from('job_postings')
          .select('id, title, item_number, department, status, created_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<any>((from, to) =>
        supabase
          .from('training_sessions')
          .select('id, title, scheduled_date, end_date, status, created_at')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<any>((from, to) =>
        supabase
          .from('training_enrollments')
          .select('id, attendance_status, is_active')
          .order('id', { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<any>((from, to) =>
        supabase
          .from('departments')
          .select('id, name, is_active, parent_department_id')
          .is(DIVISION_PARENT_COLUMN, null)
          .eq('is_active', true)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<any>((from, to) =>
        supabase
          .from('employees_with_department')
          .select('id, department')
          .eq('status', 'Active')
          .order('id', { ascending: true })
          .range(from, to),
      ),
      supabase
        .from('performance_cycles')
        .select('id, title, status, created_at')
        .order('created_at', { ascending: false }),
      fetchAllRows<any>((from, to) =>
        supabase
          .from('target_settings')
          .select('id, status, phase2_status')
          .order('id', { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<any>((from, to) =>
        supabase
          .from('performance_evaluations')
          .select('id, final_score')
          .not('final_score', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      ),
    ]);

    const firstError =
      applicantsRes.error ??
      shortlistedRes.error ??
      pendingScreeningRes.error ??
      ratersRes.error ??
      jobPostingsRes.error ??
      sessionsRes.error ??
      enrollmentsRes.error ??
      departmentsRes.error ??
      activeEmployeesRes.error ??
      cyclesRes.error ??
      targetSettingsRes.error ??
      evaluationsRes.error;

    if (firstError) {
      return {
        ok: false,
        error: (firstError as any)?.message ?? 'Failed to load dashboard summary statistics.',
      };
    }

    const jobPostings = jobPostingsRes.data ?? [];
    const openJobs = jobPostings.filter((j: any) => {
      const s = norm(j.status);
      return !s || OPEN_JOB_STATUSES.has(s);
    });

    const sessions = sessionsRes.data ?? [];
    const upcomingSessions = sessions.filter((s: any) => {
      if (norm(s.status) === 'cancelled' || norm(s.status) === 'completed') return false;
      const dateStr = String(s.end_date ?? s.scheduled_date ?? '').slice(0, 10);
      return Boolean(dateStr && dateStr >= today);
    });

    const activeEnrollments = (enrollmentsRes.data ?? []).filter((e: any) => e.is_active !== false);
    const attendedCount = activeEnrollments.filter((e: any) => norm(e.attendance_status) === 'present').length;
    const completionRatePct =
      activeEnrollments.length > 0 ? Math.round((attendedCount / activeEnrollments.length) * 100) : null;

    const cycles = (cyclesRes.data ?? []) as any[];
    const activeCycles = cycles.filter((c) => norm(c.status) === 'active');

    const targetSettings = targetSettingsRes.data ?? [];
    const pendingReviews = targetSettings.filter((t: any) => norm(t.status) === 'submitted').length;
    const inProgressEvaluations = targetSettings.filter((t: any) => {
      const p2 = norm(t.phase2_status);
      return p2 === 'open' || p2 === 'in_progress';
    }).length;

    const numericScores = (evaluationsRes.data ?? [])
      .map((e: any) => Number(e.final_score))
      .filter((score) => Number.isFinite(score) && score > 0);
    const avgPerformanceScore =
      numericScores.length > 0
        ? Number((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length).toFixed(2))
        : null;

    const empCountByDept = new Map<string, number>();
    for (const emp of activeEmployeesRes.data ?? []) {
      const key = norm(emp.department);
      if (!key) continue;
      empCountByDept.set(key, (empCountByDept.get(key) ?? 0) + 1);
    }

    const openJobsByDept = new Map<string, number>();
    for (const job of openJobs) {
      const key = norm(job.department);
      if (!key) continue;
      openJobsByDept.set(key, (openJobsByDept.get(key) ?? 0) + 1);
    }

    const departments: SuperAdminDepartmentSummary[] = (departmentsRes.data ?? []).map((dept: any) => {
      const key = norm(dept.name);
      return {
        id: String(dept.id),
        name: String(dept.name ?? '').trim(),
        employees: empCountByDept.get(key) ?? 0,
        openings: openJobsByDept.get(key) ?? 0,
      };
    });

    const activityCandidates: SuperAdminActivityItem[] = [];
    for (const job of jobPostings.slice(0, 3)) {
      if (!job.created_at) continue;
      activityCandidates.push({
        id: `job:${job.id}`,
        category: 'rsp',
        title: 'Job Position Posted',
        detail: [job.title, job.item_number ? `Item #${job.item_number}` : job.department].filter(Boolean).join(' — '),
        timestamp: String(job.created_at),
      });
    }
    for (const session of sessions.slice(0, 3)) {
      if (!session.created_at) continue;
      activityCandidates.push({
        id: `training:${session.id}`,
        category: 'lnd',
        title: norm(session.status) === 'completed' ? 'Training Session Completed' : 'Training Session Scheduled',
        detail: [session.title, session.scheduled_date ? String(session.scheduled_date).slice(0, 10) : null]
          .filter(Boolean)
          .join(' — '),
        timestamp: String(session.created_at),
      });
    }
    for (const cycle of cycles.slice(0, 2)) {
      if (!cycle.created_at) continue;
      activityCandidates.push({
        id: `cycle:${cycle.id}`,
        category: 'pm',
        title: norm(cycle.status) === 'active' ? 'Active Performance Cycle' : 'Performance Cycle Recorded',
        detail: `${cycle.title} (${cycle.status ?? 'Recorded'})`,
        timestamp: String(cycle.created_at),
      });
    }

    activityCandidates.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return {
      ok: true,
      data: {
        rsp: {
          totalApplicants: applicantsRes.count ?? 0,
          openJobs: openJobs.length,
          totalRaters: ratersRes.count ?? 0,
          shortlisted: shortlistedRes.count ?? 0,
          pendingScreening: pendingScreeningRes.count ?? 0,
        },
        lnd: {
          totalSessions: sessions.length,
          upcomingSessions: upcomingSessions.length,
          activeParticipants: activeEnrollments.length,
          completionRatePct,
        },
        pm: {
          activeEmployees: (activeEmployeesRes.data ?? []).length,
          activeCycleCount: activeCycles.length,
          activeCycleTitle: activeCycles[0]?.title ?? 'None',
          inProgressEvaluations,
          pendingReviews,
          avgPerformanceScore,
        },
        departments,
        recentActivity: activityCandidates.slice(0, 5),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to load dashboard summary statistics.',
    };
  }
}
