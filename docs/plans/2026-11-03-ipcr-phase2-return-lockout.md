---
title: Keep a returned Phase 2 rating sheet editable
date: 2026-11-03
status: Approved
summary: A Phase 2 sheet returned for revision stays editable and submittable after the rating window closes, and closing the period no longer locks it. Adds a phase2_returned_at marker and a pending-only guard on the return.
---

## Goal

When a reviewer returns an employee's Phase 2 rating sheet, the employee can always edit and resubmit it, even if the rating window has closed or the office has closed the self-rating period. The employee sees a "Returned for revision" banner whether or not the reviewer left a comment. A return only acts on a sheet that is still waiting for review.

This follows the Phase 1 fix in [2026-11-03-ipcr-return-lockout-and-audit-history.md](2026-11-03-ipcr-return-lockout-and-audit-history.md) and does not supersede it.

## Approach

Root cause: `returnPhase2ForRevision` (src/lib/api/ipcrRatings.ts) sets `phase2_status = 'in_progress'`, which looks the same as an unfinished sheet. Two locks then catch it:
- `EmployeePhase2.tsx` makes the sheet read-only, and blocks submit, whenever `phaseOpen === false`.
- `closeSelfRatingPeriod` switches every `open` or `in_progress` sheet to `closed`, and `saveEmployeeRatings` refuses saves on `closed`.

The fix adds a nullable `target_settings.phase2_returned_at timestamptz`. The return sets it, and the employee's submit clears it along with `review_comment`. The status stays `in_progress`, so the existing `phase2_status` readers don't change. A comment can't serve as the marker because the Return button doesn't require one. A new `returned` status value was rejected because every `open`/`in_progress` check would need updating.

The return gets the Phase 1 zero-row guard. It only updates a row where `phase2_status = 'completed'` and `phase2_approved_at is null`. If no row changes, it returns `NO_LONGER_PENDING` (src/lib/api/ipcrApproval.ts) without writing an audit row or sending a notification.

Live data on 2026-11-03 has no Phase 2 sheets in `in_progress`, so no one is stuck and no data fix is needed.

## Steps

1. Migration created with `npx supabase migration new phase2_returned_at`, adding the column. It is applied by the PR merge, not by hand.
2. `returnPhase2ForRevision` sets the marker and guards on pending sheets. Tests first.
3. `closeSelfRatingPeriod` skips rows with `phase2_returned_at` set.
4. `saveEmployeeRatings` clears `phase2_returned_at` and `review_comment` on submit. A draft save keeps them.
5. `loadEmployeeRatingSheet` selects `phase2_returned_at` and exposes `returnedAt: string | null` on `EmployeeRatingSheet`.
6. `EmployeePhase2.tsx` treats `status === 'in_progress' && returnedAt` as returned. Returned sheets ignore `phaseOpen === false` for editing and submit, and the banner shows on the marker, with the comment only if there is one.
7. Confirm that EmployeePage still renders the Phase 2 sheet with the window closed. Change it only if a test shows a problem.

## Risks

- **Deploy order.** The front end selects the new column. If Vercel deploys before the migration applies, the sheet load fails. Merge only after the Supabase Preview check passes, and check a rating sheet right after the deploy.
- **Missing selects.** A select list that misses `phase2_returned_at` would hide the marker. The tests cover the employee sheet load.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run --dir src`
- `npm run check:migrations`
- A browser check with the network stubbed: a returned sheet with the window closed is editable and shows the banner.
