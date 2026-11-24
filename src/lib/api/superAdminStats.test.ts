import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  errors: new Set<string>(),
  queriedTables: [] as string[],
}));

vi.mock('../supabase', () => {
  const from = (table: string) => {
    mockDb.queriedTables.push(table);
    const filters: Array<(row: any) => boolean> = [];
    let isHead = false;
    let sliceRange: [number, number] | null = null;

    const builder: any = {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        isHead = Boolean(opts?.head);
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push((row) => row[col] === val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((row) => vals.includes(row[col]));
        return builder;
      },
      is: (col: string, val: unknown) => {
        filters.push((row) => (row[col] ?? null) === val);
        return builder;
      },
      not: (col: string, op: string, val: unknown) => {
        if (op === 'is' && val === null) {
          filters.push((row) => row[col] != null);
        }
        return builder;
      },
      order: () => builder,
      range: (fromIdx: number, toIdx: number) => {
        sliceRange = [fromIdx, toIdx];
        return builder;
      },
      then: (resolve: (val: any) => void) => {
        if (mockDb.errors.has(table)) {
          resolve({ data: null, count: null, error: { message: `${table} failed` } });
          return;
        }
        const matched = (mockDb.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (isHead) {
          resolve({ data: null, count: matched.length, error: null });
          return;
        }
        const data = sliceRange ? matched.slice(sliceRange[0], sliceRange[1] + 1) : matched;
        resolve({ data, count: matched.length, error: null });
      },
    };
    return builder;
  };
  return { supabase: { from } };
});

import { fetchSuperAdminDashboardStats } from './superAdminStats';

describe('fetchSuperAdminDashboardStats', () => {
  beforeEach(() => {
    mockDb.errors.clear();
    mockDb.queriedTables.length = 0;
    mockDb.tables = {
      applicants: [
        { id: 'a1', status: 'Shortlisted', deleted_at: null },
        { id: 'a2', status: 'Pending', deleted_at: null },
        { id: 'a3', status: 'Hired', deleted_at: '2026-09-01' },
      ],
      raters: [{ id: 'r1' }, { id: 'r2' }],
      job_postings: [
        { id: 'j1', title: 'Engineer II', item_number: 'ENG-02', department: 'Office of the City Engineer', status: 'Open', created_at: '2026-11-20T00:00:00Z', deleted_at: null },
        { id: 'j2', title: 'Old Role', item_number: 'OLD-01', department: 'Office of the City Engineer', status: 'Closed', created_at: '2026-01-01T00:00:00Z', deleted_at: null },
      ],
      training_sessions: [
        { id: 't1', title: 'Leadership Workshop', scheduled_date: '2026-12-01', end_date: '2026-12-02', status: 'Scheduled', created_at: '2026-11-22T00:00:00Z' },
        { id: 't2', title: 'Past Seminar', scheduled_date: '2026-05-01', end_date: '2026-05-02', status: 'Completed', created_at: '2026-04-01T00:00:00Z' },
      ],
      training_enrollments: [
        { id: 'e1', attendance_status: 'Present', is_active: true },
        { id: 'e2', attendance_status: 'Absent', is_active: true },
        { id: 'e3', attendance_status: 'Present', is_active: false },
      ],
      departments: [
        { id: 'd1', name: 'Office of the City Engineer', is_active: true, parent_department_id: null },
        { id: 'd2', name: 'City Health Office', is_active: true, parent_department_id: null },
        { id: 'd3', name: 'Sub-Division', is_active: true, parent_department_id: 'd1' },
      ],
      employees_with_department: [
        { id: 'emp1', department: 'Office of the City Engineer', status: 'Active' },
        { id: 'emp2', department: 'Office of the City Engineer', status: 'Active' },
        { id: 'emp3', department: 'City Health Office', status: 'Active' },
      ],
      performance_cycles: [
        { id: 1, title: '2026 Semester 2', status: 'Active', created_at: '2026-07-01T00:00:00Z' },
      ],
      target_settings: [
        { id: 'ts1', status: 'submitted', phase2_status: 'locked' },
        { id: 'ts2', status: 'approved', phase2_status: 'in_progress' },
      ],
      performance_evaluations: [
        { id: 'pe1', final_score: 4.5 },
        { id: 'pe2', final_score: 4.1 },
      ],
    };
  });

  it('aggregates live metrics from canonical tables without querying legacy jobs/trainings', async () => {
    const res = await fetchSuperAdminDashboardStats(new Date('2026-11-24T00:00:00Z'));

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(mockDb.queriedTables).not.toContain('jobs');
    expect(mockDb.queriedTables).not.toContain('trainings');

    expect(res.data.rsp).toEqual({
      totalApplicants: 2,
      openJobs: 1,
      totalRaters: 2,
      shortlisted: 1,
      pendingScreening: 1,
    });
    expect(res.data.lnd).toEqual({
      totalSessions: 2,
      upcomingSessions: 1,
      activeParticipants: 2,
      completionRatePct: 50,
    });
    expect(res.data.pm).toEqual({
      activeEmployees: 3,
      activeCycleCount: 1,
      activeCycleTitle: '2026 Semester 2',
      inProgressEvaluations: 1,
      pendingReviews: 1,
      avgPerformanceScore: 4.3,
    });
    expect(res.data.departments).toEqual([
      { id: 'd1', name: 'Office of the City Engineer', employees: 2, openings: 1 },
      { id: 'd2', name: 'City Health Office', employees: 1, openings: 0 },
    ]);
    expect(res.data.recentActivity[0]?.id).toBe('training:t1');
  });

  it('returns ok: false when any table query fails instead of silently showing zeroes', async () => {
    mockDb.errors.add('job_postings');
    const res = await fetchSuperAdminDashboardStats(new Date('2026-11-24T00:00:00Z'));
    expect(res).toEqual({ ok: false, error: 'job_postings failed' });
  });
});
