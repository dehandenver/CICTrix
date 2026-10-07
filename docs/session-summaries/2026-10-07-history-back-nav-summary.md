---
title: Browser Back steps out one drill-down level — summary
date: 2026-10-07
plan: docs/plans/2026-10-07-history-back-nav.md
---

## Shipped

- Browser Back now closes one in-page level instead of leaving the page in the
  views that were not wired yet: RSP Applicant Score folder (plus its score and
  exam modals), RSP Office Directory → office → employee, RSP Archives
  sub-views, Application Ranking department → position, For Hiring department,
  the shared Office Directory section (L&D, PM), and PM IPCR Management's
  Regular office drill.
- Removed the text back links and clickable breadcrumbs from those views and
  from views that were already wired: L&D Archive, L&D and PM Summary of
  Ratings, PM Semester Summary, PM Archive, Phase 2 rating, Office Account
  Console, PM Promotional Applications, System Administration, Employee
  Directory, Applicant Ranking, Newly Hired, RSP applicant details, PM demo.
- DESIGN_IDENTITY.md §8.2 records the rule.

## Deviations

- PM IPCR Management's `drillOffice` moved from `RegularPanel` to the parent,
  because opening an employee unmounted the panel and lost the office, so Back
  could not return to it.
- Kept on purpose: fixed-destination links (Back to Home / Vacancies /
  Applicant Portal / Employee Dashboard), the PDS form stepper, the
  EvaluationForm error-card Back, icon-only Back buttons, and the interviewer
  compact-hero breadcrumb (§8.2 spec).

## Checks

- `npx tsc --noEmit`: clean. No new unused symbols vs `main` under
  `--noUnusedLocals --noUnusedParameters`.
- `npm test`: 20 files, 230 tests passed.
- `npm run lint`: does not run, no ESLint config in the repo (same on `main`).
- Headless Chromium against the dev server: 14 Back-navigation checks passed
  across Archives, Application Ranking, Office Directory and Applicant Score;
  route-level Back still works; no page errors.
