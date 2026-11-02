import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicantScoreSummary } from '../lib/api/applicantScores';
import { ForHiringPage } from './ForHiringPage';
import type { PlantillaSlot } from '../types/recruitment.types';

const {
  APPLICANT_ID,
  state,
  mockFetchHiringContext,
  mockGetApplicants,
  mockFetchScoreSummaries,
} = vi.hoisted(() => ({
  APPLICANT_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  state: { rows: [] as any[] },
  mockFetchHiringContext: vi.fn(),
  mockGetApplicants: vi.fn(),
  mockFetchScoreSummaries: vi.fn(),
}));

vi.mock('../lib/supabase', async () => {
  const { supabaseStub } = await import('../test/supabaseStub');
  return {
    supabase: supabaseStub((table) => (table === 'applicants' ? state.rows : [])),
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
  };
});

vi.mock('../lib/hiringFlow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/hiringFlow')>();
  return {
    ...actual,
    fetchHiringContext: mockFetchHiringContext,
  };
});

vi.mock('../lib/api/applicantScores', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/applicantScores')>();
  return { ...actual, fetchApplicantScoreSummaries: mockFetchScoreSummaries };
});

const defaultApplicant = {
  id: APPLICANT_ID,
  jobPostingId: 'jp-1',
  personalInfo: {
    firstName: 'Ana',
    lastName: 'Cruz',
    email: 'ana@x.ph',
  },
  position: 'Engineer II',
  department: 'Engineering Office',
  status: 'Qualified',
};

const summary = (
  overrides: Partial<ApplicantScoreSummary> = {},
): ApplicantScoreSummary => ({
  applicantId: APPLICANT_ID,
  appointmentType: 'original',
  assessmentTotal: 48,
  writtenExamRawScore: 89,
  isFinalized: true,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  state.rows = [{
    id: APPLICANT_ID,
    first_name: 'Ana',
    last_name: 'Cruz',
    email: 'ana@x.ph',
    position: 'Engineer II',
    office: 'Engineering Office',
    status: 'Qualified',
    application_type: 'job',
  }];
  mockGetApplicants.mockReturnValue([defaultApplicant]);
  mockFetchScoreSummaries.mockReset();
  mockFetchScoreSummaries.mockResolvedValue({
    ok: true,
    data: new Map([[APPLICANT_ID, summary()]]),
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
});

describe('ForHiringPage plantilla context & selection handling', () => {
  it('disables radio button, sets closed title, and prevents selection when applicant slot is closed', async () => {
    const closedSlot: PlantillaSlot = {
      id: 'slot-closed-1',
      jobPostingId: 'jp-1',
      slotNumber: 1,
      itemNumber: 'ABYAN-2026-001',
      status: 'closed',
    };

    mockFetchHiringContext.mockResolvedValue({
      ok: true,
      slotByApplicant: new Map([[APPLICANT_ID, closedSlot]]),
      revokedAt: new Map(),
    });

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText('Engineering Office'));
    fireEvent.click(await screen.findByText(/Engineer II/));

    const radio = await screen.findByRole('radio', { name: /select ana cruz/i });
    expect(radio).toBeDisabled();
    expect(radio).toHaveAttribute(
      'title',
      'This plantilla is closed. Reopen the vacancy from Job Vacancies to select this applicant.'
    );

    const selectBtn = screen.getByRole('button', { name: /select for hiring/i });
    expect(selectBtn).toBeDisabled();

    fireEvent.click(selectBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('enables radio button and allows applicant selection when plantilla slot is open', async () => {
    const openSlot: PlantillaSlot = {
      id: 'slot-open-1',
      jobPostingId: 'jp-1',
      slotNumber: 1,
      itemNumber: 'ABYAN-2026-001',
      status: 'open',
    };

    mockFetchHiringContext.mockResolvedValue({
      ok: true,
      slotByApplicant: new Map([[APPLICANT_ID, openSlot]]),
      revokedAt: new Map(),
    });

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText('Engineering Office'));
    fireEvent.click(await screen.findByText(/Engineer II/));

    const radio = await screen.findByRole('radio', { name: /select ana cruz/i });
    expect(radio).toBeEnabled();

    fireEvent.click(radio);
    expect(radio).toBeChecked();

    const selectBtn = screen.getByRole('button', { name: /select for hiring/i });
    expect(selectBtn).toBeEnabled();
  });

  it('renders ErrorBanner when fetchHiringContext returns ok: false', async () => {
    mockFetchHiringContext.mockResolvedValue({
      ok: false,
      slotByApplicant: new Map(),
      revokedAt: new Map(),
      error: new Error('Failed to load plantilla slots for applicants'),
    });

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/couldn't load the applicants for hiring/i)).toBeInTheDocument();
  });

  it('loads durable score summaries without a localStorage cache', async () => {
    localStorage.clear();

    mockFetchHiringContext.mockResolvedValue({
      ok: true,
      slotByApplicant: new Map(),
      revokedAt: new Map(),
    });

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Engineering Office')).toBeInTheDocument();
    expect(screen.getByText('1 applicant')).toBeInTheDocument();
  });

  it('reports a failed score-summary read instead of showing an empty ranking', async () => {
    mockFetchScoreSummaries.mockResolvedValue({
      ok: false,
      data: new Map(),
      error: new Error('score summary read failed'),
    });
    mockFetchHiringContext.mockResolvedValue({
      ok: true,
      slotByApplicant: new Map(),
      revokedAt: new Map(),
    });

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/couldn't load the applicants for hiring/i)).toBeInTheDocument();
  });

  it('shows when a prior selection was revoked', async () => {
    mockFetchHiringContext.mockResolvedValue({
      ok: true,
      slotByApplicant: new Map(),
      revokedAt: new Map([[APPLICANT_ID, '2026-10-29T00:00:00Z']]),
    });

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText('Engineering Office'));
    fireEvent.click(await screen.findByText(/Engineer II/));

    expect(await screen.findByText(/selection revoked/i)).toBeInTheDocument();
  });
});
