import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdsStepList, type PdsStep } from './PdsStepList';

const steps: PdsStep[] = [
  { id: 'a', label: 'Personal Information', numeral: 'I' },
  { id: 'b', label: 'Family Background', numeral: 'II' },
  { id: 'c', label: 'Educational Background', numeral: 'III' },
];

const setup = (activeId = 'b', saved: string[] = ['a'], onSelect = vi.fn()) => {
  render(<PdsStepList steps={steps} activeId={activeId} savedIds={new Set(saved)} onSelect={onSelect} />);
  return { onSelect, list: within(screen.getByRole('navigation', { name: 'PDS sections' })) };
};

describe('PdsStepList', () => {
  it('renders every label, and numerals for unsaved steps', () => {
    const { list } = setup();
    for (const s of steps) expect(list.getByText(s.label)).toBeInTheDocument();
    expect(list.getByText('II')).toBeInTheDocument();
    expect(list.getByText('III')).toBeInTheDocument();
    expect(list.queryByText('I')).not.toBeInTheDocument(); // saved shows a check instead
  });

  it('marks only the active step with aria-current="step"', () => {
    const { list } = setup('b');
    expect(list.getByRole('button', { name: /Family Background/ })).toHaveAttribute('aria-current', 'step');
    expect(list.getByRole('button', { name: /Personal Information/ })).not.toHaveAttribute('aria-current');
  });

  it('exposes "saved" in the accessible name of saved steps only', () => {
    const { list } = setup('b', ['a']);
    expect(list.getByRole('button', { name: /Personal Information.*saved/ })).toBeInTheDocument();
    expect(list.getByRole('button', { name: 'Family Background' })).toBeInTheDocument();
    expect(list.getByRole('button', { name: 'Educational Background' })).toBeInTheDocument();
  });

  it('calls onSelect with the step id on click', () => {
    const { onSelect, list } = setup();
    fireEvent.click(list.getByRole('button', { name: 'Educational Background' }));
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('calls onSelect when the jump select changes', () => {
    const { onSelect } = setup();
    fireEvent.change(screen.getByLabelText('Jump to section'), { target: { value: 'c' } });
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('shows the step count and saved count', () => {
    setup('b', ['a', 'c']);
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('2 saved')).toBeInTheDocument();
  });

  it('disables Previous on the first step and Next on the last', () => {
    const first = render(<PdsStepList steps={steps} activeId="a" savedIds={new Set<string>()} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^Previous/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Next/ })).toBeEnabled();
    first.unmount();
    render(<PdsStepList steps={steps} activeId="c" savedIds={new Set<string>()} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^Next/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Previous/ })).toBeEnabled();
  });

  it('Previous and Next select the neighbouring steps', () => {
    const { onSelect } = setup('b');
    fireEvent.click(screen.getByRole('button', { name: /^Previous/ }));
    expect(onSelect).toHaveBeenLastCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    expect(onSelect).toHaveBeenLastCalledWith('c');
  });
});
