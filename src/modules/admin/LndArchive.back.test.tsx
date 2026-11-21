import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveEmployee, ArchiveOffice } from '../../lib/api/lndArchive';

const archiveMocks = vi.hoisted(() => ({
  listArchiveOfficeDirectory: vi.fn(),
  listTrainingArchive: vi.fn(),
}));

vi.mock('../../lib/api/lndArchive', () => ({
  listArchiveOfficeDirectory: archiveMocks.listArchiveOfficeDirectory,
  listTrainingArchive: archiveMocks.listTrainingArchive,
}));

import { LndArchive } from './LndArchive';

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const OFFICES: ArchiveOffice[] = [
  { office: 'Budget Office', employeesWithRecords: 1, recordCount: 2, latestDate: '2026-06-01' },
  { office: 'HRMO', employeesWithRecords: 1, recordCount: 1, latestDate: '2026-07-01' },
];

const BUDGET_EMPS: ArchiveEmployee[] = [
  {
    employeeId: 'emp-1',
    employeeNumber: 'E-1',
    name: 'Ana Cruz',
    position: 'Budget Officer',
    department: 'Budget Office',
    dateHired: '2020-01-15',
    trainings: [
      {
        id: 'tr-1',
        title: 'Public Budgeting',
        typeOfCompetency: 'Fiscal Management',
        provider: 'DBM',
        dateConducted: 'Jun 1, 2026',
        attendancePercent: 100,
        completionStatus: 'Completed',
        certificateNumber: 'CERT-1',
        remarks: '',
      },
    ],
  },
];

describe('L&D Archive office drill-down & honest error recovery', () => {
  beforeEach(() => {
    archiveMocks.listArchiveOfficeDirectory.mockReset();
    archiveMocks.listTrainingArchive.mockReset();
    archiveMocks.listArchiveOfficeDirectory.mockResolvedValue([OFFICES[0]]);
    archiveMocks.listTrainingArchive.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a Back button that returns to the office list', async () => {
    render(<MemoryRouter><LndArchive /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Budget Office'));
    expect(await screen.findByText('Budget Office has no training records on file yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByText('Budget Office has no training records on file yet.')).not.toBeInTheDocument();
    expect(await screen.findByText('View Employees')).toBeInTheDocument();
  });

  it('renders Level 1 error panel with Retry on directory load failure and recovers', async () => {
    archiveMocks.listArchiveOfficeDirectory
      .mockRejectedValueOnce(new Error('directory failed'))
      .mockResolvedValueOnce(OFFICES);

    render(<MemoryRouter><LndArchive /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent(/office|archive|load/i);
    expect(screen.queryByText('No offices')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Budget Office')).toBeInTheDocument();
  });

  it('renders Level 2 error with Retry (not No training records) and preserves loaded data on stale refresh failure', async () => {
    archiveMocks.listArchiveOfficeDirectory.mockResolvedValue(OFFICES);
    archiveMocks.listTrainingArchive
      .mockRejectedValueOnce(new Error('attendance read failed'))
      .mockResolvedValueOnce(BUDGET_EMPS)
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce(BUDGET_EMPS);

    render(<MemoryRouter><LndArchive /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Budget Office'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/archive|record|load/i);
    expect(screen.queryByText('No training records')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Public Budgeting')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    const staleAlert = await screen.findByRole('alert');
    expect(staleAlert).toHaveTextContent(/stale/i);
    expect(screen.getByText('Public Budgeting')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry refresh/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('ignores late Level 2 responses after Back navigation', async () => {
    const slowBudget = deferred<ArchiveEmployee[]>();
    archiveMocks.listArchiveOfficeDirectory.mockResolvedValue(OFFICES);
    archiveMocks.listTrainingArchive.mockReturnValueOnce(slowBudget.promise);

    render(<MemoryRouter><LndArchive /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Budget Office'));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    slowBudget.resolve(BUDGET_EMPS);
    await Promise.resolve();
    expect(screen.queryByText('Public Budgeting')).not.toBeInTheDocument();
    expect((await screen.findAllByText('View Employees')).length).toBeGreaterThan(0);
  });
});
