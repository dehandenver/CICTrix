import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicantScoreSummary } from '../lib/api/applicantScores';
import { ForHiringPage } from './ForHiringPage';

const { ROWS, mockFetchScoreSummaries } = vi.hoisted(() => ({
  ROWS: [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', first_name: 'Ana', last_name: 'Cruz', email: 'ana@x.ph', position: 'Engineer II', office: 'Engineering Office', status: 'Qualified', application_type: 'job' },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', first_name: 'Ben', last_name: 'Reyes', email: 'ben@x.ph', position: 'Engineer II', office: 'Engineering Office', status: 'Qualified', application_type: 'job' },
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', first_name: 'Cy', last_name: 'Lim', email: 'cy@x.ph', position: 'Engineer II', office: 'Engineering Office', status: 'For Contract Signing', application_type: 'job' },
  ],
  mockFetchScoreSummaries: vi.fn(),
}));

vi.mock('../lib/supabase', async () => {
  const { supabaseStub } = await import('../test/supabaseStub');
  return { supabase: supabaseStub((table) => (table === 'applicants' ? ROWS : [])) };
});
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
  appointmentType: 'original',
  assessmentTotal: 48,
  writtenExamRawScore: 89,
  isFinalized: true,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  mockFetchScoreSummaries.mockReset();
  mockFetchScoreSummaries.mockResolvedValue({ ok: true, data: new Map() });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
});

describe('ForHiringPage visibility', () => {
  it('lists only applicants carrying a finalized assessment and written exam', async () => {
    // Ana has a durable original assessment and written exam. Ben is
    // Qualified but unscored, so he has nothing to rank and must not appear.
    // Cy is unscored too, but already holds the plantilla — hiding him would
    // lose the selection.
    mockFetchScoreSummaries.mockResolvedValue({
      ok: true,
      data: new Map([[ROWS[0].id, summary(ROWS[0].id)]]),
    });

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    expect(await screen.findByText('Engineering Office')).toBeInTheDocument();
    expect(screen.getByText('2 applicants')).toBeInTheDocument();
    expect(screen.queryByText('3 applicants')).not.toBeInTheDocument();
  });

  it('leaves only the already-selected applicant when nobody has been scored', async () => {
    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    // Cy still appears: he is past selection. The two unscored Qualified
    // applicants do not.
    expect(await screen.findByText('Engineering Office')).toBeInTheDocument();
    expect(screen.getByText('1 applicant')).toBeInTheDocument();
  });
});
