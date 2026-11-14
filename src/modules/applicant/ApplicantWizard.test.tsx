import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFTS_KEY, type ApplyDrafts, type PlantillaChoice } from './flow/applicationDrafts';
import type { ApplicantFormData } from '../../types/applicant.types';

type InsertResult = { data: Record<string, unknown> | null; error: Record<string, unknown> | null };

const { insertApplicant } = vi.hoisted(() => ({ insertApplicant: vi.fn() }));

vi.mock('../../lib/supabase', async () => {
  const { supabaseStub: stub } = await import('../../test/supabaseStub');
  const base = stub();
  // Only the applicants table matters: the duplicate check reads it and the
  // submission inserts into it. Every other table resolves to an empty result.
  const applicants = {
    select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
    insert: (payload: Record<string, unknown>) => ({ select: () => ({ single: () => insertApplicant(payload) }) }),
  };
  return {
    ATTACHMENTS_BUCKET: 'attachments',
    supabase: { ...base, from: (table: string) => (table === 'applicants' ? applicants : base.from(table)) },
  };
});
vi.mock('../../lib/crypto', () => ({ encryptApplicantFile: async (file: File) => file }));
vi.mock('../../lib/recruitmentData', () => ({
  getAuthoritativeJobPostings: () => [],
  loadJobPostings: () => [],
  syncApplicantSubmissionToRecruitment: vi.fn(),
}));
vi.mock('../../lib/plantillaSlots', () => ({ linkApplicationToSlots: () => Promise.resolve({ ok: true }) }));
vi.mock('../../lib/employeePortalData', () => ({
  // ApplicantWizard builds its promotion error map from this constant at module
  // load, so the mock must export it or the whole suite fails to import.
  PROMOTIONAL_AUTH_ERROR: {
    INVALID_CREDENTIALS: 'invalid_credentials',
    AMBIGUOUS_ACCOUNT: 'ambiguous_account',
    MISSING_EMPLOYEE_NUMBER: 'missing_employee_number',
    LOOKUP_UNAVAILABLE: 'lookup_unavailable',
  },
  // These tests never log in for a promotion; the default failure keeps that
  // path inert if the stub is ever reached.
  authenticatePromotionalEmployee: async () => ({ ok: false, error: 'invalid_credentials' }),
  findEmployeePortalAccount: () => undefined,
  getEmployeePortalAccounts: () => [],
  findEmployeePortalAccountFromSupabaseByEmployeeIdOrEmail: () => Promise.resolve(undefined),
}));
vi.mock('../../lib/api/employeeApplicationProfile', () => ({ fetchEmployeeApplicationProfile: () => Promise.resolve(null) }));

import { ApplicantWizard } from './ApplicantWizard';

const POSITION = 'Administrative Officer II';
const PLANTILLA_CAPTION = 'Plantilla 27 · SG 11';

const choice = (slotNumber: number): PlantillaChoice => ({
  key: `slot-${slotNumber}`,
  slotId: `slot-${slotNumber}`,
  slotNumber,
  label: `Plantilla ${slotNumber}`,
  itemNumber: `ITEM-${slotNumber}`,
  salaryGrade: 11,
  status: 'open',
});

const formData = (overrides: Partial<ApplicantFormData> = {}): ApplicantFormData => ({
  first_name: 'Maria',
  middle_name: '',
  last_name: 'Santos',
  gender: 'Female',
  address: '12 Rizal Street',
  contact_number: '09171234567',
  email: 'maria@example.com',
  position: POSITION,
  item_number: 'ITEM-27',
  office: 'City Human Resource Office',
  is_pwd: false,
  application_type: 'job',
  employee_id: '',
  current_position: '',
  current_department: '',
  current_division: '',
  employee_username: '',
  education_attainment: 'Bachelor',
  education_degree: '',
  education_school: '',
  work_experience_years: '',
  work_experience_months: '',
  relevant_experience_position: '',
  relevant_experience_company: '',
  relevant_experience_duties: '',
  gov_id_type: 'UMID',
  gov_id_expiration: '',
  ...overrides,
});

/** Opens the wizard on the review step, as if the applicant had refreshed there. */
const seedReviewDraft = (slotNumbers: number[], overrides: Partial<ApplicantFormData> = {}) => {
  const choices = slotNumbers.map(choice);
  const draft: ApplyDrafts = {
    version: 2,
    entryMode: 'wizard',
    step: 'review',
    posting: { id: 'posting-1', title: POSITION, department: 'City Human Resource Office' },
    choices,
    drafts: Object.fromEntries(choices.map((c) => [c.key, formData({ item_number: c.itemNumber, ...overrides })])),
    activeKey: choices[0].key,
    authenticatedEmployeeAccount: null,
    lockedPosition: true,
    formPage: 1,
  };
  sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(draft));
};

