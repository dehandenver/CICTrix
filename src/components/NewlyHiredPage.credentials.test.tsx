import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  applicants: [] as any[],
  newlyHired: [] as any[],
  employees: [] as any[],
  employeesWithDept: [] as any[],
  portalAccounts: [] as any[],
  saveNewlyHired: vi.fn(),
  seedEmployeeContactFromApplication: vi.fn(),
  listEmployeePortalAccountIdentities: vi.fn(),
  ensureEmployeePortalAccount: vi.fn(),
}));

vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));

vi.mock('../lib/supabase', () => {
  const from = (table: string) => {
    const query: any = {
      select: () => query,
      eq: () => query,
      is: () => query,
      in: () => query,
      then: (onFulfilled: (v: unknown) => unknown) => {
        const data =
          table === 'applicants'
            ? state.applicants
            : table === 'newly_hired'
              ? state.newlyHired
              : table === 'employees'
                ? state.employees
                : table === 'employees_with_department'
                  ? state.employeesWithDept
                  : table === 'employee_portal_accounts'
                    ? state.portalAccounts
                    : [];
        return Promise.resolve({ data, error: null }).then(onFulfilled);
      },
    };
    return query;
  };
  return { supabase: { from }, isMockModeEnabled: false };
});

vi.mock('../lib/recruitmentData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/recruitmentData')>();
  return {
    ...actual,
    saveNewlyHired: (...args: unknown[]) => state.saveNewlyHired(...args),
  };
});

vi.mock('../lib/api/employeePortal', () => ({
  seedEmployeeContactFromApplication: (...args: unknown[]) =>
    state.seedEmployeeContactFromApplication(...args),
}));

vi.mock('../lib/employeePortalData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/employeePortalData')>();
  return {
    ...actual,
    listEmployeePortalAccountIdentities: (...args: unknown[]) =>
      state.listEmployeePortalAccountIdentities(...args),
    ensureEmployeePortalAccount: (...args: unknown[]) =>
      state.ensureEmployeePortalAccount(...args),
  };
});

import { NewlyHiredPage } from './NewlyHiredPage';

const renderDepartment = async () => {
  render(
    <MemoryRouter>
      <NewlyHiredPage />
    </MemoryRouter>,
  );
  fireEvent.click((await screen.findAllByText(/Engineering Office/))[0]);
  await screen.findByRole('heading', { name: /Engineering Office/ });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  state.applicants = [
    {
      id: 'app-new-1',
      first_name: 'Maria',
      last_name: 'Santos',
      email: 'maria.santos@example.gov.ph',
      contact_number: '09171234567',
      address: 'Iloilo City',
      position: 'Engineer II',
      office: 'Engineering Office',
      status: 'Hired',
      created_at: '2026-11-01T00:00:00Z',
    },
  ];
  state.newlyHired = [];
  state.employees = [];
  state.employeesWithDept = [];
  state.portalAccounts = [];
  state.saveNewlyHired.mockResolvedValue({ ok: true, failed: 0 });
  state.seedEmployeeContactFromApplication.mockResolvedValue(undefined);
  state.listEmployeePortalAccountIdentities.mockResolvedValue({ ok: true, accounts: [] });
});

afterEach(() => {
  cleanup();
});

describe('NewlyHiredPage credential provisioning', () => {
  it('aborts cleanly when listEmployeePortalAccountIdentities fails without opening credentials modal', async () => {
    state.listEmployeePortalAccountIdentities.mockResolvedValue({
      ok: false,
      kind: 'lookup_unavailable',
      error: 'Unable to check existing portal accounts.',
    });

    await renderDepartment();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Generate Employee Number & Account/i }));

    await waitFor(() => {
      expect(state.listEmployeePortalAccountIdentities).toHaveBeenCalled();
    });
    expect(state.ensureEmployeePortalAccount).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('allocates next remote employee number, calls ensureEmployeePortalAccount, and clears credentials on close', async () => {
    const year = new Date().getFullYear();
    const existingNum = `EMP-${year}-001`;
    const nextNum = `EMP-${year}-002`;
    state.portalAccounts = [{ employee_id: existingNum, deleted_at: null }];
    state.listEmployeePortalAccountIdentities.mockResolvedValue({
      ok: true,
      accounts: [
        {
          id: `portal-${existingNum}`,
          username: 'existing.user',
          mustChangePassword: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          employee: { employeeId: existingNum, fullName: 'Existing User', email: 'other@example.gov.ph' },
        },
      ],
    });
    state.ensureEmployeePortalAccount.mockResolvedValue({
      ok: true,
      created: true,
      account: {
        id: `portal-${nextNum}`,
        username: 'mariasantos',
        mustChangePassword: true,
        createdAt: '2026-11-20T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
        employee: { employeeId: nextNum, fullName: 'Maria Santos', email: 'maria.santos@example.gov.ph' },
      },
      credentials: { username: 'mariasantos', password: 'Confirmed#OneTime9' },
    });

    await renderDepartment();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Generate Employee Number & Account/i }));

    await waitFor(() => {
      expect(state.ensureEmployeePortalAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          employee: expect.objectContaining({ employeeId: nextNum }),
        }),
      );
    });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(nextNum)).toBeInTheDocument();
    expect(within(dialog).getByText('mariasantos')).toBeInTheDocument();
    expect(within(dialog).getByText('Confirmed#OneTime9')).toBeInTheDocument();
    expect(state.saveNewlyHired).toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByText('Confirmed#OneTime9')).not.toBeInTheDocument();
    });
  });

  it('preserves an existing remote account (created: false) without displaying a fabricated password', async () => {
    state.employees = [
      { id: 'emp-uuid-1', application_id: 'app-new-1', employee_number: 'EMP-2026-0099', email: 'maria.santos@example.gov.ph' },
    ];
    state.listEmployeePortalAccountIdentities.mockResolvedValue({
      ok: true,
      accounts: [
        {
          id: 'acct-custom-9',
          username: 'maria.custom',
          mustChangePassword: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-02-01T00:00:00Z',
          employee: { employeeId: 'EMP-2026-0099', fullName: 'Maria Santos', email: 'maria.santos@example.gov.ph' },
        },
      ],
    });
    state.ensureEmployeePortalAccount.mockResolvedValue({
      ok: true,
      created: false,
      account: {
        id: 'acct-custom-9',
        username: 'maria.custom',
        mustChangePassword: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-02-01T00:00:00Z',
        employee: { employeeId: 'EMP-2026-0099', fullName: 'Maria Santos', email: 'maria.santos@example.gov.ph' },
      },
    });

    await renderDepartment();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Generate Employee Number & Account/i }));

    await waitFor(() => {
      expect(state.ensureEmployeePortalAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          employee: expect.objectContaining({ employeeId: 'EMP-2026-0099' }),
          requestedUsername: 'maria.custom',
        }),
      );
    });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('EMP-2026-0099')).toBeInTheDocument();
    expect(within(dialog).getByText('maria.custom')).toBeInTheDocument();
    expect(within(dialog).getByText(/existing/i)).toBeInTheDocument();
    expect(state.saveNewlyHired).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ applicantId: 'app-new-1', employeeId: 'EMP-2026-0099' }),
      ]),
    );
  });
});
