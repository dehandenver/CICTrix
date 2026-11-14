---
title: Loading and outcome feedback for every async action
date: 2026-10-26
status: In Progress
summary: One feedback layer for the whole app, so every network action shows a pending state and ends with a message that says what happened, whether it completed, and what to do next; failed reads stop rendering as empty data.
---

## Goal

Any action that waits on the network — sign in, save, submit, approve, reject, hire, delete, send, upload, generate, copy — shows that it is working on the control the user pressed, ignores repeat clicks, and ends with a visible result. Success names what changed and what happens next. Failure names the action, says whether it completed, and gives the next step. A read that fails shows an error with Retry, never an empty table or a zero count.

This follows `DESIGN_IDENTITY.md` §9.1 (button loading), §9.5 (tables), §9.9 (alerts and toasts), §13 (accessibility), and does not change the visual system. No mockup is required because §9.9 already fixes the toast and inline-alert treatment.

## What the review found

- **No shared feedback layer.** `ErrorBanner` exists but is used on four product screens. Seven files render their own toast markup in different corners, colours and durations. `alert()` is called 51 times across 10 product files, blocking the page and losing the context of what the user was doing.
- **Failures are often silent.** 96 files call `console.error`/`console.warn`; most of those paths never reach the user. Several service functions return `[]` on a query error, so a failed fetch renders as “0 employees” or an empty table — the screen states something false.
- **Pending state is inconsistent.** `Button` has a correct loading state that keeps its label, but most action controls use raw `<button>` with no busy state. Several sign-in buttons replace their label with “Signing in…”, which §9.1 forbids. Some deletes and approvals have no visible in-flight state at all.
- **Success is under-reported.** Many mutations are confirmed only by the row changing, or not at all. Users cannot tell whether a hire, validation, send or schedule completed.
- **Read errors and action errors are conflated.** A failed action often looks like a failed load (or nothing), and the copy gives no next step beyond “try again”.

## Approach

### One feedback module

New module folder `src/components/action-feedback/` (entry `index.ts`, `README.md`, implementation in `_internal/`):

| Export | Purpose |
|---|---|
| `FeedbackProvider`, `useFeedback()` | App-wide queue. `notify.success/info/warning/error(...)`; success auto-dismisses after 5s, errors stay until dismissed; hovering or focusing pauses the timer. |
| `<ToastViewport />` | Fixed top-right stack, white card, elevation 3, 4px status accent, status icon, title, message, optional action (Retry / View), close button. `role="alert"` for errors, `role="status"` + `aria-live="polite"` for success. |
| `<ActionFeedback />` | Inline §9.9 alert for forms and dialogs: tone, title, what happened, whether it completed, next step, optional Retry and dismiss. |
| `useAsyncAction()` | Wraps one async mutation: `pending`, `failure`, `run()`, guards against re-entry, translates the raw error with `describeActionFailure`, and fires the success toast. |

`describeActionFailure(action, error, { context })` is added to `src/lib/friendlyErrors.ts`. It returns `{ title, message, nextStep }`:

- **Title:** `We couldn't <action>.`
- **Message:** what failed, in plain words, plus the completion state — “Nothing was saved.” for returned API errors; for network failures, “The request didn't reach the server, so we couldn't confirm it completed.”
- **Next step:** context-specific — retry, sign in again, check the record before retrying, or contact the administrator. Raw technical text stays in the console.

### Feedback placement

- **Inline** for a form, dialog or drawer whose action has a visible place to report: the notice sits next to the control, stays until the user fixes or dismisses it, and moves focus to itself on failure.
- **Toast** for row, list and background actions, and for success everywhere. One action reports once, never both inline and toast.
- **Page-level** `ErrorBanner` (upgraded with title, next step and Retry) when the screen itself could not load.

### Loading

- Every mutation control uses the shared `Button` `loading` prop or `.btn.is-loading` (label kept, spinner before it, `disabled`, `aria-busy`, width stable).
- A guard in `useAsyncAction` prevents double submission before the network call starts.
- Initial page loads use the existing `table-loading` primitives (`TableSkeletonRows`, `SkeletonList`, `Skeleton`, `LoadingStatus`) so layout does not jump; plain “Loading…” text is removed where a shape is known.
- Destructive confirmations keep the existing `Dialog` pattern and show progress on the confirm button.

### Read failures

For each screen in the sweep, the fetch path must be able to report failure. Where the service function already returns an error, the screen renders `ErrorBanner` with Retry. Where it returns `[]` on error, that function is changed to return the error (keeping its existing callers working) and the screen is updated. No schema changes.

### Decisions

| # | Decision |
|---|---|
| D1 | One `FeedbackProvider` at `App` root, outside the router. Components used outside it (tests, isolated renders) get a no-op context, so nothing throws. |
| D2 | Inline for forms/dialogs, toast for row/list/background actions. Never both for one action. |
| D3 | Every failure names the action and states its completion. No raw Postgres/Supabase text reaches the user. |
| D4 | Buttons keep their label while loading; no “Saving…”, “Signing in…”, “Submitting…” swaps. |
| D5 | Success auto-dismisses at 5s; errors persist until dismissed. Both pause on hover/focus. |
| D6 | A failed read shows an error with Retry, not an empty result. |
| D7 | `alert()` and `window.confirm()` are removed from product flows; the shared `Dialog` handles confirmations. |
| D8 | No schema, migration or auth changes. Service return shapes change only where a screen needs the error. |
| D9 | Demo (`modules/admin/pm/demo/*`), prototypes, and the mock Settings buttons (2FA/backup/SMTP) are out of scope; the audit records them as such. |

