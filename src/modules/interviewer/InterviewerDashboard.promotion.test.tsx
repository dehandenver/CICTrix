import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Reproduces the live case from Task 3A: a promotion scheduled through RSP whose
// applicant email ends in @example.com. The row is persisted (UUID id), its
// posting is Active, and the rater is assigned, but the dashboard dropped it as
// "demo" data.
const PROMOTION_ID = '09e72c95-0e64-4199-8324-49e8dde07bc7';
const ORIGINAL_ID = '3cb9a3a8-b15e-4cee-8f66-df5877762a02';

const db = vi.hoisted(() => {
  const rows: Record<string, unknown[]> = { applicants: [], evaluations: [] };
  const query = (table: string) => {
    const chain: any = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve);
        }
        return () => chain;
      },
    });
    return chain;
  };
  return { rows, query };
});

vi.mock('../../lib/supabase', () => ({
  isMockModeEnabled: false,
  supabase: {
    from: (table: string) => db.query(table),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('../../lib/interviewerAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/interviewerAccess')>();
  return {
    ...actual,
    resolveAssignedPositionsForInterviewer: vi.fn(async () => ({
      email: 'rater@iloilo.test',
      positions: ['City Accountant II', 'Engineer I (Civil)'],
    })),
  };
});
vi.mock('../../lib/recruitmentData', () => ({
  ensureRecruitmentSeedData: vi.fn(),
  getAuthoritativeJobPostings: vi.fn(() => []),
  getJobPostingsFromSupabase: vi.fn(async () => [
    { id: 'p1', title: 'City Accountant II', jobCode: 'PLT-9622644CF0', department: 'Office of The City Accountant', status: 'Active', postedDate: '2026-10-20' },
    { id: 'p2', title: 'Engineer I (Civil)', jobCode: 'PLT-C3B80D0BA7', department: 'Office of The City Engineer', status: 'Active', postedDate: '2026-10-19' },
  ]),
}));

import { InterviewerDashboard } from './InterviewerDashboard';

const applicant = (over: Record<string, unknown>) => ({
  first_name: 'Test', middle_name: null, last_name: 'Applicant', status: 'Interview/Exam Scheduled',
  created_at: '2026-10-21T00:00:00Z', interview_time: '14:47:00', assigned_interviewer_email: 'rater@iloilo.test',
  ...over,
});

// Each posting row labels its count; read them once the scheduled original shows.
const countLabels = async () => {
  await screen.findByLabelText('View applicants for Engineer I (Civil)', {}, { timeout: 3000 });
  await screen.findAllByLabelText('1 of 1 applicants still to evaluate');
  return Object.fromEntries(
    screen.getAllByRole('row').filter((row) => row.querySelector('.ivd-job-title')).map((row) => [
      row.querySelector('.ivd-job-title')?.textContent,
      row.querySelector('.ivd-count')?.getAttribute('aria-label'),
    ]),
  );
};

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <InterviewerDashboard session={{ email: 'rater@iloilo.test', name: 'Rater' }} />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  db.rows.evaluations = [];
  db.rows.applicants = [
    applicant({
      id: PROMOTION_ID, email: 'employee@example.com', last_name: 'Promoted', position: 'City Accountant II',
      office: 'Office of The City Accountant', application_type: 'promotion', interview_date: '2026-11-02',
    }),
    applicant({
      id: ORIGINAL_ID, email: 'original@gmail.test', last_name: 'Original', position: 'Engineer I (Civil)',
      office: 'Office of The City Engineer', application_type: 'job', interview_date: '2026-11-02',
    }),
    // Same posting, never scheduled: still not an interview task.
    applicant({
      id: 'f0b8c1e2-0000-4000-8000-000000000001', email: 'unscheduled@example.com', last_name: 'Unscheduled',
      position: 'City Accountant II', application_type: 'promotion', interview_date: null,
    }),
  ];
});

describe('InterviewerDashboard scheduled promotions', () => {
  it('counts a persisted, scheduled promotion with an @example.com email', async () => {
    renderDashboard();

    expect(await countLabels()).toEqual({
      'City Accountant II': '1 of 1 applicants still to evaluate',
      'Engineer I (Civil)': '1 of 1 applicants still to evaluate',
    });
  });

  it('still hides rows with mock- ids', async () => {
    db.rows.applicants = [
      applicant({ id: 'mock-1', email: 'demo@gmail.test', position: 'City Accountant II', interview_date: '2026-11-02' }),
      applicant({
        id: ORIGINAL_ID, email: 'original@gmail.test', position: 'Engineer I (Civil)', interview_date: '2026-11-02',
      }),
    ];
    renderDashboard();

    expect(await countLabels()).toEqual({
      'City Accountant II': '0 of 0 applicants still to evaluate',
      'Engineer I (Civil)': '1 of 1 applicants still to evaluate',
    });
  });

  it('moves the promotion to this interviewer\'s history once evaluated', async () => {
    db.rows.evaluations = [{ id: 'e1', applicant_id: PROMOTION_ID, interviewer_name: 'Rater', created_at: '2026-11-02T08:00:00Z' }];
    renderDashboard();

    // A fully evaluated posting leaves the to-do table; the candidate stays reachable from history.
    expect(await countLabels()).toEqual({ 'Engineer I (Civil)': '1 of 1 applicants still to evaluate' });
    expect(await screen.findByRole('button', { name: 'View Test Promoted' })).toBeTruthy();
  });
});
