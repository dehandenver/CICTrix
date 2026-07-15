import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrainingCoursesPrototype } from './TrainingCoursesPrototype';

describe('TrainingCoursesPrototype', () => {
  it('renders all 10 courses in list view', () => {
    render(<TrainingCoursesPrototype />);
    expect(screen.getByText(/10 of 10 courses/)).toBeTruthy();
    expect(screen.getByText('Executive Presence and Influence')).toBeTruthy();
  });

  it('filters by status', () => {
    render(<TrainingCoursesPrototype />);
    const [statusSelect] = screen.getAllByRole('combobox');
    fireEvent.change(statusSelect, { target: { value: 'Rejected' } });
    // Only TRN-004 and TRN-009 are Rejected.
    expect(screen.getByText(/2 of 10 courses/)).toBeTruthy();
    expect(screen.getByText('Python for Data Reporting: Beginner Track')).toBeTruthy();
    expect(screen.queryByText('Executive Presence and Influence')).toBeNull();
  });

  it('filters by category, and combines with status', () => {
    render(<TrainingCoursesPrototype />);
    const [statusSelect, categorySelect] = screen.getAllByRole('combobox');
    fireEvent.change(categorySelect, { target: { value: 'Technical' } });
    expect(screen.getByText(/3 of 10 courses/)).toBeTruthy();

    fireEvent.change(statusSelect, { target: { value: 'Approved' } });
    // Technical + Approved -> TRN-008, TRN-010.
    expect(screen.getByText(/2 of 10 courses/)).toBeTruthy();
    expect(screen.queryByText('Python for Data Reporting: Beginner Track')).toBeNull();
  });

  it('opens a detail panel on click, showing the rejection reason', () => {
    render(<TrainingCoursesPrototype />);
    fireEvent.click(screen.getByText('Python for Data Reporting: Beginner Track'));
    expect(screen.getByText('Rejection reason')).toBeTruthy();
    expect(screen.getByText(/Overlaps with month-end close period/)).toBeTruthy();
    expect(screen.getByText('Leo Fernandez, Dept Head IT')).toBeTruthy();
    expect(screen.getByText('TRN-2026-004')).toBeTruthy();
  });

  it('shows "Not yet assigned" when there is no reviewer', () => {
    render(<TrainingCoursesPrototype />);
    fireEvent.click(screen.getByText(/Change Champions/));
    expect(screen.getByText('Not yet assigned')).toBeTruthy();
    expect(screen.queryByText('Rejection reason')).toBeNull();
  });

  it('switches to calendar view and places a course on its start day', () => {
    render(<TrainingCoursesPrototype />);
    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }));
    // Default cursor is July 2026.
    expect(screen.getByText('July 2026')).toBeTruthy();
    expect(screen.getByText(/Change Champions/)).toBeTruthy();
    // August course should not appear in the July grid.
    expect(screen.queryByText(/Inclusive Leadership/)).toBeNull();
  });

  it('renders a multi-day course on every day it spans', () => {
    render(<TrainingCoursesPrototype />);
    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }));
    // TRN-2026-003 runs Jul 27–28, so it should appear twice in July.
    const chips = screen.getAllByTitle(/Executive Presence and Influence/);
    expect(chips.length).toBe(2);
  });

  it('navigates months and respects the active filter', () => {
    render(<TrainingCoursesPrototype />);
    fireEvent.click(screen.getByRole('button', { name: /Calendar/ }));
    const nav = screen.getAllByRole('button');
    // Next-month chevron is the one right after the month heading.
    fireEvent.click(nav.find((b) => b.querySelector('svg.lucide-chevron-right'))!);
    expect(screen.getByText('August 2026')).toBeTruthy();
    expect(screen.getByText(/Inclusive Leadership/)).toBeTruthy();
  });
});
