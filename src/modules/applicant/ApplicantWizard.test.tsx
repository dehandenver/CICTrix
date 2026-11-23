import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFTS_KEY, type ApplyDrafts, type PlantillaChoice } from './flow/applicationDrafts';
import type { ApplicantFormData } from '../../types/applicant.types';

type InsertResult = { data: Record<string, unknown> | null; error: Record<string, unknown> | null };

const { insertApplicant, fileCheckBypass } = vi.hoisted(() => ({
  insertApplicant: vi.fn(),
  fileCheckBypass: { enabled: false },
}));

vi.mock('../../utils/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/validation')>();
  return {
    ...actual,
    validateFiles: (...args: Parameters<typeof actual.validateFiles>) =>
      fileCheckBypass.enabled ? null : actual.validateFiles(...args),
  };
});

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
  ensureRecruitmentSeedData: vi.fn(),
  getAuthoritativeJobPostings: () => [],
  loadJobPostings: async () => [],
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
  education_attainment: 'College Graduate',
  education_degree: 'Bachelor of Science in Public Administration',
  education_school: 'West Visayas State University',
  work_experience_years: '',
  work_experience_months: '',
  relevant_experience_position: '',
  relevant_experience_company: '',
  relevant_experience_duties: '',
  work_experience_entries: [],
  gov_id_type: 'UMID',
  gov_id_expiration: '',
  ...overrides,
});

