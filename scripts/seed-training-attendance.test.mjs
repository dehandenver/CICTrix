import { describe, it, expect, vi } from 'vitest';

// The seeder's dry run must never reach the configured project: the roster and
// sessions below are the whole world it sees, and any write fails the test.
const fixture = vi.hoisted(() => {
  const OFFICES = [
    'Office of The City Health Officer',
    'Office of The City Accountant',
    'Office of The City Engineer',
    'Office of The City Social Welfare and Development Officer',
    'Office of the City General Services Officer',
  ];
  const EMPLOYEES_PER_OFFICE = 20;
  const employees = OFFICES.flatMap((department, office) =>
    Array.from({ length: EMPLOYEES_PER_OFFICE }, (_, index) => ({
      id: `00000000-0000-0000-000${office}-${String(index).padStart(12, '0')}`,
      department,
      status: 'Active',
    })),
  );
  const session = (id, title, month, status = 'Scheduled') => ({
    id: `11111111-1111-1111-1111-${String(id).padStart(12, '0')}`,
    title,
    category: 'General',
    scheduled_date: `2026-${month}-10T08:00:00.000Z`,
    end_date: `2026-${month}-11T17:00:00.000Z`,
    capacity: 500,
    status,
    objectives: [],
  });
  const sessions = [
    session(1, 'Ethics in Public Service', '03'),
    session(2, 'Local Governance & LGU Operations', '04'),
    session(3, 'Records Management', '05'),
    session(4, 'Customer Service in Government', '06'),
    session(5, 'Year-End Planning', '12'),
  ];
  const tables = { employees_with_department: employees, training_sessions: sessions };
  const client = {
    from(table) {
      if (!(table in tables)) throw new Error(`Unexpected table: ${table}`);
      const chain = {
        then: (resolve) => resolve({ data: tables[table], error: null }),
      };
      for (const method of ['select', 'in', 'eq', 'order']) chain[method] = () => chain;
      for (const method of ['insert', 'upsert', 'update', 'delete']) {
        chain[method] = () => { throw new Error(`Unexpected write: ${method} on ${table}`); };
      }
      return chain;
    },
  };
  return { client, employees, sessions };
});

vi.mock('./lib/ipcr-shared.mjs', () => ({
  loadEnv: () => ({}),
  serviceClient: () => fixture.client,
  die: (message) => { throw new Error(message); },
}));

import {
  computeEnrolledAt,
  effectiveStatus,
  getOfficeAffinity,
  isGeneralOrEthics,
  ACTIVE_OFFICES,
  generateTrainingAttendance,
} from './seed-training-attendance.mjs';

describe('seed-training-attendance', () => {
  it('computes enrolled_at timestamp strictly before scheduled_date', () => {
    const scheduled = '2026-07-15T09:00:00.000Z';
    const empId = '00000000-0000-0000-0000-000000000001';
    const sessionId = '11111111-1111-1111-1111-111111111111';

    const enrolled = computeEnrolledAt(scheduled, empId, sessionId);
    expect(new Date(enrolled).getTime()).toBeLessThan(new Date(scheduled).getTime());
    // Between 3 and 11 days before
    const diffDays = (new Date(scheduled).getTime() - new Date(enrolled).getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(3);
    expect(diffDays).toBeLessThanOrEqual(11);
  });

  it('determines effectiveStatus accurately', () => {
    const now = new Date('2026-10-28T00:00:00Z');

    // Past session
    expect(
      effectiveStatus({ scheduled_date: '2026-07-01T08:00:00Z', end_date: '2026-07-02T17:00:00Z', status: 'Scheduled' }, now)
    ).toBe('Completed');

    // Future session
    expect(
      effectiveStatus({ scheduled_date: '2026-11-15T08:00:00Z', end_date: null, status: 'Scheduled' }, now)
    ).toBe('Scheduled');

    // Cancelled session
    expect(
      effectiveStatus({ scheduled_date: '2026-07-01T08:00:00Z', end_date: null, status: 'Cancelled' }, now)
    ).toBe('Cancelled');
  });

  it('scores office affinities logically', () => {
    const healthSession = { title: 'Maternal Care & Clinical Health', objectives: ['Improve clinical care'] };
    const engSession = { title: 'Infrastructure Project Management', objectives: ['Civil works management'] };
    const accSession = { title: 'LGU Fiscal Management & Budgeting', objectives: ['COA audit rules'] };

    expect(getOfficeAffinity(healthSession, 'Office of The City Health Officer')).toBe(100);
    expect(getOfficeAffinity(engSession, 'Office of The City Engineer')).toBeGreaterThanOrEqual(85);
    expect(getOfficeAffinity(accSession, 'Office of The City Accountant')).toBe(100);
  });

  it('identifies ethics and general governance sessions', () => {
    expect(isGeneralOrEthics({ title: 'Ethics in Public Service', objectives: [] })).toBe(true);
    expect(isGeneralOrEthics({ title: 'Local Governance & LGU Operations', objectives: [] })).toBe(true);
    expect(isGeneralOrEthics({ title: 'Civil Engineering Road Design', objectives: [] })).toBe(false);
  });

  it('dry run reports the target compliance split for the fixture roster', async () => {
    const result = await generateTrainingAttendance({ dryRun: true, writeSql: false, applyDb: false });

    // 20 employees per office: 13 met, 4 partial, 3 none, across 5 offices.
    expect(result.totalEmployees).toBe(fixture.employees.length);
    expect(result.met).toBe(65);
    expect(result.partial).toBe(20);
    expect(result.none).toBe(15);
    expect(result.met + result.partial + result.none).toBe(result.totalEmployees);
    expect(result.metPct).toBe(65);
    expect(result.partialPct).toBe(20);
    expect(result.nonePct).toBe(15);
  });

  it('dry run counts past sessions only and enrolls each employee per their target', async () => {
    const result = await generateTrainingAttendance({ dryRun: true, writeSql: false, applyDb: false });

    expect(result.completedSessions).toBe(fixture.sessions.length - 1);
    expect(result.generatedEnrollments).toBe(result.met * 2 + result.partial);
  });
});
