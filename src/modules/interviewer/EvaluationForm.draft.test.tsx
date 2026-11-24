import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const APPLICATION_ID = '11111111-2222-4333-8444-555555555555';

const db = vi.hoisted(() => {
  const rows: Record<string, unknown[]> = { applicants: [], applicant_attachments: [] };
  const inserts: unknown[] = [];
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
            return Promise.resolve({ error: null });
          };
        }
        return () => chain;
      },
    });
    return chain;
  };
  return { rows, inserts, query };
});

vi.mock('../../lib/supabase', () => ({
  isMockModeEnabled: false,
  supabase: {
    from: (table: string) => db.query(table),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('../../lib/api/applicantStatusTransition', () => ({
  transitionApplicantStatus: vi.fn().mockResolvedValue({ kind: 'advanced' }),
}));
vi.mock('../../lib/recruitmentData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/recruitmentData')>()),
  getApplicants: () => [],
  saveApplicants: vi.fn(),
}));
vi.mock('../../lib/interviewerAccess', () => ({
  resolveAssignedPositionsForInterviewer: vi.fn().mockResolvedValue([]),
  isPositionAssignedToInterviewer: vi.fn().mockReturnValue(true),
}));
vi.mock('../../hooks/usePlantillaNames', () => ({
  usePlantillaNames: () => ({ nameFor: (v: string) => v }),
}));

import { EvaluationForm } from './EvaluationForm';

const renderForm = () =>
  render(
    <MemoryRouter initialEntries={['/interviewer/dashboard', `/interviewer/evaluate/${APPLICATION_ID}`]} initialIndex={1}>
      <Routes>
        <Route path="/interviewer/dashboard" element={<div>Interviewer Dashboard</div>} />
        <Route path="/interviewer/evaluate/:id" element={<EvaluationForm />} />
      </Routes>
    </MemoryRouter>,
  );

describe('EvaluationForm Save Draft persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    db.inserts.length = 0;
    localStorage.setItem('cictrix_interviewer_session', JSON.stringify({ name: 'Rater One', email: 'rater@lgu.gov.ph' }));
    db.rows.applicants = [
      {
        id: APPLICATION_ID,
        first_name: 'Maria',
        middle_name: null,
        last_name: 'Santos',
        email: 'maria@example.com',
        position: 'Engineer II',
        office: 'Office of the City Engineer',
        application_type: 'job',
        contact_number: '09171234567',
        address: 'Iloilo City',
        is_pwd: false,
        item_number: 'ENG-001',
        status: 'Interview/Exam Scheduled',
        created_at: '2026-10-01T00:00:00Z',
      },
    ];
  });

  it('persists oral scores and interview notes on Save Draft and restores them on remount', async () => {
    const first = renderForm();
    const notes = await screen.findByPlaceholderText(/Summarize key points/i);
    fireEvent.change(notes, { target: { value: 'Strong technical answers on bridge specs.' } });

    const scoreSelects = screen.getAllByRole('combobox');
    expect(scoreSelects).toHaveLength(6);
    for (const select of scoreSelects) {
      fireEvent.change(select, { target: { value: '4' } });
    }

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Interviewer Dashboard')).toBeInTheDocument();
    expect(localStorage.getItem(`cictrix_interviewer_eval_draft:${APPLICATION_ID}`)).not.toBeNull();
    first.unmount();

    renderForm();
    expect(await screen.findByText(/Saved draft restored/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Summarize key points/i)).toHaveValue('Strong technical answers on bridge specs.');
    for (const select of screen.getAllByRole('combobox')) {
      expect(select).toHaveValue('4');
    }

    // Submitting clears the saved draft
    fireEvent.click(screen.getByRole('button', { name: 'Submit Final Evaluation' }));
    await waitFor(() => expect(db.inserts).toHaveLength(1));
    expect(localStorage.getItem(`cictrix_interviewer_eval_draft:${APPLICATION_ID}`)).toBeNull();
  });

  it('persists promotional PCPT scores on Save Draft and clears them via Discard Draft', async () => {
    db.rows.applicants = [
      {
        ...(db.rows.applicants[0] as Record<string, unknown>),
        application_type: 'promotion',
      },
    ];

    const first = renderForm();
    const notes = await screen.findByPlaceholderText(/Summarize key points/i);
    fireEvent.change(notes, { target: { value: 'Poised and articulate during promotional panel.' } });

    const pcptSelects = screen.getAllByRole('combobox');
    expect(pcptSelects).toHaveLength(6);
    for (const select of pcptSelects) {
      fireEvent.change(select, { target: { value: '5' } });
    }

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Interviewer Dashboard')).toBeInTheDocument();
    first.unmount();

    renderForm();
    expect(await screen.findByText(/Saved draft restored/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Summarize key points/i)).toHaveValue(
      'Poised and articulate during promotional panel.',
    );
    for (const select of screen.getAllByRole('combobox')) {
      expect(select).toHaveValue('5');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Discard Draft' }));
    expect(screen.queryByText(/Saved draft restored/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(`cictrix_interviewer_eval_draft:${APPLICATION_ID}`)).toBeNull();
    expect(screen.getByPlaceholderText(/Summarize key points/i)).toHaveValue('');
  });
});
