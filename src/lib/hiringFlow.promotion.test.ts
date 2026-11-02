import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromotionalAppointmentError } from './api/promotionalHiring';
import type { PromotionalAppointmentResult } from './api/promotionalHiring';
import type { ReservedApplicant } from './hiringFlow';

const mocks = vi.hoisted(() => ({
  hireApplicant: vi.fn(),
  completePromotionalAppointment: vi.fn(),
  assignApplicantToSlot: vi.fn(),
  createPassword: vi.fn(),
  upsertEmployeePortalAccount: vi.fn(),
  sendEmail: vi.fn(),
  saveNewlyHired: vi.fn(),
  saveApplicants: vi.fn(),
  getApplicants: vi.fn(),
  applicantRows: [] as any[],
  rpc: vi.fn(),
}));

vi.mock('./supabase', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    is: () => builder,
    not: () => builder,
    order: () => builder,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: mocks.applicantRows, error: null }).then(resolve),
  };
  return { supabase: { from: () => builder, rpc: mocks.rpc } };
});

vi.mock('./api/employeesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/employeesApi')>()),
  hireApplicantWithOutcome: mocks.hireApplicant,
}));
vi.mock('./api/promotionalHiring', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/promotionalHiring')>()),
  completePromotionalAppointment: mocks.completePromotionalAppointment,
}));
vi.mock('./recruitmentData', () => ({
  getApplicants: mocks.getApplicants,
  saveApplicants: mocks.saveApplicants,
  saveNewlyHired: mocks.saveNewlyHired,
}));
vi.mock('./plantillaSlots', () => ({
  assignApplicantToSlot: mocks.assignApplicantToSlot,
  fetchApplicantSlotLinks: async () => new Map(),
  fetchSlotsByJobPosting: async () => new Map(),
}));
vi.mock('./employeePortalData', () => ({
  createPassword: mocks.createPassword,
  upsertEmployeePortalAccount: mocks.upsertEmployeePortalAccount,
}));
vi.mock('./email', () => ({ sendEmail: mocks.sendEmail }));

import { ExternalHireError } from './api/employeesApi';
import { fetchReservedApplicants, generateEmployeeCredentials } from './hiringFlow';

const externalRow = (overrides: Partial<ReservedApplicant> = {}): ReservedApplicant => ({
  id: 'app-ext-1',
  fullName: 'Maria Santos',
  email: 'maria.santos@example.com',
  referenceNo: 'REF-1',
  position: 'Administrative Aide',
  department: 'CHRMO',
  slotId: 'slot-1',
  plantilla: 'Item 101 / Slot 1',
  slotItemNumber: '101',
  slotNumber: 1,
  signingDeadline: null,
  interviewScore: null,
  applicationType: 'job',
  employeeNumber: null,
  ...overrides,
});

const promotionRow = (overrides: Partial<ReservedApplicant> = {}): ReservedApplicant => ({
  ...externalRow({
    id: 'app-promo-1',
    fullName: 'Juan Dela Cruz',
    email: 'juan.delacruz@example.com',
    position: 'Administrative Officer II',
    department: 'Treasury',
    slotId: 'slot-2',
    plantilla: 'Item 202 / Slot 1',
    slotItemNumber: '202',
  }),
  applicationType: 'promotion',
  employeeNumber: 'EMP-0042',
  ...overrides,
});

const completed = (applicantId: string, alreadyCompleted = false): PromotionalAppointmentResult => ({
  applicantId,
  employeeUuid: `uuid-${applicantId}`,
  employeeNumber: 'EMP-0042',
  slotId: 'slot-2',
  completedAt: '2026-11-02T00:00:00.000Z',
  alreadyCompleted,
});

const expectNoExternalSideEffects = () => {
  expect(mocks.hireApplicant).not.toHaveBeenCalled();
  expect(mocks.assignApplicantToSlot).not.toHaveBeenCalled();
  expect(mocks.createPassword).not.toHaveBeenCalled();
  expect(mocks.upsertEmployeePortalAccount).not.toHaveBeenCalled();
  expect(mocks.sendEmail).not.toHaveBeenCalled();
  expect(mocks.saveNewlyHired).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.applicantRows = [];
  mocks.getApplicants.mockReturnValue([]);
  mocks.hireApplicant.mockResolvedValue({ employee: { employee_id: 'EMP-9001' }, promotion: null });
  mocks.assignApplicantToSlot.mockResolvedValue({ ok: true });
  mocks.createPassword.mockReturnValue('Temp#1234');
  mocks.upsertEmployeePortalAccount.mockResolvedValue({ ok: true });
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.saveNewlyHired.mockResolvedValue({ ok: true, failed: 0 });
  mocks.completePromotionalAppointment.mockImplementation(async (id: string) => completed(id));
});

