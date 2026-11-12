---
title: Paginated application form, one posting per plantilla, plantilla and office cleanup
date: 2026-10-23
status: Blocked
summary: Split Step 2 of the application into pages with per-page validation. Split merged postings back into one posting per plantilla so each plantilla has its own status, details and delete. Soft-delete the duplicate plantillas 152, 159, 162, 163, 164, and the Legal and Information Technology postings, and deactivate those two departments.
spec: Task brief pasted 2026-10-23; decisions confirmed in chat 2026-10-23 (split, Task 3 before Task 2, departments deactivated)
---

## Goal

Each plantilla is its own row everywhere, with its own Open/Closed status, description, Details and Delete. Duplicate plantillas and the Legal and IT offices are gone from every list. Applicants fill Step 2 one short page at a time.

## Approach

| # | Decision |
|---|---|
| D1 | Split every live posting with more than one plantilla back into one posting per plantilla (reverses `20261021100000_merge_postings_per_plantilla`). The lowest-numbered plantilla stays on the original posting; each other plantilla gets a copy of the posting carrying its own summary, duties and division. Applicants and other `job_posting_id` rows follow their `plantilla_slot_id`. A log table (`posting_split_log`) records new posting → original posting and the slot, so the rollback is exact. |
| D2 | Status after the split: a copy takes the original's open vacancy only if its plantilla is still `open`; otherwise it is Closed. The original keeps its vacancy only if its own plantilla is open. |
| D3 | Task 3 runs before Task 2: after the split, removing plantillas 152, 159, 162, 163, 164 is a soft delete (`deleted_at`) of their own postings, which every screen already hides. A removed plantilla with applicants stops the work for a decision. |
| D4 | Task 4: soft-delete the Legal and Information Technology postings, set their `departments` rows `is_active = false`, and drop them from hard-coded lists in `src/` and the seed scripts. Employees, IPCR records and accounts in those offices are left alone unless the user approves after seeing the audit. |
| D5 | Task 1: Step 2 becomes five pages (Application type + Personal; Contact + Position applied for; Education + Government ID; Work experience; Documents) with "Page n of 5", per-page validation and Back/Next. Answers stay in the existing `apps` state. The "Application for …" header shows on every page. The submit payload is unchanged. |
| D6 | Admin Job Positions table: no chevron; one row per posting (now one plantilla each); sort Date Posted, then Title, then Plantilla number; Delete confirmation names the plantilla. |
| D7 | Migrations ship with a rollback SQL file and apply on merge to `main` through the Supabase integration. Nothing is run by hand. |

## Steps

1. Task 1: page split in `ApplicantWizard.tsx` / `ApplicantAssessmentForm.tsx` / `AttachmentsUploadForm.tsx`, per-page validation, tests.
2. Audit (`scripts/audit-plantilla-cleanup.sql`) run by the user; results reviewed before any data migration is written.
3. Migration: split postings (D1, D2) + rollback.
4. Migration: soft-delete plantillas 152, 159, 162, 163, 164 (D3) + rollback.
5. Migration: Legal/IT postings and departments (D4) + rollback; code and seed list cleanup.
6. Admin table (D6), tests.
7. Checks, commit per task, PR on the user's go-ahead.

## Risks

- Applications without a `plantilla_slot_id` on a multi-plantilla posting can't be routed by the split; they stay on the original posting and are listed for review.
- Tables with a unique constraint per posting would block the copy; the transaction rolls back.
- Legal/IT appear in IPCR, L&D and PM data; deactivating the department may hide history in screens that filter on `is_active`.

## Checks to run

`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run check:migrations`, browser check of the application form at mobile and desktop widths, DESIGN_IDENTITY §16 checklist.

## Status check 2026-11-12

Blocked. `2026-10-30-applicant-status-and-score-writes.md` says the split waits until `feat/import-employees` is reconciled and the dependency audit is rerun. Done: Step 1 (application Step 2 split into five pages, `0f8b9db`) and part of D4 (Legal and IT offices deactivated, `20261024171047`). Left: the Step 2 audit script, the Step 3–4 split migration and removal of plantillas 152, 159, 162, 163 and 164, soft-deleting the Legal and IT postings, and the Step 6 admin table.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
