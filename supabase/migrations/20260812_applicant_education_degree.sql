-- ============================================================================
-- Applicants: persist the degree / course and school from the application form.
-- Created: 2026-08-12.
--
-- The application form collects "Degree / Course" and school, but the applicant
-- insert only ever saved education_level (the attainment). The typed degree was
-- passed into an in-session tracker object and dropped, so it could never
-- prefill a later promotional appointment — the prefill's only degree source
-- was the employee_education detail table, which nothing populates.
--
-- These two columns give the degree/school a durable home on the applicants
-- row, alongside education_level, so a promotional applicant's prior
-- application carries them through.
--
-- Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS education_degree text;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS education_school text;

NOTIFY pgrst, 'reload schema';

COMMIT;
