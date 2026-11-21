import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalHireError } from '../lib/api/externalHiring';

const mocks = vi.hoisted(() => ({
  applicants: [] as any[],
  jobPostings: [] as any[],
  hireApplicantWithOutcome: vi.fn(),
  ensureEmployeePortalAccount: vi.fn(),
  sendEmail: vi.fn(),
  saveApplicants: vi.fn(),
}));

vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./RecruitmentNavigationGuide', () => ({ RecruitmentNavigationGuide: () => null }));
vi.mock('../lib/mockDatabase', () => ({ mockDatabase: {} }));
vi.mock('../lib/singleFlight', () => ({ runSingleFlight: (_key: string, run: () => unknown) => run() }));
vi.mock('../lib/recruitmentData', () => ({
  ensureRecruitmentSeedData: () => {},
  getAuthoritativeJobPostings: () => mocks.jobPostings,
  getApplicants: () => [],
  saveApplicants: (...args: unknown[]) => mocks.saveApplicants(...args),
  formatPHDate: (value: string) => String(value).slice(0, 10),
}));
vi.mock('../lib/supabase', () => ({
  ATTACHMENTS_BUCKET: 'attachments',
  supabase: {
    from: (table: string) => {
      const data =
        table === 'applicants'
          ? mocks.applicants
          : table === 'job_postings'
            ? mocks.jobPostings
            : [];
      const result = { data, error: null };
      return {
        select: () => ({
          order: async () => result,
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
        }),
      };
    },
  },
}));
vi.mock('../lib/documentViewing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/documentViewing')>()),
  listApplicantDocumentAttachments: vi.fn(async () => []),
  prepareDocumentPreview: vi.fn(),
  downloadPreparedDocument: vi.fn(),
}));
vi.mock('../lib/api/employeesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api/employeesApi')>()),
  hireApplicantWithOutcome: (...args: unknown[]) => mocks.hireApplicantWithOutcome(...args),
}));
vi.mock('../lib/employeePortalData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/employeePortalData')>()),
  ensureEmployeePortalAccount: (...args: unknown[]) => mocks.ensureEmployeePortalAccount(...args),
}));
vi.mock('../lib/email', () => ({
  sendEmail: (...args: unknown[]) => mocks.sendEmail(...args),
}));

import { QualifiedApplicantsPage } from './QualifiedApplicantsPage';

const selectCompletedApplicantAndConfirm = async () => {
  render(
    <MemoryRouter initialEntries={['/admin/rsp/qualified']}>
      <QualifiedApplicantsPage />
    </MemoryRouter>,
  );

  const completedTab = await screen.findByRole('button', { name: /Completed/i });
  fireEvent.click(completedTab);

  const checkbox = await screen.findByRole('checkbox', { name: /Select Maria Reyes for hiring/i });
  fireEvent.click(checkbox);

  fireEvent.click(screen.getByRole('button', { name: 'Hire Applicant' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and Hire' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.jobPostings = [
    {
      id: 'job-1',
      title: 'Clerk I',
      department: 'CHRMO',
      status: 'Active',
      applicants: 1,
      postedDate: '2026-10-01',
    },
  ];
  mocks.applicants = [
    {
      id: 'app-1',
      first_name: 'Maria',
      last_name: 'Reyes',
      email: 'maria.reyes@example.gov.ph',
      contact_number: '09171234567',
      job_posting_id: 'job-1',
      position: 'Clerk I',
      office: 'CHRMO',
      status: 'Qualified',
      total_score: 90,
      created_at: '2026-10-26T00:00:00Z',
    },
  ];
  mocks.sendEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('QualifiedApplicantsPage hire credential hygiene', () => {
  it('surfaces complete_external_hire refusal without marking Hired, issuing credentials, or sending email', async () => {
    mocks.hireApplicantWithOutcome.mockRejectedValue(
      new ExternalHireError('This applicant must be selected for contract signing first.', {
        kind: 'rejected',
        hint: 'not_reserved',
        retryable: false,
      }),
    );

    await selectCompletedApplicantAndConfirm();

    await waitFor(() => {
      expect(mocks.hireApplicantWithOutcome).toHaveBeenCalledWith('app-1');
    });
    expect(mocks.ensureEmployeePortalAccount).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(screen.queryByText('Account Credentials')).not.toBeInTheDocument();
    expect(await screen.findByText(/must be selected for contract signing/i)).toBeInTheDocument();
    const calls = mocks.saveApplicants.mock.calls;
    const savedArg = (calls.length > 0 ? calls[calls.length - 1][0] : undefined) as any[] | undefined;
    if (savedArg) {
      expect(savedArg.find((a) => a.id === 'app-1')?.status).not.toBe('Hired');
    }
  });

  it('preserves an existing account (created: false) without emitting credentials or sending email', async () => {
    mocks.hireApplicantWithOutcome.mockResolvedValue({
      employee: { employee_id: 'EMP-2026-0042' },
      promotion: null,
      external: {
        applicantId: 'app-1',
        employeeUuid: 'emp-uuid-1',
        employeeNumber: 'EMP-2026-0042',
        slotId: 'slot-1',
        completedAt: '2026-11-20T00:00:00Z',
        alreadyCompleted: true,
      },
    });
    mocks.ensureEmployeePortalAccount.mockResolvedValue({
      ok: true,
      created: false,
      account: {
        id: 'acct-custom-9',
        username: 'maria.custom',
        mustChangePassword: false,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-10T00:00:00Z',
        employee: { employeeId: 'EMP-2026-0042', fullName: 'Maria Reyes', email: 'maria.reyes@example.gov.ph' },
      },
    });

    await selectCompletedApplicantAndConfirm();

    await waitFor(() => {
      expect(mocks.ensureEmployeePortalAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          employee: expect.objectContaining({ employeeId: 'EMP-2026-0042' }),
        }),
      );
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(screen.queryByText('Account Credentials')).not.toBeInTheDocument();
  });

  it('shows printable credentials and sends welcome email only when created: true', async () => {
    mocks.hireApplicantWithOutcome.mockResolvedValue({
      employee: { employee_id: 'EMP-2026-0077' },
      promotion: null,
      external: {
        applicantId: 'app-1',
        employeeUuid: 'emp-uuid-1',
        employeeNumber: 'EMP-2026-0077',
        slotId: 'slot-1',
        completedAt: '2026-11-20T00:00:00Z',
        alreadyCompleted: false,
      },
    });
    mocks.ensureEmployeePortalAccount.mockResolvedValue({
      ok: true,
      created: true,
      account: {
        id: 'portal-EMP-2026-0077',
        username: 'EMP-2026-0077',
        mustChangePassword: true,
        createdAt: '2026-11-20T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
        employee: { employeeId: 'EMP-2026-0077', fullName: 'Maria Reyes', email: 'maria.reyes@example.gov.ph' },
      },
      credentials: { username: 'EMP-2026-0077', password: 'FreshTempPassword#1' },
    });

    await selectCompletedApplicantAndConfirm();

    await screen.findByText('Account Credentials');
    expect(screen.getByText('EMP-2026-0077')).toBeInTheDocument();
    expect(screen.getByText('FreshTempPassword#1')).toBeInTheDocument();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'maria.reyes@example.gov.ph',
        employeeId: 'EMP-2026-0077',
      }),
    );
  });
});
