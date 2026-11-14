---
title: Move the PM portal onto the shared Modal and action feedback (summary)
date: 2026-11-14
plan: docs/plans/2026-11-14-pm-modals-and-feedback.md
---

## What shipped

Commit `efa5088` on `feat/pm-modals-feedback`.

- **Modals:**
  - OfficeTrainingCourses: Remove employee is now a destructive `ConfirmModal` with the reason field; Training details is a `Modal`.
  - PMIPCRManagement: IPCR Weighting and Rating Scale are xl `Modal`s with their headings in the gradient header; the Open/Close Phase confirmation is a `ConfirmModal`.
  - PMCompetencyFramework: the delete confirmation is a `ConfirmModal`.
  - PMPromotionalApplications: the new-application dialog has a header title.
- **Feedback:**
  - Evaluation cycle save and delete run through `useAsyncAction`: spinner on the button, success toast, inline failure in the dialog, toast for delete.
  - Missing cycle fields, missing training-request fields and a missing override justification show inline as `ActionFeedback` warnings.
  - Office training add, remove and send-back show success and failure toasts, with failures worded by `describeActionFailure`.
  - Phase open and close results and warnings are toasts.
  - The Phase 2 "score every indicator" check uses the sheet's existing inline notice.

## Deviations from the plan

- 11 `alert()` calls and 2 overlays remain in PMDashboard code that nothing opens: Request Document, Bulk Request and document review. Left alone, as Phase 2 did for unreachable RSP modals.
- One commit instead of two, since several files carry both changes.
- The parent plans got their status checks after rebasing onto `main` (PR #100 merged).

## Checks run

- `npx tsc --noEmit`: clean.
- `npx eslint` on the 9 touched files with `--max-warnings 0`: clean.
- `npx vitest run src/modules/admin src/components`: 298 files, 1,310 tests pass.
- No `fixed inset-0` left in PMIPCRManagement or OfficeTrainingCourses. No `alert(` left in any reachable PM code.
- **Not checked in a browser.** The local app loads, but the PM portal needs a sign-in to the hosted Supabase project, which was not done. The header colour, Esc and focus return rely on the shared `Modal`'s own tests.
- DESIGN_IDENTITY §16: popups use the shared `Modal`/`ConfirmModal` (§9.10), and destructive confirmations use the destructive tone. Mobile and tablet widths were not checked in a browser.

## Code review 2026-11-14

A reviewer checked `9317e17..36100a4` and found nothing Critical. It confirmed the hook order, the dismissal block while loading, that the PMDashboard request and review modals can't be opened, and that removing the panel headings is safe. It found two Important issues, both now fixed:

- **A Remove failure was invisible.** Toasts sit at z-index 600 and the Modal overlay at 1000, so a toast fired while the Remove dialog stayed open was hidden. The error now shows inside the dialog with Try again. The same layering affects any toast fired while a Modal is open, in every portal; raising `.afb-viewport` above 1000 would fix that globally and is left as a separate decision.
- **Phase change retry left the page stale.** The failure toast's Try again ran after the dialog closed, without reloading the phase state. The toast has no retry now (`canRetry: false`); the user reopens the confirmation instead.

Not addressed:

- No tests were added. The most useful ones would cover the Remove failure inside the dialog, a phase change that fails still reloading, and inline cycle validation.
- Minor items left as they were: indentation in the Training details body, `confirm()` before deleting a cycle, the shared `busySession` spinner, and the duplicated `reportFailure` helper.

Checks after the fixes: `npx tsc --noEmit` clean, eslint clean on both files, and `npx vitest run src/modules/admin/pm` passes 45 files and 171 tests.
