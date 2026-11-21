---
title: Carry applicant work history, education, and PWD into new-hire PDS
date: 2026-11-21
status: In Progress
summary: Persist repeatable work-experience entries with real dates, school name, and PWD status on /apply, and seed them atomically into employees, employee_work_experience, and employee_education during complete_external_hire.
spec: docs/mockups/2026-11-22-apply-work-experience-collapsible.html
---

## Goal

When an external applicant submits `/apply` with their work history (one or more entries with real start/end dates), educational background (attainment, degree/course, school), and PWD answer, that data is stored in Postgres on `applicants` and carried over atomically by `complete_external_hire` into the new hire's canonical PDS records (`employees`, `employee_work_experience`, and `employee_education`). Opening the newly hired employee's PDS immediately reflects their submitted work history, education, and PWD status, and Succession Planning, Gap Analysis, and promotional `/apply` prefill read the real dates and education rows without manual re-entry or synthetic dates.

Preserves the nine-section PDS navigation in `docs/mockups/2026-10-06-pds-step-list.html` and the hiring flow in `docs/mockups/2026-10-21-hire-reservation-flow.html`. The settled `/apply` Page 3 (School / Institution) and Page 4 **Option B (Compact Collapsible List)** layout are saved at `docs/mockups/2026-11-22-apply-work-experience-collapsible.html`.

## Approach

### 1. Database migration (CLI-generated, BOM-free UTF-8)

- Add `applicants.work_experience_entries jsonb NOT NULL DEFAULT '[]'::jsonb` with `CHECK (jsonb_typeof(work_experience_entries) = 'array')`. Keeping the repeatable entries as a JSONB array on `applicants` makes public `/apply` submission a single atomic insert and inherits existing `applicants` RLS and soft-delete semantics without introducing a new `anon`-writable table.
- Update `public.complete_external_hire` (`SECURITY INVOKER`):
  - Populate `employees.highest_educational_attainment` from `applicants.education_level` and `employees.person_with_disability` from `applicants.is_pwd`.
  - Immediately after inserting `employees` (skipped automatically on `already_completed = true` replays), seed `public.employee_work_experience` rows in order from `applicants.work_experience_entries` (defensively validating non-empty `position_title`, `company_name`, and ISO `YYYY-MM-DD` `from_date`, clearing `to_date` when `is_present` is true, and carrying `duties_responsibilities` and `is_government_service`).
  - Seed one `public.employee_education` row (`level`, `school_name`, `course`, `sort_order = 0`) when mapped `education_level` and non-empty `education_school` are both present; legacy applicants without `education_school` still populate `employees.highest_educational_attainment` without fabricating a school name.
- Update `public.save_pds_section` (`workExperience` merge) so that if an employee later fills in `to_date` on a seeded `is_present = true` row, `is_present` is automatically cleared to `false`.

### 2. Shared types, duration math, and validation

- Add `ApplicantWorkExperienceEntry` and `work_experience_entries` to `src/types/applicant.types.ts`.
- Add pure helper `src/utils/workExperience.ts` for date validation, `years_of_experience` auto-calculation (matching `employeeApplicationProfile.ts` / `criticalPositionGapAnalysis.ts`), duration formatting, and draft/payload normalization.
- Update `src/utils/validation.ts`, `src/modules/applicant/flow/formPages.ts`, and `src/modules/applicant/flow/applicationDrafts.ts` to validate `education_school` (required when `education_attainment` is selected) and each non-empty work-experience entry (optional overall for fresh graduates).

### 3. `/apply` UI, promotional prefill, and interviewer view

- Expose **School / Institution** on `/apply` page 3 (`ApplicantAssessmentForm.tsx`) and convert page 4 into a repeatable work-experience list with Date From, Date To, Currently employed toggle, Position Held, Company / Organization, Government Service toggle, Duties, and a live Total Experience readout.
- Update `ApplicantWizard.tsx` to submit both auto-computed `years_of_experience` and `work_experience_entries` (plus `education_school`) and render the full work-history list on the Step 3 Review screen.
- Update `src/lib/api/employeeApplicationProfile.ts` to prefill `workExperienceEntries` directly from `employee_work_experience` for promotional applicants.
- Update `src/lib/api/applicants.ts` and `src/modules/interviewer/ApplicantDetailsPage.tsx` to display structured work-history entries under Qualifications, falling back to `years_of_experience` for legacy applications.

## Steps

1. Run `ui-preview` for `/apply` page 3 (School input) and page 4 (repeatable work-experience cards + live total readout) and save the settled mockup to `docs/mockups/`.
2. Create BOM-free CLI migration (`npx supabase migration new applicant_pds_carryover`) and extend `supabase/tests/external_hire_transaction.test.sql` and `supabase/tests/pds_section_transactions.test.sql`; verify on a disposable Postgres/Supabase instance.
3. Implement `src/types/applicant.types.ts`, `src/utils/workExperience.ts`, `src/utils/validation.ts`, `src/modules/applicant/flow/formPages.ts`, `src/modules/applicant/flow/applicationDrafts.ts`, `src/lib/api/employeeApplicationProfile.ts`, and `src/lib/api/applicants.ts` with TDD unit tests.
4. Implement UI updates in `ApplicantAssessmentForm.tsx`, `ApplicantWizard.tsx`, and `ApplicantDetailsPage.tsx`, run `DESIGN_IDENTITY.md` §16 checklist, and update/add component and carryover integration tests.
5. Run full checks (`tsc`, `lint`, `test`, `check:migrations`, SQL tests, Python hiring tests) and ship migration PR first, then frontend PR against `dehandenver/CICTrix` `main` (confirming before each push).

## Risks

- **UTF-8 BOM in migration:** Verify migration SQL starts without `EF BB BF` before pushing so `Supabase Preview` succeeds on the first pass.
- **Legacy `/apply` callers & test fixtures:** Keep `applicants.years_of_experience` auto-populated and add `isMissingColumn` fallback for `work_experience_entries` so existing HR tables, scorers, and preview environments stay compatible.
- **Seeded current-job rows edited later in PDS:** Clearing `is_present = false` in `save_pds_section` when `to_date` is set prevents stale `"Present"` labels in Succession and Evidence Review.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run check:migrations`
- Disposable Postgres run of `supabase/tests/external_hire_transaction.test.sql` and `supabase/tests/pds_section_transactions.test.sql`
- Python tests (`backend/test_external_hiring.py`, `backend/test_promotional_hiring.py`)
- `DESIGN_IDENTITY.md` §16 checklist on touched UI components
