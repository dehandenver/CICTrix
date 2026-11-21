import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  employeeTraining: { data: [] as any[], error: null as any },
  employees: { data: [] as any[], error: null as any },
  competencies: { data: [] as any[], error: null as any },
  departments: { data: [] as any[], error: null as any },
  attendanceError: null as Error | null,
  attendanceMap: new Map<string, Map<string, { status: 'Present' | 'Absent' | 'Excused' | null; note: string | null }>>(),
}));

vi.mock('./trainingAttendance', () => ({
  listAttendance: vi.fn(async () => {
    if (state.attendanceError) throw state.attendanceError;
    return state.attendanceMap;
  }),
}));

vi.mock('../supabase', () => {
  const from = (table: string) => {
    const resolve = () => {
      if (table === 'employee_training') return Promise.resolve(state.employeeTraining);
      if (table === 'employees') return Promise.resolve(state.employees);
      if (table === 'employee_training_competencies') return Promise.resolve(state.competencies);
      if (table === 'departments') return Promise.resolve(state.departments);
      return Promise.resolve({ data: [], error: null });
    };
    const chain: any = {
      select: () => chain,
      order: () => chain,
      in: () => chain,
      is: () => chain,
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        resolve().then(onFulfilled, onRejected),
    };
    return chain;
  };
  return { supabase: { from }, isMockModeEnabled: false };
});

import { listArchiveOfficeDirectory, listTrainingArchive } from './lndArchive';

describe('lndArchive honest reads & hybrid attendance', () => {
  beforeEach(() => {
    state.employeeTraining = { data: [], error: null };
    state.employees = { data: [], error: null };
    state.competencies = { data: [], error: null };
    state.departments = { data: [], error: null };
    state.attendanceError = null;
    state.attendanceMap = new Map();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('throws when employee_training, employees, or competency tags fail', async () => {
    state.employeeTraining = { data: null, error: { message: 'archive down' } };
    await expect(listTrainingArchive('HRMO')).rejects.toThrow(/archive down/i);

    state.employeeTraining = {
      data: [{ id: 'tr-1', employee_id: 'emp-1', training_title: 'Seminar', from_date: '2026-03-01', enrollment_id: null }],
      error: null,
    };
    state.employees = { data: null, error: { message: 'employees down' } };
    await expect(listTrainingArchive('HRMO')).rejects.toThrow(/employees down/i);

    state.employees = {
      data: [{ id: 'emp-1', employee_number: 'E-1', first_name: 'Ana', last_name: 'Cruz', department: 'HRMO' }],
      error: null,
    };
    state.competencies = { data: null, error: { message: 'tags down' } };
    await expect(listTrainingArchive('HRMO')).rejects.toThrow(/tags down/i);
  });

  it('propagates live listAttendance errors instead of falling back to stored attendance_percentage', async () => {
    state.employeeTraining = {
      data: [
        {
          id: 'tr-linked',
          employee_id: 'emp-1',
          training_title: 'Linked Course',
          from_date: '2026-04-01',
          enrollment_id: 'enr-1',
          attendance_percentage: 95,
        },
      ],
      error: null,
    };
    state.employees = {
      data: [{ id: 'emp-1', employee_number: 'E-1', first_name: 'Ana', last_name: 'Cruz', department: 'HRMO' }],
      error: null,
    };
    state.attendanceError = new Error('attendance unavailable');

    await expect(listTrainingArchive('HRMO')).rejects.toThrow(/attendance unavailable/i);
  });

  it('uses live attendance for linked rows and retains stored fallback for historical unlinked rows', async () => {
    state.employeeTraining = {
      data: [
        {
          id: 'tr-linked',
          employee_id: 'emp-1',
          training_title: 'Linked Course',
          from_date: '2026-04-01',
          enrollment_id: 'enr-1',
          attendance_percentage: 100,
        },
        {
          id: 'tr-hist',
          employee_id: 'emp-1',
          training_title: 'Historical Course',
          from_date: '2025-04-01',
          enrollment_id: null,
          attendance_percentage: 88,
        },
      ],
      error: null,
    };
    state.employees = {
      data: [{ id: 'emp-1', employee_number: 'E-1', first_name: 'Ana', last_name: 'Cruz', department: 'HRMO' }],
      error: null,
    };
    state.attendanceMap.set(
      'enr-1',
      new Map([
        ['2026-04-01|AM', { status: 'Present', note: null }],
        ['2026-04-01|PM', { status: 'Absent', note: null }],
      ]),
    );

    const archive = await listTrainingArchive('HRMO');
    expect(archive).toHaveLength(1);
    const byId = Object.fromEntries(archive[0].trainings.map((t) => [t.id, t]));
    expect(byId['tr-linked'].attendancePercent).toBe(50);
    expect(byId['tr-hist'].attendancePercent).toBe(88);
  });

  it('returns [] cleanly when scoped office has no matching records', async () => {
    state.employeeTraining = {
      data: [{ id: 'tr-1', employee_id: 'emp-1', training_title: 'Course', from_date: '2026-04-01', enrollment_id: 'enr-1' }],
      error: null,
    };
    state.employees = {
      data: [{ id: 'emp-1', employee_number: 'E-1', first_name: 'Ana', last_name: 'Cruz', department: 'Accounting' }],
      error: null,
    };

    expect(await listTrainingArchive('Budget Office')).toEqual([]);
  });

  it('listArchiveOfficeDirectory throws on departments, employee_training, or employees failures', async () => {
    state.departments = { data: null, error: { message: 'depts failed' } };
    await expect(listArchiveOfficeDirectory()).rejects.toThrow(/depts failed/i);

    state.departments = { data: [{ name: 'HRMO', is_active: true }], error: null };
    state.employeeTraining = { data: null, error: { message: 'trainings failed' } };
    await expect(listArchiveOfficeDirectory()).rejects.toThrow(/trainings failed/i);

    state.employeeTraining = { data: [{ employee_id: 'emp-1', from_date: '2026-01-01' }], error: null };
    state.employees = { data: null, error: { message: 'emp lookup failed' } };
    await expect(listArchiveOfficeDirectory()).rejects.toThrow(/emp lookup failed/i);
  });
});
