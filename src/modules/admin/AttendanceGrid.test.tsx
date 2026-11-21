import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  listAttendance: vi.fn(),
  setDayAttendance: vi.fn(),
}));

vi.mock('../../lib/api/trainingAttendance', () => ({
  cellKey: (dayKey: string, session: 'AM' | 'PM') => `${dayKey}|${session}`,
  SESSION_HALVES: ['AM', 'PM'],
  SESSION_LABEL: { AM: 'Morning', PM: 'Afternoon' },
  listAttendance: apiMocks.listAttendance,
  setDayAttendance: apiMocks.setDayAttendance,
}));

import { AttendanceGrid } from './AttendanceGrid';

const localTodayIso = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}T09:00:00`;
};

const TODAY_ISO = localTodayIso();
const TODAY_KEY = TODAY_ISO.slice(0, 10);

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('AttendanceGrid', () => {
  beforeEach(() => {
    apiMocks.listAttendance.mockReset();
    apiMocks.setDayAttendance.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('blocks controls and renders Retry without fabricated counts when initial load fails', async () => {
    apiMocks.listAttendance
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(
        new Map([['enr-1', new Map([[`${TODAY_KEY}|AM`, { status: 'Present', note: null }]])]]),
      );

    render(
      <AttendanceGrid
        startDate={TODAY_ISO}
        endDate={TODAY_ISO}
        attendees={[{ enrollmentId: 'enr-1', name: 'Ana Cruz', department: 'HRMO' }]}
      />,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/attendance/i);
    expect(screen.queryByText('0P')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Present · Morning')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('1P')).toBeInTheDocument();
    expect(screen.getAllByTitle('Present · Morning')[0]).toBeEnabled();
  });

  it('clears prior session data and ignores late responses when switching scope', async () => {
    const first = deferred<Map<string, any>>();
    const second = deferred<Map<string, any>>();
    apiMocks.listAttendance
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { rerender } = render(
      <AttendanceGrid
        startDate={TODAY_ISO}
        endDate={TODAY_ISO}
        attendees={[{ enrollmentId: 'enr-1', name: 'Ana Cruz', department: 'HRMO' }]}
      />,
    );

    rerender(
      <AttendanceGrid
        startDate={TODAY_ISO}
        endDate={TODAY_ISO}
        attendees={[{ enrollmentId: 'enr-2', name: 'Ben Reyes', department: 'Accounting' }]}
      />,
    );

    // Late response for enr-1 arrives after switching to enr-2.
    first.resolve(new Map([['enr-1', new Map([[`${TODAY_KEY}|AM`, { status: 'Absent', note: null }]])]]));
    await Promise.resolve();
    expect(screen.queryByText('1A')).not.toBeInTheDocument();

    second.resolve(new Map([['enr-2', new Map([[`${TODAY_KEY}|AM`, { status: 'Present', note: null }]])]]));
    expect(await screen.findByText('1P')).toBeInTheDocument();
  });

  it('preserves loaded marks and open excuse draft on refresh failure, labels view stale, and disables mutations until Retry refresh succeeds', async () => {
    const initialMap = new Map([
      ['enr-1', new Map([[`${TODAY_KEY}|AM`, { status: 'Present', note: null }]])],
    ]);
    apiMocks.listAttendance
      .mockResolvedValueOnce(initialMap)
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce(initialMap);

    render(
      <AttendanceGrid
        startDate={TODAY_ISO}
        endDate={TODAY_ISO}
        attendees={[{ enrollmentId: 'enr-1', name: 'Ana Cruz', department: 'HRMO' }]}
      />,
    );

    expect(await screen.findByText('1P')).toBeInTheDocument();

    // Trigger Excuse modal and enter a draft note, then refresh fails while modal is open.
    fireEvent.click(screen.getAllByTitle('Excused · Afternoon')[0]);
    const textarea = await screen.findByPlaceholderText(/medical appointment/i);
    fireEvent.change(textarea, { target: { value: 'Draft excuse note' } });

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    const staleAlert = await screen.findByRole('alert');
    expect(staleAlert).toHaveTextContent(/stale/i);
    expect(screen.getByText('1P')).toBeInTheDocument();
    expect((screen.getByPlaceholderText(/medical appointment/i) as HTMLTextAreaElement).value).toBe('Draft excuse note');
    expect(screen.getByRole('button', { name: 'Save Excuse' })).toBeDisabled();
    expect(screen.getAllByTitle('Present · Morning')[0]).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /retry refresh/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getAllByTitle('Present · Morning')[0]).toBeEnabled();
  });

  it('replaces window.alert with inline error alert and keeps excuse draft open when setDayAttendance fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    apiMocks.listAttendance.mockResolvedValueOnce(new Map());
    apiMocks.setDayAttendance.mockResolvedValueOnce({ ok: false, error: 'DB locked' });

    render(
      <AttendanceGrid
        startDate={TODAY_ISO}
        endDate={TODAY_ISO}
        attendees={[{ enrollmentId: 'enr-1', name: 'Ana Cruz', department: 'HRMO' }]}
      />,
    );

    await screen.findByText('0P');
    fireEvent.click(screen.getAllByTitle('Excused · Morning')[0]);
    const textarea = await screen.findByPlaceholderText(/medical appointment/i);
    fireEvent.change(textarea, { target: { value: 'Medical cert' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Excuse' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/DB locked/i);
    expect(alertSpy).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText(/medical appointment/i) as HTMLTextAreaElement).value).toBe('Medical cert');
  });
});
