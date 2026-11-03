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

## Follow-up verification (same day)

**Browser, real app with the network fully stubbed.** The harness replaced every Supabase request and the realtime socket, so nothing reached the live project. The stub recorded zero writes. The harness files were deleted.
- **Employee page.** A returned IPCR whose workspace row still said `Targets Submitted`, with the Phase 1 window closed, showed only "Needs Revision", the supervisor's comment, an editable MFO field, and Save Draft and Submit. The same data as a plain draft showed the closed banner and a locked form, so the window really was closed and only the returned record bypassed it.
- **Console.** `/office/dashboard` shows the History subtab in Phase 1 and in Phase 2. Phase 1 listed the entries with badges. Phase 2 listed four entries, labelled "Self-rating submitted", "Ratings approved", "Returned for revision" and "Ratings edited", with only Phase 2 actions.
- **Layout.** History checked at desktop, tablet (768px) and phone (375px) widths, and the loading skeleton matched the column layout. The two faults found earlier were fixed.

**Live database, read-only `SELECT`s.**
- Exactly one IPCR is returned for revision, and its workspace row is stuck at `Targets Submitted`. That employee is affected by this bug today and is freed once this deploys.
- `ipcr_audit_log` holds 34 rows from Oct 28 to 29: 12 `approve`, 2 `return`, 11 employee `rate`, 9 reviewer `rate`. There are no `submit` or `admin_edit` rows, which fits nothing having logged them before.
- The browser key can read the log (row-level security is off and `SELECT` is granted), so History will show those rows.
- Not in scope, but worth a decision: the migration revoked `UPDATE` and `DELETE` on the log, yet `anon` and `authenticated` still hold `INSERT`, `TRUNCATE`, `TRIGGER` and `REFERENCES`. With row-level security off, anyone holding the public key can insert forged audit rows. The log is only append-only for updates and deletes.

## Not verified

- **`npm run build` fails on this machine, on `origin/main` as well as on this branch.** esbuild cannot delete its temp file (`Access is denied`), including with the temp folder redirected and outside the sandbox. `tsc` passes and all 3,147 modules transform, so this is an environment fault, not a code error. A build on another machine or in CI is still needed.
- **The branch is 7 commits ahead and 32 behind `origin/main`, and a merge conflicts** in `docs/plans/index.html` (generated, so regenerate it) and `EmployeePage.ipcr.test.tsx` (upstream's row-alignment commit `7e34f31` added tests to the same file). `EmployeePage.tsx` merges cleanly. The branch has not been merged or tested against current `main`.
- **The real sign-in, and any write.** Approve, return and resubmit were not run end to end against a database. The tests cover those writes with mocks.
- **Office scope.** The console refuses a user with no office role, so History is always scoped. The only unscoped case is an office role whose `officeId` and `officeName` are both empty. The log has no row-level security, so the office filter is the only barrier. (An earlier version of this note wrongly said a user with no role saw every office.)
- **Row cap.** History returns an office's newest 1,000 entries per phase. The cap now applies after the office filter, so another office's rows cannot crowd it out.
- Entries from before this change have no employee-submit events, so older history starts at the first reviewer action.

## Code review (Opus, medium effort)

An independent review of the seven commits found no Critical issues and rated the branch "ready with fixes". Each finding was checked against the code or the live API before acting. All were real; five were fixed and two deferred.

**Fixed, each with a test that failed first:**
- **History at scale.** The reader took the newest 1,000 rows across all offices, then filtered, so other offices' rows and Phase 2 draft saves could hide an office's real entries. The office is now resolved first (employees, then their target settings, then log rows for those settings), and drafts are dropped in the query. Separately, a lookup list of about 800 ids makes the API reject the request (HTTP 400, measured live), so every lookup is now split into chunks of 100.
- **A return that changed nothing.** `returnForRevision` and `approveTargets` did not check how many rows they updated. If another reviewer had already acted, they still logged an audit row (a phantom History entry), notified the employee and, for a return, reset the workspace row. Both now report "This IPCR is no longer pending approval" and do nothing else.
- **The workspace reset reached too far.** It reset every `Targets Submitted` row for the employee, and live data shows all 13 workspace rows sit at that status, including completed periods. It now resets only the row the employee page reads. The review suggested matching on the cycle title, which would have missed the live row labelled `Jul-Dec 2026`.
- **A returned record with no saved MFOs** could be rebuilt from the old workspace text and shown as pending again. It now keeps its returned status.
- **Two cosmetic faults:** a missing space in `current &&(`, and a hard-coded focus colour in History, now `--ring-input`.

**Deferred:**
- The action filter labels every `rate` as "Rated", so a reviewer cannot filter to approvals only. It would need a second filter on the actor's role.
- Row-level security on `ipcr_audit_log`. History now presents the log as an office's record, which makes the open `INSERT` grant more serious. It needs its own change (a policy, or inserts through a function).

