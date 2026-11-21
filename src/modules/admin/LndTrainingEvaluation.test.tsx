import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvalBoard, EvalRow, EvalTraining } from '../../lib/api/trainingEvaluations';

const apiMocks = vi.hoisted(() => ({
  listEvaluableTrainings: vi.fn(),
  getEvaluationBoard: vi.fn(),
  saveScores: vi.fn(),
  setAssessmentMode: vi.fn(),
  setReviewStatus: vi.fn(),
  uploadOutput: vi.fn(),
  saveReportNotes: vi.fn(),
}));

vi.mock('../../lib/api/trainingEvaluations', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/trainingEvaluations')>(
    '../../lib/api/trainingEvaluations',
  );
  return {
    ...actual,
    listEvaluableTrainings: apiMocks.listEvaluableTrainings,
    getEvaluationBoard: apiMocks.getEvaluationBoard,
    saveScores: apiMocks.saveScores,
    setAssessmentMode: apiMocks.setAssessmentMode,
    setReviewStatus: apiMocks.setReviewStatus,
    uploadOutput: apiMocks.uploadOutput,
    saveReportNotes: apiMocks.saveReportNotes,
  };
});

import { LndTrainingEvaluation } from './LndTrainingEvaluation';

const makeTraining = (id: string, title: string): EvalTraining => ({
  id,
  title,
  category: 'Technical',
  startDate: '2026-09-01T09:00:00Z',
  endDate: null,
  location: 'Main Hall',
  instructorName: 'Dr. Cruz',
  status: 'Scheduled',
  attendeeCount: 1,
});

const makeRow = (overrides: Partial<EvalRow> = {}): EvalRow => ({
  enrollmentId: 'enr-1',
  employeeId: 'emp-1',
  name: 'Ana Cruz',
  position: 'Analyst',
  department: 'HRMO',
  enrollmentStatus: 'Enrolled',
  attendanceStatus: 'Present',
  mode: 'test',
  pre: 70,
  post: 85,
  submissionUrl: null,
  submissionName: null,
  submissionNotes: null,
  reviewStatus: 'Pending',
  lndNotes: null,
  updatedAt: '2026-11-21 08:00:00.123456+00',
  ...overrides,
});

