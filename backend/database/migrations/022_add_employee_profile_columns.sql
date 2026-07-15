-- ============================================================================
-- 022: Add the employee profile columns the seed data actually uses
-- ============================================================================
-- scripts/seed/dataset_reset.sql inserts into employees(…, division,
-- highest_educational_attainment, eligibility, …) but no migration ever created
-- those three columns — so the reset would abort with
--   42703: column "division" of relation "employees" does not exist
-- and take the whole transaction (including the TRUNCATE) down with it.
--
-- These are also the cleanest source for the promotional-application prefill
-- and the qualification gap analysis: attainment and eligibility straight off
-- the employee record, no employee_education rows required.
--
-- Additive and idempotent.
-- ============================================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS division VARCHAR(200);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS highest_educational_attainment VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS eligibility VARCHAR(200);

GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
