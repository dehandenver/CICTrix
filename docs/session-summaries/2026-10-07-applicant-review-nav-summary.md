---
title: Next/previous navigation in RSP applicant review — summary
date: 2026-10-07
plan: docs/plans/2026-10-07-applicant-review-nav.md
---

## Shipped vs. planned

All five steps shipped as planned.

| Change | File |
|---|---|
| Review queue type, `reviewOutcome`, `nextUndecidedIndex` (+ 6 tests) | `src/lib/applicantReviewQueue.ts` |
| Delayed-save store with Undo window, written on timeout, next decision, leaving the page, or `pagehide` | `src/lib/pendingStatusDecision.ts` |
| ‹ N / total ›, progress dots (≤30), advance to next undecided, Undo toast, "All N reviewed" card; page keyed per applicant | `src/modules/interviewer/ApplicantDetailsPage.tsx` |
| Applications and Shortlisted tables pass their sorted rows as `navQueue` | `src/components/ApplicationsListPage.tsx` |
| Job Posts > Applicants passes the visible cards as `navQueue` | `src/components/JobPostingsPage.tsx` |

## Deviations

- Undo cancels a decision that has not been written yet instead of reversing a
  saved one, because Disqualify is final and visible to the applicant.
- Without a `navQueue` (direct link, other entry points) Shortlist still
  returns to the previous page as before.

## Checks run

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 236 passed, including 6 new queue tests.
- `npm run build`: built (existing chunk-size warning only).
- Local dev server in mock mode, Applications entry: counter 1 / 3 → 2 / 3
  after Disqualify, red dot for the decided applicant, toast "… marked
  Disqualified · 2 pending left"; Undo from applicant 2 returned to applicant 1
  at 1 / 3 with nothing saved; last decision showed "All 3 reviewed · 0
  shortlisted · 3 disqualified" and Undo there cleared it.
- Not run locally: the Job Posts entry, because job posts load only from live
  Supabase. Shortlist was not clicked because it stays locked until documents
  are approved; it goes through the same path as Disqualify.

## Known limits

- Closing the tab inside the 6-second window relies on a best-effort write on
  `pagehide`.
- The Disqualify dialog still says the action cannot be undone; true once the
  6-second window closes.
