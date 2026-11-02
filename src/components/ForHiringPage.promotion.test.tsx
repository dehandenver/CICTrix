import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicantScoreSummary } from '../lib/api/applicantScores';
import { ForHiringPage } from './ForHiringPage';

const {
  state,
  mockGetApplicants,
  mockSaveApplicants,
  mockGetNewlyHired,
  mockFetchHiringContext,
  mockFetchScoreSummaries,
} = vi.hoisted(() => ({
  state: { rows: [] as any[], newlyHired: [] as any[], evaluations: [] as any[] },
  mockGetApplicants: vi.fn(),
  mockSaveApplicants: vi.fn(),
  mockGetNewlyHired: vi.fn(),
  mockFetchHiringContext: vi.fn(),
  mockFetchScoreSummaries: vi.fn(),
}));

const PROMO_A = '11111111-1111-4111-8111-111111111111';
const PROMO_B = '22222222-2222-4222-8222-222222222222';
const ORIGINAL = '33333333-3333-4333-8333-333333333333';
const ORIGINAL_B = '66666666-6666-4666-8666-666666666666';
const OLD_HIRE = '44444444-4444-4444-8444-444444444444';
const COMPLETED = '55555555-5555-4555-8555-555555555555';
const SHARED_EMAIL = 'juan.dela.cruz@iloilo.gov.ph';

vi.mock('../lib/supabase', async () => {
  const { supabaseStub } = await import('../test/supabaseStub');
  return {
    supabase: supabaseStub((table) => {
      if (table === 'applicants') return state.rows;
      if (table === 'evaluations') return state.evaluations;
      return [];
    }),
  };
});
vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./ApplicantsTabBar', () => ({ ApplicantsTabBar: () => null }));

vi.mock('../lib/recruitmentData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/recruitmentData')>();
  return {
    ...actual,
    ensureRecruitmentSeedData: vi.fn(),
    getApplicants: mockGetApplicants,
    saveApplicants: mockSaveApplicants,
    getNewlyHiredFromSupabase: mockGetNewlyHired,
  };
});

vi.mock('../lib/hiringFlow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/hiringFlow')>();
  return { ...actual, fetchHiringContext: mockFetchHiringContext };
});

vi.mock('../lib/api/applicantScores', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/applicantScores')>();
  return { ...actual, fetchApplicantScoreSummaries: mockFetchScoreSummaries };
});

const summary = (
  applicantId: string,
  overrides: Partial<ApplicantScoreSummary> = {},
): ApplicantScoreSummary => ({
  applicantId,
  appointmentType: 'promotional',
  assessmentTotal: 80,
  writtenExamRawScore: 80,
  isFinalized: true,
  ...overrides,
});

const setSummaries = (...items: ApplicantScoreSummary[]) => {
  mockFetchScoreSummaries.mockResolvedValue({
    ok: true,
    data: new Map(items.map((item) => [item.applicantId, item])),
  });
};

const applicantRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  first_name: 'Ana',
  last_name: 'Cruz',
  email: 'ana.cruz@iloilo.gov.ph',
  position: 'Administrative Officer II',
  office: 'Human Resource Management Office',
  status: 'Qualified',
  application_type: 'promotion',
  ...overrides,
});

const localApplicant = (id: string) => ({
  id,
  jobPostingId: 'jp-1',
  personalInfo: {
    firstName: 'Ana',
    lastName: 'Cruz',
    email: 'ana.cruz@iloilo.gov.ph',
  },
  position: 'Administrative Officer II',
  department: 'Human Resource Management Office',
  status: 'Qualified',
  applicationType: 'promotion',
});

const setPortalAccount = (email: string) => {
  localStorage.setItem('cictrix_employee_portal_accounts', JSON.stringify([
    {
      id: 'account-old-hire',
      username: 'juan.dc',
      password: 'not-a-real-password',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      employee: { email },
    },
  ]));
};

const openPosition = async () => {
  fireEvent.click(await screen.findByText('Human Resource Management Office'));
  fireEvent.click(await screen.findByText('Administrative Officer II'));
};

beforeEach(() => {
  localStorage.clear();
  state.rows = [];
  state.newlyHired = [];
  state.evaluations = [];
  mockGetApplicants.mockReturnValue([]);
  mockSaveApplicants.mockReset();
  mockSaveApplicants.mockImplementation(() => undefined);
  mockGetNewlyHired.mockImplementation(async () => state.newlyHired);
  mockFetchHiringContext.mockResolvedValue({
    ok: true,
    slotByApplicant: new Map(),
    revokedAt: new Map(),
  });
  mockFetchScoreSummaries.mockReset();
  setSummaries();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
});

