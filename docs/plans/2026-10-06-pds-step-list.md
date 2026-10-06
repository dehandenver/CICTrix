---
title: PDS step list shows the fill-in sequence
date: 2026-10-06
status: Done
summary: Replace the wrapping PDS pill tabs with a numbered vertical step list (compact progress strip on mobile) so employees see the order to fill the Personal Data Sheet.
---

## Goal

In the employee portal's Personal Data Sheet, the nine section tabs render as
wrapping pills with no sense of order. Show the sequence (I–VIII, then
Background Information) and which sections are already saved, without gating
navigation: every section stays clickable.

Design decision: `docs/mockups/2026-10-06-pds-step-list.html` (option D,
collapsing to option C below 1024px).

## Approach

A presentational `PdsStepList` component renders the steps; the PDS section
owns the state and passes it in. No new data access.

**Checkmark rule.** A section is "saved" when it had saved data at load, or
when its save succeeds this session. An empty save counts, so optional
sections (e.g. Voluntary Work) can be marked done. Unsaved edits don't count.

## Steps

1. **`src/modules/employee/PdsStepList.tsx` + `PdsStepList.test.tsx`** (new).
   Interface:
   ```ts
   export interface PdsStep<Id extends string = string> { id: Id; label: string; numeral: string }
   export interface PdsStepListProps<Id extends string = string> {
     steps: PdsStep<Id>[];
     activeId: Id;
     savedIds: ReadonlySet<Id>;
     onSelect: (id: Id) => void;
   }
   export function PdsStepList<Id extends string>(props: PdsStepListProps<Id>): JSX.Element
   ```
   - ≥1024px: vertical list (230px, sticky) per the mockup. Each step is a
     `<button>` inside `<nav aria-label="PDS sections">` / `<ol>`;
     `aria-current="step"` on the active one. Saved = green ✓ dot, current =
     blue dot + `#EEF0FF` row, upcoming = outlined dot. Connector line between
     dots, green below saved steps.
   - <1024px: compact strip: "Step N of 9" + "K saved", 9-segment bar,
     prev / current / next buttons, and a native `<select>` labelled
     "Jump to section".
   - Colors from `src/styles/abyan-tokens.css` variables; Poppins; visible
     2px `--color-primary` focus ring; transitions ≤200ms and none under
     reduced motion.
   - Tests: renders all steps with numerals; `aria-current` on active;
     saved steps show ✓ and an accessible "saved" label; clicking a step and
     changing the select call `onSelect`; prev/next disabled at the ends.
2. **`src/modules/employee/PersonalDataSheetSection.tsx`**.
   - Add `numeral` to `SUB_TABS` (I…VIII, IX for Background Information).
   - Replace the pill bar with `PdsStepList`, laid out as a two-column flex
     (step list left, section content right) at ≥1024px, stacked below.
   - `savedIds` state: seed from `profile` scalars and from the list fetch
     results (non-empty → saved); add the section's id after each successful
     save handler. Keep `TabNavBar` and `SaveBar` unchanged.
3. Run `npx tsc --noEmit`, `npm run lint`, `npm test`; check the page at
   375 / 768 / 1280px in the browser pane.
4. Opus review via `/code-review` on the branch; fix confirmed findings.

## Risks

- Seeding "saved" for scalar-only sections (Personal, Family, Other Info,
  Background) needs a judgement on which fields count; use a small set of
  required-looking fields (e.g. surname + first name for Personal) and keep
  the predicate in one helper so it's easy to adjust.
- The employee page already has the sidebar rail; the 230px list plus the
  form must still fit at 1024px.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- Browser check at mobile, tablet, desktop widths.
