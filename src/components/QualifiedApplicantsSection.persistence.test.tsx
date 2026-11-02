import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QualifiedApplicantsSection, type ApplicantRecord } from './QualifiedApplicantsSection';

const APPLICANT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-111111111111';

const fetchApplicantCategoryScores = vi.fn();
const fetchApplicantScoreSummaries = vi.fn();
const saveApplicantCategoryScores = vi.fn();
const savePositionWrittenExamScores = vi.fn();
const fetchWrittenExamTotals = vi.fn();
const saveWrittenExamTotal = vi.fn();
const fetchLatestEvaluationForApplicantOrEmailAnySource = vi.fn();
const listApplicantDocumentAttachments = vi.fn();

vi.mock('../lib/api/examTotalPoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/examTotalPoints')>();
  return {
    ...actual,
    fetchWrittenExamTotals: (...args: unknown[]) => fetchWrittenExamTotals(...args),
    saveWrittenExamTotal: (...args: unknown[]) => saveWrittenExamTotal(...args),
  };
});

vi.mock('../lib/api/applicantScores', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/applicantScores')>();
  return {
    ...actual,
    fetchApplicantCategoryScores: (...args: unknown[]) => fetchApplicantCategoryScores(...args),
    fetchApplicantScoreSummaries: (...args: unknown[]) => fetchApplicantScoreSummaries(...args),
    saveApplicantCategoryScores: (...args: unknown[]) => saveApplicantCategoryScores(...args),
    savePositionWrittenExamScores: (...args: unknown[]) => savePositionWrittenExamScores(...args),
  };
});

vi.mock('../lib/evaluationScores', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/evaluationScores')>();
  return {
    ...actual,
    fetchLatestEvaluationForApplicantOrEmailAnySource: (...args: unknown[]) =>
      fetchLatestEvaluationForApplicantOrEmailAnySource(...args),
    subscribeToEvaluationChanges: () => () => {},
  };
});

vi.mock('../lib/documentViewing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/documentViewing')>();
  return {
    ...actual,
    listApplicantDocumentAttachments: (...args: unknown[]) => listApplicantDocumentAttachments(...args),
  };
});

vi.mock('../lib/adminSession', () => ({ getAdminRole: () => 'rsp' }));

import {
  CATEGORY_SCORES_UPDATED_EVENT,
  CAT_SCORES_KEY,
  type ApplicantCategoryScores,
  type ApplicantScoreSummary,
} from '../lib/api/applicantScores';

const applicant: ApplicantRecord = {
  id: APPLICANT_ID,
  full_name: 'Ana Cruz',
  email: 'ana.cruz@example.com',
  contact_number: '',
  position: 'Engineer I',
  office: "City Engineer's Office",
  status: 'Shortlisted',
  created_at: '2026-10-01',
  total_score: null,
  exam_date: '2026-10-20',
};

const completeOriginalScores = (finalScore = 16): ApplicantCategoryScores => ({
  education: { initialScore: finalScore, finalScore, remarks: '' },
  experience: { initialScore: 14, finalScore: 14, remarks: '' },
  performance: { initialScore: 18, finalScore: 18, remarks: '' },
  pcpt: { initialScore: 16, finalScore: 16, remarks: '' },
  potential: { initialScore: 18, finalScore: 18, remarks: '' },
  writtenExam: { initialScore: 80, finalScore: 80, remarks: '' },
  oralExam: { initialScore: 15, finalScore: 15, remarks: '' },
  appointmentType: 'original',
  positionType: 'rank-and-file',
});

const summary = (overrides: Partial<ApplicantScoreSummary> = {}): ApplicantScoreSummary => ({
  applicantId: APPLICANT_ID,
  appointmentType: 'original',
  assessmentTotal: 45,
  writtenExamRawScore: 80,
  isFinalized: true,
  ...overrides,
});

const renderSection = () => render(
  <MemoryRouter>
    <QualifiedApplicantsSection applicants={[applicant]} completedEvaluationIds={new Set()} />
  </MemoryRouter>,
);

const openFolder = async () => {
  const folderCell = await screen.findByRole('cell', { name: /Engineer I/ });
  fireEvent.click(folderCell.closest('tr') as HTMLElement);
};

const applicantRow = async () => {
  const row = await screen.findByRole('button', { name: /Open scores for Ana Cruz/ });
  return row.closest('tr') as HTMLElement;
};

const fillOriginalScores = (dialog: HTMLElement) => {
  fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '16' } });
  fireEvent.change(within(dialog).getByPlaceholderText('Enter years of experience'), { target: { value: '7' } });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  fetchWrittenExamTotals.mockResolvedValue({ ok: true, totals: {} });
  saveWrittenExamTotal.mockResolvedValue({ ok: true });
  fetchApplicantCategoryScores.mockResolvedValue({ ok: true, data: new Map() });
  fetchApplicantScoreSummaries.mockResolvedValue({ ok: true, data: new Map() });
  saveApplicantCategoryScores.mockResolvedValue({ ok: true });
  savePositionWrittenExamScores.mockResolvedValue({ ok: true });
  fetchLatestEvaluationForApplicantOrEmailAnySource.mockResolvedValue(null);
  listApplicantDocumentAttachments.mockResolvedValue([]);
});

