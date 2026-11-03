import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee } from '../../types/employee.types';
import { EmployeePage } from './EmployeePage';
import { clearEmployeeSession } from '../../lib/employeeSession';

const mocks = vi.hoisted(() => ({ raw: vi.fn(), targets: vi.fn(), workspace: vi.fn(), phaseOpen: vi.fn() }));
vi.mock('../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../test/supabaseStub');
  return { supabase: supabaseStub() };
});
vi.mock('../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('../../components/portal-header', () => ({ PortalHeader: () => null }));
vi.mock('../../lib/api/employeePortal', () => ({ fetchPortalEmployeeById: async () => ({ ok: false }), patchPortalEmployee: vi.fn() }));
vi.mock('../../lib/api/performanceEvaluations', () => ({
  getEmployeeRawDetails: mocks.raw,
  getActivePerformanceCycle: async () => ({ success: true, data: { id: 2 } }),
  getCompetenciesList: async () => ({ success: true, data: [] }),
  getLatestEmployeeIPCR: async () => ({ success: true, data: { rows: [], ratingPeriod: 'July–December 2026' } }),
  getEmployeeEvaluations: async () => ({ success: true, data: [] }),
}));
vi.mock('../../lib/api/ipcrTargets', async (original) => ({
  ...(await original<typeof import('../../lib/api/ipcrTargets')>()),
  getActiveCycle: async () => ({ ok: true, data: { id: 2 } }), loadTargetSetting: mocks.targets,
}));
vi.mock('../../lib/api/ipcrWorkspace', async (original) => ({
  ...(await original<typeof import('../../lib/api/ipcrWorkspace')>()), getWorkspace: () => mocks.workspace(),
}));
vi.mock('../../lib/api/employeePhaseGate', () => ({
  EMPTY_PHASE_GATE: {}, fetchPhaseGate: async () => ({}), isPhaseOpen: () => mocks.phaseOpen(),
}));
vi.mock('../../lib/api/phaseSchedules', async (original) => ({
  ...(await original<typeof import('../../lib/api/phaseSchedules')>()), loadEffectiveSchedules: async () => ({}),
}));
vi.mock('../../lib/api/employeeNotifications', () => ({ listEmployeeNotifications: async () => [], markEmployeeNotificationsRead: vi.fn() }));
vi.mock('./EmployeePhase2', () => ({ EmployeePhase2: ({ targetSettingId }: { targetSettingId: string }) => <div>Rating sheet: {targetSettingId}</div> }));

const employee = {
  supabaseId: 'emp-1', employeeId: 'EMP-1', fullName: 'Ana Cruz', email: 'ana@example.test', mobileNumber: '09123456789',
  homeAddress: 'Iloilo City', emergencyContactName: 'Maria Cruz', sssNumber: '123', employmentStatus: 'Regular',
} as Employee;

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  mocks.workspace.mockResolvedValue(null);
  mocks.phaseOpen.mockReturnValue(true);
  mocks.raw.mockImplementation(async () => {
    if (mocks.raw.mock.calls.length > 3) throw new Error('Repeated workspace hydration');
    return { success: true, data: { employee_number: 'EMP-1' } };
  });
  mocks.targets.mockResolvedValue({ ok: true, data: {
    setting: { id: 'approved-1', cycle_id: 2, status: 'approved' },
    targets: { core: [{ title: 'Payroll', indicators: [{ description: 'Process payroll' }] }], strategic: [], support: [] },
  } });
});
afterEach(cleanup);

describe('workspace hydration', () => {
  it('finishes hydration once and displays Phase 2 without restarting on loaded state changes', async () => {
    render(<MemoryRouter initialEntries={['/employee/ipcr-workspace']}><EmployeePage currentUser={employee} onLogout={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Phase 2: Accomplishments/ }));
    expect(await screen.findByText('Rating sheet: approved-1')).toBeInTheDocument();
    await waitFor(() => expect(mocks.targets).toHaveBeenCalledTimes(1));
    expect(mocks.raw).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Phase 1: Target Setting' }));
    expect(screen.getByDisplayValue('Payroll')).toBeDisabled();
    expect(screen.getByDisplayValue('Process payroll')).toBeDisabled();
    expect(mocks.targets).toHaveBeenCalledTimes(1);
  });
});

