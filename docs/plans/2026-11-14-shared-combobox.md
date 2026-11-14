---
title: Extract a shared Combobox from JobVacanciesPanel
date: 2026-11-14
status: Done
summary: Move the search-and-pick behavior in the Open Vacancy dialog into a reusable src/components/combobox, with no visible change to the dialog.
---

## Goal

A shared `Combobox` component exists in `src/components/combobox/` and the Open Vacant Job Position dialog uses it. The dialog looks and behaves exactly as before: same input, menu, keyboard handling, empty state and footer. The other hand-rolled comboboxes (`SearchableEmployeeCombobox`, the PM competency search, `CompetencyTagInput`) are left as they are.

## Approach

`OpenVacancyDialog` in `src/components/JobVacanciesPanel.tsx` currently inlines a full ARIA combobox. The generic parts move into `Combobox<T>`:

- **Owned by `Combobox`:** whether the menu is open, the highlighted index, keyboard handling (Up/Down skip disabled options and wrap, Enter selects, Esc closes), closing on blur after a short delay, and the ARIA wiring (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `listbox`/`option` with `aria-selected` and `aria-disabled`). The input, menu and highlight styles follow DESIGN_IDENTITY §9.3.
- **Owned by the caller:** the search text (`query` / `onQueryChange`), what a pick does (`onSelect`), how each option renders (`renderOption`), the empty state shown when nothing can be picked (`emptyState`), and an optional status line (`footer`).

The menu only shows when the search text is non-empty, matching current behavior.

The module follows the `modal/` layout: `index.ts`, `README.md`, `_internal/`.

## Steps

1. Branch `refactor/shared-combobox` off `main` and save this plan.
2. Write `src/components/combobox/_internal/Combobox.tsx`, `index.ts`, `README.md`, and `Combobox.test.tsx` covering the keys, skipping disabled options, the empty state and mouse selection.
3. Switch `OpenVacancyDialog` to `Combobox`. `JobVacanciesPanel.test.tsx` passes without edits.
4. Run the checks below and click through the dialog in the dev server.
5. Commit and write the session summary.

## Risks

- The panel tests mostly check rendered output, so a small change in keyboard behavior could slip past them. The new `Combobox` tests check each key directly.
- The menu closes on a blur timer. If the timer were dropped, clicking an option would close the menu before the pick registers. Option clicks use `onMouseDown` with `preventDefault`, as they do today.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- Manual pass through RSP › Job Vacancies › Open Vacant Job Position in the dev server, plus the DESIGN_IDENTITY.md §16 checklist.
