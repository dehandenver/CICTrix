import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Combobox } from './Combobox';

interface Fruit { name: string; soldOut?: boolean }

const FRUITS: Fruit[] = [
  { name: 'Apple' },
  { name: 'Apricot', soldOut: true },
  { name: 'Avocado' },
  { name: 'Banana' },
];

const Harness = ({ onSelect = vi.fn() }: { onSelect?: (fruit: Fruit) => void }) => {
  const [query, setQuery] = useState('');
  const items = FRUITS.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <>
      <label htmlFor="fruit-q">Fruit</label>
      <Combobox<Fruit>
        id="fruit-q"
        query={query}
        onQueryChange={setQuery}
        items={items}
        getKey={(f) => f.name}
        isDisabled={(f) => Boolean(f.soldOut)}
        onSelect={(f) => { onSelect(f); setQuery(''); }}
        renderOption={(f) => <span>{f.name}</span>}
        emptyState={<p>No fruit found.</p>}
        footer={(list) => <p>{list.length} matches</p>}
      />
    </>
  );
};

const input = () => screen.getByRole('combobox', { name: 'Fruit' });
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const press = (key: string) => fireEvent.keyDown(input(), { key });
const highlighted = () => screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')?.textContent;

describe('Combobox', () => {
  it('keeps the menu closed until there is a query', () => {
    render(<Harness />);
    fireEvent.focus(input());
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input().getAttribute('aria-expanded')).toBe('false');

    type('a');
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('4 matches')).toBeTruthy();
  });

  it('highlights the first enabled option and points aria-activedescendant at it', () => {
    render(<Harness />);
    type('a');
    expect(highlighted()).toBe('Apple');
    const active = input().getAttribute('aria-activedescendant');
    expect(document.getElementById(active ?? '')?.textContent).toBe('Apple');
  });

  it('moves with the arrow keys, skips disabled options and wraps', () => {
    render(<Harness />);
    type('a');
    press('ArrowDown');
    expect(highlighted()).toBe('Avocado'); // Apricot is sold out
    press('ArrowDown');
    expect(highlighted()).toBe('Banana');
    press('ArrowDown');
    expect(highlighted()).toBe('Apple');
    press('ArrowUp');
    expect(highlighted()).toBe('Banana');
  });

  it('picks the highlighted option with Enter and closes the menu', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    type('a');
    press('ArrowDown');
    press('Enter');
    expect(onSelect).toHaveBeenCalledWith(FRUITS[2]);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks with the mouse but ignores disabled options', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    type('ap');
    const apricot = screen.getByRole('option', { name: 'Apricot' });
    expect(apricot.getAttribute('aria-disabled')).toBe('true');
    fireEvent.mouseDown(apricot);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole('option', { name: 'Apple' }));
    expect(onSelect).toHaveBeenCalledWith(FRUITS[0]);
  });

  it('closes on Esc and marks the key as used so a surrounding modal stays open', () => {
    render(<Harness />);
    type('a');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { input().dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('leaves Esc alone when the menu is already closed, so a surrounding modal can close', () => {
    render(<Harness />);
    type('a');
    press('Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { input().dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
  });

  it('reopens the menu with ArrowDown after Esc closed it', () => {
    render(<Harness />);
    type('a');
    press('Escape');
    press('ArrowDown');
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('closes the menu shortly after blur, but not if focus comes back first', () => {
    vi.useFakeTimers();
    try {
      render(<Harness />);
      type('a');
      fireEvent.blur(input());
      fireEvent.focus(input());
      act(() => { vi.advanceTimersByTime(500); });
      expect(screen.getByRole('listbox')).toBeTruthy();

      fireEvent.blur(input());
      act(() => { vi.advanceTimersByTime(500); });
      expect(screen.queryByRole('listbox')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the empty state alongside the rows when every match is disabled', () => {
    render(<Harness />);
    type('apri');
    expect(screen.getByText('No fruit found.')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Apricot' }).getAttribute('aria-disabled')).toBe('true');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('renders no menu at all when nothing matches and there is no empty state', () => {
    render(
      <Combobox<Fruit>
        id="bare"
        query="zzz"
        onQueryChange={() => {}}
        items={[]}
        getKey={(f) => f.name}
        onSelect={() => {}}
        renderOption={(f) => f.name}
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the empty state when nothing can be picked', () => {
    render(<Harness />);
    type('zzz');
    expect(screen.getByText('No fruit found.')).toBeTruthy();
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByText(/matches/)).toBeNull();
  });
});