describe('returned for revision', () => {
  const TARGETS = { core: [{ title: 'Payroll', indicators: [{ description: 'Process payroll' }] }], strategic: [], support: [] };
  const setStatus = (status: string) => mocks.targets.mockResolvedValue({ ok: true, data: {
    setting: { id: 'ts-1', cycle_id: 2, status, review_comment: 'Fix the indicators' }, targets: TARGETS,
  } });
  // The employee's earlier submit left the workspace row at "Targets Submitted".
  const staleWorkspace = () => mocks.workspace.mockResolvedValue({
    status: 'Targets Submitted', core_target: 'Payroll\n  - Process payroll', strategic_target: null, support_target: null,
  });
  const mount = () => render(
    <MemoryRouter initialEntries={['/employee/ipcr-workspace']}><EmployeePage currentUser={employee} onLogout={() => {}} /></MemoryRouter>,
  );

  it('is editable and shows Needs Revision even though the workspace still says Targets Submitted', async () => {
    setStatus('returned_for_revision'); staleWorkspace();
    mount();
    expect(await screen.findByText('Needs Revision')).toBeInTheDocument();
    expect(screen.queryByText('Pending Approval')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Payroll')).toBeEnabled();
    expect(screen.getByRole('button', { name: /Submit Targets for Approval/ })).toBeInTheDocument();
  });

  it('stays returned when the saved targets are rebuilt from the old workspace text', async () => {
    const blank = { title: '', indicators: [{ description: '' }] };
    mocks.targets.mockResolvedValue({ ok: true, data: {
      setting: { id: 'ts-1', cycle_id: 2, status: 'returned_for_revision', review_comment: 'Fix the indicators' },
      targets: { core: [blank], strategic: [blank], support: [blank] },
    } });
    staleWorkspace();
    mount();
    expect(await screen.findByText('Needs Revision')).toBeInTheDocument();
    expect(screen.queryByText('Pending Approval')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Payroll')).toBeEnabled();
  });

  it('stays editable after the Phase 1 window has closed', async () => {
    setStatus('returned_for_revision'); staleWorkspace(); mocks.phaseOpen.mockReturnValue(false);
    mount();
    expect(await screen.findByText('Needs Revision')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Payroll')).toBeEnabled();
    expect(screen.queryByText(/not yet open/)).not.toBeInTheDocument();
  });

  it('still locks a plain draft once the window has closed', async () => {
    setStatus('draft'); mocks.phaseOpen.mockReturnValue(false);
    mount();
    expect(await screen.findByDisplayValue('Payroll')).toBeDisabled();
  });

  it('still shows Pending Approval for a record that was resubmitted', async () => {
    setStatus('submitted_for_approval'); staleWorkspace();
    mount();
    expect(await screen.findByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Payroll')).toBeDisabled();
  });
});

describe('Phase 1 target inputs', () => {
  const renderDraft = async () => {
    mocks.targets.mockResolvedValue({ ok: true, data: {
      setting: { id: 'draft-1', cycle_id: 2, status: 'draft' },
      targets: { core: [{ title: '', indicators: [{ description: '' }] }], strategic: [], support: [] },
    } });
    render(<MemoryRouter initialEntries={['/employee/ipcr-workspace']}><EmployeePage currentUser={employee} onLogout={() => {}} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Phase 1: Target Setting' }));
    return {
      mfo: await screen.findByPlaceholderText('e.g. Payroll Management'),
      indicator: await screen.findByPlaceholderText(/e\.g\. Process payroll within 3 days/),
    };
  };

  it('top-aligns the MFO and Success Indicator cells so their inputs share a row start', async () => {
    const { mfo, indicator } = await renderDraft();
    expect(mfo.closest('td')).toHaveClass('is-top');
    expect(indicator.closest('td')).toHaveClass('is-top');
    expect(mfo.closest('tr')).toBe(indicator.closest('tr'));
  });

  it('keeps both inputs editable, counted, and removable', async () => {
    const { mfo, indicator } = await renderDraft();
    expect(mfo).toBeEnabled();
    expect(indicator).toBeEnabled();

    fireEvent.change(mfo, { target: { value: 'Payroll' } });
    fireEvent.change(indicator, { target: { value: 'Process payroll on time' } });
    expect(mfo).toHaveValue('Payroll');
    expect(indicator).toHaveValue('Process payroll on time');
    expect(screen.getByText('7/120')).toBeInTheDocument();
    expect(screen.getByText('23/280')).toBeInTheDocument();

    // Strategic and support start with a blank MFO each, so index 0 is the core section's.
    fireEvent.click(screen.getAllByRole('button', { name: '+ Add Success Indicator' })[0]);
    expect(screen.getAllByPlaceholderText(/e\.g\. Process payroll within 3 days/)).toHaveLength(2);
    expect(screen.getByDisplayValue('Process payroll on time')).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle('Delete this success indicator')[1]);
    expect(screen.getAllByPlaceholderText(/e\.g\. Process payroll within 3 days/)).toHaveLength(1);

    fireEvent.click(screen.getAllByRole('button', { name: '+ Add MFO' })[0]);
    expect(screen.getAllByPlaceholderText('e.g. Payroll Management')).toHaveLength(2);
    fireEvent.click(screen.getAllByTitle('Delete this MFO')[1]);
    expect(screen.getAllByPlaceholderText('e.g. Payroll Management')).toHaveLength(1);
    expect(screen.getByDisplayValue('Payroll')).toBeInTheDocument();
  });
});

describe('profile setup reminder', () => {
  const incomplete = { ...employee, emergencyRelationship: 'Mother', emergencyContactNumber: '09123456780', sssNumber: '' };
  const mount = (path = '/employee/profile', current = incomplete) => render(
    <MemoryRouter initialEntries={[path]}><EmployeePage currentUser={current} onLogout={() => {}} /></MemoryRouter>,
  );

  it('stays dismissed after a reload or page change and can still be opened manually', async () => {
    const first = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for Now' }));
    expect(screen.queryByRole('heading', { name: 'Government Identification' })).not.toBeInTheDocument();
    first.unmount();

    const reloaded = mount();
    await screen.findByRole('button', { name: /Complete Account Setup/ });
    expect(screen.queryByRole('heading', { name: 'Government Identification' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Complete Account Setup/ }));
    expect(await screen.findByRole('heading', { name: 'Government Identification' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for Now' }));
    reloaded.unmount();

    mount('/employee/ipcr-workspace');
    await screen.findByDisplayValue('Payroll');
    expect(screen.queryByRole('heading', { name: 'Government Identification' })).not.toBeInTheDocument();
  });

  it('shows the reminder again after logout clears the employee session', async () => {
    const first = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for Now' }));
    first.unmount();
    clearEmployeeSession();
    mount();
    expect(await screen.findByRole('button', { name: 'Skip for Now' })).toBeInTheDocument();
  });

  it('does not suppress a different employee’s setup reminder', async () => {
    const first = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for Now' }));
    first.unmount();
    mount('/employee/profile', { ...incomplete, employeeId: 'EMP-2', supabaseId: 'emp-2' });
    expect(await screen.findByRole('button', { name: 'Skip for Now' })).toBeInTheDocument();
  });

  it.each(['close button', 'backdrop', 'remind later', 'finish'])('remembers dismissal using %s', async (action) => {
    const current = action === 'remind later' ? { ...incomplete, email: '' } : incomplete;
    const first = mount('/employee/profile', current);
    const heading = await screen.findByRole('heading', {
      name: action === 'remind later' ? 'Contact Information' : 'Government Identification',
    });
    const panel = heading.closest('.wizard-panel') as HTMLElement;
    if (action === 'close button') fireEvent.click(within(panel).getByRole('button', { name: '' }));
    else if (action === 'backdrop') fireEvent.click(panel.parentElement!);
    else fireEvent.click(within(panel).getByRole('button', { name: action === 'finish' ? /Save Changes/ : 'Remind me later' }));
    expect(heading).not.toBeInTheDocument();
    first.unmount();
    mount('/employee/profile', current);
    await screen.findByText('Complete your profile');
    expect(screen.queryByRole('heading', { name: 'Contact Information' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Government Identification' })).not.toBeInTheDocument();
  });
});
