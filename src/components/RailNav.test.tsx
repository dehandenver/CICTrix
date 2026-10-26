import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ClipboardCheck, UserCheck } from 'lucide-react';
import { RailNav } from './RailNav';

describe('RailNav', () => {
  // The rail scrolls the active item into view; jsdom has no layout.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  const renderRail = (count: number, onSelect = vi.fn()) =>
    render(
      <MemoryRouter>
        <RailNav
          label="Office Console"
          items={[
            { path: 'office:ipcr', label: 'IPCR', icon: ClipboardCheck, isActive: true, onSelect: vi.fn(), title: 'IPCR · Targets & ratings validation' },
            {
              path: 'office:courses', label: 'Training Courses', icon: UserCheck, isActive: false, onSelect,
              title: "Training Courses · Review L&D's list", badge: { count, label: 'to review' },
            },
          ]}
        />
      </MemoryRouter>,
    );

  it('names the landmark, labels each item, and marks the active one', () => {
    renderRail(0);
    const nav = screen.getByRole('complementary', { name: 'Office Console' });
    const ipcr = within(nav).getByRole('button', { name: 'IPCR' });
    expect(ipcr).toHaveAttribute('aria-current', 'page');
    expect(ipcr).toHaveAttribute('title', 'IPCR · Targets & ratings validation');
  });

  it('shows a count on the chip and speaks it as part of the name', () => {
    const onSelect = vi.fn();
    renderRail(3, onSelect);
    const item = screen.getByRole('button', { name: 'Training Courses, 3 to review' });
    expect(within(item).getByText('3')).toHaveClass('rail-badge');
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalled();
  });

  it('hides the badge at zero', () => {
    renderRail(0);
    const item = screen.getByRole('button', { name: 'Training Courses' });
    expect(item.querySelector('.rail-badge')).toBeNull();
  });
});
