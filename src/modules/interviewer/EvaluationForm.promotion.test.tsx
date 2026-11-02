import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Task 3A: an interviewer on a second browser (empty localStorage) opens the
// scheduled promotion. The form must read Promotional from the persisted
// application, not from a type cached by the RSP browser.
const PROMOTION_ID = '09e72c95-0e64-4199-8324-49e8dde07bc7';

const db = vi.hoisted(() => {
  const rows: Record<string, unknown[]> = { applicants: [], applicant_attachments: [] };
  const query = (table: string) => {
    const result = () => ({ data: rows[table] ?? [], error: null });
    const chain: any = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null });
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
vi.mock('../../lib/dataSourceMode', () => ({ getPreferredDataSourceMode: () => 'supabase' }));
vi.mock('../../hooks/usePlantillaNames', () => ({ usePlantillaNames: () => ({ nameFor: () => '' }) }));
vi.mock('../../lib/interviewerAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/interviewerAccess')>();
  return {
    ...actual,
    resolveAssignedPositionsForInterviewer: vi.fn(async () => ({ email: 'rater@iloilo.test', positions: ['City Accountant II'] })),
  };
});

import { EvaluationForm } from './EvaluationForm';

const renderForm = () =>
  render(
    <MemoryRouter initialEntries={[`/interviewer/evaluate/${PROMOTION_ID}`]}>
      <Routes>
        <Route path="/interviewer/evaluate/:id" element={<EvaluationForm />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  db.rows.applicants = [{
    id: PROMOTION_ID, first_name: 'Paula', middle_name: null, last_name: 'Promoted', email: 'employee@example.com',
    position: 'City Accountant II', office: 'Office of The City Accountant', status: 'Interview/Exam Scheduled',
    application_type: 'promotion', interview_date: '2026-11-02', interview_time: '14:47:00',
    created_at: '2026-10-21T00:00:00Z', contact_number: '', address: '', is_pwd: false, item_number: 'PLT-9622644CF0',
  }];
});

describe('EvaluationForm scheduled promotion', () => {
  it('opens PCPT only, from the persisted application type, with an empty cache', async () => {
    renderForm();

    expect(await screen.findByRole('button', { name: 'PCPT Evaluation' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Oral Interview Form' })).toBeNull();
    expect(screen.getByText('Oral Interview Evaluation is not required for promotional applicants.')).toBeTruthy();
  });

  it('treats the same row as Original when it is not a promotion', async () => {
    db.rows.applicants = [{ ...(db.rows.applicants[0] as object), application_type: 'job' }];
    renderForm();

    expect(await screen.findByRole('button', { name: 'Oral Interview Form' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'PCPT Evaluation' })).toBeNull();
  });

  it('keeps a hired external applicant Original although hiring linked an employee', async () => {
    db.rows.applicants = [{ ...(db.rows.applicants[0] as object), application_type: 'job', employee_id: 'EMP-2026-001' }];
    renderForm();

    expect(await screen.findByRole('button', { name: 'Oral Interview Form' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'PCPT Evaluation' })).toBeNull();
  });

  it('replaces a stale cached Promotional with the record type', async () => {
    db.rows.applicants = [{ ...(db.rows.applicants[0] as object), application_type: 'job', employee_id: 'EMP-2026-001' }];
    localStorage.setItem('cictrix_rsp_score_setup', JSON.stringify({ [PROMOTION_ID]: 'promotional' }));
    renderForm();

    expect(await screen.findByRole('button', { name: 'Oral Interview Form' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'PCPT Evaluation' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('cictrix_rsp_score_setup') ?? '{}')[PROMOTION_ID]).toBe('original');
  });
});
