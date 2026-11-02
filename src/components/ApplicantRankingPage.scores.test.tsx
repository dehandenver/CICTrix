import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicantScoreSummary } from '../lib/api/applicantScores';
import { ApplicantRankingPage } from './ApplicantRankingPage';

const { state, mockFetchScoreSummaries } = vi.hoisted(() => ({
  state: { rows: [] as any[] },
  mockFetchScoreSummaries: vi.fn(),
}));

const PROMO_A = '11111111-1111-4111-8111-111111111111';
const PROMO_B = '22222222-2222-4222-8222-222222222222';

vi.mock('../lib/supabase', async () => {
  const { supabaseStub } = await import('../test/supabaseStub');
  return {
    supabase: supabaseStub((table) => (table === 'applicants' ? state.rows : [])),
  };
});
vi.mock('../lib/recruitmentData', () => ({
  getApplicants: () => [],
  saveApplicants: () => undefined,
}));
vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./ApplicantsTabBar', () => ({ ApplicantsTabBar: () => null }));

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

beforeEach(() => {
  localStorage.clear();
  state.rows = [
    {
      id: PROMO_A,
      first_name: 'Ana',
      last_name: 'Cruz',
      email: 'ana.cruz@iloilo.gov.ph',
      position: 'Administrative Officer II',
      office: 'Human Resource Management Office',
      status: 'Qualified',
      application_type: 'promotion',
    },
    {
      id: PROMO_B,
      first_name: 'Ben',
      last_name: 'Reyes',
      email: 'ben.reyes@iloilo.gov.ph',
      position: 'Administrative Officer II',
      office: 'Human Resource Management Office',
      status: 'Qualified',
      application_type: 'promotion',
      total_score: 99,
    },
  ];
  mockFetchScoreSummaries.mockReset();
  setSummaries(
    summary(PROMO_A, { assessmentTotal: 88.5, writtenExamRawScore: 92 }),
    summary(PROMO_B, { assessmentTotal: 74, writtenExamRawScore: 80 }),
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
});

describe('ApplicantRankingPage saved assessment totals', () => {
  it('ranks promotions by their durable assessment total, not applicants.total_score', async () => {
    render(<MemoryRouter><ApplicantRankingPage /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Human Resource Management Office'));
    expect(await screen.findByText('88.50')).toBeInTheDocument();

    fireEvent.click(await screen.findByText('Administrative Officer II'));

    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]).getByText('Ana Cruz')).toBeInTheDocument();
    expect(within(rows[1]).getByText('88.50')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Ben Reyes')).toBeInTheDocument();
    expect(within(rows[2]).getByText('74.00')).toBeInTheDocument();
    expect(screen.queryByText('99.00')).not.toBeInTheDocument();
  });

  it('prints the saved totals instead of blank applicants.total_score fields', async () => {
    const printWindow = {
      document: {
        head: { innerHTML: '' },
        body: { innerHTML: '' },
      },
      focus: vi.fn(),
      print: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);

    render(<MemoryRouter><ApplicantRankingPage /></MemoryRouter>);
    expect(await screen.findByText('Human Resource Management Office')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /print all rankings/i }));

    expect(printWindow.document.body.innerHTML).toContain('88.50');
    expect(printWindow.document.body.innerHTML).toContain('74.00');
    expect(printWindow.document.body.innerHTML).toContain('Promotional');
    open.mockRestore();
  });

  it('does not fall back to a stale applicants.total_score for a promotion', async () => {
    state.rows = [state.rows[1]];
    setSummaries();

    render(<MemoryRouter><ApplicantRankingPage /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Human Resource Management Office'));
    fireEvent.click(await screen.findByText('Administrative Officer II'));

    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]).getByText('Ben Reyes')).toBeInTheDocument();
    expect(within(rows[1]).getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('99.00')).not.toBeInTheDocument();
  });

  it('reports a failed score-summary read instead of showing a successful empty ranking', async () => {
    mockFetchScoreSummaries.mockResolvedValue({
      ok: false,
      data: new Map(),
      error: new Error('score summary read failed'),
    });

    render(<MemoryRouter><ApplicantRankingPage /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/couldn't load the applicant ranking/i)).toBeInTheDocument();
    expect(screen.queryByText('No applicant data yet.')).not.toBeInTheDocument();
  });
});
