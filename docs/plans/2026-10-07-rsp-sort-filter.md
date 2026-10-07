---
title: Working sort and filters on RSP Applications and Qualified Applicants
date: 2026-10-07
status: Done
summary: Sortable column headers on the Applications, Shortlisted, Pending Assignment and Scheduled tables; department/position/type filters on Qualified Applicants; newest-first defaults; Applications pager moved under its table. Deployed to HR Demo and production from main.
---

## Goal

RSP can sort every applicant table by any column and filter Qualified
Applicants by department and position before publishing a schedule. With no
sort chosen, tables show the most recent applicant (Applications) and the most
recently qualified applicant (Qualified Applicants) first.

## Approach

Mockup: `docs/mockups/2026-10-07-qualified-sort-filter.html`, option C (flat
table with sort and filters). The user chose working sort/filter over grouping.

1. Shared `useTableSort` hook and `SortHeader` cell in `src/components/tableSort.tsx`,
   following the ▲▼ header pattern in `src/modules/admin/pm/OfficeTrainingCourses.tsx`.
2. `src/components/ApplicationsListPage.tsx`: every column sortable in the main
   and Shortlisted tables; default Applied newest first; the 10-per-page pager
   moves directly under the main table; sorting resets to page 1.
3. `src/components/PendingAssignmentList.tsx`: filter bar (search, department,
   position, type) shared by the Pending and Scheduled sub-tabs; sortable
   headers on both; select-all acts on the visible (filtered) rows only.
4. Default order for Qualified: `updated_at` descending, falling back to
   `created_at`. `src/components/QualifiedApplicantsRSPPage.tsx` maps `updated_at`.

User asked to work directly on `main` (overriding the branch-first rule) and
to deploy to HR Demo and production.

## Risks

- No `qualified_at` column exists. `updated_at` also moves on unrelated edits
  (documents, schedule saves), so "most recently qualified" is approximate.

## Checks to run

- `npx tsc --noEmit`, `npx vitest run`, `npm run build`
- Vercel deployments for `abyan-hris-iloilo` and `cictrix-hr-demo` reach Ready.
