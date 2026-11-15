---
title: Make token shadow classes render a real box-shadow
date: 2026-11-14
status: Done
summary: All seven shadow-[var(--token)] classes now use the shadow-[shadow:var(--token)] hint, so the elevations and focus rings render. Nothing pushed yet.
---

# Make token shadow classes render a real box-shadow

## What shipped vs. planned

Followed [the plan](../plans/2026-11-14-tailwind-shadow-tokens.md) on `fix/tailwind-shadow-tokens`, rebased onto `upstream/main` at `52a474f`.

Converted all seven occurrences to the `shadow:` hint form, keeping the `focus:` prefixes:

- `src/components/modal/_internal/Modal.tsx:80`: `--shadow-3`
- `src/components/SalaryGradesPage.tsx:435`: `--shadow-3`
- `src/components/ScheduleApplicantsModal.tsx:18`: `focus:` `--ring-input`
- `src/modules/admin/pm/IpcrHistory.tsx:78`: `focus:` `--ring-input`
- `src/modules/admin/rsp-archives/_internal/RspArchives.tsx:234`, `:277`: `--shadow-2`; `:428`: `--shadow-3`

`git grep -nE 'shadow-\[var\(' -- src` now returns nothing.

## Checks run

- Standalone Tailwind compile of the three new class forms: each emits `--tw-shadow: var(--token)` and a `box-shadow` declaration.
- Dev server (`vite`, port 5174): the served `globals.css` has the three rules with `box-shadow`, and no old-form rules. In the browser, a test element with `shadow-[shadow:var(--shadow-3)]` computed `rgba(16, 30, 41, 0.16) 0px 12px 32px 0px`, and one with the old form computed `none`.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npx vitest run --dir src` after the rebase: 170 files, 1,608 tests passed.

## Deviations and limits

- The brief listed six occurrences. Searching again found a seventh, `IpcrHistory.tsx:78`, which was approved for inclusion.
- I branched from `origin/main` (`cd71e17`) and then rebased onto `upstream/main`, the PR target, which was ahead and includes the shared Combobox. `upstream/main` had the same seven occurrences and no others.
- The `Modal` itself was not opened in the running app. The worktree has no `.env`, so the app stops at the Supabase credential check before it renders. Instead, I checked the served CSS and the computed style of a test element.
