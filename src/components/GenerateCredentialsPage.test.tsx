import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReservedApplicant } from '../lib/hiringFlow';
import { GenerateCredentialsPage } from './GenerateCredentialsPage';

vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));

const reserved = (id: string, fullName: string, department: string, position: string, plantilla: string, deadline: string): ReservedApplicant => ({
  id, fullName, email: `${id}@x.ph`, referenceNo: `REF-${id}`, position, department,
  slotId: `slot-${id}`, plantilla, signingDeadline: deadline, interviewScore: null,
  applicationType: 'job', employeeNumber: null,
});

const promotionRow: ReservedApplicant = {
  ...reserved('p', 'Ligaya Bautista', 'City Planning Office', 'Planning Officer III', 'Plantilla 7', '2099-10-30'),
  applicationType: 'promotion',
  employeeNumber: 'EMP-2018-0042',
};

const rows = [
  reserved('a', 'Juan Dela Cruz', "City Engineer's Office", 'Engineer II', 'Plantilla 1', '2099-10-28'),
  reserved('b', 'Maria Santos', "City Treasurer's Office", 'Clerk III', 'Plantilla 1', '2099-10-25'),
  reserved('c', 'Ana Reyes', 'City Health Office', 'Nurse I', 'Plantilla 3', '2000-01-01'),
  promotionRow,
];

const generateEmployeeCredentials = vi.fn();
const revokeSlotReservation = vi.fn();
const printCredentialCards = vi.fn();
vi.mock('../lib/hiringFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/hiringFlow')>()),
  fetchReservedApplicants: () => Promise.resolve(rows),
  generateEmployeeCredentials: (...a: unknown[]) => generateEmployeeCredentials(...a),
  printCredentialCards: (...a: unknown[]) => printCredentialCards(...a),
}));
vi.mock('../lib/plantillaSlots', () => ({
  revokeSlotReservation: (...a: unknown[]) => revokeSlotReservation(...a),
}));

const renderPage = async () => {
  render(<MemoryRouter><GenerateCredentialsPage /></MemoryRouter>);
  await screen.findByText('Juan Dela Cruz');
};

