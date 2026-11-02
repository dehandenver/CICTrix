import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditHistoryEntry } from '../../../lib/api/ipcrAudit';
import { IpcrHistory, describeAuditEntry, pageNumbers } from './IpcrHistory';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../lib/api/ipcrAudit', async (original) => ({
  ...(await original<typeof import('../../../lib/api/ipcrAudit')>()),
  listAuditHistory: mocks.list,
}));

const entry = (n: number, extra: Partial<AuditHistoryEntry> = {}): AuditHistoryEntry => ({
  id: `e${n}`, createdAt: `2026-11-${String(n).padStart(2, '0')}T08:00:00Z`, action: 'approve', reason: null,
  targetSettingId: 'ts-1', employeeId: 'emp-1', employeeName: `Employee ${n}`, department: 'Engineering Office',
  actorId: 'head-1', actorName: 'Hilda Head', actorRole: 'office_account', ...extra,
});
const SCOPE = { officeId: null, officeName: 'Engineering Office' };
const mount = (phase: 'target' | 'rating' = 'target') => render(<IpcrHistory phase={phase} scope={SCOPE} />);

beforeEach(() => {
  mocks.list.mockResolvedValue({
    ok: true,
    data: [
      entry(3, { action: 'return', reason: 'Fix the indicators', employeeName: 'Ana Cruz' }),
      entry(2, { action: 'submit', employeeName: 'Ana Cruz', actorName: 'Ana Cruz', actorRole: 'employee' }),
      entry(1, { action: 'approve', employeeName: 'Ben Reyes' }),
    ],
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('IpcrHistory', () => {
  it('loads the phase for the reviewer’s office and lists each entry with its badge and reason', async () => {
    mount();
    expect(await screen.findByText('Fix the indicators')).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith({ phase: 'target', scope: SCOPE });
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Returned for revision')).toHaveClass('badge-warning');
    expect(within(rows[1]).getByText('Submitted')).toHaveClass('badge-info');
    expect(within(rows[2]).getByText('Approved')).toHaveClass('badge-success');
    expect(screen.getByText('Showing 1–3 of 3 entries')).toBeInTheDocument();
  });

  it('asks for the rating phase when mounted for Phase 2', async () => {
    mount('rating');
    await screen.findByText('Fix the indicators');
    expect(mocks.list).toHaveBeenCalledWith({ phase: 'rating', scope: SCOPE });
  });

  it('filters by action', async () => {
    mount();
    await screen.findByText('Fix the indicators');
    fireEvent.change(screen.getByLabelText('Filter by action'), { target: { value: 'submit' } });
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
    expect(screen.getByText('Showing 1–1 of 1 entries')).toBeInTheDocument();
  });

  it('searches employee, reviewer and reason, and explains an empty result', async () => {
    mount();
    await screen.findByText('Fix the indicators');
    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'ben' } });
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'nobody' } });
    expect(await screen.findByText('No matching history')).toBeInTheDocument();
  });

  it('pages the list and keeps the active page marked', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: Array.from({ length: 12 }, (_, i) => entry(12 - i)) });
    mount();
    await screen.findByText('Showing 1–10 of 12 entries');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 11–12 of 12 entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('shows an empty state with the next step when there is no history', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: [] });
    mount();
    expect(await screen.findByText('No history yet')).toBeInTheDocument();
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it('shows a failed load as an error with Retry, never as an empty history', async () => {
    mocks.list.mockResolvedValueOnce({ ok: false, error: 'boom' });
    mount();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('No history yet')).not.toBeInTheDocument();
    mocks.list.mockResolvedValueOnce({ ok: true, data: [entry(1)] });
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(screen.getByText('Approved')).toBeInTheDocument());
  });
});

describe('describeAuditEntry', () => {
  it.each([
    [{ action: 'submit', actorRole: 'employee' }, 'Submitted', 'info'],
    [{ action: 'approve', actorRole: 'office_account' }, 'Approved', 'success'],
    [{ action: 'return', actorRole: 'office_account' }, 'Returned for revision', 'warning'],
    [{ action: 'return_phase2', actorRole: 'office_account' }, 'Returned for revision', 'warning'],
    [{ action: 'admin_edit', actorRole: 'office_account' }, 'Targets edited', 'neutral'],
    [{ action: 'admin_edit_ratings', actorRole: 'office_account' }, 'Ratings edited', 'neutral'],
    [{ action: 'rate', actorRole: 'employee' }, 'Self-rating submitted', 'info'],
    [{ action: 'rate', actorRole: 'office_account' }, 'Ratings approved', 'success'],
  ])('describes %j', (input, label, variant) => {
    expect(describeAuditEntry(input)).toEqual({ label, variant });
  });
});

describe('pageNumbers', () => {
  it('lists every page up to seven', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('shows first, last and the current page with its neighbours, with gaps, beyond seven', () => {
    expect(pageNumbers(1, 20)).toEqual([1, 2, 'gap', 20]);
    expect(pageNumbers(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(pageNumbers(20, 20)).toEqual([1, 'gap', 19, 20]);
  });
});
