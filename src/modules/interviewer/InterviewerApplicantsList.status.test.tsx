import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const transition = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api/applicantStatusTransition', () => ({ transitionApplicantStatus: transition }));
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

import { hasSnapshotEvaluation, InterviewerApplicantsList } from './InterviewerApplicantsList';

const applicant = (over: Record<string, unknown>) => ({
  middle_name: null, status: 'Interview/Exam Scheduled', contact_number: '', created_at: '2026-10-21T00:00:00Z',
  position: POSITION, office: 'Office of The City Accountant', interview_time: '14:47:00',
  assigned_interviewer_email: 'rater@iloilo.test', ...over,
});

const openDetails = async (status: string) => {
  db.rows.applicants = [applicant({
    id: ORIGINAL_ID, first_name: 'Oscar', last_name: 'Original', email: 'oscar@gmail.test',
    application_type: 'job', interview_date: '2026-11-02', status,
  })];
  render(
    <MemoryRouter initialEntries={[`/interviewer/applicants?position=${encodeURIComponent(POSITION)}`]}>
      <Routes>
        <Route path="/interviewer/applicants" element={<InterviewerApplicantsList />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Oscar Original' }, { timeout: 3000 }));
  return await screen.findByRole('button', { name: 'Qualify' });
};

const statusPill = (text: string) => within(document.querySelector('.applicant-summary-card') as HTMLElement).getByText(text);

beforeEach(() => {
  localStorage.clear();
  db.rows.evaluations = [];
  transition.mockReset();
  transition.mockResolvedValue({ kind: 'advanced', status: 'Qualified' });
});

describe('InterviewerApplicantsList decisions', () => {
  it('asks the service to qualify the application', async () => {
    fireEvent.click(await openDetails('For Evaluation'));

    await waitFor(() => expect(transition).toHaveBeenCalledWith(ORIGINAL_ID, 'Qualified', undefined));
    expect(await screen.findByText('Qualified')).toBeTruthy();
  });

  it('asks the service to disqualify, keeping the stored Not Qualified value', async () => {
    await openDetails('For Evaluation');
    transition.mockResolvedValue({ kind: 'advanced', status: 'Not Qualified' });

    fireEvent.click(screen.getByRole('button', { name: 'Disqualify' }));

    await waitFor(() => expect(transition).toHaveBeenCalledWith(ORIGINAL_ID, 'Disqualified', 'Not Qualified'));
    expect(await screen.findByText('Not Qualified')).toBeTruthy();
  });

  it('keeps a hired applicant as is and explains the refusal', async () => {
    transition.mockResolvedValue({ kind: 'unchanged', reason: 'transition-not-allowed' });

    fireEvent.click(await openDetails('Hired'));

    expect(await screen.findByText(/can't move to that status/i)).toBeTruthy();
    expect(statusPill('Hired')).toBeTruthy();
  });

  it('does not show the new status until the server confirms it', async () => {
    let finish: (value: unknown) => void = () => {};
    transition.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    const qualify = await openDetails('For Evaluation');
    fireEvent.click(qualify);

    await waitFor(() => expect((qualify as HTMLButtonElement).disabled).toBe(true));
    expect(statusPill('For Evaluation')).toBeTruthy();
    finish({ kind: 'advanced', status: 'Qualified' });
    expect(await screen.findByText('Qualified')).toBeTruthy();
  });

  it('shows a failed write without changing the status or the raw error', async () => {
    transition.mockResolvedValue({ kind: 'failed', error: 'permission denied for table applicants' });

    fireEvent.click(await openDetails('For Evaluation'));

    expect(await screen.findByText(/couldn't update this application/i)).toBeTruthy();
    expect(screen.queryByText(/permission denied/)).toBeNull();
    expect(statusPill('For Evaluation')).toBeTruthy();
  });

  it('clears a refusal when the details are closed and reopened', async () => {
    transition.mockResolvedValue({ kind: 'unchanged', reason: 'transition-not-allowed' });
    fireEvent.click(await openDetails('Hired'));
    await screen.findByText(/can't move to that status/i);

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(document.querySelector('.details-close-btn') as HTMLElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Oscar Original' }));

    await screen.findByRole('button', { name: 'Qualify' });
    expect(screen.queryByText(/can't move to that status/i)).toBeNull();
  });
});

describe('InterviewerApplicantsList status pill', () => {
  it('does not read Not Qualified as qualified', async () => {
    await openDetails('Not Qualified');

    expect(statusPill('Not Qualified').className).not.toContain('status-qualified');
  });

  it('reads For Evaluation as reviewed, not pending', async () => {
    await openDetails('For Evaluation');

    expect(statusPill('For Evaluation').className).toContain('status-reviewed');
  });
});

describe('hasSnapshotEvaluation', () => {
  const snapshot = { pcptAverage: 4 };

  it('counts a snapshot saved for this application', () => {
    expect(hasSnapshotEvaluation({ [`id:${ORIGINAL_ID}`]: snapshot }, { id: ORIGINAL_ID, email: 'a@b.test' })).toBe(true);
  });

  it('ignores a stale snapshot saved under a shared email', () => {
    expect(hasSnapshotEvaluation({ 'email:a@b.test': snapshot }, { id: ORIGINAL_ID, email: 'a@b.test' })).toBe(false);
  });
});
