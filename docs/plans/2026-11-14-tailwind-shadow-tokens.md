---
title: Make token shadow classes render a real box-shadow
date: 2026-11-14
status: Done
summary: Seven Tailwind classes write shadow-[var(--token)], which Tailwind 3.4.17 compiles to a shadow colour, so no shadow renders. Switch them to the shadow-[shadow:var(--token)] hint form.
---

## Goal

Every element that asks for a token shadow (`--shadow-2`, `--shadow-3`, `--ring-input`) actually renders it. The visible change: the shared `Modal` panel, the Salary Grades drawer, the RSP Archives filter popover, sort menu and toast gain their elevation, and two inputs gain their focus ring.

## Approach

Tailwind 3.4.17 cannot infer the type of `var(...)` in an arbitrary value, and for `shadow-[...]` it falls back to `--tw-shadow-color: var(--token)`. The explicit `shadow:` hint, `shadow-[shadow:var(--token)]`, makes it emit `--tw-shadow: var(--token)` and a real `box-shadow`. The new shared Combobox already uses this form.

Occurrences (from `grep -rnE 'shadow-\[var\(' src`):

- `src/components/modal/_internal/Modal.tsx:80` — `shadow-[var(--shadow-3)]`
- `src/components/SalaryGradesPage.tsx:435` — `shadow-[var(--shadow-3)]`
- `src/components/ScheduleApplicantsModal.tsx:18` — `focus:shadow-[var(--ring-input)]`
- `src/modules/admin/pm/IpcrHistory.tsx:78` — `focus:shadow-[var(--ring-input)]` (not in the original list; found by the re-grep)
- `src/modules/admin/rsp-archives/_internal/RspArchives.tsx:234`, `:277` — `shadow-[var(--shadow-2)]`
- `src/modules/admin/rsp-archives/_internal/RspArchives.tsx:428` — `shadow-[var(--shadow-3)]`

## Steps

1. Replace each class with the `shadow:` hint form, keeping any `focus:` prefix. End state: the grep returns nothing.
2. Compile a sample through PostCSS + Tailwind and confirm the output contains `box-shadow`.
3. Check the shared `Modal` in the dev server and confirm its computed `box-shadow` is `--shadow-3`. Deviation: the worktree has no `.env`, so the app stops at the Supabase credential check and the `Modal` could not be opened. Checked the dev server's served CSS and a test element's computed `box-shadow` instead.

## Risks

- Elements that silently had no shadow now have one. That is the intended design, but it is a visible change. No surface was opened in a running app (see Step 3), so the new shadows on the `Modal`, popovers and focus rings are verified in compiled CSS, not seen on screen.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run --dir src` (not bare `npm test`, which also collects `.worktrees/` copies)
- Compiled CSS check for `shadow-[shadow:var(--shadow-3)]` and `focus:shadow-[shadow:var(--ring-input)]`
- DESIGN_IDENTITY.md §16: shadows come from tokens (§5.3)
