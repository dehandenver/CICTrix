# Applicant-to-PDS Qualification Carryover

**Plan:** `docs/plans/2026-11-21-applicant-to-pds-carryover.md`
**Settled Mockup:** `docs/mockups/2026-11-22-apply-work-experience-collapsible.html`

## What Shipped vs. Planned

1. **Database migration (`supabase/migrations/20261121163818_applicant_pds_carryover.sql`, PR #112):**
   - Added `public.applicants.work_experience_entries jsonb NOT NULL DEFAULT '[]'::jsonb` with `CHECK (jsonb_typeof(work_experience_entries) = 'array')` and ensured carryover columns exist on `public.applicants` and `public.employees`.
   - Updated `public.complete_external_hire` (`SECURITY INVOKER`) to atomically seed `employees.highest_educational_attainment`, `employees.person_with_disability`, `employee_education` (level mapped to `valid_education_level`, `school_name`, `course`), and ordered `employee_work_experience` rows from `work_experience_entries` on initial completion while skipping seeding on `already_completed = true` replays.
   - Updated `public.save_pds_section` (`workExperience`) so saving a non-null `to_date` on an existing row clears `is_present = false` while preserving `duties_responsibilities` and `separation_reason`.
2. **Validation, helpers & promotional prefill:**
   - Added `ApplicantWorkExperienceEntry` types in `src/types/applicant.types.ts` and pure date/duration/validation helpers in `src/utils/workExperience.ts`.
   - Updated `src/utils/validation.ts`, `src/modules/applicant/flow/formPages.ts`, and `src/modules/applicant/flow/applicationDrafts.ts` so `education_school` is required when `education_attainment` is selected, non-blank `work_experience_entries` are validated with calendar/future/range checks, and `years_of_experience` auto-computes from dated entries.
   - Updated `src/lib/api/employeeApplicationProfile.ts` to populate `workExperienceEntries`, `educationDegree`, and `educationSchool` from PDS tables with fallback to `applicants` rows, and added `work_experience_entries` to `src/lib/api/applicants.ts`.
3. **`/apply` Option B UI, Review & Interviewer View:**
   - Exposed required `School / Institution` on Page 3 and replaced Page 4 with Option B (Compact Collapsible List) with live total duration pill, `Date From`, `Date To`, `Currently employed here`, and `Government service` checkboxes in `src/modules/applicant/ApplicantAssessmentForm.tsx`.
   - Updated `src/modules/applicant/ApplicantWizard.tsx` to persist `work_experience_entries` + auto-computed `years_of_experience` (with missing-column retry guard) and display full education + work entries on Step 3 Review.
   - Updated `src/modules/interviewer/ApplicantDetailsPage.tsx` Qualifications card to render structured work-history entries alongside duration.

**Deviations from plan:** None.

## Checks Run

- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 warnings, 0 errors.
- `npm run check:migrations`: passed (`135` files).
- Full Vitest suite (`npx vitest run --dir src`): `201` files / `1,926` tests passed prior to adding the final carryover smoke suite; focused + smoke Vitest run (`13` files / `59` tests, including `src/test/applicantPdsCarryover.smoke.test.tsx`) passed `59/59` after final edit.
- Isolated Docker full-stack Supabase (`Postgres 17` + GoTrue + PostgREST + Kong): applied `20261121163818_applicant_pds_carryover.sql` cleanly over production schema snapshot (`ON_ERROR_STOP=1`), verified existing row defaults and `23514` array check, passed `supabase/tests/external_hire.test.sql` and `supabase/tests/pds_section_transactions.test.sql`, and passed all 7 PostgREST/RPC HTTP end-to-end carryover assertions.
- Python hiring tests (`backend/test_external_hiring.py`, `backend/test_promotional_hiring.py`): `30` tests passed (`OK`).
- `DESIGN_IDENTITY.md` §16 UI checklist: passed on all touched UI components.
- Note on `npm run build`: `tsc` passed and Vite transformed 3,157 modules cleanly before hitting a local Windows Defender `%TEMP%` unlink lock on `esbuild` temp cleanup (`Access is denied`).
