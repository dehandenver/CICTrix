# combobox

A search input with a pick list, following the WAI-ARIA combobox pattern and the DESIGN_IDENTITY §9.3 input and menu styles. It was extracted from the Open Vacant Job Position dialog in `JobVacanciesPanel`.

Plan: `docs/plans/2026-11-14-shared-combobox.md`.

## Public interface

```tsx
import { Combobox } from '../components/combobox';

<label htmlFor="position-q">Job position</label>
<Combobox<PositionMatch>
  id="position-q"
  inputRef={inputRef}
  placeholder="Search by title or plantilla number"
  query={query}
  onQueryChange={setQuery}
  items={results}
  getKey={(m) => m.job.id}
  isDisabled={(m) => m.eligibility !== 'available'}
  onSelect={(m) => { setPicked(m.job); setQuery(''); }}
  renderOption={(m, { disabled }) => <span>{m.job.title}</span>}
  emptyState={<p>No matching job position found.</p>}
  footer={(items) => <p>{items.length} matches</p>}
/>
```

`Combobox` owns whether the menu is open, the highlighted option, keyboard handling and the ARIA attributes. The caller owns the query, the filtering, what a pick does, and how each option looks.

- The menu opens once the query has text.
- Up and Down move between enabled options and wrap. Enter picks the highlighted option. Esc closes the menu and calls `preventDefault`, so a surrounding `Modal` stays open.
- The highlight resets to the first enabled option when the query changes.
- Disabled options are listed with `aria-disabled` and can't be picked or highlighted.
- `emptyState` shows when no option can be picked. `footer` shows under the options when there is at least one.

## Not handled

- Filtering or fuzzy matching. Pass the already-filtered `items`.
- Free-text values. A value is only set through `onSelect`.
- Multi-select or chips.
- Showing the selected value. The caller renders its own selected state, as the vacancy dialog does with its "Change" card.

## Dependencies

React and `lucide-react` (the `Search` icon). Styles use the tokens in `src/styles/abyan-tokens.css`.