### Coverage

Sweep by portal, one commit each:

- **Auth and access:** admin/employee/interviewer login, set initial password, session expiry, logout, auth-init failure, Settings account forms.
- **Applicant:** wizard submit (per-application outcomes), document upload, status lookup, assessment prefill.
- **Employee:** IPCR save/submit, Phase 2 save, IDP, trainings and archive, account change.
- **Interviewer:** login, applicants list, applicant detail decisions (validate, resubmit, undecided), evaluation submit, edit details, delete.
- **RSP:** applications, qualified, for hiring, newly hired, credentials, pending assignment, rater management, job posts and close vacancy, salary grades, critical positions, succession, office directory, dashboard mutations.
- **L&D:** dashboard, courses, calendar, plan, seminar enrollment, training needs/evaluation, archive, IDP settings, competency framework, attendance.
- **PM:** dashboard, IPCR management, competency framework, promotional applications, office console/courses/weighting, Phase 2 panel, summary/semester ratings, archive, system administration, supervisor access.

## Steps

1. Build `action-feedback` and `describeActionFailure`; unit-test provider queue, error persistence, success auto-dismiss, pause, re-entry guard, and friendly copy. Mount the provider in `App` and replace `ErrorBanner` with the upgraded version. Verify with `tsc`, lint and tests.
2. Sweep auth, applicant, employee and interviewer flows. Fix the label swaps, add missing pending states, replace the remaining `alert()` calls, and add success/failure feedback to every mutation. Commit.
3. Sweep RSP mutations. Replace the ad-hoc toasts and the `alert()` calls in `NewlyHiredPage`; add feedback to hire/qualify/reject/validate/schedule/close-vacancy/credential paths. Commit.
4. Sweep L&D and PM mutations, including the 16 `alert()` calls in `PMIPCRManagement`, the 14 in `PMDashboard`, and the five in `OfficeTrainingCourses`/`OfficeAccountConsole`. Commit.
5. Read-failure pass for the primary lists and dashboards. Change the service functions that discard errors, add `ErrorBanner` + Retry, and remove the empty-as-error cases. Commit.
6. Write `docs/audits/2026-10-26-loading-error-feedback.md` with one row per product screen: action, pending state, success feedback, failure feedback, read-error state, status. Regenerate the plans index and write the session summary.

## Risks

- **About 60 files.** Mitigated by the shared module, portal-sized commits, and `tsc`/lint/test after each. Screens not reached in this pass stay listed as open in the audit.
- **Claiming too much on failure.** A network error can hide a write that did land. Copy therefore says “we couldn't confirm” for network failures and “nothing was saved” only when the API returned an error.
- **Toast overload.** Only one notice per action, and successes for row actions collapse to a short title. The queue caps at three visible.
- **Provider in tests.** Components rendered without the provider get a no-op; tests that assert notices must wrap in the provider.
- **Service contract changes.** Functions that switch from `[]` to an error result need every caller updated; the audit lists them, and `tsc` catches missed call sites.
- **Disabled states hide double submits but can strand a user.** The pending state always ends in `finally`, and a failure leaves the control enabled.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- `DESIGN_IDENTITY.md` §16 checklist on every touched surface.
- Browser pass at Fast 3G: sign in, save, submit, approve, delete, send, upload. Each shows a pending control, a success notice, then a forced failure (offline) with the action, completion state and next step.
- Reduced motion: no spinner or toast animation; the notice still appears.
- Screen reader: errors announced assertively, successes politely, focus moves to inline failures.
- Mobile width: toast stack does not cover the primary action or the header.

## Status check 2026-11-12

Still In Progress. Done: Step 1 (action-feedback module, `describeActionFailure`), Step 2 (auth, applicant, employee, interviewer) and Step 3 (RSP, `f216229`). Left: Step 4, the L&D and PM sweep (`alert()` remains in PMDashboard, PMIPCRManagement, OfficeTrainingCourses, OfficeAccountConsole, Phase2RatingPanel, AttendanceGrid, TrainingCalendar and ChangePositionModal); the rest of the Step 5 read-failure pass; Step 6, where the audit lives at `docs/ux-feedback-audit.md`, not the planned `docs/audits/` path; and the final summary.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.

## Status check 2026-11-14

Step 4, PM part, is done in `ad157e3` (PMDashboard cycles, PMIPCRManagement, OfficeTrainingCourses, OfficeAccountConsole, Phase2RatingPanel); see `docs/plans/2026-11-14-pm-modals-and-feedback.md`. Still left in Step 4: the L&D sweep (`alert()` remains in AttendanceGrid, TrainingCalendar and ChangePositionModal), plus Steps 5 and 6.
