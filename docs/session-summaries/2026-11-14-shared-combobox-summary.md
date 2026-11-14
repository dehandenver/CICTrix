# Shared Combobox extraction

Plan: `docs/plans/2026-11-14-shared-combobox.md`.

## Shipped

- New module `src/components/combobox/` (`index.ts`, `README.md`, `_internal/Combobox.tsx`, `_internal/Combobox.test.tsx`). `Combobox<T>` owns whether the menu is open, the highlighted option, keyboard handling, closing on blur, and the ARIA wiring. The caller owns the query, the filtering, what a pick does, how each option renders, the empty state and the footer.
- `OpenVacancyDialog` in `src/components/JobVacanciesPanel.tsx` now uses it. Its markup, classes, copy and keyboard behavior are unchanged. The file drops about 40 lines.
- As planned, `SearchableEmployeeCombobox`, the PM competency search and `CompetencyTagInput` were not touched.

## Deviations

None from the plan. The blur delay (120ms) is now a named constant.

## Checks run

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed (zero warnings).
- `npx vitest run --dir src`: 132 files, 1185 tests passed. This includes 7 new `Combobox` tests (opening only with a query, `aria-activedescendant`, arrow keys skipping disabled options and wrapping, Enter, mouse picks ignoring disabled options, Esc calling `preventDefault`, the empty state) and the unchanged `JobVacanciesPanel.test.tsx`.
- `npm test` with no path also collects tests from the copies under `.worktrees/` and `.claude/worktrees/`, so it runs for over 10 minutes. Scoping it to `src` avoids that.
- Dev server: the public page loads with no console or server errors. The Open Vacant Job Position dialog itself was **not** checked in the browser, because it sits behind the RSP admin sign-in to the hosted Supabase project.

## Manual check

Sign in to the RSP portal, go to Job Vacancies, then Open Vacant Job Position. Type part of a title, then use the arrow keys (open positions are skipped), Enter, Esc (the menu closes but the modal stays open), a mouse pick, and a search with no results that shows the Create Job Position link.
