---
title: Browser Back steps out one drill-down level; remove back-label links
date: 2026-10-07
status: Done
summary: Wire every in-page drill-down to useBackClosesView so browser Back closes one level instead of leaving the page, and remove the label-style "‹ Parent" / "Back to …" links from those views.
---

## Goal

When a user drills into an in-page view (a folder, an office, a position, an
archive sub-view, a detail panel), the browser's Back button returns to the
view they were just on, one level at a time. It never jumps to the portal
home. The text back links ("‹ Applicant Score › Project Manager",
"Back to Offices", …) are removed; the page title and subtitle stay.

## Approach

- Use the existing `useBackClosesView` hook (`src/hooks/useHistoryBack.ts`),
  one distinct key per nesting level.
- Remove label-style back links and breadcrumbs in those views.
- Out of scope: tab/filter switches (no history step), icon-only back
  buttons (kept), public links to fixed places ("Back to Home",
  "Back to Vacancies"), pagination Previous/Next.

## Steps

1. RSP: Applicant Score folder (QualifiedApplicantsSection), Office Directory
   → office → position (RSPDashboard, OfficeDirectorySection), Archives
   sub-views, For Hiring drill-down.
2. Screens already wired but still showing a "Back to …" label: LndArchive,
   PMIPCRManagement, Phase2RatingPanel, OfficeAccountConsole,
   SystemAdministrationPage, JobPostingsPage, EmployeeDetailPage,
   EmployeeListByPosition. Remove the label links only.
3. Update DESIGN_IDENTITY.md §8.2 (sub-page breadcrumbs / back navigation).

## Risks

- With the label links gone, browser Back (or Alt+←) is the only way out of
  a drill-down that has no icon back button. Less discoverable on mobile or
  an installed app.
- Nested views must use distinct keys, or one Back closes two levels.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, `npm test`.
- Dev server: drill into each view, press browser Back, confirm one level.
