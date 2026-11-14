import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';

/** How long the menu stays open after the input blurs, so a click on an option still lands. */
const BLUR_CLOSE_DELAY_MS = 120;

const FIELD_CLASS = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:shadow-[shadow:var(--ring-input)]';

export interface ComboboxOptionState {
  highlighted: boolean;
  disabled: boolean;
}

export interface ComboboxProps<T> {
  /** The input's id, for an external `<label htmlFor>`. */
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
  /** The search text. The caller owns it, so it can clear it after a pick. */
  query: string;
  onQueryChange: (query: string) => void;
  /** Options for the current query, in display order. Disabled ones are shown but can't be picked. */
  items: T[];
  getKey: (item: T) => string;
  isDisabled?: (item: T) => boolean;
  onSelect: (item: T) => void;
  /** The contents of one option row. */
  renderOption: (item: T, state: ComboboxOptionState) => ReactNode;
  /** Shown in the menu when no option can be picked. */
  emptyState?: ReactNode;
  /** A status line under the options, shown when there is at least one. */
  footer?: (items: T[]) => ReactNode;
}

/**
 * A search input with a pick list (WAI-ARIA combobox pattern). The menu opens
 * once the query has text. Up/Down move between enabled options and wrap,
 * Enter picks, Esc closes the menu without closing a surrounding modal.
 */
export function Combobox<T>({
  id, inputRef, placeholder, query, onQueryChange, items, getKey,
  isDisabled = () => false, onSelect, renderOption, emptyState, footer,
}: ComboboxProps<T>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();

  const cancelBlurClose = () => { clearTimeout(blurTimer.current); blurTimer.current = undefined; };
  useEffect(() => cancelBlurClose, []);

  const selectable = items.map((item, i) => (isDisabled(item) ? -1 : i)).filter((i) => i >= 0);

  // Reset to the first enabled option whenever the query changes. Keyed on the
  // query, not `items`, so callers don't have to memoize the list.
  useEffect(() => { setHighlight(selectable[0] ?? -1); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (item: T | undefined) => {
    if (item === undefined || isDisabled(item)) return;
    setMenuOpen(false);
    onSelect(item);
  };

  const moveHighlight = (step: number) => {
    if (selectable.length === 0) return;
    const at = selectable.indexOf(highlight);
    const next = at < 0 ? 0 : (at + step + selectable.length) % selectable.length;
    setHighlight(selectable[next]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setMenuOpen(true); moveHighlight(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveHighlight(-1); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(items[highlight]); }
    // preventDefault tells a surrounding Modal that this Esc was used.
    else if (event.key === 'Escape' && menuOpen) { event.preventDefault(); setMenuOpen(false); }
  };

  const showEmptyState = selectable.length === 0 && emptyState != null;
  // Never open an empty bordered box: a caller without `emptyState` gets no menu when nothing matches.
  const showMenu = menuOpen && query.trim().length > 0 && (items.length > 0 || showEmptyState);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        id={id}
        className={`${FIELD_CLASS} pl-10`}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showMenu}
        aria-controls={`${listId}-list`}
        aria-activedescendant={highlight >= 0 ? `${listId}-opt-${highlight}` : undefined}
        value={query}
        onChange={(event) => { onQueryChange(event.target.value); setMenuOpen(true); }}
        onFocus={() => { cancelBlurClose(); setMenuOpen(true); }}
        onBlur={() => {
          cancelBlurClose();
          blurTimer.current = setTimeout(() => setMenuOpen(false), BLUR_CLOSE_DELAY_MS);
        }}
        onKeyDown={onKeyDown}
      />
      {showMenu && (
        <div id={`${listId}-list`} role="listbox" className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 max-h-[300px] overflow-auto rounded-lg border border-slate-200 bg-white shadow-[shadow:var(--shadow-2)]">
          {showEmptyState ? emptyState : null}
          {items.length > 0 && (
            <>
              {items.map((item, index) => {
                const disabled = isDisabled(item);
                const highlighted = index === highlight;
                return (
                  <div
                    key={getKey(item)}
                    id={`${listId}-opt-${index}`}
                    role="option"
                    aria-selected={highlighted}
                    aria-disabled={disabled}
                    onMouseDown={(event) => { event.preventDefault(); choose(item); }}
                    onMouseEnter={() => { if (!disabled) setHighlight(index); }}
                    className={`flex items-center gap-3 border-t border-slate-100 px-3 py-2.5 first:border-t-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${highlighted ? 'bg-[var(--color-primary-50)]' : ''}`}
                  >
                    {renderOption(item, { highlighted, disabled })}
                  </div>
                );
              })}
              {footer?.(items)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
