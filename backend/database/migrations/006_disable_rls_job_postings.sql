-- ============================================================================
-- DISABLE RLS ON JOB POSTINGS
-- Allow the frontend anon Supabase client to read + write job postings so
-- that newly added postings show up immediately on the Landing Page (public
-- visitors) and the Interviewer Dashboard (signed-in but anon-client based).
--
-- Mirrors the existing pattern in:
--   003_disable_rls_evaluations.sql
--   005_disable_rls_employees_newly_hired.sql
--
-- Created: 2026-05-21
-- ============================================================================

-- Primary recruitment table used by JobPostingsPage / RSPDashboard / LandingPage.
ALTER TABLE job_postings DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON job_postings TO authenticated, anon;

-- Legacy duplicate table that some older code paths still write/delete from
-- (RSPDashboard.handleDeleteJob). Keep its perms in sync to avoid partial fixes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'jobs') THEN
    EXECUTE 'ALTER TABLE jobs DISABLE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO authenticated, anon';
  END IF;
END $$;
