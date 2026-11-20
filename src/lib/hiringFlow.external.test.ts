import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalHireError } from './api/employeesApi';
import type { ReservedApplicant } from './hiringFlow';

const mocks = vi.hoisted(() => ({
  hireApplicantWithOutcome: vi.fn(),
  completePromotionalAppointment: vi.fn(),
  assignApplicantToSlot: vi.fn(),
  ensureEmployeePortalAccount: vi.fn(),
  createPassword: vi.fn(),
  upsertEmployeePortalAccount: vi.fn(),
  sendEmail: vi.fn(),
  saveNewlyHired: vi.fn(),
  saveApplicants: vi.fn(),
  getApplicants: vi.fn(),
}));

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('./api/employeesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/employeesApi')>()),
  hireApplicantWithOutcome: mocks.hireApplicantWithOutcome,
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
  ensureEmployeePortalAccount: mocks.ensureEmployeePortalAccount,
  createPassword: mocks.createPassword,
  upsertEmployeePortalAccount: mocks.upsertEmployeePortalAccount,
}));
vi.mock('./email', () => ({ sendEmail: mocks.sendEmail }));

import { generateEmployeeCredentials } from './hiringFlow';

const externalRow = (overrides: Partial<ReservedApplicant> = {}): ReservedApplicant => ({
  id: 'app-ext-1',
  fullName: 'Maria Santos',
  email: 'maria.santos@example.gov.ph',
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.getApplicants.mockReturnValue([]);
  mocks.saveNewlyHired.mockResolvedValue({ ok: true, failed: 0 });
  mocks.sendEmail.mockResolvedValue(undefined);
});