/** Opens the wizard on the review step (bypassing file check for dialog/label tests). */
const seedReviewDraft = (
  slotNumbers: number[],
  overrides: Partial<ApplicantFormData> = {},
  options: { bypassFileCheck?: boolean } = { bypassFileCheck: true },
) => {
  fileCheckBypass.enabled = Boolean(options.bypassFileCheck);
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

/** Opens the wizard on a specific Step 2 fill page. */
const seedFillDraft = (formPage: number, overrides: Partial<ApplicantFormData> = {}) => {
  const choices = [choice(27)];
  const draft: ApplyDrafts = {
    version: 2,
    entryMode: 'wizard',
    step: 'fill',
    posting: { id: 'posting-1', title: POSITION, department: 'City Human Resource Office' },
    choices,
    drafts: { [choices[0].key]: formData({ item_number: choices[0].itemNumber, ...overrides }) },
    activeKey: choices[0].key,
    authenticatedEmployeeAccount: null,
    lockedPosition: true,
    formPage,
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
    fileCheckBypass.enabled = false;
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

  it('shows education_school and structured work_experience_entries on Review and submits auto-computed years_of_experience', async () => {
    const entries = [
      {
        from_date: '2023-02-01',
        to_date: '2024-08-01',
        is_present: false,
        position_title: 'Administrative Aide IV',
        company_name: 'City Government of Iloilo',
        duties_responsibilities: 'Maintains 201 personnel records and prepares HRIS notices.',
        is_government_service: true,
      },
      {
        from_date: '2021-01-01',
        to_date: '2023-01-01',
        is_present: false,
        position_title: 'Records Clerk',
        company_name: 'Iloilo Provincial Capitol',
        duties_responsibilities: 'Encoded incoming correspondence and maintained filing index.',
        is_government_service: true,
      },
    ];
    seedReviewDraft([27], {
      education_attainment: 'College Graduate',
      education_degree: 'Bachelor of Science in Public Administration',
      education_school: 'West Visayas State University',
      work_experience_entries: entries,
    });
    insertApplicant.mockResolvedValue(saved('1'));
    renderWizard();

    expect(
      screen.getByText('College Graduate · Bachelor of Science in Public Administration · West Visayas State University'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: 3 yrs 6 mos')).toBeInTheDocument();
    expect(
      screen.getByText('Administrative Aide IV · City Government of Iloilo (2023-02-01 – 2024-08-01)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Records Clerk · Iloilo Provincial Capitol (2021-01-01 – 2023-01-01)'),
    ).toBeInTheDocument();

    declare();
    clickReviewButton('Submit Application');
    confirm('Submit');

    await screen.findByRole('heading', { name: 'Application submitted' });
    expect(insertApplicant).toHaveBeenCalledTimes(1);
    const payload = insertApplicant.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.education_school).toBe('West Visayas State University');
    expect(payload.years_of_experience).toBe(3.5);
    expect(payload.work_experience_entries).toEqual(entries);
  });

  it('retries submission without work_experience_entries when the database column does not exist yet', async () => {
    seedReviewDraft([27], {
      education_school: 'West Visayas State University',
      work_experience_entries: [
        {
          from_date: '2022-01-01',
          to_date: '2024-01-01',
          is_present: false,
          position_title: 'Records Clerk',
          company_name: 'City Hall',
          duties_responsibilities: 'Filing and correspondence',
          is_government_service: true,
        },
      ],
    });
    const capturedPayloads: Array<Record<string, unknown>> = [];
    insertApplicant.mockImplementation(async (payload: Record<string, unknown>) => {
      capturedPayloads.push({ ...payload });
      if (capturedPayloads.length === 1) {
        return {
          data: null,
          error: {
            code: 'PGRST204',
            message: "Could not find the 'work_experience_entries' column of 'applicants' in the schema cache",
          },
        };
      }
      return saved('1');
    });
    renderWizard();

    declare();
    clickReviewButton('Submit Application');
    confirm('Submit');

    await screen.findByRole('heading', { name: 'Application submitted' });
    expect(capturedPayloads).toHaveLength(2);
    expect(capturedPayloads[0]).toHaveProperty('work_experience_entries');
    expect(capturedPayloads[1]).not.toHaveProperty('work_experience_entries');
    expect(capturedPayloads[1].education_school).toBe('West Visayas State University');
    expect(capturedPayloads[1].years_of_experience).toBe(2);
  });

  it('renders required School / Institution on Page 3 when educational attainment is selected', () => {
    seedFillDraft(3, {
      education_attainment: 'College Graduate',
      education_school: '',
    });
    renderWizard();

    const schoolInput = screen.getByLabelText(/school \/ institution/i);
    expect(schoolInput).toBeRequired();
    fireEvent.change(schoolInput, { target: { value: 'Central Philippine University' } });
    expect(schoolInput).toHaveValue('Central Philippine University');
  });

  it('supports Option B add, collapse, edit, present-toggle, and remove interactions on Page 4', () => {
    seedFillDraft(4, { work_experience_entries: [] });
    renderWizard();

    expect(screen.getByText(/optional for fresh graduates\./i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add work experience/i }));

    expect(screen.getByText('Entry 1 · Most recent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add another work experience/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/date from/i), { target: { value: '2022-01-01' } });
    fireEvent.change(screen.getByLabelText(/date to/i), { target: { value: '2024-01-01' } });
    fireEvent.click(screen.getByLabelText(/government service/i));
    fireEvent.change(screen.getByLabelText(/position held/i), { target: { value: 'Administrative Aide IV' } });
    fireEvent.change(screen.getByLabelText(/company \/ organization/i), { target: { value: 'City Government of Iloilo' } });
    fireEvent.change(screen.getByLabelText(/description of duties/i), { target: { value: 'Maintains personnel records.' } });

    expect(screen.getByTestId('work-experience-total')).toHaveTextContent('Total: 2 yrs');

    // Collapse via Done
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(screen.getByText('Administrative Aide IV · City Government of Iloilo')).toBeInTheDocument();
    expect(screen.getByText('2022-01-01 – 2024-01-01 · Government service')).toBeInTheDocument();
    expect(screen.queryByLabelText(/position held/i)).not.toBeInTheDocument();

    // Re-expand via Edit and check Currently employed here clears and disables Date To
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByLabelText(/position held/i)).toHaveValue('Administrative Aide IV');
    fireEvent.click(screen.getByLabelText(/currently employed here/i));
    const dateToInput = screen.getByLabelText(/date to/i);
    expect(dateToInput).toBeDisabled();
    expect(dateToInput).toHaveValue('');

    // Remove entry returns empty state
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(screen.getByText(/optional for fresh graduates\./i)).toBeInTheDocument();
    expect(screen.queryByTestId('work-experience-total')).not.toBeInTheDocument();
  });

  it('keeps an incomplete Page 4 entry expanded and shows field errors when Done is clicked', () => {
    seedFillDraft(4, { work_experience_entries: [] });
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: /add work experience/i }));
    fireEvent.change(screen.getByLabelText(/position held/i), { target: { value: 'Records Clerk' } });

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(screen.getByText('Start date is required')).toBeInTheDocument();
    expect(screen.getByText('End date is required unless currently employed')).toBeInTheDocument();
    expect(screen.getByText('Company/organization is required')).toBeInTheDocument();
    expect(screen.getByText('Description of duties is required')).toBeInTheDocument();
    expect(screen.getByLabelText(/position held/i)).toBeInTheDocument();
  });

  it('auto-expands the first invalid Page 4 entry and blocks Next when validation fails', () => {
    seedFillDraft(4, {
      work_experience_entries: [
        {
          from_date: '2023-01-01',
          to_date: '2024-01-01',
          is_present: false,
          position_title: 'Administrative Aide IV',
          company_name: 'City Government of Iloilo',
          duties_responsibilities: 'Maintains records.',
          is_government_service: true,
        },
        {
          from_date: '2024-01-01',
          to_date: '2022-01-01',
          is_present: false,
          position_title: 'Records Clerk',
          company_name: 'Provincial Capitol',
          duties_responsibilities: 'Filing.',
          is_government_service: false,
        },
      ],
    });
    renderWizard();

    // Initially both entries render collapsed
    expect(screen.queryByLabelText(/date to/i)).not.toBeInTheDocument();

    // Clicking Next runs Page 4 validation and expands Entry 2 with its date error
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText('End date cannot be earlier than start date')).toBeInTheDocument();
    expect(screen.getByText('Entry 2')).toBeInTheDocument();
    expect(screen.getByText('Page 4 of 5')).toBeInTheDocument();
  });

  it('redirects a reloaded Step 3 review draft with no files back to Page 5 Documents and blocks submission', () => {
    // Use real validateFiles (no bypass): simulates reloading on Step 3 where File objects were dropped.
    seedReviewDraft([27], {}, { bypassFileCheck: false });
    renderWizard();

    expect(screen.getByText('Page 5 of 5')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/uploaded documents cannot be kept across page reloads/i);
    expect(screen.queryByRole('button', { name: 'Submit Application' })).not.toBeInTheDocument();
    expect(insertApplicant).not.toHaveBeenCalled();
  });
});
