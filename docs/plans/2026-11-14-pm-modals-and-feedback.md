---
title: Move the PM portal onto the shared Modal and action feedback
date: 2026-11-14
status: Done
summary: Finish standard-modal Phase 4 and loading-and-action-feedback Step 4 for the PM portal. Six hand-rolled overlays move to Modal or ConfirmModal, four untitled Dialogs get a header, and 27 alert() calls become inline form errors, toasts or useAsyncAction failures.
spec: docs/plans/2026-10-25-standard-modal.md (Phase 4) and docs/plans/2026-10-26-loading-and-action-feedback.md (Step 4, PM part)
---

## Goal

Every PM popup looks and behaves like the rest of the app (§9.10): gradient header, white title, Esc and overlay close, focus trap and return, and a body that scrolls inside the panel. No PM action uses the browser's `alert()` box. Form checks show inside the form, failures say what happened and what to do next, and successes show as a toast.

No PM-specific modal mockup exists. The two saved PM mockups (`2026-10-16-pm-dashboard.html`, `2026-10-25-pm-submission-rate-merged.html`) cover dashboard layout only. §9.10 sets the modal look, so no design question is open.

## Approach

Use the existing `src/components/modal` (`Modal`, `ConfirmModal`) and `src/components/action-feedback` (`useFeedback`, `useAsyncAction`, `ActionFeedback`). Follow the Phase 3 L&D pass (`2a45eb6`) and the RSP feedback pass (`f216229`). `FeedbackProvider` is already mounted in `App.tsx`.

| File | Overlays to Modal | Untitled Dialog | alert() |
|---|---|---|---|
| `src/modules/admin/PMDashboard.tsx` | Request document, Bulk request | 1 | 14 |
| `src/modules/admin/pm/PMIPCRManagement.tsx` | 2 | 1 | 3 |
| `src/modules/admin/pm/OfficeTrainingCourses.tsx` | Remove employee (ConfirmModal-style), Session detail | none | 5 |
| `src/modules/admin/pm/OfficeAccountConsole.tsx` | none | none | 4 |
| `src/modules/admin/pm/Phase2RatingPanel.tsx` | none | none | 1 |
| `src/modules/admin/pm/PMCompetencyFramework.tsx` | none | 1 | none |
| `src/modules/admin/pm/PMPromotionalApplications.tsx` | none | 1 | none |

How each `alert()` is replaced:

- **Form checks** become an inline `ActionFeedback` (warning) in the form or popup.
- **Failed saves** become `useAsyncAction`, or `describeActionFailure` plus a toast for row actions, so the message says what happened and what to do next.
- **Successes** become a success toast.
- **Warnings** become a warning toast.

## Steps

1. Modals: move the six overlays to `Modal`/`ConfirmModal` and title the four untitled `Dialog`s. Commit.
2. Feedback: replace the 27 `alert()` calls in the five files. Commit.
3. Checks below, then update the two parent plans (Phase 4 and Step 4 PM part done) and write the session summary.

## Risks

- Existing PM tests may assert on `window.alert` or on old overlay markup. Run the PM tests after each step and update assertions to the new behaviour, not the reverse.
- The legacy `globals.css` colours `h2` and `p` dark. `Modal` scopes this away, but the rendered header colour still has to be checked.
- Demo files under `pm/demo/` stay out of scope, as the parent plan excluded them.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run src/modules/admin` (PM and admin tests)
- No `alert(` and no `fixed inset-0` left in the seven files.
- DESIGN_IDENTITY.md §16 checklist for the touched popups.
- Browser: the PM popups render a white header title, Esc closes them and focus returns. Only if the dev server can reach a PM login; otherwise record that it was not checked.

## Status check 2026-11-14

Done in `efa5088`. Deviations:

- **Unreachable code left alone.** In PMDashboard, the Request Document and Bulk Document Request modals and the document-review preview are never opened: nothing calls `setShowRequestModal(true)`, `setShowBulkRequestModal(true)` or a non-null `setReviewingRequest`. Their 11 `alert()` calls and 2 overlays stay as they were. Phase 2 of the standard-modal plan left unreachable RSP modals the same way. Deleting them is a separate cleanup.
- **Untitled Dialogs:** the PMDashboard cycle dialog already had a title. The Open/Close Phase confirmation and the competency delete confirmation became `ConfirmModal`. The promotional application dialog got a title.
- **Panel headings:** `OfficeWeightingPanel` and `RatingScalePanel` lost their own heading, which moved into the modal header. Both are only rendered inside those modals.
- **One commit instead of two.** Several files carry both changes, so they landed together.
- **`window.confirm` stays** before deleting an evaluation cycle. It is not an overlay or an `alert()`, so it was out of scope.
- **Parent plans:** `2026-10-25-standard-modal.md` Phase 4 and the PM part of `2026-10-26-loading-and-action-feedback.md` Step 4 are covered here. Their status-check notes get updated after PR #100 merges, which edits the same files.