/** A promise the test settles by hand, to hold a submission mid-flight. */
const deferred = () => {
  let resolve!: (value: InsertResult) => void;
  const promise = new Promise<InsertResult>((res) => { resolve = res; });
  return { promise, resolve };
};

const saved = (id: string): InsertResult => ({
  data: { id, item_number: `ITEM-${id}`, reference_no: `REF-${id}` },
  error: null,
});
const rejected: InsertResult = { data: null, error: { message: 'boom' } };

const insertedSlots = () => insertApplicant.mock.calls.map(([payload]) => (payload as { plantilla_slot_id: string }).plantilla_slot_id);

const renderWizard = () =>
  render(
    <MemoryRouter>
      <ApplicantWizard />
    </MemoryRouter>,
  );

const confirmDialog = () => screen.getByRole('dialog');
const dialogTitle = () => within(confirmDialog()).getByRole('heading').textContent;

const declare = () => fireEvent.click(screen.getByRole('checkbox', { name: /I hereby certify/ }));
const clickReviewButton = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const confirm = (label: string) => fireEvent.click(within(confirmDialog()).getByRole('button', { name: label }));

describe('ApplicantWizard confirmation and labels', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    insertApplicant.mockReset();
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    // The wizard logs failed submissions on purpose; keep the output readable.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps "Submit application?" while a single submission is running', async () => {
    seedReviewDraft([27]);
    const request = deferred();
    insertApplicant.mockReturnValue(request.promise);
    renderWizard();

    declare();
    clickReviewButton('Submit Application');
    expect(dialogTitle()).toBe('Submit application?');

    confirm('Submit');
    await waitFor(() => expect(insertApplicant).toHaveBeenCalledTimes(1));
    expect(dialogTitle()).toBe('Submit application?');

    request.resolve(saved('1'));
    expect(await screen.findByRole('heading', { name: 'Application submitted' })).toBeInTheDocument();
  });

  it('keeps "Submit 2 applications?" after the first item finishes and the second is still running', async () => {
    seedReviewDraft([27, 28]);
    const first = deferred();
    const second = deferred();
    insertApplicant.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderWizard();

    declare();
    clickReviewButton('Submit 2 Applications');
    expect(dialogTitle()).toBe('Submit 2 applications?');

    confirm('Submit');
    await waitFor(() => expect(insertApplicant).toHaveBeenCalledTimes(1));
    first.resolve(saved('1'));
    await waitFor(() => expect(insertApplicant).toHaveBeenCalledTimes(2));
    expect(dialogTitle()).toBe('Submit 2 applications?');

    second.resolve(saved('2'));
    expect(await screen.findByRole('heading', { name: '2 applications submitted' })).toBeInTheDocument();
  });

  it('retries only the failed item and keeps "Retry application?" while it runs', async () => {
    seedReviewDraft([27, 28]);
    insertApplicant.mockResolvedValueOnce(saved('1')).mockResolvedValueOnce(rejected);
    renderWizard();

    declare();
    clickReviewButton('Submit 2 Applications');
    confirm('Submit');
    const retryButton = await screen.findByRole('button', { name: 'Retry 1 Failed' });
    expect(insertedSlots()).toEqual(['slot-27', 'slot-28']);

    const retry = deferred();
    insertApplicant.mockReturnValueOnce(retry.promise);
    fireEvent.click(retryButton);
    expect(dialogTitle()).toBe('Retry application?');

    confirm('Retry');
    await waitFor(() => expect(insertApplicant).toHaveBeenCalledTimes(3));
    expect(dialogTitle()).toBe('Retry application?');
    // The item that already succeeded is not sent again.
    expect(insertedSlots()).toEqual(['slot-27', 'slot-28', 'slot-28']);

    retry.resolve(saved('2'));
    expect(await screen.findByRole('heading', { name: '2 applications submitted' })).toBeInTheDocument();
  });

  it('leads with the target position for a promotional application, on the review card and the success row', async () => {
    seedReviewDraft([27], {
      application_type: 'promotion',
      current_position: 'Clerk I',
      position: POSITION,
    });
    insertApplicant.mockResolvedValue(saved('1'));
    const { container } = renderWizard();

    const heading = container.querySelector('.af-review-card summary .af-title-s');
    expect(heading).toHaveTextContent(POSITION);
    expect(heading).not.toHaveTextContent('Clerk I');
    expect(heading).not.toHaveTextContent('Plantilla 27');
    expect(container.querySelector('.af-review-card summary .af-caption')).toHaveTextContent(PLANTILLA_CAPTION);

    declare();
    clickReviewButton('Submit Application');
    confirm('Submit');

    await screen.findByRole('heading', { name: 'Application submitted' });
    const row = container.querySelector('.af-ref') as HTMLElement;
    expect(row.querySelector('.af-headline')).toHaveTextContent(POSITION);
    expect(row.querySelector('.af-body-s')).toHaveTextContent(PLANTILLA_CAPTION);
  });
});
