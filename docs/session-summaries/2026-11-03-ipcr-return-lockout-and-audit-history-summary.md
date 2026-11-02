---
title: IPCR return lockout fix and audit history tab
date: 2026-11-03
summary: A returned Phase 1 IPCR is now editable and resubmittable, and each phase of the Office Account console has a History tab over the existing audit log. Type-check, lint and 1,340 src tests pass. The new screen was not checked in a browser.
---

## What shipped

Implements [the plan](../plans/2026-11-03-ipcr-return-lockout-and-audit-history.md) on branch `fix/ipcr-return-lockout-and-audit-history`, cut from `origin/main`. Four commits after the plan. Not pushed.

**Lockout fix (`6565a83`).** Cause: `returnForRevision` updated only `target_settings`, while the employee page also read `ipcr_workspace.status = 'Targets Submitted'` as pending, so a returned IPCR stayed read-only and Phase 2 never opened.
- `EmployeePage.tsx`: a returned record is no longer pending, and `isTargetWindowOpen` lets it ignore a closed Phase 1 window. The closed-window banners are hidden for it.
- `ipcrTargets.ts`: the submit guard skips the window check for a returned record. `statusForSave` keeps a returned record returned on Save Draft.
- `ipcrApproval.ts`: a return resets the employee's `Targets Submitted` workspace row to `Draft Targets`, best-effort.
- No data migration. Employees already stuck are freed by the page change.

**Audit write side (`8fdf0cb`).** New `src/lib/api/ipcrAudit.ts` holds the one audit writer. The Phase 1 submit and resubmit are logged (`Resubmitted after revision` when it follows a return). Approve, return, edit, Phase 2 return, rating and ratings-edit report `auditFailed`, and the reviewer's banner adds "Saved, but the history entry could not be recorded." The action is never undone.

**History read side and screen (`e99764d`, `3e15b8f`).** `listAuditHistory({ phase, scope })` returns one phase's entries newest first, limited to the reviewer's office, with employee and reviewer names. `IpcrHistory.tsx` is a History subtab in Phase 1 and Phase 2: search, an action filter, a page-size menu, the shared table, §10 status badges and the §9.6 pager.

## Deviations from the plan

- **Branch base.** The plan said to cut from the current branch. That branch carried 27 unrelated promotion commits, so I cut from `origin/main` and removed the upstream so the branch cannot push to `main` by accident.
- **Added: Save Draft keeps a returned record returned.** Found while writing the tests. Without it, a draft save demoted the record to `draft` and re-locked the employee once the window closed.
- **Dropped: a `submit_phase2` write.** The employee's Phase 2 self-rating submit was already logged as `rate` with role `employee`. History labels it "Self-rating submitted". Draft and partial saves are logged too, so they are named once in `ipcrAudit.ts` and hidden from History.
- **Code fix after a test failure.** `saveTargetSetting` read `current.status` after the final update. It now captures `wasReturned` first.

## Checks

- `npx tsc --noEmit`: passed.
- `npm run lint` (zero warnings): passed.
- `npx vitest run --dir src`: 152 files, 1,340 tests passed. The Part 1 tests failed before the fix (8 failures) and pass after it. `npm test` without `--dir src` also picks up the nested worktree folders.
- New tests: `ipcrApproval.test.ts`, `ipcrAudit.test.ts`, `ipcrAudit.history.test.ts`, `ipcrRatings.audit.test.ts`, `ipcrTargets.submit.test.ts`, plus cases added to `ipcrTargets.test.ts` and `EmployeePage.ipcr.test.tsx`, and `IpcrHistory.test.tsx`.

## Not verified

- **No browser check** of the History tab or the employee page, and not at mobile, tablet and desktop widths. The DESIGN_IDENTITY §16 visual items are unchecked. The tests mock the data layer.
- **No live data.** How many employees are stuck, and what the real audit log holds, were not checked. `npm run build` was not run.
- **Office scope.** A console user with no office role gets no scope, so History shows every office, the same as the pending list does today. A user with an office role sees only their office. The log has no row-level security, so this filter is the only barrier.
- **Row cap.** The reader takes the newest 1,000 entries for a phase before the office filter, so an office's older entries could be missing if other offices dominate.
- Entries from before this change have no employee-submit events, so older history starts at the first reviewer action.
