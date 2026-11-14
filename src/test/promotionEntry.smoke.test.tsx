/**
 * Checkpoint smoke: fresh-browser promotional entry (Task 1).
 *
 * This is a characterization smoke test, not browser acceptance. It renders
 * the real ApplicantWizard against a remote-only employee_portal_accounts
 * fixture with empty browser storage. All Supabase, profile and recruitment
 * calls are mocked; no live service is contacted.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const { remote, profileMock } = vi.hoisted(() => ({
  remote: {
    rows: [] as Row[],
    failures: {} as Record<string, unknown>,
    queries: [] as Array<{ column: string; value: string }>,
    isFilters: [] as Array<{ column: string; value: unknown }>,
  },
  profileMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => {
  const builder = (table: string) => {
    const filters: Array<{ column: string; value: string }> = [];
    // Soft-delete filters are recorded but not enforced, so a permissive
    // policy that returns a deleted row still exercises the defensive check.
    const result = () => ({
      data:
        table === 'employee_portal_accounts'
          ? remote.rows.filter((row) =>
              filters.every((filter) => {
                const expected = filter.value.replace(/\\_/g, '_');
                return String(row[filter.column] ?? '').trim().toLowerCase() === expected;
              }),
            )
          : [],
      error: null,
    });

    const query: any = {
      select: () => query,
      ilike: (column: string, value: string) => {
        remote.queries.push({ column, value });
        const failure = remote.failures[column];
        if (failure) return Promise.resolve({ data: null, error: failure });
        filters.push({ column, value: String(value).trim().toLowerCase() });
        return query;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ column, value: String(value).trim().toLowerCase() });
        return query;
      },
      is: (column: string, value: unknown) => {
        remote.isFilters.push({ column, value });
        return query;
      },
      order: () => query,
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(onFulfilled, onRejected),
    };
    return query;
  };

  return {
    ATTACHMENTS_BUCKET: 'applicant-attachments',
    supabase: {
      from: (table: string) => builder(table),
      storage: { from: () => ({ upload: vi.fn() }) },
    },
  };
});

vi.mock('../lib/api/employeeApplicationProfile', () => ({
  fetchEmployeeApplicationProfile: profileMock,
}));

vi.mock('../lib/recruitmentData', () => ({
  ensureRecruitmentSeedData: vi.fn(),
  getAuthoritativeJobPostings: () => [],
  loadJobPostings: async () => [],
  syncApplicantSubmissionToRecruitment: vi.fn(),
}));

vi.mock('../lib/plantillaSlots', () => ({
  linkApplicationToSlots: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../lib/crypto', () => ({
  encryptApplicantFile: vi.fn(async (file: File) => file),
}));

import { ApplicantWizard } from '../modules/applicant/ApplicantWizard';

const LOCAL_ACCOUNTS_KEY = 'cictrix_employee_portal_accounts';

const accountRow = (overrides: Row = {}): Row => ({
  id: 'account-maria',
  username: 'maria.santos',
  password: 'Correct#123',
  employee_id: 'EMP-2024-001',
  full_name: 'Maria Santos',
  email: 'maria.santos@example.gov.ph',
  mobile_number: '+63-900-000-0000',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  ...overrides,
});

const profile = {
  supabaseId: 'employee-uuid',
  employeeNumber: 'EMP-2024-001',
  firstName: 'Maria',
  middleName: 'Cruz',
  lastName: 'Santos',
  sex: 'Female',
  address: 'Iloilo City',
  contactNumber: '+63-900-000-0000',
  email: 'maria.santos@example.gov.ph',
  currentPosition: 'Administrative Assistant I',
  currentDepartment: 'Office of the City Mayor',
  currentDivision: 'Administrative Division',
  educationAttainment: 'College Graduate',
  educationDegree: 'BS Computer Science',
  educationSchool: 'University of the Philippines',
  workExperienceYears: '3',
  workExperienceMonths: '2',
  relevantExperiencePosition: 'Administrative Aide',
  relevantExperienceCompany: 'City Government of Iloilo',
  relevantExperienceDuties: 'Records management',
};

const renderWizard = () =>
  render(
    <MemoryRouter initialEntries={['/apply']}>
      <ApplicantWizard />
    </MemoryRouter>,
  );

const openPromotionLogin = () => {
  fireEvent.click(
    screen.getByRole('button', { name: /current employee applying for promotion/i }),
  );
};

const submitLogin = (identifier: string, password: string) => {
  fireEvent.change(screen.getByLabelText('Employee Number'), {
    target: { value: identifier },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
};

const expectPromotionFormForMaria = async () => {
  await waitFor(() => {
    expect(screen.getByLabelText(/employee id/i)).toHaveValue('EMP-2024-001');
  });
  expect(screen.getByLabelText(/first name/i)).toHaveValue('Maria');
  expect(screen.getByLabelText(/last name/i)).toHaveValue('Santos');
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  remote.rows = [accountRow()];
  remote.failures = {};
  remote.queries = [];
  remote.isFilters = [];
  profileMock.mockReset();
  profileMock.mockResolvedValue(profile);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe('checkpoint smoke: fresh-browser promotional entry', () => {
  it('logs in by username from empty storage and prefills the real wizard form', async () => {
    renderWizard();
    openPromotionLogin();
    submitLogin('Maria.Santos', 'Correct#123');

    await expectPromotionFormForMaria();

    expect(profileMock).toHaveBeenCalledTimes(1);
    expect(profileMock).toHaveBeenCalledWith('EMP-2024-001');
    expect(localStorage.getItem(LOCAL_ACCOUNTS_KEY)).toBeNull();
    expect(
      remote.isFilters.some((filter) => filter.column === 'deleted_at' && filter.value === null),
    ).toBe(true);
  });

  it('logs in by employee number from empty storage and prefills the same employee', async () => {
    renderWizard();
    openPromotionLogin();
    submitLogin(' emp-2024-001 ', 'Correct#123');

    await expectPromotionFormForMaria();

    expect(profileMock).toHaveBeenCalledTimes(1);
    expect(profileMock).toHaveBeenCalledWith('EMP-2024-001');
    expect(localStorage.getItem(LOCAL_ACCOUNTS_KEY)).toBeNull();
  });

  it('rejects a wrong remote password without opening the promotion form', async () => {
    renderWizard();
    openPromotionLogin();
    submitLogin('maria.santos', 'Wrong#123');

    await screen.findByText(/invalid employee credentials/i);

    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/employee id/i)).not.toBeInTheDocument();
    expect(profileMock).not.toHaveBeenCalled();
  });
});
