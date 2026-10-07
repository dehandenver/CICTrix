---
title: Working sort and filters on RSP applicant tables — summary
date: 2026-10-07
plan: docs/plans/2026-10-07-rsp-sort-filter.md
---

## Shipped vs. planned

All four steps shipped as planned, on `main` at the user's request.

| Change | File |
|---|---|
| `useTableSort` hook, `SortHeader` and `SortButton` (▲▼ headers, blanks always last, natural text order) | `src/components/tableSort.tsx` |
| Applications and Shortlisted tables sort on every column; default newest applied first; 10-per-page pager moved under the main table; sorting resets to page 1 | `src/components/ApplicationsListPage.tsx` |
| Pending Assignment and Scheduled get a search/department/position/type filter bar and sortable headers; default most recently qualified first; select-all acts on visible rows and the selection drops rows the filters hide | `src/components/PendingAssignmentList.tsx` |
| `updated_at` mapped onto `ApplicantRecord` | `src/components/QualifiedApplicantsRSPPage.tsx`, `src/components/QualifiedApplicantsSection.tsx` |

## Deviations

- Scheduled's combined "Position / Office" header got two sort buttons, one per value, rather than a single header.
- The Position dropdown narrows to the chosen department.

## Checks run

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 230 passed, including 3 new `tableSort` tests.
- `npm run build`: built (existing chunk-size warning only).
- Local dev server with an RSP session: Applications defaults newest first, Department sort both directions, page 2 continues the order; Qualified defaults by `updated_at`, Operations filter shows 3 of 10, Position sort, select-all selects only those 3 and Save shows (3); Scheduled sorts by exam date and office.

## Known limits

- "Most recently qualified" uses `updated_at`, which also moves on unrelated edits. A `qualified_at` column would make it exact.

## Follow-up: selection across filters

Shipped option B from `docs/mockups/2026-10-07-qualified-selection-bar.html`
in `src/components/PendingAssignmentList.tsx`. Picks now persist across filter
changes and drop only once an applicant is assigned. The header checkbox adds
or removes just the visible rows. The selection bar lists the total and
per-department chips with jump and ✕, plus Clear all.

Checks: `npx tsc --noEmit` clean; `npx vitest run` 230 passed. On the local dev
server, picking 2 in Operations and 1 in HRMO showed "3 selected" with both
chips and Save Assignment (3); the Operations chip switched the filter and
showed both picks still checked; ✕ dropped to 1; Clear all hid the bar.
