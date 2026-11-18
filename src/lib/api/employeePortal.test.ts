import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  updateSelect: vi.fn(),
  maybeSingle: vi.fn(),
  readSelect: vi.fn(),
  readEq: vi.fn(),
  single: vi.fn(),
}));

vi.mock('../supabase', () => ({ supabase: { from: db.from } }));

import { patchPortalEmployee } from './employeePortal';

/** A row shape close enough to the real `employees` row for the mapper. */
const employeeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'emp-1',
  employee_number: 'EMP-1',
  first_name: 'Ana',
  middle_name: '',
  last_name: 'Cruz',
  suffix: '',
  email: 'ana@example.test',
  phone: '09123456789',
  date_of_birth: '1990-01-02',
  place_of_birth: 'Iloilo',
  sex: 'Female',
  civil_status: 'Single',
  height_m: 1.72,
  weight_kg: 60,
  modified_at: '2026-11-17T00:00:00.000Z',
  ...overrides,
});

const mockUpdatedRow = (updated: Record<string, unknown> | null, error: { message: string } | null = null) => {
  db.maybeSingle.mockResolvedValue({ data: updated, error });
  db.updateSelect.mockReturnValue({ maybeSingle: db.maybeSingle });
  db.updateEq.mockReturnValue({ select: db.updateSelect });
  db.update.mockReturnValue({ eq: db.updateEq });
};

const mockExistingRow = (current: Record<string, unknown> | null) => {
  db.single.mockResolvedValue({ data: current, error: null });
  db.readEq.mockReturnValue({ single: db.single });
  db.readSelect.mockReturnValue({ eq: db.readEq });
};

beforeEach(() => {
  vi.clearAllMocks();
  db.from.mockReturnValue({ update: db.update, select: db.readSelect });
});

describe('patchPortalEmployee', () => {
  it('returns the checked updated row as a normalized Employee', async () => {
    mockUpdatedRow(employeeRow({ place_of_birth: 'Iloilo City', height_m: 1.7 }));

    const result = await patchPortalEmployee('emp-1', { placeOfBirth: 'Iloilo City', heightM: 1.7 });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: {
        supabaseId: 'emp-1',
        employeeId: 'EMP-1',
        placeOfBirth: 'Iloilo City',
        heightM: 1.7,
      },
    });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.update.mock.calls[0][0]).toMatchObject({
      place_of_birth: 'Iloilo City',
      height_m: 1.7,
      modified_at: expect.any(String),
    });
    expect(db.updateEq).toHaveBeenCalledWith('id', 'emp-1');
    expect(db.updateSelect).toHaveBeenCalledWith('*');
  });

  it('fails when the update matched no employee row', async () => {
    mockUpdatedRow(null);

    const result = await patchPortalEmployee('emp-1', { placeOfBirth: 'Iloilo City' });

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/row/i) });
    expect(result).not.toHaveProperty('data');
  });

  it('leaves omitted numeric fields out of the update', async () => {
    mockUpdatedRow(employeeRow());

    const result = await patchPortalEmployee('emp-1', { bloodType: 'O+' });

    const columns = db.update.mock.calls[0][0] as Record<string, unknown>;
    expect(columns).not.toHaveProperty('height_m');
    expect(columns).not.toHaveProperty('weight_kg');
    expect(columns.blood_type).toBe('O+');
    expect(result).toMatchObject({ ok: true, data: { heightM: 1.72, weightKg: 60 } });
  });

  it('writes cleared height and weight as SQL null', async () => {
    mockUpdatedRow(employeeRow({ height_m: null, weight_kg: null }));

    const result = await patchPortalEmployee('emp-1', { heightM: null, weightKg: null });

    const columns = db.update.mock.calls[0][0] as Record<string, unknown>;
    expect(columns.height_m).toBeNull();
    expect(columns.weight_kg).toBeNull();
    expect(result).toMatchObject({ ok: true, data: { heightM: undefined, weightKg: undefined } });
  });

  it('preserves an explicit zero instead of treating it as cleared', async () => {
    mockUpdatedRow(employeeRow({ weight_kg: 0 }));

    const result = await patchPortalEmployee('emp-1', { weightKg: 0 });

    const columns = db.update.mock.calls[0][0] as Record<string, unknown>;
    expect(columns.weight_kg).toBe(0);
    expect(result).toMatchObject({ ok: true, data: { weightKg: 0 } });
  });

  it('does not issue an update when the patch has no writable fields', async () => {
    mockExistingRow(employeeRow());

    const result = await patchPortalEmployee('emp-1', {});

    expect(db.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, data: { email: 'ana@example.test' } });
  });

  it('reports a database error instead of claiming success', async () => {
    mockUpdatedRow(null, { message: 'permission denied' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    let result: Awaited<ReturnType<typeof patchPortalEmployee>>;
    try {
      result = await patchPortalEmployee('emp-1', { placeOfBirth: 'Iloilo City' });
    } finally {
      consoleError.mockRestore();
    }

    expect(result).toEqual({ ok: false, error: 'permission denied' });
  });
});
