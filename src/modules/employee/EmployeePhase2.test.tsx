import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeePhase2 } from './EmployeePhase2';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../lib/api/ipcrRatings', () => ({ loadEmployeeRatingSheet: load, saveEmployeeRatings: vi.fn() }));
vi.mock('../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('../../lib/api/employeeNotifications', () => ({ markEmployeeNotificationsRead: vi.fn() }));
vi.mock('../../lib/api/ipcrRatingScale', () => ({ DEFAULT_RATING_SCALE: [], getRatingScale: async () => [] }));
vi.mock('../../components/table-loading', () => ({ useDelayedLoading: () => false, SkeletonList: () => null }));

const sheet = (phase2Status = 'locked') => ({
  targetSettingId: 'approved-1', employeeId: 'emp-1', employeeName: 'Ana Cruz', period: 'July–December 2026',
  phase2Status, phase2OpenTargetDate: null, reviewComment: null as string | null, returnedAt: null as string | null,
  mfos: [{ id: 'mfo-1', functionType: 'core', title: 'Payroll', indicators: [{
    successIndicatorId: 'si-1', description: 'Process payroll', accomplishment: 'Saved accomplishment',
    remarks: '', quality: 4, efficiency: 4, timeliness: 4, overriddenByOffice: false,
  }] }],
});

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
afterEach(cleanup);

describe('approved Phase 1 to Phase 2', () => {
  it('loads the resolved approved record and displays targets before the rating window opens', async () => {
    load.mockResolvedValue({ ok: true, data: sheet() });
    render(<EmployeePhase2 employeeId="emp-1" cycleId={2} targetSettingId="approved-1" phaseOpen={false} />);
    expect(await screen.findByText('Process payroll')).toBeInTheDocument();
    expect(screen.getByText('Payroll')).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith('emp-1', 2, 'approved-1');
    expect(screen.getByDisplayValue('Saved accomplishment')).toBeDisabled();
    expect(screen.queryByText(/Submitted — overall rating/)).not.toBeInTheDocument();
  });

  it('shows the actual load error and retries instead of claiming approval is missing', async () => {
    load.mockResolvedValueOnce({ ok: false, error: 'Ratings request failed' }).mockResolvedValueOnce({ ok: true, data: sheet() });
    render(<EmployeePhase2 employeeId="emp-1" targetSettingId="approved-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ratings request failed');
    expect(screen.queryByText(/don’t have an approved/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading Phase 2' }));
    expect(await screen.findByText('Process payroll')).toBeInTheDocument();
  });

  it('restores submitted details as read-only across remounts and ignores stale cached drafts', async () => {
    sessionStorage.setItem('cictrix_phase2_draft_emp-1', JSON.stringify({ 'si-1': { accomplishment: 'Stale draft', quality: 1 } }));
    load.mockResolvedValue({ ok: true, data: sheet('completed') });
    const first = render(<EmployeePhase2 employeeId="emp-1" targetSettingId="approved-1" phaseOpen />);
    expect(await screen.findByDisplayValue('Saved accomplishment')).toBeDisabled();
    first.unmount();
    render(<EmployeePhase2 employeeId="emp-1" targetSettingId="approved-1" phaseOpen />);
    expect(await screen.findByDisplayValue('Saved accomplishment')).toBeDisabled();
    expect(screen.queryByDisplayValue('Stale draft')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
  });
});

describe('returned for revision', () => {
  const returned = (reviewComment: string | null) => ({ ...sheet('in_progress'), returnedAt: '2026-11-03T02:00:00Z', reviewComment });

  it('stays editable and submittable after the rating window has closed', async () => {
    load.mockResolvedValue({ ok: true, data: returned(null) });
    render(<EmployeePhase2 employeeId="emp-1" targetSettingId="approved-1" phaseOpen={false} />);
    expect(await screen.findByDisplayValue('Saved accomplishment')).toBeEnabled();
    expect(screen.getByRole('button', { name: /Submit Self-Ratings/ })).toBeEnabled();
    expect(screen.queryByText(/is not yet open/)).not.toBeInTheDocument();
  });

  it('shows the revision banner even when the reviewer left no comment', async () => {
    load.mockResolvedValue({ ok: true, data: returned(null) });
    render(<EmployeePhase2 employeeId="emp-1" targetSettingId="approved-1" phaseOpen={false} />);
    expect(await screen.findByText(/Revision Requested by Supervisor/)).toBeInTheDocument();
  });

  it('shows the reviewer comment when there is one', async () => {
    load.mockResolvedValue({ ok: true, data: returned('Add evidence') });
    render(<EmployeePhase2 employeeId="emp-1" targetSettingId="approved-1" phaseOpen />);
    expect(await screen.findByText(/Add evidence/)).toBeInTheDocument();
  });

  it('still locks an unfinished sheet that was not returned once the window has closed', async () => {
    load.mockResolvedValue({ ok: true, data: sheet('in_progress') });
    render(<EmployeePhase2 employeeId="emp-1" targetSettingId="approved-1" phaseOpen={false} />);
    expect(await screen.findByDisplayValue('Saved accomplishment')).toBeDisabled();
    expect(screen.queryByText(/Revision Requested by Supervisor/)).not.toBeInTheDocument();
  });
});