describe('Generate Employee Credentials', () => {
  beforeEach(() => {
    generateEmployeeCredentials.mockReset();
    revokeSlotReservation.mockReset();
    printCredentialCards.mockReset();
    printCredentialCards.mockReturnValue(true);
  });

  it('groups applicants by department and plantilla', async () => {
    await renderPage();
    const engineering = screen.getByRole('region', { name: "City Engineer's Office" });
    expect(within(engineering).getByText('Engineer II · Plantilla 1')).toBeInTheDocument();
    expect(within(engineering).getByText('0 of 1 selected')).toBeInTheDocument();
  });

  it('keeps a selection across departments and totals it', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Juan Dela Cruz' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Maria Santos' }));

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByText(/City Engineer's Office \(1\), City Treasurer's Office \(1\)/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: "City Treasurer's Office" })).getByText('1 of 1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate \(2\)/ })).toBeEnabled();
  });

  it('flags a missed signing date', async () => {
    await renderPage();
    const health = screen.getByRole('region', { name: 'City Health Office' });
    expect(within(health).getByText('Deadline passed')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: "City Engineer's Office" })).getByText('Awaiting signing')).toBeInTheDocument();
  });

  it('generates only the ticked applicants and shows their credentials', async () => {
    generateEmployeeCredentials.mockResolvedValue({
      credentials: [{ fullName: 'Juan Dela Cruz', employeeId: 'EMP-1', tempPassword: 'pw-1', email: 'a@x.ph', emailSent: true, position: 'Engineer II', department: "City Engineer's Office", plantilla: 'Plantilla 1' }],
      promotions: [],
      failures: [],
    });
    await renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Juan Dela Cruz' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate \(1\)/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Generate' }));

    await screen.findByText('Employee Records Created');
    expect(generateEmployeeCredentials).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' })]);
    expect(screen.getByText('EMP-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print Credentials/ })).toBeEnabled();
  });

  it('marks promotion rows with a chip and their employee number', async () => {
    await renderPage();
    const planning = screen.getByRole('region', { name: 'City Planning Office' });
    expect(within(planning).getByText('Promotion')).toBeInTheDocument();
    expect(within(planning).getByText(/EMP-2018-0042/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: "City Engineer's Office" })).queryByText('Promotion')).toBeNull();
  });

  it('summarises a mixed selection in the confirmation', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Juan Dela Cruz' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Ligaya Bautista' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate \(2\)/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/1 credential, 1 promotion/)).toBeInTheDocument();
  });

  const generateSelected = async (...names: string[]) => {
    await renderPage();
    names.forEach((n) => fireEvent.click(screen.getByRole('checkbox', { name: `Select ${n}` })));
    fireEvent.click(screen.getByRole('button', { name: `Generate (${names.length})` }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Generate' }));
  };

  const promotionOutcome = {
    applicantId: 'p', employeeUuid: 'uuid-p', employeeNumber: 'EMP-2018-0042', slotId: 'slot-p',
    completedAt: '2026-11-02T00:00:00Z', alreadyCompleted: false,
    fullName: 'Ligaya Bautista', position: 'Planning Officer III', department: 'City Planning Office', plantilla: 'Plantilla 7',
  };

  it('shows a promotion-only result without a password, an error or printing', async () => {
    generateEmployeeCredentials.mockResolvedValue({ credentials: [], promotions: [promotionOutcome], failures: [] });
    await generateSelected('Ligaya Bautista');

    const dialog = await screen.findByRole('dialog', { name: 'Promotions Completed' });
    expect(within(dialog).getByText('Promotion completed. Your existing employee account is unchanged.')).toBeInTheDocument();
    expect(within(dialog).getByText('EMP-2018-0042')).toBeInTheDocument();
    expect(within(dialog).getByText(/Planning Officer III/)).toBeInTheDocument();
    expect(within(dialog).getByText('City Planning Office')).toBeInTheDocument();
    expect(within(dialog).queryByText('Temporary Password')).toBeNull();
    expect(screen.queryByText(/couldn't generate/i)).toBeNull();
    expect(within(dialog).getByRole('button', { name: /Print Credentials/ })).toBeDisabled();
  });

  it('shows both kinds in a mixed result and prints only the credentials', async () => {
    const credential = { fullName: 'Juan Dela Cruz', employeeId: 'EMP-1', tempPassword: 'pw-1', email: 'a@x.ph', emailSent: true, position: 'Engineer II', department: "City Engineer's Office", plantilla: 'Plantilla 1' };
    generateEmployeeCredentials.mockResolvedValue({ credentials: [credential], promotions: [promotionOutcome], failures: [] });
    await generateSelected('Juan Dela Cruz', 'Ligaya Bautista');

    const dialog = await screen.findByRole('dialog', { name: 'Appointments Completed' });
    expect(within(dialog).getByText('pw-1')).toBeInTheDocument();
    expect(within(dialog).getByText('Promotion completed. Your existing employee account is unchanged.')).toBeInTheDocument();
    const print = within(dialog).getByRole('button', { name: /Print Credentials/ });
    expect(print).toBeEnabled();
    fireEvent.click(print);
    expect(printCredentialCards).toHaveBeenCalledWith([credential]);
  });

  it('shows the error only when nothing was generated or completed', async () => {
    generateEmployeeCredentials.mockResolvedValue({ credentials: [], promotions: [], failures: [] });
    await generateSelected('Juan Dela Cruz');
    expect(await screen.findByText(/couldn't generate any credentials/i)).toBeInTheDocument();
  });

  it('says nothing was completed when every selected row failed', async () => {
    const reason = 'Ligaya Bautista: not promoted. This applicant is no longer reserved for the plantilla.';
    generateEmployeeCredentials.mockResolvedValue({ credentials: [], promotions: [], failures: [reason] });
    await generateSelected('Ligaya Bautista');

    const dialog = await screen.findByRole('dialog', { name: 'Nothing Was Completed' });
    expect(within(dialog).getByText(/None of the selected applicants were completed\. Check the reasons below/)).toBeInTheDocument();
    expect(within(dialog).getByText(reason)).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/Credentials were emailed|accounts? generated/i);
    expect(screen.queryByText('Employee Records Created')).toBeNull();
    expect(screen.queryByText(/Check your connection/i)).toBeNull();
    expect(screen.queryByText(/couldn't generate any credentials/i)).toBeNull();
    expect(within(dialog).queryByRole('table')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Print Credentials/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('says the result is unconfirmed, not that nothing was completed, when a promotion got no answer', async () => {
    const reason = "Corazon Panganiban: result not confirmed. We couldn't confirm whether this promotion finished.";
    generateEmployeeCredentials.mockResolvedValue({ credentials: [], promotions: [], failures: [reason], unconfirmed: 1 });
    await generateSelected('Ligaya Bautista');

    const dialog = await screen.findByRole('dialog', { name: 'Result Not Confirmed' });
    expect(dialog.textContent).not.toMatch(/Nothing Was Completed|None of the selected applicants were completed/);
    expect(within(dialog).getByText(reason)).toBeInTheDocument();
  });

  it('keeps the credential title and failure list when some credentials were issued', async () => {
    const credential = { fullName: 'Juan Dela Cruz', employeeId: 'EMP-1', tempPassword: 'pw-1', email: 'a@x.ph', emailSent: true, position: 'Engineer II', department: "City Engineer's Office", plantilla: 'Plantilla 1' };
    generateEmployeeCredentials.mockResolvedValue({ credentials: [credential], promotions: [], failures: ['Ana Reyes: could not be hired.'] });
    await generateSelected('Juan Dela Cruz', 'Ana Reyes');

    const dialog = await screen.findByRole('dialog', { name: 'Employee Records Created' });
    expect(within(dialog).getByText('1 account generated. Credentials were emailed where an address was on file.')).toBeInTheDocument();
    expect(within(dialog).getByText('Ana Reyes: could not be hired.')).toBeInTheDocument();
    expect(within(dialog).getByText('pw-1')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Print Credentials/ })).toBeEnabled();
  });

  it('keeps the promotion title and failure list when some promotions completed', async () => {
    generateEmployeeCredentials.mockResolvedValue({ credentials: [], promotions: [promotionOutcome], failures: ['Ana Reyes: could not be hired.'] });
    await generateSelected('Ligaya Bautista', 'Ana Reyes');

    const dialog = await screen.findByRole('dialog', { name: 'Promotions Completed' });
    expect(within(dialog).getByText('1 promotion completed.')).toBeInTheDocument();
    expect(within(dialog).getByText('Ana Reyes: could not be hired.')).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/accounts? generated/i);
  });

  it('recovers from a thrown batch error and keeps the selection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    generateEmployeeCredentials.mockRejectedValue(new Error('permission denied for table employees'));
    await generateSelected('Juan Dela Cruz');

    const alert = await screen.findByText(/We couldn't generate the credentials/);
    expect(alert.textContent).not.toContain('employees');
    expect(screen.getByRole('checkbox', { name: 'Select Juan Dela Cruz' })).toBeChecked();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate \(1\)/ })).toBeEnabled();
  });

  it('revokes a selection after a confirmation', async () => {
    revokeSlotReservation.mockResolvedValue({ ok: true });
    await renderPage();
    const health = screen.getByRole('region', { name: 'City Health Office' });
    fireEvent.click(within(health).getByRole('button', { name: /Did not report/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke Selection' }));
    await waitFor(() => expect(revokeSlotReservation).toHaveBeenCalledWith('c'));
  });
  it('explains a failed revoke without database text (Task 2)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    revokeSlotReservation.mockResolvedValue({ ok: false, error: 'permission denied for table plantilla_slots' });
    await renderPage();
    const health = screen.getByRole('region', { name: 'City Health Office' });
    fireEvent.click(within(health).getByRole('button', { name: /Did not report/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke Selection' }));
    const alert = await screen.findByText(/We couldn't revoke the selection./);
    expect(alert.textContent).toContain("You don't have permission");
    expect(alert.textContent).not.toContain('plantilla_slots');
  });
});