describe('Applicant score persistence and finalization', () => {
  it('keeps the modal open and editable with entered values when the remote save is rejected', async () => {
    saveApplicantCategoryScores.mockResolvedValue({ ok: false, error: new Error('permission denied') });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderSection();
    await openFolder();
    fireEvent.click(await screen.findByRole('button', { name: /Open scores for Ana Cruz/ }));
    const dialog = await screen.findByRole('dialog');

    fillOriginalScores(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Scores' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Scores were not saved');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect((within(dialog).getByRole('combobox') as HTMLSelectElement).value).toBe('16');
    expect((within(dialog).getByPlaceholderText('Enter years of experience') as HTMLInputElement).value).toBe('7');
    expect(within(dialog).queryByText('Score Finalized — View Only Mode')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Save Scores' })).toBeEnabled();
    expect(saveApplicantCategoryScores).toHaveBeenCalledWith(APPLICANT_ID, expect.objectContaining({
      education: expect.objectContaining({ finalScore: 16 }),
      experience: expect.objectContaining({ finalScore: 14 }),
      appointmentType: 'original',
    }));

    const successEvent = dispatchSpy.mock.calls.find(
      ([event]) => (event as CustomEvent).type === CATEGORY_SCORES_UPDATED_EVENT,
    );
    expect(successEvent).toBeUndefined();
    expect(localStorage.getItem(CAT_SCORES_KEY)).toBeNull();
  });

  it('does not finalize until the awaited save succeeds', async () => {
    let resolveSave!: (result: { ok: boolean }) => void;
    saveApplicantCategoryScores.mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));

    renderSection();
    await openFolder();
    fireEvent.click(await screen.findByRole('button', { name: /Open scores for Ana Cruz/ }));
    const dialog = await screen.findByRole('dialog');

    fillOriginalScores(dialog);
    const saveButton = within(dialog).getByRole('button', { name: 'Save Scores' }) as HTMLButtonElement;
    fireEvent.click(saveButton);

    expect(saveButton.getAttribute('aria-busy')).toBe('true');
    expect(within(dialog).queryByText('Score Finalized — View Only Mode')).toBeNull();

    // The old handler finalized on a timer; an unresolved remote save must not.
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(within(dialog).queryByText('Score Finalized — View Only Mode')).toBeNull();

    resolveSave({ ok: true });

    expect(await within(dialog).findByText('Score Finalized — View Only Mode')).toBeInTheDocument();
  });

  it('uses the remote summary for finalized state after a hard reload with an empty cache', async () => {
    fetchApplicantCategoryScores.mockResolvedValue({
      ok: true,
      data: new Map([[APPLICANT_ID, completeOriginalScores()]]),
    });
    fetchApplicantScoreSummaries.mockResolvedValue({
      ok: true,
      data: new Map([[APPLICANT_ID, summary()]]),
    });

    renderSection();
    await openFolder();
    const row = await applicantRow();

    await waitFor(() => expect(within(row).getByText('Finalized')).toBeInTheDocument());
    expect(fetchApplicantScoreSummaries).toHaveBeenCalledWith([APPLICANT_ID]);

    fireEvent.click(row);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Score Finalized — View Only Mode')).toBeInTheDocument());
  });

  it('does not treat a complete local cache as durable finalization for a real applicant id', async () => {
    localStorage.setItem(CAT_SCORES_KEY, JSON.stringify({ [APPLICANT_ID]: completeOriginalScores() }));
    fetchApplicantCategoryScores.mockResolvedValue({
      ok: true,
      data: new Map([[APPLICANT_ID, completeOriginalScores()]]),
    });
    fetchApplicantScoreSummaries.mockResolvedValue({
      ok: true,
      data: new Map([[APPLICANT_ID, summary({ isFinalized: false })]]),
    });

    renderSection();
    await openFolder();
    const row = await applicantRow();

    await waitFor(() => expect(within(row).getByText('Pending')).toBeInTheDocument());
    expect(within(row).queryByText('Finalized')).toBeNull();

    fireEvent.click(row);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Score Finalized — View Only Mode')).toBeNull();
    expect((within(dialog).getByRole('combobox') as HTMLSelectElement).disabled).toBe(false);
  });

  it('shows a load error instead of treating a failed summary read as an empty ranking', async () => {
    fetchApplicantScoreSummaries.mockResolvedValue({
      ok: false,
      data: new Map(),
      error: new Error('offline'),
    });

    renderSection();
    await openFolder();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("We couldn't load saved score status");
    const row = await applicantRow();
    expect(within(row).getByText('Status unavailable')).toBeInTheDocument();
    expect(within(row).queryByText('Pending')).toBeNull();
    expect(within(row).queryByText('Finalized')).toBeNull();
  });

  it('keeps valid zero scores visible instead of rendering them as missing', async () => {
    const zeroScores: ApplicantCategoryScores = {
      ...completeOriginalScores(0),
      experience: { initialScore: 0, finalScore: 0, remarks: '' },
      writtenExam: { initialScore: 0, finalScore: 0, remarks: '' },
      oralExam: { initialScore: 0, finalScore: 0, remarks: '' },
    };
    fetchApplicantCategoryScores.mockResolvedValue({
      ok: true,
      data: new Map([[APPLICANT_ID, zeroScores]]),
    });
    fetchApplicantScoreSummaries.mockResolvedValue({
      ok: true,
      data: new Map([[APPLICANT_ID, summary({ assessmentTotal: 0, writtenExamRawScore: 0 })]]),
    });

    renderSection();
    await openFolder();
    const row = await applicantRow();

    await waitFor(() => expect(within(row).getByText('Finalized')).toBeInTheDocument());
    expect(within(row).getAllByText('0').length).toBeGreaterThan(0);
    expect(within(row).getByText('0 / 100')).toBeInTheDocument();
  });
});
