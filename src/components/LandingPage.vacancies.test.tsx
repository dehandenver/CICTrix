import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types/recruitment.types';

const posting = (id: string, title: string, department: string, slots: Array<[string, 'open' | 'filled' | 'closed']>) => ({
  id,
  jobCode: `PLT-${id}`,
  title,
  department,
  status: 'Active',
  employmentStatus: 'Permanent',
  applicationDeadline: '2099-12-31',
  postedDate: '2026-10-01T00:00:00.000Z',
  plantillaSlots: slots.map(([label, status], idx) => ({
    id: `${id}-${idx}`, jobPostingId: id, slotNumber: idx + 1, label, itemNumber: `PLT-${id}-${idx}`, status,
  })),
}) as unknown as JobPosting;

const jobs = [
  posting('b', 'Social Welfare Officer IV (Division Chief)', 'Office of the City Social Welfare and Development Officer',
    [['Plantilla 113', 'open'], ['Plantilla 114', 'open'], ['Plantilla 115', 'filled'], ['Plantilla 116', 'closed']]),
  posting('a', 'Engineer II (Drainage / Flood Control)', 'Office of the City Engineer', [['Plantilla 65', 'open']]),
  // Its one plantilla is filled, so it is not a vacancy and gets no row.
  posting('c', 'Carpenter II', 'Office of the City Engineer', [['Plantilla 86', 'filled']]),
];

let mockLoadError: string | null = null;

vi.mock('../lib/recruitmentData', () => ({
  getAuthoritativeJobPostings: () => jobs,
  getJobPostingsLoadError: () => mockLoadError,
  // The real loader fires this event when it finishes; the page applies the cache on it.
  loadJobPostings: () => Promise.resolve().then(() => {
    window.dispatchEvent(new Event('cictrix:job-postings-updated'));
    return jobs;
  }),
}));
vi.mock('../hooks/useSalarySchedule', () => ({ useSalarySchedule: () => [] }));

const renderPage = async () => {
  const { LandingPage } = await import('./LandingPage');
  render(<MemoryRouter><LandingPage /></MemoryRouter>);
  return screen.findAllByText('Social Welfare Officer IV (Division Chief)');
};

describe('Landing — vacancies table plantilla numbers and accessibility', () => {
  beforeEach(() => {
    mockLoadError = null;
  });

  it('gives each open plantilla its own row with a direct job-details link and leaves filled and closed ones out', async () => {
    const titles = await renderPage();
    const rows = titles.map((title) => title.closest('tr') as HTMLElement);

    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('113')).toBeInTheDocument();
    const link113 = within(rows[0]).getByRole('link', {
      name: 'Apply for Social Welfare Officer IV (Division Chief), Plantilla 113',
    });
    expect(link113).toHaveAttribute('href', '/job-details/PLT-b?slot=b-0');

    expect(within(rows[1]).getByText('114')).toBeInTheDocument();
    const link114 = within(rows[1]).getByRole('link', {
      name: 'Apply for Social Welfare Officer IV (Division Chief), Plantilla 114',
    });
    expect(link114).toHaveAttribute('href', '/job-details/PLT-b?slot=b-1');

    expect(screen.queryByText('115')).not.toBeInTheDocument();
    expect(screen.queryByText('116')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filled' })).not.toBeInTheDocument();
  });

  it('sorts by department, drops a fully filled posting and counts only vacant rows', async () => {
    await renderPage();
    const titles = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td p')?.textContent);

    expect(titles).toEqual([
      'Engineer II (Drainage / Flood Control)',
      'Social Welfare Officer IV (Division Chief)',
      'Social Welfare Officer IV (Division Chief)',
    ]);
    expect(screen.queryByText('Carpenter II')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 to 3 of 3 jobs/)).toBeInTheDocument();
  });

  it('opens Login portals on click and closes on Escape while restoring focus', async () => {
    await renderPage();
    const loginBtn = screen.getByRole('button', { name: 'Login' });
    expect(loginBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(loginBtn);
    expect(loginBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link', { name: 'Employee Portal' }).length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(loginBtn).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(loginBtn);
  });

  it('hides pagination on empty search and lets users clear the query', async () => {
    await renderPage();
    const search = screen.getByLabelText('Search vacancies');
    fireEvent.change(search, { target: { value: 'zzzz-no-match' } });

    expect(screen.getByText('No vacancies match your search.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Vacancies pagination' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText(/Showing 1 to 3 of 3 jobs/)).toBeInTheDocument();
  });

  it('shows a friendly error without exposing raw internal error text', async () => {
    mockLoadError = 'FATAL: postgres connection refused';
    const { LandingPage } = await import('./LandingPage');
    render(<MemoryRouter><LandingPage /></MemoryRouter>);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load the vacancies/i);
    expect(alert).not.toHaveTextContent('FATAL');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('builds ellipsis pagination tokens and formats dates without UTC day shifts', async () => {
    const { buildPageList, formatClosingDate } = await import('./LandingPage');
    expect(buildPageList(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(buildPageList(5, 12)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 12]);
    expect(buildPageList(2, 10)).toEqual([1, 2, 3, 'ellipsis', 10]);
    expect(formatClosingDate('2026-11-29')).toBe('Nov 29, 2026');
  });
});