describe('generateEmployeeCredentials with promotions', () => {
  it('completes a promotion-only batch without touching accounts, slots, email or Newly Hired', async () => {
    const outcome = await generateEmployeeCredentials([
      promotionRow(),
      promotionRow({ id: 'app-promo-2', fullName: 'Ana Reyes' }),
    ]);

    expect(mocks.completePromotionalAppointment).toHaveBeenCalledTimes(2);
    expect(mocks.completePromotionalAppointment).toHaveBeenNthCalledWith(1, 'app-promo-1');
    expect(mocks.completePromotionalAppointment).toHaveBeenNthCalledWith(2, 'app-promo-2');
    expectNoExternalSideEffects();
    expect(outcome.credentials).toEqual([]);
    expect(outcome.failures).toEqual([]);
    expect(outcome.promotions).toHaveLength(2);
    expect(outcome.promotions[0]).toMatchObject({
      applicantId: 'app-promo-1',
      employeeNumber: 'EMP-0042',
      alreadyCompleted: false,
      fullName: 'Juan Dela Cruz',
      position: 'Administrative Officer II',
      department: 'Treasury',
      plantilla: 'Item 202 / Slot 1',
    });
  });

  it('leaves the external path unchanged', async () => {
    const outcome = await generateEmployeeCredentials([externalRow()]);

    expect(mocks.completePromotionalAppointment).not.toHaveBeenCalled();
    expect(mocks.hireApplicant).toHaveBeenCalledTimes(1);
    expect(mocks.assignApplicantToSlot).toHaveBeenCalledWith('slot-1', 'app-ext-1');
    expect(mocks.upsertEmployeePortalAccount).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.saveNewlyHired).toHaveBeenCalledTimes(1);
    expect(outcome.promotions).toEqual([]);
    expect(outcome.failures).toEqual([]);
    expect(outcome.credentials).toHaveLength(1);
    expect(outcome.credentials[0]).toMatchObject({
      fullName: 'Maria Santos',
      employeeId: 'EMP-9001',
      tempPassword: 'Temp#1234',
      emailSent: true,
    });
  });

  it('processes a mixed batch in order and keeps the external steps to the external row', async () => {
    const outcome = await generateEmployeeCredentials([promotionRow(), externalRow()]);

    expect(mocks.completePromotionalAppointment).toHaveBeenCalledTimes(1);
    expect(mocks.hireApplicant).toHaveBeenCalledTimes(1);
    expect(mocks.hireApplicant).toHaveBeenCalledWith('app-ext-1');
    expect(mocks.assignApplicantToSlot).toHaveBeenCalledTimes(1);
    expect(mocks.assignApplicantToSlot).toHaveBeenCalledWith('slot-1', 'app-ext-1');
    expect(mocks.createPassword).toHaveBeenCalledTimes(1);
    expect(mocks.upsertEmployeePortalAccount).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'maria.santos@example.com' }));
    expect(mocks.saveNewlyHired).toHaveBeenCalledTimes(1);
    const saved = mocks.saveNewlyHired.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].applicantId).toBe('app-ext-1');
    expect(outcome.promotions.map((p) => p.fullName)).toEqual(['Juan Dela Cruz']);
    expect(outcome.credentials.map((c) => c.fullName)).toEqual(['Maria Santos']);
    expect(outcome.failures).toEqual([]);
  });

  it('counts a replay of a completed promotion as a promotion, not a failure', async () => {
    mocks.completePromotionalAppointment.mockResolvedValueOnce(completed('app-promo-1', true));

    const outcome = await generateEmployeeCredentials([promotionRow()]);

    expect(outcome.failures).toEqual([]);
    expect(outcome.credentials).toEqual([]);
    expect(outcome.promotions).toHaveLength(1);
    expect(outcome.promotions[0].alreadyCompleted).toBe(true);
    expectNoExternalSideEffects();
  });

  it('reports a rejected promotion once, without retry wording, and continues', async () => {
    mocks.completePromotionalAppointment.mockRejectedValueOnce(
      new PromotionalAppointmentError('The employee has no portal account.', {
        kind: 'rejected',
        code: 'P0001',
        hint: 'account_missing',
        retryable: false,
      }),
    );

    const outcome = await generateEmployeeCredentials([promotionRow(), externalRow()]);

    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]).toContain('Juan Dela Cruz: not promoted.');
    expect(outcome.failures[0]).toContain('The employee has no portal account.');
    expect(outcome.failures[0]).not.toMatch(/try again/i);
    expect(outcome.promotions).toEqual([]);
    // The batch kept going to the external row.
    expect(outcome.credentials).toHaveLength(1);
    expect(mocks.completePromotionalAppointment).toHaveBeenCalledTimes(1);
    expect(mocks.hireApplicant).toHaveBeenCalledTimes(1);
  });

  describe('retryable promotion failures', () => {
    // Drive the real completePromotionalAppointment so the messages are the ones users see.
    const failThroughRealApi = async (rpcFailure: { error: unknown } | { reject: unknown }) => {
      const real = await vi.importActual<typeof import('./api/promotionalHiring')>('./api/promotionalHiring');
      mocks.rpc.mockImplementation(() => ({
        abortSignal: () => ('reject' in rpcFailure
          ? Promise.reject(rpcFailure.reject)
          : Promise.resolve({ data: null, error: rpcFailure.error })),
      }));
      mocks.completePromotionalAppointment.mockImplementationOnce(real.completePromotionalAppointment);
      const outcome = await generateEmployeeCredentials([
        promotionRow(),
        promotionRow({ id: 'app-promo-2', fullName: 'Ana Reyes' }),
      ]);
      expect(outcome.failures).toHaveLength(1);
      // The batch kept going to the second row.
      expect(outcome.promotions.map((p) => p.fullName)).toEqual(['Ana Reyes']);
      expect(mocks.completePromotionalAppointment).toHaveBeenCalledTimes(2);
      expectNoExternalSideEffects();
      return outcome.failures[0];
    };
    const countOf = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

    it('states retry safety exactly once for a busy database (57014)', async () => {
      const failure = await failThroughRealApi({ error: { code: '57014', message: 'canceling statement due to statement timeout' } });

      expect(failure).toContain('Juan Dela Cruz: not promoted.');
      expect(countOf(failure, /try again/gi)).toBe(1);
      expect(countOf(failure, /retrying is safe/gi)).toBe(1);
      expect(failure).not.toMatch(/promote them twice/i);
    });

  });

  describe('a promotion with no answer (F11)', () => {
    const uncertainError = () => new PromotionalAppointmentError('No answer.', { kind: 'uncertain', retryable: true });

    it('checks once more and counts the promotion when the replay confirms it', async () => {
      mocks.completePromotionalAppointment
        .mockRejectedValueOnce(uncertainError())
        .mockResolvedValueOnce(completed('app-promo-1', true));

      const outcome = await generateEmployeeCredentials([promotionRow()]);

      expect(mocks.completePromotionalAppointment).toHaveBeenCalledTimes(2);
      expect(mocks.completePromotionalAppointment).toHaveBeenNthCalledWith(2, 'app-promo-1');
      expect(outcome.failures).toEqual([]);
      expect(outcome.unconfirmed).toBe(0);
      expect(outcome.promotions.map((p) => p.fullName)).toEqual(['Juan Dela Cruz']);
      expectNoExternalSideEffects();
    });

    it('reports an unconfirmed result, never "not promoted", when the check also gets no answer', async () => {
      mocks.completePromotionalAppointment
        .mockRejectedValueOnce(uncertainError())
        .mockRejectedValueOnce(uncertainError());

      const outcome = await generateEmployeeCredentials([promotionRow()]);

      expect(mocks.completePromotionalAppointment).toHaveBeenCalledTimes(2);
      expect(outcome.unconfirmed).toBe(1);
      expect(outcome.failures).toHaveLength(1);
      expect(outcome.failures[0]).toContain('Juan Dela Cruz: result not confirmed.');
      expect(outcome.failures[0]).not.toMatch(/not promoted/i);
      expect(outcome.failures[0]).toMatch(/no longer listed, the promotion is complete/i);
      expect(outcome.failures[0]).toMatch(/will not promote them twice/i);
    });

    it('does not check again after a definite rejection', async () => {
      mocks.completePromotionalAppointment.mockRejectedValueOnce(
        new PromotionalAppointmentError('Busy.', { kind: 'busy', code: '57014', retryable: true }),
      );

      const outcome = await generateEmployeeCredentials([promotionRow()]);

      expect(mocks.completePromotionalAppointment).toHaveBeenCalledTimes(1);
      expect(outcome.unconfirmed).toBe(0);
      expect(outcome.failures[0]).toContain('Juan Dela Cruz: not promoted.');
    });
  });

  it('reports a refused external hire with its own message and no retry wording, then continues', async () => {
    const message = 'Office "Budget Office" is not an active office. Change the job posting\'s office to an active one, then hire again.';
    mocks.hireApplicant.mockRejectedValueOnce(new ExternalHireError(message));

    const outcome = await generateEmployeeCredentials([externalRow(), externalRow({ id: 'app-ext-2', fullName: 'Ana Reyes' })]);

    expect(outcome.failures).toEqual([`Maria Santos: not hired. ${message}`]);
    expect(outcome.failures[0]).not.toMatch(/try again/i);
    expect(outcome.credentials.map((c) => c.fullName)).toEqual(['Ana Reyes']);
    expect(mocks.hireApplicant).toHaveBeenCalledTimes(2);
  });

  it('treats a row cached as external as a promotion when the hire reports one, keeping the existing account', async () => {
    mocks.hireApplicant.mockResolvedValue({
      employee: { employee_id: 'EMP-0042' },
      promotion: completed('app-ext-1'),
    });

    const outcome = await generateEmployeeCredentials([externalRow()]);

    expect(mocks.hireApplicant).toHaveBeenCalledTimes(1);
    expect(outcome.credentials).toEqual([]);
    expect(outcome.failures).toEqual([]);
    expect(outcome.promotions).toEqual([
      expect.objectContaining({ applicantId: 'app-ext-1', employeeNumber: 'EMP-0042', fullName: 'Maria Santos' }),
    ]);
    expect(mocks.assignApplicantToSlot).not.toHaveBeenCalled();
    expect(mocks.createPassword).not.toHaveBeenCalled();
    expect(mocks.upsertEmployeePortalAccount).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.saveNewlyHired).not.toHaveBeenCalled();
  });
});

