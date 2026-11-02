import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QualifiedApplicantsSection, type ApplicantRecord } from './QualifiedApplicantsSection';
import type { ApplicantCategoryScores } from '../lib/api/applicantScores';

vi.mock('../lib/api/examTotalPoints', () => ({
  fetchWrittenExamTotals: vi.fn().mockResolvedValue({ ok: true, totals: {} }),
  saveWrittenExamTotal: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../lib/adminSession', () => ({ getAdminRole: () => 'rsp' }));

const saveExam = vi.fn();
const fetchCatScores = vi.fn();
vi.mock('../lib/api/applicantScores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api/applicantScores')>()),
  savePositionWrittenExamScores: (...args: unknown[]) => saveExam(...args),
  fetchApplicantCategoryScores: (...args: unknown[]) => fetchCatScores(...args),
}));

const applicant = (id: string, full_name: string): ApplicantRecord => ({
  id,
  full_name,
  email: `${id}@example.com`,
  contact_number: '',
  position: 'Planning Officer II',
  office: 'Budget Office',
  status: 'Shortlisted',
  created_at: '2026-10-01',
  total_score: null,
  exam_date: '2026-10-20',
});

const applicants = [applicant('1', 'Teodoro Mendoza'), applicant('2', 'Corazon Panganiban')];

const enterScoresAndSave = async () => {
  render(<MemoryRouter><QualifiedApplicantsSection applicants={applicants} completedEvaluationIds={new Set()} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Exam Score/ }));
  fireEvent.change(await screen.findByLabelText(/Written exam score for Teodoro Mendoza/), { target: { value: '88' } });
  fireEvent.change(screen.getByLabelText(/Written exam score for Corazon Panganiban/), { target: { value: '77' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Scores/ }));
};

describe('Written exam score save (F9)', () => {
  beforeEach(() => {
    localStorage.clear();
    saveExam.mockReset();
    fetchCatScores.mockReset();
    fetchCatScores.mockResolvedValue({ data: new Map() });
  });

  it('keeps the modal open with an error and marks nothing completed when the save fails', async () => {
    saveExam.mockResolvedValue({ ok: false, error: { code: 'P0001' } });
    await enterScoresAndSave();

    expect((await screen.findByRole('alert')).textContent).toContain('Exam scores were not saved');
    expect(screen.getByRole('heading', { name: 'Written Examination Scores' })).toBeTruthy();
    expect((screen.getByLabelText(/Written exam score for Teodoro Mendoza/) as HTMLInputElement).value).toBe('88');
    expect(screen.queryByText(/Completed 2\/2/)).toBeNull();
  });

  it('closes after the database confirms the save', async () => {
    saveExam.mockResolvedValue({ ok: true });
    await enterScoresAndSave();

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Written Examination Scores' })).toBeNull(), { timeout: 3000 });
    expect(saveExam).toHaveBeenCalledWith('Planning Officer II', { 1: 88, 2: 77 });
  });

  it('shows each saved exam score in the applicants table', async () => {
    saveExam.mockResolvedValue({ ok: true });
    await enterScoresAndSave();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Written Examination Scores' })).toBeNull(), { timeout: 3000 });

    fireEvent.click(screen.getByText('Planning Officer II', { selector: 'span' }));
    const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
    expect(row('Teodoro Mendoza').textContent).toMatch(/88 \/ \d+/);
    expect(row('Corazon Panganiban').textContent).toMatch(/77 \/ \d+/);
  });

  it('keeps scores loaded from the database while the exam save was waiting (M1)', async () => {
    let finishLoad!: (value: { data: Map<string, ApplicantCategoryScores> }) => void;
    fetchCatScores.mockReturnValue(new Promise((resolve) => { finishLoad = resolve; }));
    let finishSave!: (value: { ok: true }) => void;
    saveExam.mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    await enterScoresAndSave();

    const category = (finalScore: number) => ({ initialScore: finalScore, finalScore, remarks: '' });
    const loaded: ApplicantCategoryScores = {
      education: category(17), experience: category(0), performance: category(0), pcpt: category(0),
      potential: category(0), writtenExam: category(60), oralExam: category(0),
    };
    await act(async () => finishLoad({ data: new Map([['1', loaded]]) }));
    await act(async () => finishSave({ ok: true }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Written Examination Scores' })).toBeNull(), { timeout: 3000 });

    fireEvent.click(screen.getByText('Planning Officer II', { selector: 'span' }));
    const cells = [...(screen.getByText('Teodoro Mendoza').closest('tr') as HTMLElement).querySelectorAll('td')].map((td) => td.textContent);
    expect(cells).toContain('17');
    expect(cells.some((c) => /^88 \/ \d+/.test(c ?? ''))).toBe(true);
  });
});
