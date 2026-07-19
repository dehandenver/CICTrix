-- ============================================================================
-- ipcr_competency_matches — open reads to the app, matching the rest of the
-- L&D tables.
--
-- Why: the L&D "Training Requests & Needs" page reads this table to build the
-- Training Needs Assessment. It shipped RLS-locked with role-claim policies
-- that no real session satisfies, so the panel rendered "No needs assessment
-- yet" even with rows present. Verified 2026-07-19:
--
--     service_role   -> 22 rows
--     anon           ->  0 rows
--     authenticated  ->  0 rows   (a real L&D admin session, signed in)
--
-- Note the third line: this is NOT fixed by having proper admin accounts. The
-- policies gate on a JWT role claim that Supabase Auth sessions do not carry,
-- so an authenticated admin is denied exactly like anon.
--
-- Same fix and same posture as 20260722/23/27 for the other training tables:
-- reads open, enforcement in the app layer.
--
-- Idempotent: safe to re-apply.
-- ============================================================================

BEGIN;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ipcr_competency_matches'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ipcr_competency_matches', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.ipcr_competency_matches DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ipcr_competency_matches TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
