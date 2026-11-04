import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const APPLICATION_ID = '09e72c95-0e64-4199-8324-49e8dde07bc7';
const SIBLING_ID = '3f0a7a56-2a3c-4f7e-9d7b-0b1f3c9a1111';

const db = vi.hoisted(() => {
  const rows: Record<string, unknown[]> = { applicants: [], applicant_attachments: [] };
  const inserts: unknown[] = [];
  const state = { insertError: null as { message: string } | null };
  const query = (table: string) => {
    const result = () => ({ data: rows[table] ?? [], error: null });
    const chain: any = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null });
        }
        if (prop === 'insert') {
          return (payload: unknown) => {
            inserts.push(payload);
            return Promise.resolve({ error: state.insertError });
          };
        }
        return () => chain;
      },
    });
    return chain;
  };
  return { rows, inserts, state, query };
});

const transition = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => ({ rows: [] as any[], saved: [] as any[][] }));

vi.mock('../../lib/supabase', () => ({
  isMockModeEnabled: false,
  supabase: {
    from: (table: string) => db.query(table),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('../../lib/api/applicantStatusTransition', () => ({ transitionApplicantStatus: transition }));
vi.mock('../../lib/recruitmentData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/recruitmentData')>()),
  getApplicants: () => store.rows,
  saveApplicants: (rows: any[]) => { store.saved.push(rows); },
}));
vi.mock('../../lib/dataSourceMode', () => ({ getPreferredDataSourceMode: () => 'supabase' }));
vi.mock('../../hooks/usePlantillaNames', () => ({ usePlantillaNames: () => ({ nameFor: () => '' }) }));
vi.mock('../../lib/interviewerAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/interviewerAccess')>()),
  resolveAssignedPositionsForInterviewer: vi.fn(async () => ({ email: 'rater@iloilo.test', positions: ['City Accountant II'] })),
}));

import { EvaluationForm } from './EvaluationForm';

const EMAIL = 'shared@example.com';
const recruitmentRow = (id: string, status: string, email = EMAIL) => ({ id, status, personalInfo: { email } });

const submitEvaluation = async ({ pcpt = false } = {}) => {
  const view = render(
    <MemoryRouter initialEntries={[`/interviewer/evaluate/${APPLICATION_ID}`]}>
      <Routes>
        <Route path="/interviewer/evaluate/:id" element={<EvaluationForm />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'PCPT Evaluation' }, { timeout: 3000 });
  const nameInput = view.container.querySelector('input.form-input, input[type="text"]') as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: 'Rita Rater' } });
  if (pcpt) {
    const select = view.container.querySelector('select.pcpt-score-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: select.options[1].value } });
  }
  const notes = view.container.querySelector('.interview-notes-textarea') as HTMLTextAreaElement;
  fireEvent.change(notes, { target: { value: 'Clear and well prepared.' } });
  fireEvent.submit(notes.closest('form') as HTMLFormElement);
  return view;
};

beforeEach(() => {
  localStorage.clear();
  transition.mockReset();
  transition.mockResolvedValue({ kind: 'advanced', status: 'For Evaluation' });
  db.inserts.length = 0;
  db.state.insertError = null;
  store.rows = [];
  store.saved = [];
  db.rows.applicants = [{
    id: APPLICATION_ID, first_name: 'Paula', middle_name: null, last_name: 'Promoted', email: EMAIL,
    position: 'City Accountant II', office: 'Office of The City Accountant', status: 'Interview/Exam Scheduled',
    application_type: 'promotion', interview_date: '2026-11-02', interview_time: '14:47:00',
    created_at: '2026-10-21T00:00:00Z', contact_number: '', address: '', is_pwd: false, item_number: 'PLT-1',
  }];
});

