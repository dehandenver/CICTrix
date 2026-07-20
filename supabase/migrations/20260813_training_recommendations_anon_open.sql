-- ============================================================================
-- Migration: Unlock training_recommendations for the app's anon client
-- Date: 2026-08-13
--
-- training_recommendations still had RLS enabled with role-claim policies that
-- no real session satisfies, so the frontend (anon key) read it as EMPTY while
-- the service role saw every row:
--
--     SERVICE  200  30 rows
--     ANON     200   0 rows
--
-- Four of the five Seminar Enrollment subtabs read this table, so all four
-- rendered empty. Enrolled/Finalized kept working only because it reads
-- training_enrollments, which is already open — which is exactly the tell.
--
-- Same fix, and the same reasoning, as 20260722/23/27 applied to the other
-- training_* tables: the app has no authenticated Postgres role to write a
-- meaningful policy against, so a policy keyed on role claims can only ever
-- deny everyone. Access is enforced in the application's route guards.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- Drop every existing policy on the table; leaving one behind would keep
-- filtering rows if RLS is ever re-enabled.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'training_recommendations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.training_recommendations', p.policyname);
  END LOOP;
END $$;

ALTER TABLE training_recommendations DISABLE ROW LEVEL SECURITY;

GRANT ALL ON training_recommendations TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