const makeBoard = (id = 'sess-1', title = 'Ethics Training', rowOverrides: Partial<EvalRow> = {}): EvalBoard => ({
  training: makeTraining(id, title),
  rows: [makeRow(rowOverrides)],
  reportNotes: 'Initial recommendation',
});

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('LndTrainingEvaluation', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((fn) => fn.mockReset());
    apiMocks.saveScores.mockResolvedValue({ ok: true, updatedAt: '2026-11-21 08:05:00.000001+00' });
    apiMocks.setAssessmentMode.mockResolvedValue({ ok: true, updatedAt: '2026-11-21 08:05:00.000002+00' });
    apiMocks.setReviewStatus.mockResolvedValue({ ok: true, updatedAt: '2026-11-21 08:05:00.000003+00' });
    apiMocks.uploadOutput.mockResolvedValue({
      ok: true,
      url: 'https://cdn.local/out.pdf',
      name: 'out.pdf',
      updatedAt: '2026-11-21 08:05:00.000004+00',
    });
    apiMocks.saveReportNotes.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows Retry error panel and never empty state when listEvaluableTrainings fails', async () => {
    apiMocks.listEvaluableTrainings
      .mockRejectedValueOnce(new Error('list down'))
      .mockResolvedValueOnce([makeTraining('sess-1', 'Ethics Training')]);
    apiMocks.getEvaluationBoard.mockResolvedValueOnce(makeBoard());

    render(<LndTrainingEvaluation />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/load|training/i);
    expect(screen.queryByText('No trainings to evaluate')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
  });

  it('blocks board controls on initial load error and handles confirmed null board', async () => {
    apiMocks.listEvaluableTrainings.mockResolvedValue([makeTraining('sess-1', 'Ethics Training')]);
    apiMocks.getEvaluationBoard
      .mockRejectedValueOnce(new Error('board down'))
      .mockResolvedValueOnce(null);

    render(<LndTrainingEvaluation />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/board|evaluation|load/i);
    expect(screen.queryByLabelText('Pre-test score for Ana Cruz')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export training report/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/training not found/i)).toBeInTheDocument();
  });

  it('clears old board immediately and ignores late responses on session switch', async () => {
    const firstBoard = deferred<EvalBoard>();
    const secondBoard = deferred<EvalBoard>();
    apiMocks.listEvaluableTrainings.mockResolvedValue([
      makeTraining('sess-1', 'First Training'),
      makeTraining('sess-2', 'Second Training'),
    ]);
    apiMocks.getEvaluationBoard
      .mockReturnValueOnce(firstBoard.promise)
      .mockReturnValueOnce(secondBoard.promise);

    render(<LndTrainingEvaluation />);
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'sess-2' } });
    firstBoard.resolve(makeBoard('sess-1', 'First Training', { name: 'Old Attendee' }));
    await Promise.resolve();
    expect(screen.queryByText('Old Attendee')).not.toBeInTheDocument();

    secondBoard.resolve(makeBoard('sess-2', 'Second Training', { name: 'New Attendee' }));
    expect(await screen.findByText('New Attendee')).toBeInTheDocument();
  });

  it('preserves board and drafts on refresh failure, labels view stale, and disables all mutators until Retry refresh succeeds', async () => {
    const board = makeBoard('sess-1', 'Ethics Training', { pre: 70, post: 85 });
    apiMocks.listEvaluableTrainings.mockResolvedValue([board.training]);
    apiMocks.getEvaluationBoard
      .mockResolvedValueOnce(board)
      .mockRejectedValueOnce(new Error('refresh boom'))
      .mockResolvedValueOnce(board);

    render(<LndTrainingEvaluation />);
    const preInput = (await screen.findByLabelText('Pre-test score for Ana Cruz')) as HTMLInputElement;
    const notesBox = screen.getByPlaceholderText(/assessment of the training/i) as HTMLTextAreaElement;

    fireEvent.change(preInput, { target: { value: '77' } });
    fireEvent.change(notesBox, { target: { value: 'Draft notes' } });

    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    const staleAlert = await screen.findByRole('alert');
    expect(staleAlert).toHaveTextContent(/stale/i);
    expect(preInput.value).toBe('77');
    expect(notesBox.value).toBe('Draft notes');
    expect(preInput).toBeDisabled();
    expect(notesBox).toBeDisabled();
    expect(screen.getByRole('button', { name: /export training report/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /retry refresh/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Pre-test score for Ana Cruz')).toBeEnabled();
  });

  it('sends partial single-field patches, supports explicit 0 and null clear, merges rapid edits, and threads updatedAt', async () => {
    const ts0 = '2026-11-21 08:00:00.111111+00';
    const ts1 = '2026-11-21 08:02:00.222222+00';
    const ts2 = '2026-11-21 08:03:00.333333+00';
    const board = makeBoard('sess-1', 'Ethics Training', { pre: 70, post: 85, updatedAt: ts0 });
    apiMocks.listEvaluableTrainings.mockResolvedValue([board.training]);
    apiMocks.getEvaluationBoard.mockResolvedValue(board);
    apiMocks.saveScores
      .mockResolvedValueOnce({ ok: true, updatedAt: ts1 })
      .mockResolvedValueOnce({ ok: true, updatedAt: ts2 });

    render(<LndTrainingEvaluation />);
    const preInput = (await screen.findByLabelText('Pre-test score for Ana Cruz')) as HTMLInputElement;
    const postInput = screen.getByLabelText('Post-test score for Ana Cruz') as HTMLInputElement;

    // Post edited alone sends ONLY { post: 91 } omitting pre.
    fireEvent.change(postInput, { target: { value: '91' } });
    fireEvent.blur(postInput);
    await waitFor(() => expect(apiMocks.saveScores).toHaveBeenCalledTimes(1));
    expect(apiMocks.saveScores).toHaveBeenLastCalledWith('enr-1', { post: 91 }, ts0);

    // Explicit 0 uses updated ts1, omitting untouched post.
    fireEvent.change(preInput, { target: { value: '0' } });
    fireEvent.blur(preInput);
    await waitFor(() => expect(apiMocks.saveScores).toHaveBeenCalledTimes(2));
    expect(apiMocks.saveScores).toHaveBeenLastCalledWith('enr-1', { pre: 0 }, ts1);

    // Clearing post to '' sends explicit null using ts2.
    fireEvent.change(postInput, { target: { value: '' } });
    fireEvent.blur(postInput);
    await waitFor(() => expect(apiMocks.saveScores).toHaveBeenCalledTimes(3));
    expect(apiMocks.saveScores).toHaveBeenLastCalledWith('enr-1', { post: null }, ts2);

    // Invalid score is rejected without calling saveScores.
    fireEvent.change(preInput, { target: { value: '105' } });
    fireEvent.blur(preInput);
    await Promise.resolve();
    expect(apiMocks.saveScores).toHaveBeenCalledTimes(3);
  });

  it('preserves draft and offers Refresh on conflict; handles uploadOutput partialFailure honestly', async () => {
    const board = makeBoard('sess-1', 'Ethics Training', { mode: 'output', pre: null, post: null });
    apiMocks.listEvaluableTrainings.mockResolvedValue([board.training]);
    apiMocks.getEvaluationBoard.mockResolvedValue(board);
    apiMocks.setReviewStatus.mockResolvedValueOnce({
      ok: false,
      conflict: true,
      error: 'Changed concurrently',
    });
    apiMocks.uploadOutput.mockResolvedValueOnce({
      ok: false,
      partialFailure: true,
      url: 'https://cdn.local/partial.pdf',
      name: 'partial.pdf',
      error: 'File uploaded but row update conflicted',
    });

    render(<LndTrainingEvaluation />);
    const reviewSelect = await screen.findByDisplayValue('Pending');
    fireEvent.change(reviewSelect, { target: { value: 'Verified' } });

    const conflictAlert = await screen.findByRole('alert');
    expect(conflictAlert).toHaveTextContent(/changed concurrently/i);
    expect(screen.getByDisplayValue('Pending')).toBeInTheDocument();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['abc'], 'partial.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(apiMocks.uploadOutput).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('partial.pdf')).not.toBeInTheDocument();
  });
});
