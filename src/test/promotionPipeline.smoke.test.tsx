/**
 * Checkpoint smoke: cross-task durable score handoff and fail-closed behavior.
 *
 * This is a characterization smoke test, not browser/database acceptance. The
 * real Task 2 score services write to a stateful in-memory fake of
 * `applicant_category_scores`; the real scoring modal, For Hiring and Applicant
 * Ranking components read that persisted state after a simulated hard reload
 * (unmount + localStorage.clear). Only unrelated document, evaluation,
 * exam-total, hiring-context and local recruitment reads are mocked.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvaluationSnapshot } from '../lib/evaluationScores';
import type { ApplicantRecord } from '../components/QualifiedApplicantsSection';

const {
  appState,
  mockFetchHiringContext,
  mockGetApplicants,
  mockSaveApplicants,
  mockGetNewlyHired,
} = vi.hoisted(() => ({
  appState: {
    scoreRows: [] as any[],
    applicants: [] as any[],
    evaluations: [] as any[],
    rejectUpsert: null as Error | null,
    upserts: [] as any[],
  },
  mockFetchHiringContext: vi.fn(),
  mockGetApplicants: vi.fn(),
  mockSaveApplicants: vi.fn(),
  mockGetNewlyHired: vi.fn(),
}));

const APPLICANT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-111111111111';
const RESERVED_APPLICANT_ID = 'b2c3d4e5-f6a1-4b2c-9d3e-222222222222';
const SHARED_EMAIL = 'maria.santos@iloilo.gov.ph';
const POSITION = 'Administrative Officer II';
const OFFICE = 'Human Resource Management Office';

vi.mock('../lib/supabase', () => {
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

  const builder = (table: string) => {
    const filters: Array<{ kind: 'in'; column: string; values: string[] } | { kind: 'eq'; column: string; value: string }> = [];

    const result = () => {
      if (table === 'applicant_category_scores') {
        let rows = appState.scoreRows;
        for (const filter of filters) {
          rows = rows.filter((row) =>
            filter.kind === 'in'
              ? filter.values.includes(String(row[filter.column] ?? ''))
              : String(row[filter.column] ?? '') === filter.value,
          );
        }
        return { data: clone(rows), error: null };
      }
      if (table === 'applicants') return { data: clone(appState.applicants), error: null };
      if (table === 'evaluations') return { data: clone(appState.evaluations), error: null };
      return { data: [], error: null };
    };

    const query: any = {
      select: () => query,
      in: (column: string, values: string[]) => {
        filters.push({ kind: 'in', column, values: values.map(String) });
        return query;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ kind: 'eq', column, value: String(value) });
        return query;
      },
      order: () => query,
      upsert: async (payload: any) => {
        appState.upserts.push(clone(payload));
        if (appState.rejectUpsert) {
          return { data: null, error: appState.rejectUpsert };
        }
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          const id = String(row.applicant_id ?? '');
          const index = appState.scoreRows.findIndex((existing) => String(existing.applicant_id) === id);
          if (index >= 0) appState.scoreRows[index] = clone(row);
          else appState.scoreRows.push(clone(row));
        }
        return { data: null, error: null };
      },
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(onFulfilled, onRejected),
    };
    return query;
  };

  const channel = {
    on: () => channel,
    subscribe: () => channel,
    unsubscribe: () => undefined,
  };

  return {
    supabase: {
      from: (table: string) => builder(table),
      channel: () => channel,
      removeChannel: () => undefined,
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    },
  };
});

vi.mock('../components/AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('../components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../components/ApplicantsTabBar', () => ({ ApplicantsTabBar: () => null }));

vi.mock('../lib/recruitmentData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/recruitmentData')>();
  return {
    ...actual,
    ensureRecruitmentSeedData: vi.fn(),
    getApplicants: mockGetApplicants,
    saveApplicants: mockSaveApplicants,
    getNewlyHiredFromSupabase: mockGetNewlyHired,
  };
});

vi.mock('../lib/hiringFlow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/hiringFlow')>();
  return { ...actual, fetchHiringContext: mockFetchHiringContext };
});

vi.mock('../lib/api/examTotalPoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/examTotalPoints')>();
  return {
    ...actual,
    fetchWrittenExamTotals: vi.fn(async () => ({ ok: true, totals: {} })),
    saveWrittenExamTotal: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock('../lib/evaluationScores', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/evaluationScores')>();
  return {
    ...actual,
    fetchLatestEvaluationForApplicantOrEmailAnySource: vi.fn(async () => null),
    subscribeToEvaluationChanges: () => () => undefined,
  };
});

vi.mock('../lib/documentViewing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/documentViewing')>();
  return { ...actual, listApplicantDocumentAttachments: vi.fn(async () => []) };
});

vi.mock('../lib/adminSession', () => ({ getAdminRole: () => 'rsp' }));

import {
  CATEGORY_SCORES_UPDATED_EVENT,
  CAT_SCORES_KEY,
  fetchApplicantScoreSummaries,
  saveApplicantCategoryScores,
  type ApplicantCategoryScores,
} from '../lib/api/applicantScores';
import { QualifiedApplicantsSection } from '../components/QualifiedApplicantsSection';
import { ForHiringPage } from '../components/ForHiringPage';
import { ApplicantRankingPage } from '../components/ApplicantRankingPage';

const promotionalApplicant = (overrides: Partial<ApplicantRecord> = {}): ApplicantRecord => ({
  id: APPLICANT_ID,
  full_name: 'Maria Santos',
  email: SHARED_EMAIL,
  contact_number: '',
  position: POSITION,
  office: OFFICE,
  status: 'Shortlisted',
  created_at: '2026-10-01',
  total_score: null,
  application_type: 'promotion',
  education_level: null,
  years_of_experience: null,
  ...overrides,
});

const evaluationSnapshot: EvaluationSnapshot = {
  applicantId: APPLICANT_ID,
  jobId: null,
  score: null,
  pcptRawScore: 32,
  writtenExamRawScore: 90,
  oralRawScore: null,
  completed: true,
  updatedAt: '2026-10-29T00:00:00.000Z',
  row: {},
};

const completePromotionalScores = (): ApplicantCategoryScores => ({
  education: { initialScore: 16, finalScore: 16, remarks: '' },
  experience: { initialScore: 14, finalScore: 14, remarks: '' },
  performance: { initialScore: 14, finalScore: 14, remarks: '' },
  pcpt: { initialScore: 18, finalScore: 18, remarks: '' },
  potential: { initialScore: 18, finalScore: 18, remarks: '' },
  writtenExam: { initialScore: 90, finalScore: 90, remarks: '' },
  oralExam: { initialScore: 0, finalScore: null, remarks: '' },
  appointmentType: 'promotional',
  positionType: 'rank-and-file',
});

const renderSection = () =>
  render(
    <MemoryRouter>
      <QualifiedApplicantsSection
        applicants={[promotionalApplicant()]}
        completedEvaluationIds={new Set()}
        evaluationsByApplicant={{ [APPLICANT_ID]: evaluationSnapshot }}
      />
    </MemoryRouter>,
  );

const openFolderAndPromotionalTrack = async () => {
  const folderCell = await screen.findByRole('cell', { name: /Administrative Officer II/ });
  fireEvent.click(folderCell.closest('tr') as HTMLElement);
  fireEvent.click(await screen.findByRole('button', { name: /Promotional/ }));
};

const openScoringModal = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Open scores for Maria Santos/ }));
  return screen.findByRole('dialog');
};

const fillPromotionalScores = (dialog: HTMLElement) => {
  const selects = within(dialog).getAllByRole('combobox');
  // Promotional RSP fields: Education select then Performance Rating select.
  fireEvent.change(selects[0], { target: { value: '16' } });
  fireEvent.change(selects[1], { target: { value: '14' } });
  fireEvent.change(within(dialog).getByPlaceholderText('Enter years of experience'), {
    target: { value: '7' },
  });
  fireEvent.change(within(dialog).getByPlaceholderText(/Enter raw score/), {
    target: { value: '85' },
  });
};

const openForHiringPosition = async () => {
  fireEvent.click(await screen.findByText(OFFICE));
  fireEvent.click(await screen.findByText(POSITION));
};

const openRankingPosition = async () => {
  fireEvent.click(await screen.findByText(OFFICE));
  fireEvent.click(await screen.findByText(POSITION));
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  appState.scoreRows = [];
  appState.applicants = [];
  appState.evaluations = [];
  appState.rejectUpsert = null;
  appState.upserts = [];

  mockFetchHiringContext.mockReset();
  mockFetchHiringContext.mockResolvedValue({
    ok: true,
    slotByApplicant: new Map(),
    revokedAt: new Map(),
  });
  mockGetApplicants.mockReset();
  mockGetApplicants.mockReturnValue([]);
  mockSaveApplicants.mockReset();
  mockGetNewlyHired.mockReset();
  mockGetNewlyHired.mockResolvedValue([]);

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('checkpoint smoke: durable score handoff', () => {
  it('saves a complete promotion in the real scoring modal, survives a hard reload, and ranks it in both selection pages', async () => {
    renderSection();
    await openFolderAndPromotionalTrack();
    const dialog = await openScoringModal();

    fillPromotionalScores(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Scores' }));

    expect(await within(dialog).findByText('Score Finalized — View Only Mode')).toBeInTheDocument();

    expect(appState.scoreRows).toHaveLength(1);
    const savedRow = appState.scoreRows[0];
    expect(savedRow.applicant_id).toBe(APPLICANT_ID);
    expect(savedRow.appointment_type).toBe('promotional');
    expect(savedRow.is_finalized).toBe(true);
    expect(savedRow.education.finalScore).toBe(16);
    expect(savedRow.experience.finalScore).toBe(14);
    expect(savedRow.performance.finalScore).toBe(14);
    expect(savedRow.potential.finalScore).toBe(18);
    expect(savedRow.pcpt.finalScore).toBe(18);
    expect(savedRow.written_exam_raw_score).toBe(90);
    // PCPT comes from the interviewer; no oral score is invented for a promotion.
    expect(savedRow.oral_exam.finalScore).toBeNull();

    const summaryResult = await fetchApplicantScoreSummaries([APPLICANT_ID]);
    expect(summaryResult.ok).toBe(true);
    expect(summaryResult.data.get(APPLICANT_ID)).toEqual({
      applicantId: APPLICANT_ID,
      appointmentType: 'promotional',
      assessmentTotal: 80,
      writtenExamRawScore: 90,
      isFinalized: true,
    });

    // Simulated hard reload: unmount, wipe every browser cache, then re-render
    // the real selection pages against only the persisted fake table.
    cleanup();
    localStorage.clear();
    appState.applicants = [
      {
        id: APPLICANT_ID,
        first_name: 'Maria',
        last_name: 'Santos',
        email: SHARED_EMAIL,
        position: POSITION,
        office: OFFICE,
        status: 'Shortlisted',
        application_type: 'promotion',
        // Deliberately stale legacy value; promotions must not rank on it.
        total_score: 99,
      },
    ];

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>,
    );
    await openForHiringPosition();

    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('80.00')).toBeInTheDocument();
    expect(screen.getByText('90.00 / 100')).toBeInTheDocument();
    expect(screen.queryByText('99.00')).not.toBeInTheDocument();

    cleanup();
    render(
      <MemoryRouter>
        <ApplicantRankingPage />
      </MemoryRouter>,
    );
    await openRankingPosition();

    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('Promotional')).toBeInTheDocument();
    expect(screen.getByText('80.00')).toBeInTheDocument();
    expect(screen.queryByText('99.00')).not.toBeInTheDocument();
  });
});

describe('checkpoint smoke: fail-closed scoring', () => {
  it('publishes nothing when the upsert is rejected and leaves an existing reservation visible without a score', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    appState.rejectUpsert = new Error('permission denied: row rejected');
    const direct = await saveApplicantCategoryScores(APPLICANT_ID, completePromotionalScores(), true);
    expect(direct.ok).toBe(false);
    expect(appState.scoreRows).toHaveLength(0);
    expect(localStorage.getItem(CAT_SCORES_KEY)).toBeNull();
    expect(
      dispatchSpy.mock.calls.some(([event]) => (event as Event).type === CATEGORY_SCORES_UPDATED_EVENT),
    ).toBe(false);

    renderSection();
    await openFolderAndPromotionalTrack();
    const dialog = await openScoringModal();

    fillPromotionalScores(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Scores' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Scores were not saved');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).queryByText('Score Finalized — View Only Mode')).toBeNull();
    expect(localStorage.getItem(CAT_SCORES_KEY)).toBeNull();
    expect(appState.scoreRows).toHaveLength(0);
    expect(
      dispatchSpy.mock.calls.some(([event]) => (event as Event).type === CATEGORY_SCORES_UPDATED_EVENT),
    ).toBe(false);

    const summaryResult = await fetchApplicantScoreSummaries([APPLICANT_ID]);
    expect(summaryResult.ok).toBe(true);
    expect(summaryResult.data.size).toBe(0);

    cleanup();
    localStorage.clear();
    appState.applicants = [
      {
        id: APPLICANT_ID,
        first_name: 'Ana',
        last_name: 'Cruz',
        email: SHARED_EMAIL,
        position: POSITION,
        office: OFFICE,
        status: 'Qualified',
        application_type: 'promotion',
      },
      {
        id: RESERVED_APPLICANT_ID,
        first_name: 'Maria',
        last_name: 'Santos',
        email: SHARED_EMAIL,
        position: POSITION,
        office: OFFICE,
        status: 'For Contract Signing',
        application_type: 'promotion',
      },
    ];

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>,
    );
    await openForHiringPosition();

    // The rejected promotion is not presented as scored or complete.
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('Awaiting signing')).toBeInTheDocument();
    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument();
    expect(screen.queryByText('80.00')).not.toBeInTheDocument();
    expect(screen.queryByText('Score Finalized — View Only Mode')).not.toBeInTheDocument();
    expect(screen.queryByText(/Scores were saved/i)).not.toBeInTheDocument();

    const reservedRow = screen.getByText('Awaiting signing').closest('tr') as HTMLElement;
    expect(within(reservedRow).getByText('Maria Santos')).toBeInTheDocument();
    // Both the assessment and written-exam cells stay blank: no durable score.
    expect(within(reservedRow).getAllByText('—')).toHaveLength(2);

    // The same application UUID also stays visible when it carries the
    // reservation; the rejected save never adds a score to it.
    cleanup();
    appState.applicants = [
      {
        id: APPLICANT_ID,
        first_name: 'Maria',
        last_name: 'Santos',
        email: SHARED_EMAIL,
        position: POSITION,
        office: OFFICE,
        status: 'For Contract Signing',
        application_type: 'promotion',
      },
    ];

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>,
    );
    await openForHiringPosition();

    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('Awaiting signing')).toBeInTheDocument();
    expect(screen.queryByText('80.00')).not.toBeInTheDocument();
    const sameReservedRow = screen.getByText('Awaiting signing').closest('tr') as HTMLElement;
    expect(within(sameReservedRow).getAllByText('—')).toHaveLength(2);
  });
});