describe('ForHiringPage promotion visibility', () => {
  it('shows a qualified promotion that shares an email with an older hire and existing account', async () => {
    state.rows = [
      applicantRow(PROMO_A, {
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        email: SHARED_EMAIL,
        status: 'Qualified',
      }),
      applicantRow(OLD_HIRE, {
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        email: SHARED_EMAIL,
        status: 'Selected',
        application_type: 'job',
      }),
    ];
    state.newlyHired = [{ applicantId: OLD_HIRE, employeeInfo: { email: SHARED_EMAIL } }];
    setPortalAccount(SHARED_EMAIL);
    setSummaries(summary(PROMO_A, { assessmentTotal: 86, writtenExamRawScore: 90 }));

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);
    await openPosition();

    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getAllByText('Juan Dela Cruz')).toHaveLength(1);
    expect(screen.getByText('86.00')).toBeInTheDocument();
    expect(mockSaveApplicants).not.toHaveBeenCalled();
  });

  it('does not treat an existing portal account with the same email as a completed application', async () => {
    state.rows = [applicantRow(PROMO_A, { email: SHARED_EMAIL })];
    setPortalAccount(SHARED_EMAIL);
    setSummaries(summary(PROMO_A, { assessmentTotal: 82, writtenExamRawScore: 88 }));

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);
    await openPosition();

    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
    expect(screen.getByText('82.00')).toBeInTheDocument();
  });

  it('does not bring back a completed record for the same applicant UUID', async () => {
    state.rows = [applicantRow(COMPLETED, { email: SHARED_EMAIL })];
    state.newlyHired = [{ applicantId: COMPLETED, employeeInfo: { email: SHARED_EMAIL } }];
    setSummaries(summary(COMPLETED, { assessmentTotal: 90, writtenExamRawScore: 90 }));

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    expect(await screen.findByText('No qualified applicants yet.')).toBeInTheDocument();
    expect(screen.queryByText('Human Resource Management Office')).not.toBeInTheDocument();
  });

  it('drops a stale local candidate when the remote row is terminal', async () => {
    mockGetApplicants.mockReturnValue([localApplicant(PROMO_A)]);
    state.rows = [applicantRow(PROMO_A, { status: 'Not Selected' })];
    setSummaries(summary(PROMO_A, { assessmentTotal: 80, writtenExamRawScore: 80 }));

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    expect(await screen.findByText('No qualified applicants yet.')).toBeInTheDocument();
    expect(screen.queryByText('Human Resource Management Office')).not.toBeInTheDocument();
  });

  it('drops a stale local candidate when the remote row is deleted', async () => {
    mockGetApplicants.mockReturnValue([localApplicant(PROMO_A)]);
    state.rows = [applicantRow(PROMO_A, { deleted_at: '2026-10-30T00:00:00Z' })];
    setSummaries(summary(PROMO_A, { assessmentTotal: 80, writtenExamRawScore: 80 }));

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    expect(await screen.findByText('No qualified applicants yet.')).toBeInTheDocument();
    expect(screen.queryByText('Human Resource Management Office')).not.toBeInTheDocument();
  });

  it('excludes an applicant whose plantilla slot is filled', async () => {
    state.rows = [applicantRow(PROMO_A)];
    setSummaries(summary(PROMO_A, { assessmentTotal: 80, writtenExamRawScore: 80 }));
    mockFetchHiringContext.mockResolvedValue({
      ok: true,
      slotByApplicant: new Map([[PROMO_A, {
        id: 'slot-filled-1',
        jobPostingId: 'jp-1',
        slotNumber: 1,
        itemNumber: 'ABYAN-2026-001',
        status: 'filled',
      }]]),
      revokedAt: new Map(),
    });

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    expect(await screen.findByText('No qualified applicants yet.')).toBeInTheDocument();
  });

  it('ranks fully scored promotions by the saved five-category total with no oral score', async () => {
    state.rows = [
      applicantRow(PROMO_A, { first_name: 'Ana', last_name: 'Cruz' }),
      applicantRow(PROMO_B, { first_name: 'Ben', last_name: 'Reyes' }),
    ];
    setSummaries(
      summary(PROMO_A, { assessmentTotal: 91.5, writtenExamRawScore: 95 }),
      summary(PROMO_B, { assessmentTotal: 74, writtenExamRawScore: 80 }),
    );

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);
    await openPosition();

    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Ana Cruz')).toBeInTheDocument();
    expect(within(rows[1]).getByText('91.50')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Ben Reyes')).toBeInTheDocument();
    expect(within(rows[2]).getByText('74.00')).toBeInTheDocument();
  });

  it('hides a finalized promotion that is missing the written exam', async () => {
    state.rows = [applicantRow(PROMO_A)];
    setSummaries(summary(PROMO_A, { assessmentTotal: 80, writtenExamRawScore: null }));

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    expect(await screen.findByText('No qualified applicants yet.')).toBeInTheDocument();
  });

  it('hides a promotion whose five-category assessment is incomplete', async () => {
    state.rows = [applicantRow(PROMO_A)];
    setSummaries(summary(PROMO_A, { assessmentTotal: null, writtenExamRawScore: 80 }));

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    expect(await screen.findByText('No qualified applicants yet.')).toBeInTheDocument();
  });

  it('hides a promotion that is not finalized even when the stored total is present', async () => {
    state.rows = [applicantRow(PROMO_A)];
    setSummaries(summary(PROMO_A, { assessmentTotal: 80, writtenExamRawScore: 80, isFinalized: false }));

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    expect(await screen.findByText('No qualified applicants yet.')).toBeInTheDocument();
  });

  it('keeps an existing reservation visible without any saved score', async () => {
    state.rows = [applicantRow(PROMO_A, { status: 'For Contract Signing' })];

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);
    await openPosition();

    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
    expect(screen.getByText('Awaiting signing')).toBeInTheDocument();
  });

  it('keeps original applicants ranked by their interview score', async () => {
    state.rows = [applicantRow(ORIGINAL, { application_type: 'job', status: 'Qualified' })];
    setSummaries(summary(ORIGINAL, {
      appointmentType: 'original',
      assessmentTotal: 48,
      writtenExamRawScore: 85,
    }));

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);
    await openPosition();

    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
    expect(screen.getByText('48.00')).toBeInTheDocument();
  });

  it('ignores newer browser-local evaluation data when ranking real original applicants', async () => {
    state.rows = [
      applicantRow(ORIGINAL, { first_name: 'Ana', last_name: 'Cruz', application_type: 'job' }),
      applicantRow(ORIGINAL_B, { first_name: 'Ben', last_name: 'Reyes', application_type: 'job' }),
    ];
    state.evaluations = [
      { applicant_id: ORIGINAL, overall_score: 4.5, updated_at: '2026-10-01T00:00:00Z' },
      { applicant_id: ORIGINAL_B, overall_score: 4, updated_at: '2026-10-01T00:00:00Z' },
    ];
    localStorage.setItem('cictrix_evaluations', JSON.stringify([
      { applicant_id: ORIGINAL, overall_score: 1, updated_at: '2026-10-30T00:00:00Z' },
    ]));
    localStorage.setItem('cictrix_interviewer_score_snapshot', JSON.stringify({
      [ORIGINAL_B]: { oralAverage: 5, updatedAt: '2026-10-30T00:00:00Z' },
    }));
    setSummaries(
      summary(ORIGINAL, { appointmentType: 'original', assessmentTotal: 60, writtenExamRawScore: 85 }),
      summary(ORIGINAL_B, { appointmentType: 'original', assessmentTotal: 50, writtenExamRawScore: 85 }),
    );

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);
    await openPosition();

    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]).getByText('Ana Cruz')).toBeInTheDocument();
    expect(within(rows[1]).getByText('18.00')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Ben Reyes')).toBeInTheDocument();
    expect(within(rows[2]).getByText('16.00')).toBeInTheDocument();
  });

  it('falls back to the durable summary when no persisted evaluation exists', async () => {
    state.rows = [
      applicantRow(ORIGINAL, { first_name: 'Ana', last_name: 'Cruz', application_type: 'job' }),
      applicantRow(ORIGINAL_B, { first_name: 'Ben', last_name: 'Reyes', application_type: 'job' }),
    ];
    localStorage.setItem('cictrix_evaluations', JSON.stringify([
      { applicant_id: ORIGINAL, overall_score: 5, updated_at: '2026-10-30T00:00:00Z' },
    ]));
    localStorage.setItem('cictrix_interviewer_score_snapshot', JSON.stringify({
      [ORIGINAL_B]: { oralAverage: 5, updatedAt: '2026-10-30T00:00:00Z' },
    }));
    setSummaries(
      summary(ORIGINAL, { appointmentType: 'original', assessmentTotal: 60, writtenExamRawScore: 85 }),
      summary(ORIGINAL_B, { appointmentType: 'original', assessmentTotal: 50, writtenExamRawScore: 85 }),
    );

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);
    await openPosition();

    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]).getByText('Ana Cruz')).toBeInTheDocument();
    expect(within(rows[1]).getByText('60.00')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Ben Reyes')).toBeInTheDocument();
    expect(within(rows[2]).getByText('50.00')).toBeInTheDocument();
  });
});
