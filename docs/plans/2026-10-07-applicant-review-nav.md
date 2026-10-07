---
title: Next/previous navigation in RSP applicant review
date: 2026-10-07
status: Done
summary: Arrows, an N / total counter and progress dots on the RSP applicant details page; after Shortlist or Disqualify it moves to the next undecided applicant, with a 6-second Undo before the decision is saved. Opened from Job Posts > Applicants and from Applications.
---

## Goal

RSP reviews applicants one after another without returning to the list.
After shortlisting or disqualifying one applicant, the next undecided applicant
opens straight away.

## Approach

Mockup: `docs/mockups/2026-10-07-applicant-nav.html`, option C.

1. Both entry points (`JobPostingsPage` Applicants panel, and the Applications
   and Shortlisted tables in `ApplicationsListPage`) pass the rows they show,
   in their shown order, as `navQueue` in the route state.
2. `ApplicantDetailsPage` shows ‹ N / total › and status dots (up to 30
   applicants) in the breadcrumb row. A wrapper keyed on the applicant id
   remounts the page per applicant so no state leaks between them.
3. Confirming Shortlist or Disqualify moves to the next undecided applicant
   in the queue (wrapping round). Undecided means the status is not yet
   Shortlisted or later and not Disqualified/Not Selected. When none are left,
   an "All N reviewed" card offers a way back to the list.
4. Undo by delayed save (`src/lib/pendingStatusDecision.ts`). The decision is
   written 6 seconds after confirming. Undo inside that window cancels it and
   reopens the applicant. The pending decision is written straight away when
   another decision is made, when the user leaves the details page, or when
   the tab is hidden or closed.
5. Without a `navQueue` (direct link, other entry points) the page behaves
   as before.

Deviation from the mockup: Undo cancels a not-yet-saved decision rather than
reversing a saved one, because Disqualify is final (`is_final`) and writes an
applicant-visible activity log entry. User chose this on 2026-10-07.

## Risks

- Closing the tab within the 6-second window relies on a best-effort write
  on `pagehide`; the request can be cut off by the browser.
- The status shown in the list reflects the delayed write only after it lands.

## Checks to run

- `npx tsc --noEmit`, `npx vitest run`, `npm run build`
- Local dev server: both entry points, arrows, counter, Shortlist and
  Disqualify advance, Undo, end card.
- Vercel deployments for `abyan-hris-iloilo` and `cictrix-hr-demo` reach Ready.
