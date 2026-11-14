---
title: Import the office plantilla sheet as job postings (summary)
date: 2026-10-20
plan: docs/plans/2026-10-20-import-sheet-job-postings.md
---

Written 2026-11-12 from a code, git and read-only database audit. No summary was recorded when the work shipped.

## What shipped

- **D7 code fix first, as ordered:** `src/lib/api/departments.ts` filters divisions out of office lists through `DIVISION_PARENT_COLUMN`, `officeDirectory.ts` skips rows with a `parent_department_id`, and `formatOfficeLabel` is used on the Applications, Job Postings and Job Vacancies pages.
- **Generator:** `scripts/import-sheet-postings/` holds `sheet.csv`, `generate.py`, the generated `import_sheet_postings.sql` and a README.
- **Live import:** PR #6 (`feat/import-sheet-postings`) merged. The live database has the Social Welfare office (OCSWDO) with one active weighting row, 28 child divisions, 128 active postings and 179 plantilla slots.

## Deviations from the plan

- Slot labels were corrected after the import in PR #19 (`fix/import-sheet-slot-labels`).
- Migration `20261021100000_merge_postings_per_plantilla` later merged postings to one per title per office, so the live posting count no longer matches the sheet's job-row count.

## Checks run

- Audit 2026-11-12: read-only SELECTs confirmed the office, weighting, divisions, postings and slots listed above.
- The compliance, L&D archive and succession office filters (part of D7) were not checked one by one.
