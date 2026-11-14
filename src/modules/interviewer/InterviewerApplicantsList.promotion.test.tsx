import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Task 3A: the scheduled promotion was hidden from the list because its email
// ends in @example.com. It must show once, under Promotional, and open the
// evaluation for its own persisted UUID.
const PROMOTION_ID = '09e72c95-0e64-4199-8324-49e8dde07bc7';
const ORIGINAL_ID = '3cb9a3a8-b15e-4cee-8f66-df5877762a02';
const POSITION = 'City Accountant II';

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
  ATTACHMENTS_BUCKET: 'applicant-attachments',
  isMockModeEnabled: false,
  supabase: {
    from: (table: string) => db.query(table),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('../../lib/dataSourceMode', () => ({ getPreferredDataSourceMode: () => 'supabase' }));
vi.mock('../../lib/interviewerAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/interviewerAccess')>();
  return {
    ...actual,
    resolveAssignedPositionsForInterviewer: vi.fn(async () => ({ email: 'rater@iloilo.test', positions: [POSITION] })),
  };
});
vi.mock('../../lib/recruitmentData', () => ({
  ensureRecruitmentSeedData: vi.fn(),
  getAuthoritativeJobPostings: vi.fn(() => []),
  getApplicants: vi.fn(() => []),
}));

import { InterviewerApplicantsList } from './InterviewerApplicantsList';

const applicant = (over: Record<string, unknown>) => ({
  middle_name: null, status: 'Interview/Exam Scheduled', contact_number: '', created_at: '2026-10-21T00:00:00Z',
  position: POSITION, office: 'Office of The City Accountant', interview_time: '14:47:00',
  assigned_interviewer_email: 'rater@iloilo.test', ...over,
});

const EvaluateRoute = () => <p>Evaluating {useParams().id}</p>;

const renderList = () =>
  render(
    <MemoryRouter initialEntries={[`/interviewer/applicants?position=${encodeURIComponent(POSITION)}`]}>
      <Routes>
        <Route path="/interviewer/applicants" element={<InterviewerApplicantsList />} />
        <Route path="/interviewer/evaluate/:id" element={<EvaluateRoute />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  db.rows.evaluations = [];
  db.rows.applicants = [
    applicant({
      id: PROMOTION_ID, first_name: 'Paula', last_name: 'Promoted', email: 'employee@example.com',
      application_type: 'promotion', interview_date: '2026-11-02',
    }),
    applicant({
      id: ORIGINAL_ID, first_name: 'Oscar', last_name: 'Original', email: 'oscar@gmail.test',
      application_type: 'job', interview_date: '2026-11-02',
    }),
    applicant({
      id: 'f0b8c1e2-0000-4000-8000-000000000001', first_name: 'Una', last_name: 'Unscheduled',
      email: 'una@example.com', application_type: 'promotion', interview_date: null,
    }),
    applicant({
      id: 'mock-7', first_name: 'Demo', last_name: 'Row', email: 'demo@gmail.test',
      application_type: 'job', interview_date: '2026-11-02',
    }),
  ];
});

describe('InterviewerApplicantsList scheduled promotions', () => {
  it('lists the scheduled promotion once, as Promotional, beside the original', async () => {
    renderList();

    const evaluate = await screen.findByRole('button', { name: 'Evaluate Paula Promoted' }, { timeout: 3000 });
    expect(within(evaluate.closest('tr')!).getByText('Promotional')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Evaluate Paula Promoted' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Evaluate Oscar Original' })).toBeTruthy();
    expect(screen.queryByText(/Una Unscheduled/)).toBeNull();
    expect(screen.queryByText(/Demo Row/)).toBeNull();
  });

  it('keeps the promotion under the Promotional filter', async () => {
    renderList();
    await screen.findByRole('button', { name: 'Evaluate Paula Promoted' }, { timeout: 3000 });

    fireEvent.change(screen.getByLabelText('Applicant type'), { target: { value: 'promotional' } });

    expect(screen.getByRole('button', { name: 'Evaluate Paula Promoted' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Evaluate Oscar Original' })).toBeNull();
  });

  it('opens the evaluation for the persisted application UUID', async () => {
    renderList();

    fireEvent.click(await screen.findByRole('button', { name: 'Evaluate Paula Promoted' }, { timeout: 3000 }));

    expect(await screen.findByText(`Evaluating ${PROMOTION_ID}`)).toBeTruthy();
  });
});
