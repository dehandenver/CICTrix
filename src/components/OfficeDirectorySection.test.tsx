import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { OfficeDirectorySection } from './OfficeDirectorySection';
import type { OfficeDirectoryRow } from '../lib/api/officeDirectory';

const rows: OfficeDirectoryRow[] = Array.from({ length: 23 }, (_, i) => ({
  officeId: `o${i + 1}`,
  officeName: `Office ${String(i + 1).padStart(2, '0')}`,
  code: '',
  isActive: true,
  deptHead: null,
  supervisors: [],
  employeeCount: 1,
  divisions: [],
}));

// The real paging rules over fixed rows, instead of the database.
vi.mock('../lib/api/officeDirectory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/officeDirectory')>();
  return {
    ...actual,
    queryOfficeDirectory: vi.fn(async (query) => ({ ok: true, data: actual.pageOfficeDirectory(rows, query) })),
  };
});

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <OfficeDirectorySection />
      <LocationProbe />
    </MemoryRouter>,
  );

const urlParams = () => new URLSearchParams(screen.getByTestId('search').textContent ?? '');

describe('OfficeDirectorySection pagination', () => {
  it('restores page and size from the URL and keeps ?module=', async () => {
    renderAt('/admin/lnd?module=office-directory&odPage=2');
    expect(await screen.findByText('Office 11')).toBeInTheDocument();
    expect(screen.getByText('Showing 11–20 of 23 offices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(urlParams().get('odPage')).toBe('3'));
    expect(urlParams().get('module')).toBe('office-directory');
    expect(await screen.findByText('Office 21')).toBeInTheDocument();
  });

  it('clamps an out-of-range page and writes the real page back', async () => {
    renderAt('/admin/pm?module=office-directory&odPage=9');
    expect(await screen.findByText('Office 21')).toBeInTheDocument();
    await waitFor(() => expect(urlParams().get('odPage')).toBe('3'));
  });

  it('resets to page 1 when the page size changes', async () => {
    renderAt('/admin/lnd?module=office-directory&odPage=3');
    await screen.findByText('Office 21');
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: '25' } });
    await waitFor(() => expect(urlParams().get('odSize')).toBe('25'));
    expect(urlParams().get('odPage')).toBeNull();
    expect(await screen.findByText('Showing 1–23 of 23 offices')).toBeInTheDocument();
  });

  it('resets to page 1 on search, and offers to clear a search with no matches', async () => {
    renderAt('/admin/lnd?module=office-directory&odPage=2');
    await screen.findByText('Office 11');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search offices' }), { target: { value: 'Office 2' } });
    await waitFor(() => expect(urlParams().get('odQ')).toBe('Office 2'));
    expect(urlParams().get('odPage')).toBeNull();
    expect(await screen.findByText('Showing 1–4 of 4 offices')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search offices' }), { target: { value: 'zzz' } });
    expect(await screen.findByText('No offices match “zzz”')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clear search/ }));
    await waitFor(() => expect(urlParams().get('odQ')).toBeNull());
    expect(await screen.findByText('Showing 1–10 of 23 offices')).toBeInTheDocument();
  });
});
