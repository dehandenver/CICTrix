import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('shows the range label, page buttons with ellipsis, and the active page', () => {
    render(<Pagination total={200} page={10} pageSize={10} onPageChange={() => {}} itemLabel="offices" label="Pages" />);
    expect(screen.getByText('Showing 91–100 of 200 offices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 10' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Page 5' })).not.toBeInTheDocument();
    expect(screen.getAllByText('…')).toHaveLength(2);
  });

  it('moves with Previous / Next and disables them at the ends', () => {
    const onPageChange = vi.fn();
    const { rerender } = render(<Pagination total={30} page={1} pageSize={10} onPageChange={onPageChange} label="Pages" />);
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    rerender(<Pagination total={30} page={3} pageSize={10} onPageChange={onPageChange} label="Pages" />);
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Page 1' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('offers 10 / 25 / 50 per page when a size handler is given', () => {
    const onPageSizeChange = vi.fn();
    render(<Pagination total={30} page={1} pageSize={10} onPageChange={() => {}} onPageSizeChange={onPageSizeChange} label="Pages" />);
    const select = screen.getByLabelText('Show');
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual(['10', '25', '50']);
    fireEvent.change(select, { target: { value: '25' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });

  it('clamps an out-of-range page for display and hides buttons for one page', () => {
    render(<Pagination total={5} page={9} pageSize={10} onPageChange={() => {}} label="Pages" />);
    expect(screen.getByText('Showing 1–5 of 5 entries')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next/ })).not.toBeInTheDocument();
  });

  it('renders nothing when there are no rows', () => {
    const { container } = render(<Pagination total={0} page={1} pageSize={10} onPageChange={() => {}} label="Pages" />);
    expect(container).toBeEmptyDOMElement();
  });
});
