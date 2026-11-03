---
title: Keep a returned Phase 2 rating sheet editable
date: 2026-11-03
summary: A Phase 2 sheet returned for revision now stays editable and submittable after the rating window closes, and closing the period skips it. Type-check, lint, the migration check and 1,483 src tests pass. Not checked in a browser.
---

## What shipped

Implements [the plan](../plans/2026-11-03-ipcr-phase2-return-lockout.md) on branch `fix/ipcr-phase2-return-lockout`, cut from `upstream/main`. Not pushed.

- **Migration `20261103105541_phase2_returned_at`** adds a nullable `target_settings.phase2_returned_at`. It is applied by the PR merge, not by hand.
- **`returnPhase2ForRevision`** sets the marker and only updates a sheet with `phase2_status = 'completed'` and `phase2_approved_at is null`. When no row changes, it returns `NO_LONGER_PENDING` (now exported from `ipcrApproval.ts`) and writes no audit row, stage or notification.
- **`closeSelfRatingPeriod`** skips rows with the marker set.
- **`saveEmployeeRatings`** clears the marker and `review_comment` on submit. A draft save leaves them.
- **`loadEmployeeRatingSheet`** exposes `returnedAt` on `EmployeeRatingSheet`.
- **`EmployeePhase2.tsx`** treats `in_progress` with `returnedAt` as returned. A returned sheet ignores the closed window for editing and submit, the "not yet open" banner is hidden for it, and the revision banner shows with or without a comment.

## Deviations from the plan

- **The deploy-order risk is smaller than planned.** The employee sheet load selects `*`, so it can't fail on a missing column before the migration applies. It would read `returnedAt` as null, which matches today's behaviour. The return and the close do name the column, so they would error until the migration lands.
- **EmployeePage needed no change.** The Phase 2 tab is always clickable, and the auto-switch only runs while the window is open.
- **The existing `ipcrRatings.audit.test.ts` mock** gained `is`, `select` and a changed-row result, because the return now checks how many rows it updated.

## Checks

- `npx tsc --noEmit`: passed.
- `npm run lint` (zero warnings): passed.
- `npm run check:migrations`: OK, 130 files.
- `npx vitest run --dir src`: 158 files, 1,483 tests passed.
- New tests (`ipcrRatings.return.test.ts`, plus cases in `EmployeePhase2.test.tsx`) failed before the change: 5 of 6 data-layer cases and 2 of 4 sheet cases. The other three already held and stay as guards.

## Not verified

- **No browser check.** The sheet's behaviour is covered by component tests that render the real `EmployeePhase2` in jsdom, but not in a running app.
- **No end-to-end write against a database.** Live data has no Phase 2 sheets in `in_progress` today, so no one is stuck.
- **The migration has not run anywhere yet.** The Supabase Preview check on the PR will be the first run.