describe('fetchReservedApplicants application type', () => {
  const dbRow = (overrides: Record<string, unknown>) => ({
    id: 'a1',
    first_name: 'Juan',
    middle_name: null,
    last_name: 'Dela Cruz',
    email: 'juan@example.com',
    reference_no: 'REF-1',
    position: 'Aide',
    office: 'CHRMO',
    plantilla_slot_id: null,
    signing_deadline: null,
    deleted_at: null,
    ...overrides,
  });

  it('maps promotion and promotional rows to promotion with the trimmed employee number', async () => {
    mocks.applicantRows = [
      dbRow({ id: 'a1', application_type: 'promotion', employee_id: ' EMP-0042 ' }),
      dbRow({ id: 'a2', application_type: 'promotional', employee_id: 'EMP-0043' }),
    ];

    const rows = await fetchReservedApplicants();

    expect(rows.map((r) => [r.applicationType, r.employeeNumber])).toEqual([
      ['promotion', 'EMP-0042'],
      ['promotion', 'EMP-0043'],
    ]);
  });

  it('maps job and missing types to job with no employee number, ignoring a stray employee_id', async () => {
    mocks.applicantRows = [
      dbRow({ id: 'a3', application_type: 'job', employee_id: 'EMP-STRAY' }),
      dbRow({ id: 'a4', application_type: null, employee_id: null }),
      dbRow({ id: 'a5', application_type: 'promotion', employee_id: '  ' }),
    ];

    const rows = await fetchReservedApplicants();

    expect(rows.map((r) => [r.applicationType, r.employeeNumber])).toEqual([
      ['job', null],
      ['job', null],
      ['promotion', null],
    ]);
  });
});
