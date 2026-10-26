import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LNDDashboard } from './LNDDashboard';

vi.mock('../../components/AdminHeader', () => ({ AdminHeader: () => null }));

const at = (iso: string) => `${iso}T00:00:00`;
const thisYear = new Date().getFullYear();
// One training finished in January, one far in the future this year.
const events = [
  { id: 'e1', title: 'Done', startDate: at(`${thisYear}-01-10`), endDate: null, status: 'Scheduled', attendees: [{ employeeId: 'a1', attendanceStatus: 'Present' }] },
  { id: 'e2', title: 'Later', startDate: at(`${thisYear + 1}-01-01`), endDate: null, status: 'Scheduled', attendees: [] },
];

vi.mock('../../lib/api/trainingCalendar', async (orig) => ({
  ...(await orig<typeof import('../../lib/api/trainingCalendar')>()),
  listCalendarEvents: vi.fn(async () => events),
}));
vi.mock('../../lib/api/trainingNeeds', async (orig) => ({
  ...(await orig<typeof import('../../lib/api/trainingNeeds')>()),
  computeNeedsAssessment: vi.fn(async () => [
    { competency: 'Public Communication Skills', category: 'Technical', demand: 50, priority: 'High', peakOfficeDemand: 50,
      offices: [{ office: 'Accounting', affected: 1, total: 2, demand: 50 }] },
  ]),
  listActiveEmployees: vi.fn(async () => [
    { id: 'a1', name: 'Ana', position: 'Clerk', department: 'Accounting' },
    { id: 'a2', name: 'Ben', position: 'Clerk', department: 'Accounting' },
    { id: 'e1', name: 'Cora', position: 'Engineer', department: 'Engineering' },
  ]),
}));
vi.mock('../../lib/api/idpSubmissions', async (orig) => ({
  ...(await orig<typeof import('../../lib/api/idpSubmissions')>()),
  listSubmissions: vi.fn(async () => ({ ok: true, data: [] })),
}));
vi.mock('../../lib/api/trainingLifecycle', async (orig) => ({
  ...(await orig<typeof import('../../lib/api/trainingLifecycle')>()),
  listIncompleteLockedTrainings: vi.fn(async () => []),
  listLockingSoonWithoutRoster: vi.fn(async () => []),
}));

const LocationProbe = () => <output data-testid="search">{useLocation().search}</output>;

const renderDashboard = () =>
  render(
    <MemoryRouter initialEntries={['/admin/lnd']}>
      <LNDDashboard />
      <LocationProbe />
    </MemoryRouter>,
  );

const statValue = (label: string) => screen.getByText(label).closest('.rd-stat') as HTMLElement;

describe('L&D dashboard', () => {
  // RailNav scrolls the active item into view; jsdom has no layout.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('has a labelled hero with the period toggle, office filter and note', async () => {
    renderDashboard();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard & Analytics' })).toBeInTheDocument();
    const period = screen.getByRole('group', { name: 'Period for training completion' });
    expect(within(period).getByRole('button', { name: 'Year' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Filter by office' })).toBeInTheDocument();
    expect(screen.getByText('The period applies to training completion only.')).toBeInTheDocument();
    expect(screen.getByText(/^As of /)).toBeInTheDocument();
    await screen.findByText('With skill gaps');
  });

  it('shows the four sections as KPI strips', async () => {
    renderDashboard();
    for (const title of ['Training Needs Assessment', 'Competency Gaps', 'Individual Development Plans', 'Trainings']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
    await waitFor(() => expect(statValue('With skill gaps')).toHaveTextContent('1'));
    expect(statValue('Offices assessed')).toHaveTextContent('1/2');
    // Year: 1 of the 2 calendar trainings is finished.
    expect(statValue('Completion · this year')).toHaveTextContent('50%');
    expect(statValue('IDPs submitted')).toHaveClass('risk');
  });

  it('scopes per-employee numbers to the chosen office', async () => {
    renderDashboard();
    await waitFor(() => expect(statValue('Trained at least once')).toHaveTextContent('33% of employees'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by office' }), { target: { value: 'Accounting' } });
    expect(statValue('Trained at least once')).toHaveTextContent('50% of employees');
    expect(statValue('Offices assessed')).toHaveTextContent('1/1');
  });

  it('switches section from View all and records it in ?module=', async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'View all: Individual Development Plans' }));
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?module=idp-form'));
  });
});