describe('generateEmployeeCredentials external hire & checkpoint replay', () => {
  it('completes a new external hire via ensureEmployeePortalAccount without redundant assignApplicantToSlot', async () => {
    mocks.hireApplicantWithOutcome.mockResolvedValue({
      employee: { employee_id: 'EMP-2026-0042' },
      promotion: null,
      external: {
        applicantId: 'app-ext-1',
        employeeUuid: 'emp-uuid-1',
        employeeNumber: 'EMP-2026-0042',
        slotId: 'slot-1',
        completedAt: '2026-11-20T00:00:00Z',
        alreadyCompleted: false,
      },
    });
    mocks.ensureEmployeePortalAccount.mockResolvedValue({
      ok: true,
      created: true,
      account: {
        id: 'portal-EMP-2026-0042',
        username: 'EMP-2026-0042',
        mustChangePassword: true,
        createdAt: '2026-11-20T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
        employee: {
          employeeId: 'EMP-2026-0042',
          fullName: 'Maria Santos',
          email: 'maria.santos@example.gov.ph',
        },
      },
      credentials: { username: 'EMP-2026-0042', password: 'OneTime#Password1' },
    });

    const outcome = await generateEmployeeCredentials([externalRow()]);

    expect(mocks.assignApplicantToSlot).not.toHaveBeenCalled();
    expect(mocks.createPassword).not.toHaveBeenCalled();
    expect(mocks.upsertEmployeePortalAccount).not.toHaveBeenCalled();
    expect(mocks.ensureEmployeePortalAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedUsername: 'EMP-2026-0042',
        employee: expect.objectContaining({ employeeId: 'EMP-2026-0042', fullName: 'Maria Santos' }),
      }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(outcome.failures).toEqual([]);
    expect((outcome as any).existingAccounts).toEqual([]);
    expect(outcome.credentials).toEqual([
      expect.objectContaining({
        fullName: 'Maria Santos',
        employeeId: 'EMP-2026-0042',
        username: 'EMP-2026-0042',
        tempPassword: 'OneTime#Password1',
        emailSent: true,
      }),
    ]);
  });

  it('checkpoint: preserves an independently changed remote portal account across stale/empty browser storage replays without emitting credentials or email', async () => {
    // Stale browser storage has an old account with an outdated password.
    localStorage.setItem(
      'cictrix_employee_portal_accounts',
      JSON.stringify([
        {
          id: 'stale-local-id',
          username: 'EMP-2026-0042',
          password: 'StaleBrowserPassword#0',
          employee: { employeeId: 'EMP-2026-0042', fullName: 'Maria Santos' },
        },
      ]),
    );

    const remoteAccountFixture = {
      id: 'acct-custom-9',
      username: 'maria.custom',
      password: 'ChangedByUser#99',
      employee_id: 'EMP-2026-0042',
    };

    mocks.hireApplicantWithOutcome.mockResolvedValue({
      employee: { employee_id: remoteAccountFixture.employee_id },
      promotion: null,
      external: {
        applicantId: 'app-ext-1',
        employeeUuid: 'emp-uuid-1',
        employeeNumber: remoteAccountFixture.employee_id,
        slotId: 'slot-1',
        completedAt: '2026-11-20T00:00:00Z',
        alreadyCompleted: true,
      },
    });
    mocks.ensureEmployeePortalAccount.mockResolvedValue({
      ok: true,
      created: false,
      account: {
        id: remoteAccountFixture.id,
        username: remoteAccountFixture.username,
        mustChangePassword: false,
        createdAt: '2026-11-20T00:00:00Z',
        updatedAt: '2026-11-20T01:00:00Z',
        employee: {
          employeeId: remoteAccountFixture.employee_id,
          fullName: 'Maria Santos',
          email: 'maria.santos@example.gov.ph',
        },
      },
    });

    const outcome = await generateEmployeeCredentials([externalRow()]);

    expect(remoteAccountFixture.password).toBe('ChangedByUser#99');
    expect(remoteAccountFixture.id).toBe('acct-custom-9');
    expect(remoteAccountFixture.employee_id).toBe('EMP-2026-0042');
    expect(mocks.createPassword).not.toHaveBeenCalled();
    expect(mocks.upsertEmployeePortalAccount).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(outcome.credentials).toEqual([]);
    expect(outcome.failures).toEqual([]);
    expect((outcome as any).existingAccounts).toEqual([
      expect.objectContaining({
        applicantId: 'app-ext-1',
        employeeNumber: 'EMP-2026-0042',
        accountId: 'acct-custom-9',
        username: 'maria.custom',
      }),
    ]);

    // Also verify from completely empty browser storage
    localStorage.clear();
    sessionStorage.clear();
    const emptyStorageOutcome = await generateEmployeeCredentials([externalRow()]);
    expect(emptyStorageOutcome.credentials).toEqual([]);
    expect((emptyStorageOutcome as any).existingAccounts).toHaveLength(1);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('retries uncertain external hire once and reports unconfirmed honestly without claiming not hired', async () => {
    mocks.hireApplicantWithOutcome
      .mockRejectedValueOnce(new ExternalHireError('Connection dropped.', { kind: 'uncertain', retryable: true }))
      .mockRejectedValueOnce(new ExternalHireError('Still timed out.', { kind: 'uncertain', retryable: true }));

    const outcome = await generateEmployeeCredentials([externalRow()]);

    expect(mocks.hireApplicantWithOutcome).toHaveBeenCalledTimes(2);
    expect(outcome.unconfirmed).toBe(1);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]).not.toMatch(/not hired/i);
    expect(outcome.failures[0]).toMatch(/confirm/i);
    expect(mocks.ensureEmployeePortalAccount).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('increments unconfirmed and directs HR to Accounts when ensureEmployeePortalAccount returns unconfirmed', async () => {
    mocks.hireApplicantWithOutcome.mockResolvedValue({
      employee: { employee_id: 'EMP-2026-0042' },
      promotion: null,
      external: {
        applicantId: 'app-ext-1',
        employeeUuid: 'emp-uuid-1',
        employeeNumber: 'EMP-2026-0042',
        slotId: 'slot-1',
        completedAt: '2026-11-20T00:00:00Z',
        alreadyCompleted: false,
      },
    });
    mocks.ensureEmployeePortalAccount.mockResolvedValue({
      ok: false,
      kind: 'unconfirmed',
      error: 'Could not confirm account creation.',
    });

    const outcome = await generateEmployeeCredentials([externalRow()]);

    expect(outcome.unconfirmed).toBe(1);
    expect(outcome.credentials).toEqual([]);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]).toContain('EMP-2026-0042');
    expect(outcome.failures[0]).toMatch(/Accounts/i);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