describe('EvaluationForm status after submission', () => {
  it('advances the submitted application to For Evaluation and says so', async () => {
    await submitEvaluation();

    expect(await screen.findByText(/moved to For Evaluation/i)).toBeTruthy();
    expect(transition).toHaveBeenCalledWith(APPLICATION_ID, 'For Evaluation');
    expect(db.inserts).toHaveLength(1);
    expect((db.inserts[0] as { applicant_id: string }).applicant_id).toBe(APPLICATION_ID);
    expect(screen.queryByText(/Reviewed/)).toBeNull();
  });

  it('does not touch the status when the evaluation insert fails', async () => {
    db.state.insertError = { message: 'insert rejected' };

    await submitEvaluation();

    await waitFor(() => expect(db.inserts).toHaveLength(1));
    await screen.findByRole('alert');
    expect(transition).not.toHaveBeenCalled();
    expect(screen.queryByText('Evaluation Submitted')).toBeNull();
  });

  it('keeps the saved evaluation and warns, without asking to resubmit, when the status update fails', async () => {
    transition.mockResolvedValue({ kind: 'failed', error: 'write rejected' });

    await submitEvaluation();

    const warning = await screen.findByRole('alert');
    expect(warning.textContent).toMatch(/evaluation is saved/i);
    expect(warning.textContent).toMatch(/do not need to submit it again/i);
    expect(warning.textContent).not.toContain('write rejected');
    expect(screen.getByText('Evaluation Submitted')).toBeTruthy();
    expect(db.inserts).toHaveLength(1);
  });

  it('reports a concurrent change and leaves the local store alone', async () => {
    transition.mockResolvedValue({ kind: 'unchanged', reason: 'concurrent-change' });
    store.rows = [recruitmentRow(APPLICATION_ID, 'Interview/Exam Scheduled')];

    await submitEvaluation();

    expect(await screen.findByText(/changed while you were submitting/i)).toBeTruthy();
    expect(store.saved).toEqual([]);
  });

  it('says the status stays when the workflow does not allow the move', async () => {
    transition.mockResolvedValue({ kind: 'unchanged', reason: 'transition-not-allowed' });

    await submitEvaluation();

    expect(await screen.findByText(/status stays as it is/i)).toBeTruthy();
  });
});

describe('EvaluationForm local recruitment store', () => {
  it('updates only the submitted application when two share an email', async () => {
    store.rows = [
      recruitmentRow(APPLICATION_ID, 'Interview/Exam Scheduled'),
      recruitmentRow(SIBLING_ID, 'Shortlisted'),
    ];

    await submitEvaluation();
    await screen.findByText('Evaluation Submitted');

    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]).toEqual([
      recruitmentRow(APPLICATION_ID, 'For Evaluation'),
      recruitmentRow(SIBLING_ID, 'Shortlisted'),
    ]);
  });

  it('does not match applications on a blank email', async () => {
    db.rows.applicants = [{ ...(db.rows.applicants[0] as object), email: '' }];
    store.rows = [
      recruitmentRow(APPLICATION_ID, 'Interview/Exam Scheduled', ''),
      recruitmentRow(SIBLING_ID, 'Shortlisted', ''),
    ];

    await submitEvaluation();
    await screen.findByText('Evaluation Submitted');

    expect(store.saved[0][1].status).toBe('Shortlisted');
  });

  it('does not demote a local row that has already moved past evaluation', async () => {
    store.rows = [recruitmentRow(APPLICATION_ID, 'Hired')];

    await submitEvaluation();
    await screen.findByText('Evaluation Submitted');

    expect(store.saved[0][0].status).toBe('Hired');
  });
});

describe('EvaluationForm score snapshot', () => {
  it('keys the snapshot by application, never by a shared email', async () => {
    await submitEvaluation({ pcpt: true });
    await screen.findByText('Evaluation Submitted');

    const snapshot = JSON.parse(localStorage.getItem('cictrix_interviewer_score_snapshot') ?? '{}');
    expect(Object.keys(snapshot).filter((key) => key.startsWith('email:'))).toEqual([]);
  });
});
