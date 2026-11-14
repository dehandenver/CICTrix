import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { ReferenceAppsChip } from './ReferenceAppsChip';
import type { ReferenceApplication } from '../lib/referenceApplications';

const app = (overrides: Partial<ReferenceApplication>): ReferenceApplication => ({
  id: 'a1',
  referenceNo: 'ABYAN-731-052',
  position: 'Administrative Aide I',
  plantillaLabel: 'Plantilla 2',
  status: 'Qualified',
  hiredElsewhereApplicationId: null,
  createdAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

const hire = app({ id: 'hire', position: 'Records Officer I', plantillaLabel: 'Plantilla 5', status: 'Selected' });
const withdrawn = app({ id: 'w', status: 'Withdrawn - Hired Elsewhere', hiredElsewhereApplicationId: 'hire' });

const renderChip = (applications: ReferenceApplication[]) =>
  render(
    <table><tbody><tr><td>
      <ReferenceAppsChip applicantName="Juan Dela Cruz" referenceNo="ABYAN-731-052"
        applications={applications} currentApplicationId="hire" />
    </td></tr></tbody></table>,
  );

describe('ReferenceAppsChip', () => {
  it('renders nothing for a single application', () => {
    const { container } = renderChip([hire]);
    expect(container.querySelector('button')).toBeNull();
  });

  it('counts the applications and lists them all when opened', () => {
    renderChip([hire, withdrawn]);
    const chip = screen.getByRole('button', { name: '2 apps: show all applications under ABYAN-731-052' });
    expect(chip).toHaveTextContent('2 apps');
    expect(chip).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('dialog', { name: /Juan Dela Cruz/ });
    expect(within(dialog).getByText('Records Officer I')).toBeInTheDocument();
    expect(within(dialog).getByText('Administrative Aide I')).toBeInTheDocument();
  });

  it('shows a hired-elsewhere application as a neutral badge naming the hire plantilla', () => {
    renderChip([hire, withdrawn]);
    fireEvent.click(screen.getByRole('button', { name: /^2 apps/ }));
    const label = screen.getByText('Withdrawn: hired on Plantilla 5');
    expect(label.closest('.badge')).toHaveClass('badge-neutral');
    expect(screen.getByText('Selected').closest('.badge')).toHaveClass('badge-success');
  });

  it('closes on Escape and returns focus to the chip', () => {
    renderChip([hire, withdrawn]);
    const chip = screen.getByRole('button', { name: /^2 apps/ });
    fireEvent.click(chip);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chip).toHaveFocus();
  });

  it('closes on an outside click and on a second click of the chip', () => {
    renderChip([hire, withdrawn]);
    const chip = screen.getByRole('button', { name: /^2 apps/ });
    fireEvent.click(chip);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(chip);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(chip);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not let a click reach the row underneath', () => {
    const onRowClick = vi.fn();
    render(
      <table><tbody><tr onClick={onRowClick}><td>
        <ReferenceAppsChip applicantName="Juan Dela Cruz" referenceNo="ABYAN-731-052" applications={[hire, withdrawn]} />
      </td></tr></tbody></table>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^2 apps/ }));
    fireEvent.click(screen.getByText('Records Officer I'));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('moves focus into the popover so its list can be read and scrolled', () => {
    renderChip([hire, withdrawn]);
    fireEvent.click(screen.getByRole('button', { name: /^2 apps/ }));
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('closes when focus moves elsewhere on the page', () => {
    render(
      <>
        <ReferenceAppsChip applicantName="Juan Dela Cruz" referenceNo="ABYAN-731-052" applications={[hire, withdrawn]} />
        <button type="button">Next row action</button>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^2 apps/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Next row action' }).focus());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('marks its Esc as handled without stopping it, so an enclosing Modal stays open', () => {
    const outer = vi.fn((event: KeyboardEvent) => event.defaultPrevented);
    document.addEventListener('keydown', outer);
    try {
      renderChip([hire, withdrawn]);
      fireEvent.click(screen.getByRole('button', { name: /^2 apps/ }));
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(outer).toHaveBeenCalledTimes(1);
      expect(outer.mock.results[0].value).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      document.removeEventListener('keydown', outer);
    }
  });
});
